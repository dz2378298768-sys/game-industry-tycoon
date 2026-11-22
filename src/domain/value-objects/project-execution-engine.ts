/**
 * Project 执行编排器（PROJ V0.1.1 §4/§5/§6 的纯逻辑组合）。
 *
 * 职责边界：
 *  - 只组合本内核纯函数；不读写 `Company.cash`（R-PROJ-3），不回写蓝图（R-PROJ-1）；
 *  - 闸门传入 D-01 `revalidationGate` 结果（fail-closed：任一 E 级 ⇒ 不切快照 / 不交付）；
 *  - 账本经注入的 `UnifiedLedger`：承诺用 `createCommitment`（不改现金），支出走 `postTransaction`。
 *
 * 所有状态变更返回新对象（不可变更新）；`state` 永不出现 `REWORKING`（§4.1）。
 */
import type {
  Build,
  DeliveryForm,
  Discipline,
  ExecutionProject,
  PauseReason,
  ProjectState,
  ReworkCategory,
  ExecutionReworkSession,
  ExecutionReworkTask,
  TeamMember,
  WorkPackage,
  Worklog,
} from '@domain/entities/project-execution'
import {
  isTerminalState,
} from '@domain/entities/project-execution'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import type { UnifiedLedger } from '@domain/entities/finance'
import { createCommitment } from '@domain/value-objects/finance-commitment'
import type { DisciplineWorkload } from './project-execution-cost-helpers'
import {
  decomposeWorkPackages,
  type DecompositionInput,
} from './project-execution-decomposition'
import {
  advanceOneDay,
  allWorkPackagesDone,
  computeBottleneck,
  progressVector,
  type AdvanceDayResult,
} from './project-execution-daily'
import {
  estimateProjectCost,
  type CostEstimateResult,
} from './project-execution-capacity'
import {
  computeReworkCostBreakdown,
  estimateReworkCostRange,
  type ReworkAffectedItemInput,
  type ReworkCostBreakdown,
} from './project-execution-rework'
import {
  clearPauseFields,
  computePausedDays,
  deterministicId,
  enterPauseFields,
  isPauseTimedOut,
  restorePauseFields,
  transitionProjectState,
} from './project-execution-state-machine'
import { rebaselineWorkPackages } from './project-execution-rebaseline'
import { DISCIPLINE_ORDER, type ProjectFormulaParams } from './project-execution-tuning'

export interface GateOutcome {
  pass: boolean
  violations?: ReadonlyArray<{ code: string; severity: string }>
  refViolations?: ReadonlyArray<{ code: string; severity: string }>
  hardRuleViolations?: ReadonlyArray<{ code: string; severity: string }>
}

export interface ProjectExecutionState {
  project: ExecutionProject
  workPackages: WorkPackage[]
  worklogs: Worklog[]
  reworkSessions: ExecutionReworkSession[]
  reworkTasks: ExecutionReworkTask[]
  builds: Build[]
  /** FIN 账本交易 id（支出侧，append-only）。 */
  expenseTxIds: string[]
}

/** 立项输入。 */
export interface CreateProjectInput {
  projectId: string
  companyId: string
  studioId: string
  versionId: string
  snapshotId: string
  formulaVersion: string
  day: number
  hrb?: number
  budgetCapacityCents: number
  /** FIN AvailableCash at setup；BudgetCapacity 必须 ≤ 它（§5.4-1）。 */
  availableCashCents: number
  deliveryFormTarget?: DeliveryForm
  teamRefs?: string[]
  plannedLaunchDay?: number | null
  /** 拆解输入（来自冻结快照的只读投影）。 */
  decomposition: DecompositionInput
  /** 拆解用产能（§6.1 duration）。 */
  capacity?: DisciplineWorkload
}

export interface SetupCommitmentInput {
  ledger: UnifiedLedger
  day: number
  endAt?: number
}

function defaultWorkload(): DisciplineWorkload {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
}

function workloadOf(wps: ReadonlyArray<WorkPackage>): DisciplineWorkload {
  const out = defaultWorkload()
  for (const wp of wps) {
    if (wp.state === 'DEACTIVATED') continue
    out[wp.discipline] += wp.baselineWorkUnits
  }
  return out
}

