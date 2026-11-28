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
import type { CreateCommitmentInput } from '@domain/value-objects/finance-commitment'
import { monthKeyOf } from '@domain/value-objects/finance-commitment'
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
  computeChangeWorkUnits,
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
import {
  checkRemainingInvariant,
  rebaselineWorkPackages,
} from './project-execution-rebaseline'
import { DISCIPLINE_ORDER, type ProjectFormulaParams } from './project-execution-tuning'

/**
 * R1（ADJ-06 §2）：闸门单一入参。**只有** `pass` 与 `violations` 两个通道，
 * `refViolations` / `hardRuleViolations` 已删除——D-01 内部有几个违规通道、怎么合并，是 D-01 的事；
 * Project 只接收"是否通过 + 违规列表"，杜绝三通道旁路复发（CODE-01/CODE-03 各犯过一次）。
 */
export interface GateOutcome {
  pass: boolean
  violations: ReadonlyArray<{ code: string; severity: string }>
}

export interface GateEvaluation {
  gatePass: boolean
  violationCodes: string[]
  /** 诊断输出（不改变 fail-closed 行为）。矛盾输入（pass=true 但含 E）⇒ PROJ_GATE_INCONSISTENT。 */
  diagnostics: string[]
}

/**
 * R1：`gatePass = pass === true && violations 无 E 级`。唯一判定实现（返工与交付共用，
 * CR-03-14：避免闸门修补漏改一处）。
 */
