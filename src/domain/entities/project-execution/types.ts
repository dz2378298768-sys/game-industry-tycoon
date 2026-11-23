/**
 * Project / WorkPackage 执行内核（PROJ V0.1.1）实体类型。
 *
 * 权威：`docs/design/05_Project与WorkPackage执行规格_V0.1.1.md`
 *  - §3.1 Project、§3.2 WorkPackage、§3.3 Worklog、§3.4 BudgetCapacity/CostEstimate、§3.5 ReworkTask/Session、§3.6 Build
 *  - §4.1 七态（无 REWORKING 枚举；返工 = ACTIVE + ReworkSession(active) 呈现标签）
 *
 * 命名约定：全部类型独立命名（`ExecutionProject` 等），不覆盖既有 `src/domain/entities/project.ts`。
 * 金额一律整数美分 `int cents`，`+∞` 用 `Number.POSITIVE_INFINITY` 显式表示（§3.1 costEstCents）。
 */
import type { BlueprintDiscipline } from '@domain/entities/product-blueprint'

export type Discipline = BlueprintDiscipline

// ===== §4.1 状态 =====

/**
 * §4.1 七态。**不含 REWORKING**（C-继承 D-01 §7.1）：
 * 返工期间 state 恒为 ACTIVE，`ReworkSession(status='active')` 提供"返工中"呈现标签。
 */
export type ProjectState =
  | 'SETUP'
  | 'ACTIVE'
  | 'PAUSED'
  | 'READY_TO_DELIVER'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ABANDONED'

export const PROJECT_STATES: readonly ProjectState[] = [
  'SETUP',
  'ACTIVE',
  'PAUSED',
  'READY_TO_DELIVER',
  'COMPLETED',
  'CANCELLED',
  'ABANDONED',
]

/** 终态（接受态，非死锁）：§4.4。 */
export const PROJECT_TERMINAL_STATES: readonly ProjectState[] = ['COMPLETED', 'CANCELLED', 'ABANDONED']

export function isTerminalState(state: ProjectState): boolean {
  return PROJECT_TERMINAL_STATES.includes(state)
}

/** §3.1 pauseReason；非 PAUSED 为 null。 */
export type PauseReason = 'player' | 'budget_exhausted'

/** §3.2 WorkPackage.state。 */
export type WorkPackageState = 'PENDING' | 'READY' | 'BLOCKED' | 'ACTIVE' | 'DONE' | 'DEACTIVATED'
export type WorkPackagePriority = 'P0' | 'P1' | 'P2'
export type WorkPackageKind = 'NORMAL' | 'REWORK'

/** §3.1 deliveryFormTarget / §3.6 deliveryForm（D-01 ReleaseForm 同构）。 */
export type DeliveryForm = 'full' | 'early_access' | 'demo'

/** §3.5 返工类别（D-01 §15.2 五类）。 */
export type ReworkCategory = 'A' | 'B' | 'C' | 'D' | 'E'
/** §3.5/§6.5 三档。 */
export type ReworkMode = 'minimal' | 'partial' | 'full'
export type ReworkSessionStatus = 'active' | 'completed' | 'cancelled'
export type ReworkTaskState = 'PENDING' | 'DONE' | 'CANCELLED'

/** §3.4 verdict 原样消费 D-01 §6.2.1。 */
export type HrbVerdict = 'feasible' | 'need_more_budget_or_delay' | 'need_reduce_scope_or_lower_goal'

// ===== §3.1 Project =====