function remainingOf(wps: ReadonlyArray<WorkPackage>): DisciplineWorkload {
  const out = defaultWorkload()
  for (const wp of wps) {
    if (wp.state === 'DEACTIVATED') continue
    out[wp.discipline] += wp.remainingWorkUnits
  }
  return out
}

function cloneState(state: ProjectExecutionState): ProjectExecutionState {
  return {
    project: { ...state.project },
    workPackages: state.workPackages.map((wp) => ({ ...wp, blockedBy: [...wp.blockedBy], dependents: [...wp.dependents] })),
    worklogs: [...state.worklogs],
    reworkSessions: state.reworkSessions.map((s) => ({ ...s, costEstimate: { ...s.costEstimate } })),
    reworkTasks: state.reworkTasks.map((t) => ({ ...t })),
    builds: [...state.builds],
    expenseTxIds: [...state.expenseTxIds],
  }
}

function assertNonTerminal(project: ExecutionProject, action: string): void {
  if (isTerminalState(project.state)) {
    throw new ProjectError(PROJ_ERROR.TERMINAL_STATE, `${action} rejected: project is ${project.state}`)
  }
}

/** §4.1 呈现标签：`ACTIVE` + 存在 active 会话 ⇒ "返工中"。不是状态枚举值。 */
export function isInReworkDisplay(state: ProjectExecutionState): boolean {
  return state.project.state === 'ACTIVE' && state.reworkSessions.some(
    (s) => s.sessionId === state.project.reworkSessionId && s.status === 'active',
  )
}

/**
 * 立项：SETUP → ACTIVE（§4.3 首行）。
 * 前置：绑定唯一 snapshotId、依赖无环（拆解内校验）、BudgetCapacity ≤ AvailableCash。
 * 副作用：创建 WPs；建 `project_budget` 承诺（**不改现金**，BR-3）。
 */
export function createProjectExecution(
  input: CreateProjectInput,
  params: ProjectFormulaParams,
): ProjectExecutionState {
  if (input.budgetCapacityCents > input.availableCashCents) {
    throw new ProjectError(
      PROJ_ERROR.BUDGET_CAPACITY_EXCEEDS_CASH,
      `budgetCapacityCents ${input.budgetCapacityCents} > AvailableCash ${input.availableCashCents}`,
    )
  }
  if (input.snapshotId === '') {
    throw new ProjectError(PROJ_ERROR.SNAPSHOT_MISSING, 'snapshotId required at setup (R-PROJ-0)')
  }
  const hrb = input.hrb ?? 0.5
  const decomposition = decomposeWorkPackages(
    input.capacity !== undefined
      ? { ...input.decomposition, capacity: input.capacity }
      : input.decomposition,
    params,
  )

  const project: ExecutionProject = {
    projectId: input.projectId,
    companyId: input.companyId,
    studioId: input.studioId,
    versionId: input.versionId,
    snapshotId: input.snapshotId,
    formulaVersion: input.formulaVersion,
    projectFormulaVersion: params.projectFormulaVersion,
    hrb,
    budgetCapacityCents: input.budgetCapacityCents,
    budgetCapCents: Math.round(hrb * input.budgetCapacityCents),
    costEstCents: Number.POSITIVE_INFINITY,
    reworkCount: 0,
    state: 'SETUP',
    deliveryFormTarget: input.deliveryFormTarget ?? 'full',
    teamRefs: [...(input.teamRefs ?? [])],
    workPackageIds: decomposition.workPackages.map((wp) => wp.workPackageId),
    reworkSessionId: null,
    buildIds: [],
    commitmentIds: [],
    pausedAtDayIndex: null,
    pausedDays: 0,
    pauseReason: null,
    plannedLaunchDay: input.plannedLaunchDay ?? null,
    launchDelayDays: 0,
    createdAt: input.day,
    updatedAt: input.day,
  }
  project.state = transitionProjectState('SETUP', 'launch')

  return {
    project,
    workPackages: decomposition.workPackages,
    worklogs: [],
    reworkSessions: [],
    reworkTasks: [],
    builds: [],
    expenseTxIds: [],
  }
}

/**
 * 立约承诺：`one_off project_budget, amountCents = Budget_cap`（C2：恒等于 Budget_cap，非 BudgetCapacity）。
 * 承诺创建**不改现金**（BR-3）。返回的承诺 id 追加至 `commitmentIds`。
 */