export function evaluateGate(gate: GateOutcome): GateEvaluation {
  const violations = [...(gate.violations ?? [])]
  const eViolations = violations.filter((v) => v.severity === 'E')
  const diagnostics: string[] = []
  if (gate.pass === true && eViolations.length > 0) {
    diagnostics.push(PROJ_ERROR.GATE_INCONSISTENT)
  }
  return {
    gatePass: gate.pass === true && eViolations.length === 0,
    violationCodes: violations.map((v) => v.code),
    diagnostics,
  }
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
  /** FIN AvailableCash at setup；承诺额 round(hrb × BudgetCapacity) 必须 ≤ 它（§5.4-1；hrb 缺省 0.5）。 */
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
    // R10（P2-4）：Cost_est 的 W_d 不含返工 WP——返工是"把改坏的部分改回来"，其工作量
    // 属于已计成本的沉没/追加，重复计入会让 ratio 虚增、误判"需缩减"。
    if (wp.state === 'DEACTIVATED' || wp.kind === 'REWORK') continue
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
 * 前置：绑定唯一 snapshotId、依赖无环（拆解内校验）、承诺额 round(hrb × BudgetCapacity) ≤ AvailableCash（hrb 缺省 0.5）。
 * 副作用：创建 WPs；建 `project_budget` 承诺（**不改现金**，BR-3）。
 */
export function createProjectExecution(
  input: CreateProjectInput,
  params: ProjectFormulaParams,
): ProjectExecutionState {
  // ADJ-2026-11-24-30 §3.1：守卫校验对象是"承诺额"（hrb × budgetCapacityCents），不是整笔容量。
  // 与 game-world.ts 的 preview/createExecutionProject 同源；纪律"承诺额 ≤ AvailableCash"不放宽。
  const hrbForGuard = input.hrb ?? 0.5
  const commitmentCents = Math.round(hrbForGuard * input.budgetCapacityCents)
  if (commitmentCents > input.availableCashCents) {
    throw new ProjectError(
      PROJ_ERROR.BUDGET_CAPACITY_EXCEEDS_CASH,
      `commitmentCents(hrb × budgetCapacityCents) ${commitmentCents} > AvailableCash ${input.availableCashCents}`,
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
    deliveryFailures: 0,
    lastDeliveryFailure: null,
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
 * 承诺创建**不改现金**（BR-3）。R5（ADJ-06 §4.2）：经 `ledger.registerCommitment` 落入
 * `UnifiedLedger` 承诺注册表（权威事实源）；`commitmentIds` 退化为索引。
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
  const payload: CreateCommitmentInput = {
    commitmentId,
    companyId: next.project.companyId,
    sourceType: 'project_budget',
    sourceRef: next.project.projectId,
    amountCents: amount,
    period: 'one_off',
    startAt: input.day,
    endAt: input.endAt ?? input.day,
  }
  const res = input.ledger.registerCommitment(payload)
  if (!res.success) {
    throw new ProjectError(PROJ_ERROR.LEDGER_POST_FAILED, res.errorMessage ?? 'registerCommitment failed at setup')
  }
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
    const res = ctx.ledger.registerCommitment({
      commitmentId,
      companyId: next.project.companyId,
      sourceType: 'project_budget',
      sourceRef: next.project.projectId,
      amountCents: delta,
      period: 'one_off',
      startAt: ctx.day,
      endAt: ctx.day,
    })
    if (!res.success) {
      throw new ProjectError(PROJ_ERROR.LEDGER_POST_FAILED, res.errorMessage ?? 'registerCommitment failed at top-up')
    }
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
  work: 'total' | 'remaining' = 'total',
): CostEstimateResult {
  return estimateProjectCost(
    {
      workload: work === 'remaining' ? remainingOf(state.workPackages) : workloadOf(state.workPackages),
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
  // R9（P2-3 / CR-03-11）：日推进的 WP 完成点**同步**置对应 ReworkTask DONE——
  // 正常推进路径即可完成返工任务，不依赖未文档化的手动补丁函数。
  next.reworkTasks = syncReworkTasks(next.reworkTasks, next.workPackages)
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

/**
 * §4.3 恢复。R7（P2-1）：恢复前按同一公式判超时——PAUSED 已超 60 天 ⇒ 先强制转
 * `CANCELLED` 并拒绝恢复（与 advanceProjectDay/读档路径同一 `isPauseTimedOut`，封堵状态机后门）。
 * 团队为空 ⇒ 抛 `PROJ_TEAM_REQUIRED`（R15 P3-3：未用错误码要么用要么删；不再静默保持 PAUSED）。
 */
export function resumeProject(
  state: ProjectExecutionState,
  day: number,
  members: ReadonlyArray<TeamMember>,
  params: ProjectFormulaParams,
): { state: ProjectExecutionState; resumed: boolean; reason?: string } {
  const next = cloneState(state)
  if (next.project.state !== 'PAUSED') {
    return { state: next, resumed: false, reason: `not paused (${next.project.state})` }
  }
  const p = next.project
  // R7：超时判定与推进/读档同式（C5）
  p.pausedDays = computePausedDays(p.pausedAtDayIndex, day)
  if (isPauseTimedOut(p.pausedAtDayIndex, day, params.pauseTimeoutDays)) {
    p.state = transitionProjectState('PAUSED', 'pause_timeout')
    p.updatedAt = day
    return { state: next, resumed: false, reason: 'pause_timeout: project force-cancelled' }
  }
  if (members.length === 0) {
    throw new ProjectError(PROJ_ERROR.TEAM_REQUIRED, 'resume requires a non-empty team (§4.3 前置条件)')
  }
  p.state = transitionProjectState('PAUSED', 'resume')
  const cleared = clearPauseFields()
  p.pausedAtDayIndex = cleared.pausedAtDayIndex
  p.pausedDays = cleared.pausedDays
  p.pauseReason = cleared.pauseReason
  p.updatedAt = day
  return { state: next, resumed: true }
}

/** R13（P2-7 / TC-18）存档投影：执行事实 + 参数快照（派生估算不入档，§3.4 注）。 */
export interface ProjectExecutionArchiveV2 {
  project: ExecutionProject
  workPackages: WorkPackage[]
  worklogs: Worklog[]
  reworkSessions: ExecutionReworkSession[]
  reworkTasks: ExecutionReworkTask[]
  builds: Build[]
  /** §11 S4 参数快照：读档**强制**用存档参数（缺参抛 PROJ_ARCHIVE_PARAMS_REQUIRED）。 */
  formulaParams: ProjectFormulaParams
  /** FIN 账本交易 id（支出侧，append-only 事实）。 */
  expenseTxIds: string[]
}

/** 生成存档：显式固化 formulaParams（P2-7：存档必须可复现同一结果）。 */
export function archiveProjectExecution(
  state: ProjectExecutionState,
  params: ProjectFormulaParams,
): ProjectExecutionArchiveV2 {
  return {
    project: { ...state.project },
    workPackages: state.workPackages.map((wp) => ({ ...wp, blockedBy: [...wp.blockedBy], dependents: [...wp.dependents] })),
    worklogs: [...state.worklogs],
    reworkSessions: state.reworkSessions.map((s) => ({ ...s, costEstimate: { ...s.costEstimate } })),
    reworkTasks: state.reworkTasks.map((t) => ({ ...t })),
    builds: [...state.builds],
    formulaParams: { ...params },
    expenseTxIds: [...state.expenseTxIds],
  }
}

/** §11 S1 读档：按**存档参数快照**重算 pausedDays（C5）；未接存档参数的旧档拒绝读入（fail-closed）。 */
export function restoreProjectExecution(
  archive: ProjectExecutionArchiveV2,
  day: number,
): ProjectExecutionState {
  if (archive.formulaParams === undefined || archive.formulaParams === null) {
    throw new ProjectError(
      PROJ_ERROR.ARCHIVE_PARAMS_REQUIRED,
      'archive is missing formulaParams snapshot (§11 S4); refusing to restore with ambient params',
    )
  }
  const params = archive.formulaParams
  const project = { ...archive.project }
  if (project.state === 'PAUSED') {
    const f = restorePauseFields(
      { pausedAtDayIndex: project.pausedAtDayIndex, pausedDays: project.pausedDays, pauseReason: project.pauseReason },
      day,
    )
    project.pausedAtDayIndex = f.pausedAtDayIndex
    project.pausedDays = f.pausedDays
    project.pauseReason = f.pauseReason
    if (isPauseTimedOut(f.pausedAtDayIndex, day, params.pauseTimeoutDays)) {
      project.state = transitionProjectState('PAUSED', 'pause_timeout')
    }
  }
  return {
    project,
    workPackages: archive.workPackages.map((wp) => ({ ...wp, blockedBy: [...wp.blockedBy], dependents: [...wp.dependents] })),
    worklogs: [...archive.worklogs],
    reworkSessions: archive.reworkSessions.map((s) => ({ ...s, costEstimate: { ...s.costEstimate } })),
    reworkTasks: archive.reworkTasks.map((t) => ({ ...t })),
    builds: [...archive.builds],
    expenseTxIds: [...archive.expenseTxIds],
  }
}

/**
 * §4.3 取消（任意非终态）。R5（ADJ-06 §4.2）：提供账本时**显式释放**本项目的全部预算承诺
 * （`releaseCommitment(id, effectiveMonth)`，effectiveMonth = monthKeyOf(day)）——
 * 否则玩家取消项目后承诺仍占着 AvailableCash（可观察玩法 bug，ADJ-06 §4.1）。
 * 释放成功后才转 CANCELLED；释放失败抛错且状态不变（fail-closed）。
 */
export function cancelProject(
  state: ProjectExecutionState,
  day: number,
  ctx?: { ledger: UnifiedLedger },
): ProjectExecutionState {
  const next = cloneState(state)
  assertNonTerminal(next.project, 'cancelProject')
  if (ctx !== undefined) {
    const effectiveMonth = monthKeyOf(day)
    for (const c of ctx.ledger.getCommitments(next.project.companyId, { sourceRef: next.project.projectId })) {
      if (c.state === 'cancelled') continue
      const res = ctx.ledger.releaseCommitment(next.project.companyId, c.commitmentId, effectiveMonth)
      if (!res.success) {
        throw new ProjectError(
          PROJ_ERROR.LEDGER_POST_FAILED,
          res.errorMessage ?? `releaseCommitment ${c.commitmentId} failed on cancel`,
        )
      }
    }
  }
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
 * R11（ADJ-08 §2）：按受影响学科生成多个 `kind=REWORK` WP（各自 baseline = 该学科的返工工作量）；
 * 受影响学科无法确定 ⇒ 抛 `PROJ_REWORK_SCOPE_UNKNOWN`（**禁止默认 design**）；
 * 分摊后为 0 的学科不生成 WP（P3-2：无 0 baseline WP）。
 */
export function planRework(
  state: ProjectExecutionState,
  input: StartReworkInput,
  params: ProjectFormulaParams,
): ReworkPlan {
  const validReadyRework = state.project.state === 'READY_TO_DELIVER' &&
    input.targetSnapshotId !== state.project.snapshotId
  if (state.project.state !== 'ACTIVE' && !validReadyRework) {
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

  // R11：学科维度 fail-closed——affected 必须携带学科，且每项能关联到 changeId
  if (input.affected.length === 0) {
    throw new ProjectError(PROJ_ERROR.REWORK_SCOPE_UNKNOWN, 'rework affected scope carries no items')
  }
  for (const item of input.affected) {
    if (!(DISCIPLINE_ORDER as readonly string[]).includes(item.discipline)) {
      throw new ProjectError(
        PROJ_ERROR.REWORK_SCOPE_UNKNOWN,
        `affected item ${item.instanceId} has unknown discipline (ADJ-08 §2: no default design)`,
      )
    }
  }

  // 每个受影响项的变更量 wc_i（与全量 breakdown 同一公式逐项计算），按占比分摊返工工作量
  const changePerItem = input.affected.map((item) =>
    computeChangeWorkUnits({ category: input.category, affected: [item], workTotal: baseTotal }, params),
  )
  const changeSum = changePerItem.reduce((s, v) => s + v, 0)
  if (changeSum <= 0 || breakdown.reworkWorkUnits <= 0) {
    throw new ProjectError(
      PROJ_ERROR.REWORK_SCOPE_UNKNOWN,
      'rework workload cannot be attributed to any affected discipline (all change units are zero)',
    )
  }

  const tasks: ExecutionReworkTask[] = []
  const reworkWorkPackages: WorkPackage[] = []
  input.affected.forEach((item, i) => {
    const share = (breakdown.reworkWorkUnits * changePerItem[i]!) / changeSum
    // 分摊后为 0 的学科不生成返工 WP（P3-2）
    if (share <= 0) return
    // s-2（ADJ-14 D-2）：显式契约——affected 必须能对齐到 changes 中的 change；
    // 旧回退 `?? input.changes[i]` 在 affected 与 changes 未对齐时会把 changeId 挂到
    // 无关 change（归档口径失真），改为 fail-closed 抛错。
    const changeRef = input.changes.find((c) => c.instanceIds.includes(item.instanceId))
    if (changeRef === undefined) {
      throw new ProjectError(
        PROJ_ERROR.REWORK_CHANGE_UNMATCHED,
        `affected item ${item.instanceId} (discipline ${item.discipline}) matches no change in input.changes; positional fallback removed (s-2 explicit contract)`,
      )
    }
    const changeId = changeRef.changeId
    const taskId = deterministicId('rtask', input.sessionId, changeId, item.discipline)
    const wp: WorkPackage = {
      workPackageId: deterministicId('wp', state.project.projectId, 'rework', input.sessionId, item.discipline, item.instanceId),
      projectId: state.project.projectId,
      // 返工 WP 来源于旧权威快照（新快照尚未权威，§5.1-3）
      snapshotId: state.project.snapshotId,
      sourceRef: { reworkTaskId: taskId },
      discipline: item.discipline,
      workUnits: share,
      baselineWorkUnits: share,
      remainingWorkUnits: share,
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
      changeId,
      category: input.category,
      affectedInstanceIds: [item.instanceId],
      deltaWorkUnits: share,
      workPackageId: wp.workPackageId,
      state: 'PENDING',
      orderIndex: i,
    })
  })
  if (reworkWorkPackages.length === 0) {
    throw new ProjectError(
      PROJ_ERROR.REWORK_SCOPE_UNKNOWN,
      'no rework WorkPackage generated: all affected disciplines resolve to zero baseline',
    )
  }

  const session: ExecutionReworkSession = {
    sessionId: input.sessionId,
    projectId: state.project.projectId,
    status: 'active',
    targetDraftVersionId: input.targetDraftVersionId,
    targetSnapshotId: input.targetSnapshotId,
    baseSnapshotId: state.project.snapshotId,
    taskIds: tasks.map((t) => t.taskId),
    changeIds: [...new Set(tasks.map((t) => t.changeId))],
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
  /** R1：D-01 闸门结果单一入参 `{ pass, violations }`（提交点同步执行，fail-closed）。 */
  gate: GateOutcome
  /** R2（P1-1）：新快照分学科 W_d，**必填**（类型层面不可省）；缺参/学科残缺抛 PROJ_SNAPSHOT_SWITCH_BLOCKED。 */
  newWorkload: DisciplineWorkload
  /** Decomposition of the frozen target, when supplied by the blueprint owner. */
  targetWorkPackages?: readonly WorkPackage[]
}

/**
 * 返工完成（§5.5-6 / §4.3）：
 *  - 任务完成由 WP DONE 派生（R9）∧ `evaluateGate` 零 E 级 ⇒ 切 snapshotId → 新、rebaseline、会话 completed；
 *  - 否则 **不切快照**、会话保持 active、state 保持 ACTIVE（fail-closed，TC-07）。
 * R2（P1-1 / ADJ-06 §1.2）：切快照**原子**——rebaseline 成功 ∧ 开工 WP 全部指向新快照 ∧
 * Σbaseline == ΣW_d(new) 三条同时成立才落 `project.snapshotId`；任一不成立抛错，
 * 调用方拿到的原状态逐字段不变（fail-closed 干净）。
 */
export function completeRework(
  state: ProjectExecutionState,
  input: CompleteReworkInput,
  params: ProjectFormulaParams,
): { state: ProjectExecutionState; switched: boolean; gate: { pass: boolean; violationCodes: string[]; diagnostics: string[] } } {
  const next = cloneState(state)
  const sessionId = next.project.reworkSessionId
  if (sessionId === null) {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_MISSING, 'no active rework session')
  }
  const session = next.reworkSessions.find((s) => s.sessionId === sessionId)
  if (session === undefined || session.status !== 'active') {
    throw new ProjectError(PROJ_ERROR.REWORK_SESSION_NOT_ACTIVE, 'rework session not active')
  }
  // R2：newWorkload 运行时校验（类型必填之外的兜底）：缺参或学科残缺 ⇒ 拒绝切快照
  if (input.newWorkload === undefined || input.newWorkload === null) {
    throw new ProjectError(PROJ_ERROR.SNAPSHOT_SWITCH_BLOCKED, 'newWorkload is required to switch snapshots (R2/P1-1)')
  }
  for (const d of DISCIPLINE_ORDER) {
    const v = input.newWorkload[d]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new ProjectError(
        PROJ_ERROR.SNAPSHOT_SWITCH_BLOCKED,
        `newWorkload is missing or invalid for discipline "${d}" (partial discipline set rejected)`,
      )
    }
  }
  const gate = evaluateGate(input.gate)
  const gateResult = { pass: gate.gatePass, violationCodes: gate.violationCodes, diagnostics: gate.diagnostics }
  session.gateResult = { pass: gate.gatePass, violationCodes: gate.violationCodes }

  // R9：任务完成由 WP DONE 派生（真实日推进已把返工 WP 推到 DONE）
  const sessionWps = next.workPackages.filter((wp) => wp.reworkSessionId === sessionId && wp.state !== 'DEACTIVATED')
  const tasksDone = sessionWps.length > 0 && sessionWps.every((wp) => wp.state === 'DONE')

  if (!gate.gatePass || !tasksDone) {
    // §4.5 active --完成闸门FAIL--> active（附 ViolationSet，返回修正）
    return { state: next, switched: false, gate: gateResult }
  }

  const targetSnapshotId = session.targetSnapshotId
  // R2：rebaseline 先行（可能抛 PROJ_REBASELINE_UNBALANCED）；抛错时 next 被丢弃，原状态干净
  if (input.targetWorkPackages !== undefined) {
    next.workPackages = rebaseToTargetPackages(next.workPackages, input.targetWorkPackages, input.newWorkload, targetSnapshotId)
    next.project.workPackageIds = next.workPackages.map((wp) => wp.workPackageId)
  } else {
  const reb = rebaselineWorkPackages(next.workPackages, input.newWorkload, targetSnapshotId)
  // R3：守恒断言对**传入的 W_d(new)**（禁止自证）；失败 ⇒ 整个切换回滚
  if (!checkRemainingInvariant(reb, input.newWorkload)) {
    throw new ProjectError(
      PROJ_ERROR.REBASELINE_UNBALANCED,
      'rebaseline invariant violated (Σremaining != ΣW_d(new) − Σdelivered, or delivered > baseline); switch rolled back',
    )
  }
  // R2 原子条件 ③：开工（未归档）NORMAL WP 的 Σbaseline == Σ W_d(new) − 已承载折算量。
  // R3B（ADJ-14 D-1，M-1 修复）：无 open WP 学科的 W_d(new) 中已由 DONE NORMAL WP 交付量
  // 承载的部分不再要求 open WP 承载，与 rebaseline 预检同口径扣减（doneCarriedCreditWorkUnits
  // 由 rebaseline 单一来源给出，两级判定一致）。
  const openBaseline = reb.workPackages
    .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DONE' && wp.state !== 'DEACTIVATED')
    .reduce((s, wp) => s + wp.baselineWorkUnits, 0)
  const targetTotal = DISCIPLINE_ORDER.reduce((s, d) => s + input.newWorkload[d], 0)
  if (Math.abs(openBaseline - (targetTotal - reb.doneCarriedCreditWorkUnits)) > 1e-6) {
    throw new ProjectError(
      PROJ_ERROR.REBASELINE_UNBALANCED,
      `Σ open NORMAL baseline ${openBaseline} != Σ W_d(new) ${targetTotal} − done-carried credit ${reb.doneCarriedCreditWorkUnits}; switch rolled back`,
    )
  }
  // ——原子提交：以下全部成功才对外返回——
  next.workPackages = reb.workPackages
  }
  next.project.snapshotId = targetSnapshotId
  next.project.versionId = session.targetDraftVersionId
  next.project.state = transitionProjectState('ACTIVE', 'rework_complete')
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

function rebaseToTargetPackages(
  existing: readonly WorkPackage[],
  target: readonly WorkPackage[],
  workload: DisciplineWorkload,
  snapshotId: string,
): WorkPackage[] {
  const targetIds = new Set(target.map((wp) => wp.workPackageId))
  if (targetIds.size !== target.length || target.some((wp) =>
    wp.snapshotId !== snapshotId || wp.kind !== 'NORMAL' ||
    !Number.isFinite(wp.baselineWorkUnits) || wp.baselineWorkUnits < 0 ||
    wp.blockedBy.some((id) => !targetIds.has(id)))) {
    throw new ProjectError(PROJ_ERROR.REBASELINE_UNBALANCED, 'Invalid target work packages')
  }
  for (const discipline of DISCIPLINE_ORDER) {
    const units = target.filter((wp) => wp.discipline === discipline)
      .reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
    if (Math.abs(units - workload[discipline]) > 1e-6) {
      throw new ProjectError(PROJ_ERROR.REBASELINE_UNBALANCED, `Unbalanced target workload for ${discipline}`)
    }
  }
  const previous = new Map(existing.filter((wp) => wp.state !== 'DEACTIVATED').map((wp) => [wp.workPackageId, wp]))
  const live = target.map((wp): WorkPackage => {
    const deliveredWorkUnits = Math.min(wp.baselineWorkUnits, previous.get(wp.workPackageId)?.deliveredWorkUnits ?? 0)
    const remaining = wp.baselineWorkUnits - deliveredWorkUnits
    return {
      ...wp,
      deliveredWorkUnits,
      remainingWorkUnits: remaining <= 1e-9 ? 0 : remaining,
      progress: wp.baselineWorkUnits === 0 ? 1 : deliveredWorkUnits / wp.baselineWorkUnits,
      state: remaining <= 1e-9 ? 'DONE' : 'READY',
    }
  })
  const unfinished = new Set(live.filter((wp) => wp.state !== 'DONE').map((wp) => wp.workPackageId))
  return [
    ...live.map((wp): WorkPackage => wp.state !== 'DONE' && wp.blockedBy.some((id) => unfinished.has(id))
      ? { ...wp, state: 'BLOCKED' }
      : wp),
    ...existing.filter((wp) => !targetIds.has(wp.workPackageId)).map((wp): WorkPackage =>
      wp.kind === 'REWORK' ? wp : { ...wp, state: 'DEACTIVATED' }),
  ]
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

/** 由 WP DONE 派生任务完成（R9）：PENDING 且其 WP 已 DONE ⇒ DONE。 */
function syncReworkTasks(
  tasks: ReadonlyArray<ExecutionReworkTask>,
  wps: ReadonlyArray<WorkPackage>,
): ExecutionReworkTask[] {
  const doneWps = new Set(wps.filter((wp) => wp.state === 'DONE').map((wp) => wp.workPackageId))
  return tasks.map((t) =>
    t.state === 'PENDING' && t.workPackageId !== null && doneWps.has(t.workPackageId)
      ? { ...t, state: 'DONE' as const }
      : t,
  )
}

/** 交付闸门结果同步消费（§5.6 / C8：只调用一次，fail-closed）。导出供外部补偿同步（如读档）。 */
export function markReworkTasksFromWorklogs(state: ProjectExecutionState): ProjectExecutionState {
  const next = cloneState(state)
  next.reworkTasks = syncReworkTasks(next.reworkTasks, next.workPackages)
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
  deliveryDecision?: Build['deliveryDecision']
  defectListRefs?: string[]
  /** 计数用：项目累计支出（来自 expenseTxIds 关联的交易）。 */
  expenseTotalCents?: number
}

/**
 * 提交交付：仅 `READY_TO_DELIVER` 可提交；闸门 PASS ⇒ COMPLETED + 生成 Build。
 * R14（ADJ-08 §1.3）：FAIL 时 **state 保持 READY_TO_DELIVER**（不退回 ACTIVE、不自动建 ReworkSession），
 * 记 `deliveryFailures += 1` 与 `lastDeliveryFailure = { day, reasonCodes, eViolations }`；
 * 不生成 Build；权威 snapshotId 不变；玩家可再次提交（无次数上限）。
 * COMPLETED 终态拒绝二次交付（§10 B-6，TC-04）。
 */
export function submitDelivery(
  state: ProjectExecutionState,
  input: SubmitDeliveryInput,
): { state: ProjectExecutionState; completed: boolean; build: Build | null; diagnostics: string[] } {
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
  const gate = evaluateGate(input.gate)
  if (!gate.gatePass) {
    // R14：保持 READY_TO_DELIVER，仅记录失败审计；不自动建 ReworkSession（返工是玩家决策）
    const eViolations = [...input.gate.violations].filter((v) => v.severity === 'E')
    next.project.deliveryFailures += 1
    next.project.lastDeliveryFailure = {
      day: input.day,
      reasonCodes: gate.violationCodes,
      eViolations,
    }
    next.project.updatedAt = input.day
    return { state: next, completed: false, build: null, diagnostics: gate.diagnostics }
  }
  const build: Build = {
    buildId: deterministicId('build', next.project.projectId, next.builds.length),
    projectId: next.project.projectId,
    snapshotId: next.project.snapshotId,
    versionLabel: input.versionLabel,
    deliveryForm: input.deliveryForm,
    deliveryGateResult: { pass: true, violationCodes: [] },
    qualitySnapshotRef: input.qualitySnapshotRef ?? null,
    ...(input.deliveryDecision === undefined ? {} : { deliveryDecision: input.deliveryDecision }),
    defectListRefs: [...(input.defectListRefs ?? [])],
    deliveredTier: input.deliveredTier,
    actualCostCents: input.actualCostCents,
    builtAt: input.day,
  }
  next.builds.push(build)
  next.project.buildIds.push(build.buildId)
  next.project.state = transitionProjectState('READY_TO_DELIVER', 'delivery_pass')
  next.project.updatedAt = input.day
  return { state: next, completed: true, build, diagnostics: gate.diagnostics }
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