export interface ExecutionProject {
  projectId: string
  companyId: string
  studioId: string
  /** 立项所用设计版本（1 版本最多 1 项目，§3.1）。 */
  versionId: string
  /** R-PROJ-0：唯一生效快照。切换仅在返工闸门 PASS。 */
  snapshotId: string
  formulaVersion: string
  /** 本文 §6 公式口径版本（参数快照锚点，§11 S4）。 */
  projectFormulaVersion: string
  /** D-01 §6.2.1，默认 0.5；Play 可调（场景 A）。 */
  hrb: number
  /** 项目预算上限（玩家分配，≤AvailableCash at setup）；非承诺额（C2）。 */
  budgetCapacityCents: number
  /** 派生只读：= round(hrb × budgetCapacityCents)（D-01 §6.2.1）。 */
  budgetCapCents: number
  /** §6.4：`+∞` 当 ∃d(W_d>0 ∧ Cap_d=0)。 */
  costEstCents: number
  reworkCount: number
  state: ProjectState
  deliveryFormTarget: DeliveryForm
  teamRefs: string[]
  workPackageIds: string[]
  reworkSessionId: string | null
  buildIds: string[]
  /** FIN BudgetCommitment 引用（立约 + 追加，append-only；C2/N-02）。仅作索引，权威在 UnifiedLedger。 */
  commitmentIds: string[]
  /** 交付闸门 FAIL 累计次数（ADJ-08 §1.3 审计计数）。 */
  deliveryFailures: number
  /** 最近一次交付 FAIL 的原因记录（ADJ-08 §1.3：day / reasonCodes / eViolations）。 */
  lastDeliveryFailure: {
    day: number
    reasonCodes: string[]
    eViolations: ReadonlyArray<{ code: string; severity: string }>
  } | null
  pausedAtDayIndex: number | null
  pausedDays: number
  pauseReason: PauseReason | null
  plannedLaunchDay: number | null
  launchDelayDays: number
  /** Calendar dayIndex。 */
  createdAt: number
  updatedAt: number
}

// ===== §3.2 WorkPackage =====

export interface WorkPackageSourceRef {
  instanceId?: string
  contentPackId?: string
  reworkTaskId?: string
}

export interface WorkPackage {
  workPackageId: string
  projectId: string
  snapshotId: string
  sourceRef: WorkPackageSourceRef
  discipline: Discipline
  /** = baselineWorkUnits（拆解值）。 */
  workUnits: number
  baselineWorkUnits: number
  remainingWorkUnits: number
  deliveredWorkUnits: number
  /** clamp(delivered / workUnits, 0, 1)；§6.3。 */
  progress: number
  skillRef: string | null
  requiredSkillLevel: number
  blockedBy: string[]
  dependents: string[]
  priority: WorkPackagePriority
  state: WorkPackageState
  kind: WorkPackageKind
  orderIndex: number
  /** 返工 WP 所属会话（kind=REWORK 时非空，§3.5/§5.5-4）。 */
  reworkSessionId: string | null
  /** 返工 WP 的档位（记账标识，§3.3 reworkMode）。 */
  reworkMode: ReworkMode | null
}

/** §3.2 拆解结果（WP + DAG 派生量）。 */
export interface DecompositionResult {
  workPackages: WorkPackage[]
  /** ΣWP baselineWorkUnits（= W_total，C4 守恒）。 */
  totalBaselineWorkUnits: number
  /** 关键路径（WP id 序列，按 DAG 拓扑顺序）。 */
  criticalPathIds: string[]
  /** §6.1 ProjectBaselineDuration（天）。 */
  baselineDurationDays: number
}

// ===== §3.3 Worklog / DailyOutput =====

export interface Worklog {
  logId: string
  projectId: string
  workPackageId: string
  day: number
  discipline: Discipline
  outputWorkUnits: number
  capacityAppliedCents: number
  source: 'system_auto' | 'player_authorized'
  reworkMode: ReworkMode | null
}

// ===== §3.4 BudgetCapacity / CostEstimate（派生只读） =====

export interface CostEstimate {
  budgetCapacityCents: number
  budgetCapCents: number
  /** int 或 `+∞`。 */
  costEstCents: number
  /** decimal 或 `+∞`（Budget_cap=0）。 */
  ratio: number
  verdict: HrbVerdict
  reasoning: string[]
  /**
   * 学科单位成本（cents/workUnit）；`Cap_d=0` 时为 `+∞`。
   * **W_d=0 的学科不参与 Cost_est 求和**（N-01/P1，消 `0×+∞`）。
   */
  costPerWorkUnit: Record<Discipline, number>
  salaryDailyCents: Record<Discipline, number>
}