export function setupBudgetCommitment(
  state: ProjectExecutionState,
  input: SetupCommitmentInput,
): ProjectExecutionState {
  const next = cloneState(state)
  const amount = next.project.budgetCapCents
  if (amount <= 0) {
    // hrb=0：Budget_cap=0 不产生零额承诺（FIN 拒收），承诺集合为空，Σ=0=Budget_cap（恒等仍成立）
    return next
  }
  const commitmentId = deterministicId('commit', next.project.projectId, 'budget', 0, amount)
  const commitment = createCommitment(
    {
      commitmentId,
      companyId: next.project.companyId,
      sourceType: 'project_budget',
      sourceRef: next.project.projectId,
      amountCents: amount,
      period: 'one_off',
      startAt: input.day,
      endAt: input.endAt ?? input.day,
    },
    { ledger: input.ledger },
  )
  void commitment
  if (!next.project.commitmentIds.includes(commitmentId)) next.project.commitmentIds.push(commitmentId)
  return next
}

/**
 * 追加预算（场景 A 步 6，C2/N-02）：上调 hrb ⇒ 重算 Budget_cap；以**补充承诺** `ΔBudget_cap` 登记。
 * 不变式：Σ 立约 + 追加 = 当前 Budget_cap（不双算）。**W_d / WP baseline 不变**（R-PROJ-2）。
 */
export function topUpBudget(
  state: ProjectExecutionState,
  newHrb: number,
  ctx: { ledger: UnifiedLedger; day: number },
): ProjectExecutionState {
  const next = cloneState(state)
  assertNonTerminal(next.project, 'topUpBudget')
  if (newHrb < next.project.hrb) {
    throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, 'hrb may only be increased via top-up')
  }
  const oldCap = next.project.budgetCapCents
  const newCap = Math.round(newHrb * next.project.budgetCapacityCents)
  if (newCap > next.project.budgetCapacityCents) {
    throw new ProjectError(PROJ_ERROR.BUDGET_CAPACITY_EXCEEDED, 'Budget_cap exceeds budgetCapacityCents')
  }
  const delta = newCap - oldCap
  next.project.hrb = newHrb
  next.project.budgetCapCents = newCap
  next.project.updatedAt = ctx.day
  if (delta > 0) {
    const commitmentId = deterministicId('commit', next.project.projectId, 'budget', next.project.commitmentIds.length, delta)
    createCommitment(
      {
        commitmentId,
        companyId: next.project.companyId,
        sourceType: 'project_budget',
        sourceRef: next.project.projectId,
        amountCents: delta,
        period: 'one_off',
        startAt: ctx.day,
        endAt: ctx.day,
      },
      { ledger: ctx.ledger },
    )
    next.project.commitmentIds.push(commitmentId)
  }
  return next
}

/** §6.4 成本估算（派生只读，不入事实存储，§3.4 注）。 */
export function estimateCost(
  state: ProjectExecutionState,
  members: ReadonlyArray<TeamMember>,
  day: number,
  rTech: number,
  rScope: number,
  params: ProjectFormulaParams,
): CostEstimateResult {
  return estimateProjectCost(
    {
      workload: workloadOf(state.workPackages),
      members,
      day,
      budgetCapacityCents: state.project.budgetCapacityCents,
      hrb: state.project.hrb,
      rTech,
      rScope,
    },
    params,
  )
}

export interface AdvanceProjectDayInput {
  day: number
  members: ReadonlyArray<TeamMember>
  ledger?: UnifiedLedger
  params: ProjectFormulaParams
  source?: 'system_auto' | 'player_authorized'
}

/**
 * 日推进（§5.3-5 L0 步 4）：
 *  - 非 ACTIVE（PAUSED/READY_TO_DELIVER/终态）不推进；
 *  - PAUSED 超时（≥ pauseTimeoutDays）强制 → CANCELLED（§4.3/§4.4，读档路径同式）；
 *  - ACTIVE 且 WP 全 DONE ⇒ READY_TO_DELIVER。
 */
export function advanceProjectDay(
  state: ProjectExecutionState,
  input: AdvanceProjectDayInput,
): { state: ProjectExecutionState; advance: AdvanceDayResult | null } {
  const next = cloneState(state)
  const params = input.params
  const p = next.project

  if (p.state === 'PAUSED') {
    // C5：pausedDays 按公式重算（读档后同样成立），超时强制取消
    p.pausedDays = computePausedDays(p.pausedAtDayIndex, input.day)
    if (isPauseTimedOut(p.pausedAtDayIndex, input.day, params.pauseTimeoutDays)) {
      p.state = transitionProjectState('PAUSED', 'pause_timeout')
      p.updatedAt = input.day
    }
    return { state: next, advance: null }
  }
  if (p.state !== 'ACTIVE') return { state: next, advance: null }

  const cost = estimateCost(next, input.members, input.day, 0, 0, params)
  const advanceInput = {
    projectId: p.projectId,
    companyId: p.companyId,
    day: input.day,
    workPackages: next.workPackages,
    capacity: cost.capacity,
    costPerWorkUnit: cost.costPerWorkUnit,
    reworkSessions: next.reworkSessions,
    source: input.source ?? 'system_auto',
    ...(input.ledger !== undefined ? { ledger: input.ledger } : {}),
  }
  const advance = advanceOneDay(advanceInput)
  next.workPackages = advance.workPackages
  next.worklogs.push(...advance.logs)
  next.reworkSessions = advance.reworkSessions
  next.expenseTxIds.push(...advance.transactionIds)
  next.project.costEstCents = cost.costEstCents
  next.project.updatedAt = input.day

  if (allWorkPackagesDone(next.workPackages) && next.project.reworkSessionId === null) {
    next.project.state = transitionProjectState('ACTIVE', 'all_work_packages_done')
  }
  return { state: next, advance }
}

/** §4.3 暂停：写 pausedAtDayIndex/pausedDays=0/pauseReason（C5）；重复暂停不重置起算日。 */
export function pauseProject(
  state: ProjectExecutionState,
  day: number,
  reason: PauseReason = 'player',
): ProjectExecutionState {
  const next = cloneState(state)
  assertNonTerminal(next.project, 'pauseProject')
  const p = next.project
  const nextState = transitionProjectState(p.state, 'pause')
  const fields = enterPauseFields(
    { pausedAtDayIndex: p.pausedAtDayIndex, pausedDays: p.pausedDays, pauseReason: p.pauseReason },
    day,
    reason,
  )
  p.state = nextState
  p.pausedAtDayIndex = fields.pausedAtDayIndex
  p.pausedDays = fields.pausedDays
  p.pauseReason = fields.pauseReason
  p.updatedAt = day
  return next
}

/** §4.3 恢复：团队必须 > 0（否则保持 PAUSED 并提示，§4.3 前置条件）。 */
export function resumeProject(
  state: ProjectExecutionState,
  day: number,
  members: ReadonlyArray<TeamMember> = [],
): { state: ProjectExecutionState; resumed: boolean; reason?: string } {
  const next = cloneState(state)
  if (next.project.state !== 'PAUSED') {
    return { state: next, resumed: false, reason: `not paused (${next.project.state})` }
  }
  if (members.length === 0) {
    return { state: next, resumed: false, reason: 'team empty: remains PAUSED' }
  }
  const p = next.project
  p.state = transitionProjectState('PAUSED', 'resume')
  const cleared = clearPauseFields()
  p.pausedAtDayIndex = cleared.pausedAtDayIndex
  p.pausedDays = cleared.pausedDays
  p.pauseReason = cleared.pauseReason
  p.updatedAt = day
  return { state: next, resumed: true }
}

/** §11 S1 读档：按同一公式重算 pausedDays（C5）。 */
export function restoreProjectExecution(
  state: ProjectExecutionState,
  day: number,
  params: ProjectFormulaParams,
): ProjectExecutionState {
  const next = cloneState(state)
  if (next.project.state === 'PAUSED') {
    const f = restorePauseFields(
      {
        pausedAtDayIndex: next.project.pausedAtDayIndex,
        pausedDays: next.project.pausedDays,
        pauseReason: next.project.pauseReason,
      },
      day,
    )
    next.project.pausedAtDayIndex = f.pausedAtDayIndex
    next.project.pausedDays = f.pausedDays
    next.project.pauseReason = f.pauseReason
    if (isPauseTimedOut(f.pausedAtDayIndex, day, params.pauseTimeoutDays)) {
      next.project.state = transitionProjectState('PAUSED', 'pause_timeout')
    }
  }
  void 0
  return next
}