// ===== §6.2 团队 / 产能输入（D-03 只读引用） =====

/** D-03 Employment 的最小只读投影（只引用不复制主数据，§3.1 teamRefs）。 */
export interface TeamMember {
  employmentId: string
  salaryCentsPerMonth: number
  /** 学科技能档 0..5；缺键视为 0（§10 B-9）。 */
  skillLevels: Partial<Record<Discipline, number>>
  /** §6.2 available(e,day)；D-03 未接入时缺省 true。 */
  available?: (day: number) => boolean
  /** §6.4 w_e[d] 薪资学科归属权重；缺键视为 1（computeSalaryDaily `?? 1`，P3-6 注释与实现统一）。 */
  salaryWeight?: Partial<Record<Discipline, number>>
}

// ===== §3.5 ReworkTask / ReworkSession =====

export interface ExecutionReworkTask {
  taskId: string
  sessionId: string
  /** D-01 §4.15 DesignChangeRecord.changeId（§11 S3）。 */
  changeId: string
  category: ReworkCategory
  affectedInstanceIds: string[]
  /** §6.5 该任务承担的工作量（category 分段式产出）。 */
  deltaWorkUnits: number
  /** 受影响项对应的返工 WorkPackage。 */
  workPackageId: string | null
  state: ReworkTaskState
  orderIndex: number
}

export interface ReworkCostEstimate {
  mode: ReworkMode
  /** 区间估算（Cents）；`+∞` 当团队缺失。 */
  lowCents: number
  highCents: number
  /** 推进后落实的实际值（R-PROJ-5：不锁死）。 */
  actualCents: number
  reworkWorkUnits: number
}

export interface ExecutionReworkSession {
  sessionId: string
  projectId: string
  status: ReworkSessionStatus
  /** 返工开始时生成，闸门 PASS 才发布（D-01 §15.3）。 */
  targetDraftVersionId: string
  /** 目标草稿快照 id；**仅闸门 PASS 后才成为权威**（R-PROJ-0）。 */
  targetSnapshotId: string
  /** 会话开始时的权威快照（返工期间恒为该快照，§5.1-3）。 */
  baseSnapshotId: string
  taskIds: string[]
  changeIds: string[]
  mode: ReworkMode | null
  costEstimate: ReworkCostEstimate
  /** 沉没成本估算（D-01 §15.5 sunkCostEstimate）。 */
  sunkCostEstimateWorkUnits: number
  /** 最近一次完成闸门结果（FAIL 不切快照）。 */
  gateResult: { pass: boolean; violationCodes: string[] } | null
  /** §6.5 会话开始时的 W_total（δ 分母）。 */
  baseTotalWorkUnits: number
  startedAt: number
  closedAt: number | null
}

// ===== §3.6 Build =====

export interface Build {
  buildId: string
  projectId: string
  /** 交付时权威快照（R-PROJ-0，冻结）。 */
  snapshotId: string
  versionLabel: string
  deliveryForm: DeliveryForm
  /** D-01 RevalidationGate（含 D-02 DeliveryGateResult，同一闸门，C8）。 */
  deliveryGateResult: { pass: boolean; violationCodes: string[] }
  /** D-02 QualityAssessment 只读引用。 */
  qualitySnapshotRef: string | null
  defectListRefs: string[]
  deliveredTier: number
  actualCostCents: number
  builtAt: number
}

// ===== §11 S1 存档投影 =====

/** 执行权威的持久化快照（S1/S2/S3）。派生估算（Cost_est/ratio/verdict）不入此结构（§3.4 注、S5）。 */
export interface ProjectExecutionArchive {
  project: ExecutionProject
  workPackages: WorkPackage[]
  worklogs: Worklog[]
  reworkSessions: ExecutionReworkSession[]
  reworkTasks: ExecutionReworkTask[]
  builds: Build[]
}