/** §4.3 取消（任意非终态）。未来承诺由 FIN `cancelCommitment` 释放（本内核只返回 id 列表）。 */
export function cancelProject(state: ProjectExecutionState, day: number): ProjectExecutionState {
  const next = cloneState(state)
  assertNonTerminal(next.project, 'cancelProject')
  next.project.state = transitionProjectState(next.project.state, 'cancel')
  next.project.updatedAt = day
  return next
}

/** §4.3 放弃设计版本/产品（任意非 COMPLETED）。 */
export function abandonProject(state: ProjectExecutionState, day: number): ProjectExecutionState {
  const next = cloneState(state)
  if (next.project.state === 'COMPLETED') {
    throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, 'COMPLETED cannot be abandoned (terminal)')
  }
  if (isTerminalState(next.project.state)) {
    throw new ProjectError(PROJ_ERROR.TERMINAL_STATE, `abandon rejected: project is ${next.project.state}`)
  }
  next.project.state = transitionProjectState(next.project.state, 'abandon')
  next.project.updatedAt = day
  return next
}

/** §5.4-6 延期（C6）：只改 plannedLaunchDay 与 launchDelayDays（上限），不改 W_d。 */
export function delayLaunch(
  state: ProjectExecutionState,
  newPlannedLaunchDay: number,
  params: ProjectFormulaParams,
  day?: number,
): ExecutionProject {
  const p = { ...state.project }
  // C6：累计延期按"当前目标日 → 新目标日"的增量累加，上限 LAUNCH_DELAY_MAX_DAYS；
  // plannedLaunchDay 与 launchDelayDays 同步截断，避免"日期已延但累计天数被截"的口径分裂。
  const current = p.plannedLaunchDay ?? p.createdAt
  const requestedDelta = newPlannedLaunchDay - current
  const wantedDelay = Math.max(0, p.launchDelayDays + requestedDelta)
  const appliedDelta = Math.min(wantedDelay, params.launchDelayMaxDays) - p.launchDelayDays
  p.launchDelayDays = p.launchDelayDays + appliedDelta
  p.plannedLaunchDay = current + appliedDelta
  p.updatedAt = day ?? p.updatedAt
  return p
}

// ===== 返工（§5.5 / §6.5） =====

export interface StartReworkInput {
  sessionId: string
  category: ReworkCategory
  affected: ReadonlyArray<ReworkAffectedItemInput>
  targetDraftVersionId: string
  targetSnapshotId: string
  /** changeId → 受影响 instanceIds。 */
  changes: ReadonlyArray<{ changeId: string; instanceIds: string[] }>
  day: number
  /** 参与估算的学科单位成本（来自 estimateCost）。 */
  costPerUnit: ReadonlyArray<number>
}

export interface ReworkPlan {
  session: ExecutionReworkSession
  tasks: ExecutionReworkTask[]
  /** 新增返工 WP（kind=REWORK，可直接并入 workPackages）。 */
  reworkWorkPackages: WorkPackage[]
  breakdown: ReworkCostBreakdown
}

/**
 * 开始返工：state 恒 ACTIVE（呈现标签），权威快照**不变**（R-PROJ-0）。
 * 成本只给区间估算，不锁死 actual（R-PROJ-5）。A 类不返工。
 */
export function planRework(
  state: ProjectExecutionState,
  input: StartReworkInput,
  params: ProjectFormulaParams,
): ReworkPlan {
  if (state.project.state !== 'ACTIVE') {
    throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, `rework requires ACTIVE, got ${state.project.state}`)
  }
  if (input.category === 'A') {
    throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, 'category A is metadata-only: no rework (§5.5-1)')
  }
  // §6.5：δ 分母取会话开始权威快照的 W_total（Σ NORMAL WP baseline）
  const baseTotal = state.workPackages
    .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
    .reduce((s, wp) => s + wp.baselineWorkUnits, 0)
  const breakdown = computeReworkCostBreakdown(
    { category: input.category, affected: input.affected, workTotal: baseTotal },
    params,
  )
  const range = estimateReworkCostRange(breakdown.reworkWorkUnits, input.costPerUnit, params)

  const tasks: ExecutionReworkTask[] = []
  const reworkWorkPackages: WorkPackage[] = []
  input.changes.forEach((change, i) => {
    const taskId = deterministicId('rtask', input.sessionId, change.changeId)
    // 返工 WP：workUnits = 该任务承担的分段工作量（单一 change 取 session 总工作量）
    const units = breakdown.reworkWorkUnits / Math.max(1, input.changes.length)
    const wp: WorkPackage = {
      workPackageId: deterministicId('wp', state.project.projectId, 'rework', input.sessionId, change.changeId),
      projectId: state.project.projectId,
      // 返工 WP 来源于旧权威快照（新快照尚未权威，§5.1-3）
      snapshotId: state.project.snapshotId,
      sourceRef: { reworkTaskId: taskId },
      discipline: inferDiscipline(input.affected),
      workUnits: units,
      baselineWorkUnits: units,
      remainingWorkUnits: units,
      deliveredWorkUnits: 0,
      progress: 0,
      skillRef: null,
      requiredSkillLevel: 0,
      blockedBy: [],
      dependents: [],
      priority: 'P0',
      state: 'READY',
      kind: 'REWORK',
      // 返工为闸门级决策（§8.1）：orderIndex 取负偏移，确保同为 P0 时在同日派工中先于既有 WP
      orderIndex: -1 - i,
      reworkSessionId: input.sessionId,
      reworkMode: breakdown.mode,
    }
    reworkWorkPackages.push(wp)
    tasks.push({
      taskId,
      sessionId: input.sessionId,
      changeId: change.changeId,
      category: input.category,
      affectedInstanceIds: [...change.instanceIds],
      deltaWorkUnits: units,
      workPackageId: wp.workPackageId,
      state: 'PENDING',
      orderIndex: i,
    })
  })

  const session: ExecutionReworkSession = {
    sessionId: input.sessionId,
    projectId: state.project.projectId,
    status: 'active',
    targetDraftVersionId: input.targetDraftVersionId,
    targetSnapshotId: input.targetSnapshotId,
    baseSnapshotId: state.project.snapshotId,
    taskIds: tasks.map((t) => t.taskId),
    changeIds: input.changes.map((c) => c.changeId),
    mode: breakdown.mode,
    costEstimate: {
      mode: breakdown.mode,
      lowCents: range.lowCents,
      highCents: range.highCents,
      actualCents: 0,
      reworkWorkUnits: breakdown.reworkWorkUnits,
    },
    sunkCostEstimateWorkUnits: breakdown.sunkWorkUnits,
    gateResult: null,
    baseTotalWorkUnits: baseTotal,
    startedAt: input.day,
    closedAt: null,
  }
  return { session, tasks, reworkWorkPackages, breakdown }
}

function inferDiscipline(affected: ReadonlyArray<ReworkAffectedItemInput>): Discipline {
  void affected
  // 课目维度不参与成本（成本按工作量计），统一归 'design' 以便派工集合固定；
  // 实际返工按 affected 的学科 WP 归集见 planRework 的 units 均分口径。
  return 'design'
}

/** 将返工计划并入项目状态（state 保持不变，`reworkSessionId` 非空 ⇒ 呈现标签出现）。 */
export function beginRework(state: ProjectExecutionState, plan: ReworkPlan, day: number): ProjectExecutionState {
  const next = cloneState(state)
  if (next.project.reworkSessionId !== null) {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_NOT_ACTIVE, 'a rework session is already active')
  }
  next.project.state = transitionProjectState(next.project.state, 'rework_start')
  next.project.reworkSessionId = plan.session.sessionId
  next.project.reworkCount += 1
  next.project.updatedAt = day
  next.reworkSessions.push(plan.session)
  next.reworkTasks.push(...plan.tasks)
  next.workPackages.push(...plan.reworkWorkPackages)
  next.project.workPackageIds.push(...plan.reworkWorkPackages.map((wp) => wp.workPackageId))
  return next
}

export interface CompleteReworkInput {
  day: number
  /** D-01 §7.2.1 闸门结果（提交点同步执行，fail-closed）。 */
  gate: GateOutcome
  /** 新快照分学科 W_d（rebaseline 用；闸门 PASS 时必填）。 */
  newWorkload?: DisciplineWorkload
}

/**
 * 返工完成（§5.5-6 / §4.3）：
 *  - `ExecutionReworkTask` 全完成 ∧ `RevalidationGate` 零 E 级 ⇒ 切 snapshotId → 新、rebaseline、会话 completed；
 *  - 否则 **不切快照**、会话保持 active、state 保持 ACTIVE（fail-closed，TC-07）。
 */
export function completeRework(
  state: ProjectExecutionState,
  input: CompleteReworkInput,
  params: ProjectFormulaParams,
): { state: ProjectExecutionState; switched: boolean; gate: { pass: boolean; violationCodes: string[] } } {
  const next = cloneState(state)
  const sessionId = next.project.reworkSessionId
  if (sessionId === null) {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_MISSING, 'no active rework session')
  }
  const session = next.reworkSessions.find((s) => s.sessionId === sessionId)
  if (session === undefined || session.status !== 'active') {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_NOT_ACTIVE, 'rework session not active')
  }
  const tasksDone = next.reworkTasks.filter((t) => t.sessionId === sessionId).every((t) => t.state === 'DONE')
  const eViolations = (input.gate.violations ?? []).filter((v) => v.severity === 'E')
  const gatePass = input.gate.pass === true && eViolations.length === 0
  const gateResult = { pass: gatePass, violationCodes: (input.gate.violations ?? []).map((v) => v.code) }
  session.gateResult = gateResult

  if (!gatePass || !tasksDone) {
    // §4.5 active --完成闸门FAIL--> active（附 ViolationSet，返回修正）
    return { state: next, switched: false, gate: gateResult }
  }

  // 切权威快照（唯一 snapshotId，R-PROJ-0）
  const targetSnapshotId = session.targetSnapshotId
  next.project.snapshotId = targetSnapshotId
  next.project.state = transitionProjectState('ACTIVE', 'rework_complete')
  // rebaseline（§5.5-5，防双算）
  if (input.newWorkload !== undefined) {
    const reb = rebaselineWorkPackages(next.workPackages, input.newWorkload, targetSnapshotId)
    next.workPackages = reb.workPackages
  }
  // 返工 WP 随之归档（剩余清零）
  next.workPackages = next.workPackages.map((wp) =>
    wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const, remainingWorkUnits: 0 } : wp,
  )
  next.reworkTasks = next.reworkTasks.map((t) => (t.sessionId === sessionId ? { ...t, state: 'DONE' as const } : t))
  session.status = 'completed'
  session.closedAt = input.day
  next.project.reworkSessionId = null
  next.project.updatedAt = input.day
  void params

  if (allWorkPackagesDone(next.workPackages)) {
    next.project.state = transitionProjectState('ACTIVE', 'all_work_packages_done')
  }
  return { state: next, switched: true, gate: gateResult }
}

/** §4.5 撤销返工：丢弃目标草稿，旧快照继续生效（权威不变）。 */
export function cancelRework(state: ProjectExecutionState, day: number): ProjectExecutionState {
  const next = cloneState(state)
  const sessionId = next.project.reworkSessionId
  if (sessionId === null) {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_MISSING, 'no active rework session')
  }
  const session = next.reworkSessions.find((s) => s.sessionId === sessionId)!
  session.status = 'cancelled'
  session.closedAt = day
  next.reworkTasks = next.reworkTasks.map((t) =>
    t.sessionId === sessionId && t.state !== 'DONE' ? { ...t, state: 'CANCELLED' as const } : t,
  )
  next.workPackages = next.workPackages.map((wp) =>
    wp.reworkSessionId === sessionId && wp.state !== 'DONE' ? { ...wp, state: 'DEACTIVATED' as const } : wp,
  )
  next.project.reworkSessionId = null
  next.project.state = 'ACTIVE'
  next.project.updatedAt = day
  return next
}

/** 交付闸门结果同步消费（§5.6 / C8：只调用一次，fail-closed）。 */
export function markReworkTasksFromWorklogs(state: ProjectExecutionState): ProjectExecutionState {
  const next = cloneState(state)
  const doneWps = new Set(next.workPackages.filter((wp) => wp.state === 'DONE').map((wp) => wp.workPackageId))
  next.reworkTasks = next.reworkTasks.map((t) =>
    t.state === 'PENDING' && t.workPackageId !== null && doneWps.has(t.workPackageId)
      ? { ...t, state: 'DONE' as const }
      : t,
  )
  return next
}

// ===== 交付（§4.3 / §5.6） =====

export interface SubmitDeliveryInput {
  day: number
  gate: GateOutcome
  versionLabel: string
  deliveryForm: DeliveryForm
  actualCostCents: number
  deliveredTier: number
  qualitySnapshotRef?: string | null
  defectListRefs?: string[]
  /** 计数用：项目累计支出（来自 expenseTxIds 关联的交易）。 */
  expenseTotalCents?: number
}

/**
 * 提交交付：仅 `READY_TO_DELIVER` 可提交；闸门 PASS ⇒ COMPLETED + 生成 Build；
 * FAIL ⇒ 阻断、不生成 Build、回路返工（§4.3 READY_TO_DELIVER→ACTIVE）。
 * COMPLETED 终态拒绝二次交付（§10 B-6，TC-04）。
 */
export function submitDelivery(
  state: ProjectExecutionState,
  input: SubmitDeliveryInput,
): { state: ProjectExecutionState; completed: boolean; build: Build | null } {
  const next = cloneState(state)
  if (next.project.state === 'COMPLETED') {
    throw new ProjectError(PROJ_ERROR.TERMINAL_STATE, 'COMPLETED rejects duplicate delivery (§10 B-6)')
  }
  if (next.project.state !== 'READY_TO_DELIVER') {
    throw new ProjectError(
      PROJ_ERROR.INVALID_STATE_TRANSITION,
      `delivery requires READY_TO_DELIVER, got ${next.project.state}`,
    )
  }
  const eViolations = (input.gate.violations ?? []).filter((v) => v.severity === 'E')
  const gatePass = input.gate.pass === true && eViolations.length === 0
  if (!gatePass) {
    next.project.state = transitionProjectState('READY_TO_DELIVER', 'delivery_fail')
    next.project.updatedAt = input.day
    return { state: next, completed: false, build: null }
  }
  const build: Build = {
    buildId: deterministicId('build', next.project.projectId, next.builds.length),
    projectId: next.project.projectId,
    snapshotId: next.project.snapshotId,
    versionLabel: input.versionLabel,
    deliveryForm: input.deliveryForm,
    deliveryGateResult: { pass: true, violationCodes: [] },
    qualitySnapshotRef: input.qualitySnapshotRef ?? null,
    defectListRefs: [...(input.defectListRefs ?? [])],
    deliveredTier: input.deliveredTier,
    actualCostCents: input.actualCostCents,
    builtAt: input.day,
  }
  next.builds.push(build)
  next.project.buildIds.push(build.buildId)
  next.project.state = transitionProjectState('READY_TO_DELIVER', 'delivery_pass')
  next.project.updatedAt = input.day
  return { state: next, completed: true, build }
}

// ===== 汇总视图（UI 只读消费，§8.4） =====

export interface ProjectExecutionView {
  state: ProjectState
  reworkLabel: boolean
  progressVector: DisciplineWorkload
  bottleneck: Discipline | null
  burden: DisciplineWorkload
  remainingWorkUnits: DisciplineWorkload
  snapshotId: string
  reworkCount: number
  reworkExcessive: boolean
}

export function summarizeProjectExecution(
  state: ProjectExecutionState,
  members: ReadonlyArray<TeamMember>,
  day: number,
  params: ProjectFormulaParams,
): ProjectExecutionView {
  const capacity = defaultWorkload()
  for (const d of DISCIPLINE_ORDER) {
    let sum = 0
    for (const m of members) {
      if (m.available !== undefined && !m.available(day)) continue
      const level = m.skillLevels[d] ?? 0
      if (level <= 0) continue
      sum += params.fSkill[level] ?? 0
    }
    capacity[d] = params.kOutput * sum
  }
  const bottleneck = computeBottleneck(state.workPackages, capacity, params.epsilon)
  return {
    state: state.project.state,
    reworkLabel: isInReworkDisplay(state),
    progressVector: progressVector(state.workPackages),
    bottleneck: bottleneck.discipline,
    burden: bottleneck.burden,
    remainingWorkUnits: remainingOf(state.workPackages),
    snapshotId: state.project.snapshotId,
    reworkCount: state.project.reworkCount,
    reworkExcessive: state.project.reworkCount >= params.kReworkLimit,
  }
}
