import { createEmptyWorld, type WorldState } from '@simulation/services/world-state'
import { GameCalendar } from '@simulation/services/game-calendar'
import { FinanceService } from '@simulation/services/finance-service'
import { UnifiedLedger } from '@domain/entities/finance'
import { EmployeeService } from '@simulation/services/employee-service'
import { ProjectService } from '@simulation/services/project-service'
import { RandomService } from '@simulation/services/random-service'
import { MarketSimulationService } from '@simulation/services/market-simulation-service'
import { NULL_MARKET_INPUT_PROVIDER } from '@simulation/services/sales-types'
import type { MarketInputProvider } from '@simulation/services/sales-types'
import { seedInitialAwareness } from '@content/market-inputs'
import { awarenessByScopeOf } from '@simulation/services/product-awareness'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'
import { computeAvailableCash, computeRunwayMonths, annotateCommitmentsForRunway, computeCashForecast } from '@domain/value-objects/finance-formulas'
import { evaluateRuntimeDeliveryGate } from './delivery-gate-context'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { reasonCodesForSignals } from '@domain/value-objects/finance-crisis'
import {
  createProjectExecution,
  setupBudgetCommitment,
  estimateCost,
  planRework,
  beginRework,
  submitDelivery,
} from '@domain/value-objects/project-execution-engine'
import type { ProjectExecutionState } from '@domain/value-objects/project-execution-engine'
import {
  computeChangeWorkUnits,
  computeReworkCostBreakdown,
  estimateReworkCostRange,
  type ReworkAffectedItemInput,
} from '@domain/value-objects/project-execution-rework'
import { DEFAULT_PROJECT_FORMULA_PARAMS, DISCIPLINE_ORDER } from '@domain/value-objects/project-execution-tuning'
import { ProjectError } from '@domain/entities/project-execution'
import type { ReworkCategory, ReworkMode, Discipline as ExecutionDiscipline } from '@domain/entities/project-execution'
import type { CrisisLevel } from '@domain/entities/finance'
import {
  createCompanyAssetSoldEvent,
  createProductLifecycleChangedEvent,
} from '@domain/events'
import { AI_COMPANIES, createAiStaff, findAiSpec, seedDueAiCompanies } from '@content/ai-companies'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import genreSegmentAffinity from '@content/genre-segment-affinity.json'
import genresContent from '@content/genres.json'
import { planAiMonth, suggestedStartBudget, type AiCompanyView, type AiPlan } from '@simulation/ai/ai-planner'
import { projectMonthlyBurnCents } from '@simulation/ai/ai-runway'
import { computeMarketingLift } from '@simulation/services/demand-pool'
import { MARKETING_BUDGET_MAX_CENTS, MARKETING_BUDGET_MIN_CENTS } from '@domain/value-objects/marketing-response'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { PersonnelService, D03_SCHEMA_VERSION } from '@simulation/services/personnel-service'
import { migrateEmployees } from '@domain/value-objects/personnel-migration'
import { DEFAULT_PERSONNEL_PARAMS, createPersonnelSnapshot } from '@domain/value-objects/personnel-tuning'
import { RefundService, type PlayerRefundRequest, type RefundRequestResult } from '@simulation/services/refund-service'
import {
  ProductPricingService,
  type PricingResult,
  type SetPriceCmd,
  type ApplyDiscountCmd,
  type RetireProductCmd,
} from '@simulation/services/product-pricing-service'
import { MarketingService } from '@simulation/services/marketing-service'
import type { MarketingChannel } from '@domain/value-objects/marketing-response'
import { hasFullControl, estimateContractProceeds, type ContractEstimate } from '@simulation/services/contract-estimate'
import { ContractService } from '@simulation/services/contract-service'
import { uuid } from '@domain/types'
import { createNewCompany } from '@domain/entities/company'
import { TUNING } from '@content/tuning'
import {
  cityRentMultiplier,
  citySalaryMultiplier,
  isPlatformAvailable,
  isSegmentAvailable,
  yearOfDay,
} from '@content/queries'
import { completionRatio, isQaComplete } from '@simulation/systems/project-progress'
import { isTerminalProjectPhase } from '@simulation/systems/phase-rules'
import { defectLevelOf } from '@simulation/systems/qa-quality'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { DomainEvent } from '@domain/events'
import type { EmployeeRole, Discipline, ProjectRole } from '@domain/enums'
import type { TeamAssignment } from '@domain/value-objects'
import { topUpIdempotencyKey, createTopUpChangeLogEntry } from '@domain/value-objects'
import { REC03_CONTENT_PACKS, REC03_FORMULA_VERSION, REC03_MODULES, REC03_SEGMENT_MAP, REC03_SLOTS, validateRec03Catalog } from '@content/rec03-content'
import { createP1Catalog } from '@content/d04-vocabulary'
import { estimateFourChannels } from '@domain/value-objects/product-blueprint-estimation'
import { checkCompositionRules, type CompositionRules } from '@domain/value-objects/product-blueprint-composition'
import { DEFAULT_BLUEPRINT_TUNING } from '@domain/value-objects/product-blueprint-tuning'
import { lockVersion } from '@domain/value-objects/product-blueprint-lifecycle'
import type { BlueprintVersion, DesignVersionSnapshot, FrozenBlueprint, ModuleInstance, PositioningProfile, ReleaseForm } from '@domain/entities/product-blueprint'
import { type DecompositionInput } from '@domain/value-objects/project-execution-decomposition'

export interface CommandOutcome<T = undefined> {
  success: boolean
  result?: T | undefined
  errorCode?: string | undefined
  message?: string | undefined
  /** 命中幂等键时为 true（非错误） */
  idempotent?: boolean | undefined
}

/** 预算追加命令（DESIGN-G05 §9 / TASK-M1.1-G05-001-D） */
export interface TopUpBudgetCmd {
  projectId: string
  amountCents: number
  seq: number
  reason: string
}

/** CODE-07A：公司级财务派生视图（UI 只读投影）。 */
export interface GameFinancialOverview {
  dayIndex: number
  cashBalanceCents: number
  availableCashCents: number
  committedCents: number
  runwayMonths: number
  crisisLevel: CrisisLevel
  reasonCodes: ReturnType<typeof reasonCodesForSignals>
}

/** P-05：招聘影响预览（可用现金/跑道 前→后，同源领域公式派生，不写回）。 */
export interface RecruitImpactPreview {
  before: GameFinancialOverview
  after: GameFinancialOverview
  feeCents: number
  salaryMonthlyCents: number
}

/** CODE-07B P-02：市场调研结果卡（ADJ-16 R-6 竞品档案条数 + 需求方向标签）。 */
export interface MarketResearchResult {
  txId: string
  costCents: number
  competitorCount: number
  /** 方向档仅为内容亲和度的定性换算（数值机会模型 OPEN，P2），不展示数值。 */
  directionTags: Array<{ genreId: string; displayName: string; band: 'high' | 'medium' | 'low' }>
}

/** P-04：立项预览（内核同源派生；Cost_est=+∞ 时 costEstCents=null，UI 显示"暂不可估"）。 */
export interface ExecutionProjectPreview {
  budgetCapCents: number
  costEstCents: number | null
  costEstInfinite: boolean
  ratio: number
  verdict: import('@domain/entities/project-execution').HrbVerdict
  reasoning: string[]
  workPackages: Array<{ workPackageId: string; discipline: string; baselineWorkUnits: number; dependsOn: readonly string[] }>
  requestId?: string
  snapshotId?: string
  versionId?: string
  snapshot?: DesignVersionSnapshot
  decomposition?: DecompositionInput
  estimates?: import('@domain/entities/product-blueprint').EstimateBundle
  violations?: import('@domain/entities/product-blueprint').BlueprintViolation[]
}

export type BlueprintDraftInput =
  | { kind: 'draft'; requestId: string; workingTitle: string; genreId: string; primaryTypeId: string; targetSegmentClaims: string[]; platformTargets: string[]; modules: Array<{ templateId: string; slotId: string; instanceId: string; intensity: 1 | 2 | 3 | 4 | 5; depthSelection: import('@domain/entities/product-blueprint').DepthSelection; optionSelections: Record<string, string>; contentPackId: string | null }>; deliveryForm: ReleaseForm; hrb: number; budgetCapacityCents: number }
  | { kind: 'snapshotRef'; requestId: string; snapshotId: string; versionId: string; workingTitle: string; genreId: string; plannedLaunchDay: number; hrb: number; budgetCapacityCents: number }

/** P-06：研发推进摘要（WP/Cap_d 瓶颈/Cost_est ratio verdict，内核同源派生）。 */
export interface ExecutionSummary {
  costEstCents: number | null
  costEstInfinite: boolean
  ratio: number
  verdict: import('@domain/entities/project-execution').HrbVerdict
  budgetCapCents: number
  workPackages: Array<{ workPackageId: string; discipline: string; state: string; kind: string; baselineWorkUnits: number; remainingWorkUnits: number }>
  capacityByDiscipline: Record<string, number>
  bottleneckDiscipline: string | null
}

/**
 * CODE-07B REVISION / U4：返工预估只读投影。全部字段由内核纯函数
 * （`computeReworkCostBreakdown` / `estimateReworkCostRange` / `estimateCost`）同源派生，
 * application 层不造数；`available=false` 时 UI 必须 fail-closed。
 */
export interface ReworkEstimate {
  projectId: string
  category: ReworkCategory
  /** δ 档位（内核 breakdown.mode）。 */
  mode: ReworkMode
  /** δ = W_change / max(ε, W_total)。 */
  changeRatio: number
  /** 返工工作量按学科分列（与 planRework 分摊同口径）。 */
  disciplineUnits: Array<{ discipline: ExecutionDiscipline; workUnits: number }>
  /** 返工总工作量（记账基数）。 */
  reworkWorkUnits: number
  /** 沉没工作量（已投入中不可复用部分）。 */
  sunkWorkUnits: number
  /** 成本区间（分）；+∞ 时置 null，以 costInfinite 标识，禁止 UI 显示 Infinity。 */
  costLowCents: number | null
  costHighCents: number | null
  costInfinite: boolean
  /** 延长天数区间（内核 durationExtension）。 */
  delayLowDays: number
  delayHighDays: number
  /** 内核是否可评估（false ⇒ UI 显示不可用原因，不伪造数字）。 */
  available: boolean
  unavailableReason: string | null
}

/**
 * 07B REVISION2：交付闸门评估只读视图（P-09 UI 接线，fail-closed）。
 *
 * 内核当前不产出 D-02 QualityAssessment 快照（OPEN-D02-WIRING）；本视图由编排层把
 * `evaluateDeliveryGate` 的真实判定结果登记后暴露给 UI。缺快照 / 项目非可交付态一律
 * `available=false, pass=false`，绝不伪造 pass=true（ADJ-21 §2.3）。
 */
export interface DeliveryGateEvaluation {
  /** 是否存在可用的真实 D-02 判定快照。 */
  available: boolean
  /** 闸门是否 PASS；仅当 available=true 且真实判定 PASS 且无 E 级违规时为 true。 */
  pass: boolean
  /** 可直接传给 submitDeliveryForProject 的 gate（与内核 evaluateGate 语义一致）。 */
  gate: { pass: boolean; violations: ReadonlyArray<{ code: string; severity: string }> }
  /** 失败 / 不可用原因码，逐条供 UI fail-closed 展示（U3 不回退）。 */
  reasonCodes: readonly string[]
  /** 不可用的结构化原因；可用时为 null。 */
  unavailableReason: string | null
  /** 判定来源（'d02-evaluateDeliveryGate' | 'unavailable'）。 */
  source: string
  checkedAt: number | null
}

/** 由 evaluateDeliveryGate 真实判定产物转换的登记入参（编排 / 测试入口，UI 不调用）。 */
export interface DeliveryGateEvaluationInput {
  pass: boolean
  violations: ReadonlyArray<{ code: string; severity: string }>
  reasonCodes?: readonly string[]
  checkedAt?: number
  source?: string
}

export class GameWorld {
  public world: WorldState
  public calendar: GameCalendar
  public finance: FinanceService
  public employees: EmployeeService
  /** CODE-06：D-03 人才与组织服务（Person/Employment 权威；Employee 为派生视图，双轨） */
  public personnel: PersonnelService
  public projects: ProjectService
  public rng: RandomService
  public sales: MarketSimulationService
  public refunds: RefundService
  public pricing: ProductPricingService
  public marketing: MarketingService
  public contracts: ContractService
  public scheduler: DailyScheduler
  private readonly salesInputs: MarketInputProvider
  /** P-03/P-04：ExecutionProject 状态（内存暂存；存档序列化未包含 → OPEN-PROJ-EXEC-PERSIST） */
  private readonly executionProjects = new Map<string, ProjectExecutionState>()
  private readonly rec03Snapshots = new Map<string, { snapshot: DesignVersionSnapshot; decomposition: DecompositionInput; projectId?: string; name: string; genreId: string; plannedLaunchDay: number }>()
  private readonly rec03Requests = new Map<string, { hash: string; result: { projectId: string; snapshotId: string; versionId: string; commitmentId: string } }>()
  /**
   * 07B REVISION2：D-02 交付闸门评估判定快照（key=projectId::form）。
   * 仅供只读视图消费；不参与 submitDeliveryForProject / evaluateGate 判定，内核提交语义零改动。
   */
  private readonly deliveryGateEvaluations = new Map<string, DeliveryGateEvaluationInput>()

  /** AI 竞争开关：默认关闭，M3-A2 决策器接入后由生产工厂显式开启（避免既有 Tests 世界被 AI 公司污染） */
  private readonly aiCompetitionEnabled: boolean

  /**
   * B-01a：参与模拟判定（hash01 离职判定）的实体 ID 生成器。
   * 由 seed + 递增序号派生，同 seed 同操作序列必得同 ID；读档时按存档中已有的
   * `emp-<seed>-<seq>` 还原序号，避免续跑后 ID 碰撞。事件/会话/展示 ID 仍用 uuid()。
   */
  private employmentSeq = 0

  constructor(
    seed = 42,
    salesInputs: MarketInputProvider = NULL_MARKET_INPUT_PROVIDER,
    options: { aiCompetition?: boolean } = {},
  ) {
    this.aiCompetitionEnabled = options.aiCompetition === true
    this.world = createEmptyWorld(seed)
    this.calendar = new GameCalendar(0)
    this.rng = new RandomService(seed)
    // A-1：账本唯一——FinanceService 只是它的委托层，二者共享同一实例。
    this.finance = new FinanceService(new UnifiedLedger())
    this.salesInputs = salesInputs
    this.personnel = new PersonnelService({
      finance: this.finance,
      nextEmploymentId: () => this.nextEmploymentId(),
    })
    this.employees = new EmployeeService({
      getAssignmentsByCompany: (companyId) => {
        const all: TeamAssignment[] = []
        for (const p of this.world.projects) {
          if (p.companyId === companyId) all.push(...p.teamAssignments)
        }
        return all
      },
    })
    this.projects = new ProjectService({
      hasProductForProject: (projectId) => this.world.products.some((x) => x.sourceProjectId === projectId),
      isPlatformAvailable,
      getCompanyStatus: (companyId) => this.world.companies.find((c) => c.id === companyId)?.status ?? null,
    })
    this.sales = new MarketSimulationService({
      finance: this.finance,
      rng: this.rng,
      inputs: this.salesInputs,
      demandMode: true,
    })
    this.refunds = this.createRefundService()
    this.pricing = new ProductPricingService()
    this.marketing = new MarketingService({ finance: this.finance, tuning: TUNING.sales })
    this.contracts = new ContractService(this.finance)
    this.scheduler = new DailyScheduler({
      finance: this.finance,
      sales: this.sales,
      refunds: this.refunds,
      pricing: this.pricing,
      marketing: this.marketing,
      contracts: this.contracts,
      personnelTick: this.personnelTick,
    })
  }

  /**
   * B-01a：下一个确定性 employmentId = `emp-<saveSeed>-<seq>`。
   * 同 seed + 同招聘操作序列 ⇒ 同 ID ⇒ hash01(employmentId, day) 离职判定可复现（R9 / DP-3）。
   */
  private nextEmploymentId(): string {
    this.employmentSeq += 1
    return `emp-${this.world.saveSeed}-${this.employmentSeq}`
  }

  /** B-01a：读档后从已有实体 ID 还原递增序号，避免续跑新招员工与存档 ID 碰撞。 */
  private restoreEmploymentSeq(state: WorldState): void {
    const marker = `emp-${state.saveSeed}-`
    let max = 0
    const consider = (id: string | undefined): void => {
      if (!id?.startsWith(marker)) return
      const seq = Number(id.slice(marker.length))
      if (Number.isInteger(seq) && seq > max) max = seq
    }
    for (const e of state.employees ?? []) consider(e.id)
    for (const e of state.employments ?? []) consider(e.employmentId)
    this.employmentSeq = max
  }

  private createRefundService(): RefundService {
    return new RefundService({
      finance: this.finance,
      // 当前 TUNING 只影响"无快照"的新请求（Q10 回退口径），历史批次一律按 refundDayIndex
      refundWindowDays: TUNING.sales.refundWindowDays,
      isCompanyRegistered: (companyId) =>
        this.world.companies.some((c) => c.id === companyId),
    })
  }

  private get dayIndex(): number {
    return this.calendar.currentDayIndex
  }

  /** 把 world 项目同步进 ProjectService，执行操作，再写回 world */
  private withProjects<T>(fn: () => T): T {
    this.projects.reset(this.world.projects)
    try {
      return fn()
    } finally {
      this.world.projects = this.projects.listAll()
    }
  }

  private syncEmployeesFromWorld(): void {
    this.employees.reset(this.world.employees)
  }

  // ===== CODE-06：D-03 人才层（双轨桥） =====

  /**
   * 人才层命令作用域：命令前从 WorldState 切片接管，命令后回写（与 withProjects 同构）。
   * world.employees 保持 legacy 派生视图；world.persons/employments 为 D-03 权威。
   */
  private withPersonnel<T>(fn: () => T): T {
    this.ensurePersonnelLayer()
    this.personnel.adopt({
      persons: this.world.persons ?? [],
      employments: this.world.employments ?? [],
      candidates: this.world.candidates ?? [],
      personEvents: this.world.personEvents ?? [],
    }, this.world.personnelFormulaSnapshot)
    try {
      return fn()
    } finally {
      const slice = this.personnel.toSlice()
      this.world.persons = slice.persons
      this.world.employments = slice.employments
      this.world.candidates = slice.candidates
      this.world.personEvents = slice.personEvents
      this.world.personnelFormulaSnapshot = slice.snapshot
      this.world.d03SchemaVersion = slice.d03SchemaVersion
    }
  }

  /**
   * 懒引导（§15.3）：world 只有 legacy employees（手工构造/旧路径注入）且从未建立人才层时，
   * 按 §15.3 就地迁移（含 Step3 承诺注册 / Step4 校验），保证人事命令与薪资结算可用。
   * 判据 = 有 legacy employees 但无 Person 层（employments 为 undefined **或空数组**均可——
   * personnelTick 的 toSlice 会先写回空切片，不能因此跳过迁移）。
   */
  private ensurePersonnelLayer(): void {
    if ((this.world.persons?.length ?? 0) > 0) return
    if (this.world.employees.length === 0) return
    this.migrateLegacyEmployeesInto(this.world)
  }

  /** §15.3 就地迁移：employees → Person+Employment + 承诺注册 + 校验修复（写入传入 state）。 */
  private migrateLegacyEmployeesInto(state: WorldState): void {
    const migration = migrateEmployees({
      employees: state.employees,
      day: state.currentDayIndex,
      params: DEFAULT_PERSONNEL_PARAMS,
      regionOf: () => 'default',
    })
    for (const log of migration.logs) console.info(`[d03-migrate] ${log.legacyId}: ${log.message}`)
    for (const repair of migration.repairs) console.info(`[d03-repair] ${repair.code}: ${repair.message}`)
    for (const c of migration.salaryCommitments) this.finance.getLedger().registerCommitment(c)
    state.persons = migration.persons
    state.employments = migration.employments
    state.personEvents = migration.personEvents
    state.candidates = []
    state.d03SchemaVersion = D03_SCHEMA_VERSION
    state.personnelFormulaSnapshot = createPersonnelSnapshot(state.currentDayIndex)
  }

  /** 派生 Employee 视图与 Employment 状态对齐（双轨一致性；morale/fatigue 等 legacy 字段不动）。 */
  private reconcileEmployeeView(): void {
    this.personnel.adopt({
      persons: this.world.persons ?? [],
      employments: this.world.employments ?? [],
      candidates: this.world.candidates ?? [],
      personEvents: this.world.personEvents ?? [],
    }, this.world.personnelFormulaSnapshot)
    this.world.employees = this.personnel.reconcileEmployeeView(this.world.employees)
  }

  /** §6.7 市场月薪基准（P1：defaultStartingSalaryCents × 城市系数；P2 接 baseSalary 表）。 */
  private marketSalaryForCity(cityId: string | undefined): number {
    return Math.round(
      TUNING.employee.defaultStartingSalaryCents *
        citySalaryMultiplier(cityId ?? 'san_francisco'),
    )
  }

  /** ORD-01 人事每日 tick（调度器钩子）：候选池刷新（S5-1）→ dailyTick → 派生视图同步。 */
  private personnelTick = (state: WorldState, dayIndex: number): WorldState => {
    // §15.3 懒引导：legacy world（手工构造/旧存档）首次人事 tick 时就地迁移，
    // 否则 toSlice 会把空 employments 切片写回，迁移窗口永久丢失。
    if (state.employees.length > 0 && (state.persons?.length ?? 0) === 0) {
      this.migrateLegacyEmployeesInto(state)
    }
    this.personnel.adopt({
      persons: state.persons ?? [],
      employments: state.employments ?? [],
      candidates: state.candidates ?? [],
      personEvents: state.personEvents ?? [],
    }, state.personnelFormulaSnapshot)
    // S5-1：候选池每游戏日刷新一次（§12）
    const playerCompany = state.companies.find((c) => c.isPlayer)
    if (playerCompany !== undefined) {
      this.personnel.refreshCandidatePool(
        dayIndex,
        () => this.marketSalaryForCity(playerCompany.cityId),
        'default',
      )
    }
    const activeEmploymentIds = new Set<string>()
    let anyProjectInProduction = false
    for (const p of state.projects) {
      if (p.isPaused || isTerminalProjectPhase(p.phase)) continue
      anyProjectInProduction = true
      for (const a of p.teamAssignments) activeEmploymentIds.add(a.employeeId)
    }
    this.personnel.dailyTick({
      day: dayIndex,
      activeEmploymentIds,
      anyProjectInProduction,
      marketSalaryOf: (companyId) => {
        const c = state.companies.find((x) => x.id === companyId)
        return this.marketSalaryForCity(c?.cityId)
      },
    })
    const slice = this.personnel.toSlice()
    return {
      ...state,
      persons: slice.persons,
      employments: slice.employments,
      candidates: slice.candidates,
      personEvents: slice.personEvents,
      personnelFormulaSnapshot: slice.snapshot,
      d03SchemaVersion: slice.d03SchemaVersion,
      employees: this.personnel.reconcileEmployeeView(state.employees),
    }
  }

  /**
   * A-2：`Company.cashBalanceCents` 是**派生只读兼容字段**（F-10）。
   * 全仓库只有这里（运行时单点回写）与 `restore` 的读档 hydrate 会写它，且每次都从账本派生；
   * 写完立即做 A-3 一致性断言（fail-loud，不静默对齐）。
   */
  private syncCash(company: Company): void {
    this.finance.syncCash(company)
    this.finance.assertCashConsistent(company)
  }

  // ----- Company -----

  createCompany(params: { name: string; cityId: string }): Company {
    const dayIndex = this.dayIndex
    const company = createNewCompany({
      id: uuid(),
      name: params.name,
      cityId: params.cityId,
      foundingDay: dayIndex,
      cashCents: 0,
      brand: TUNING.company.startingBrand,
      technologyCapacity: TUNING.company.startingTechnologyCapacity,
      managementCapacity: TUNING.company.managementCapacity,
      monthlyFixedExpenseCents: 0,
    })
    this.world.companies.push(company)

    // 初始余额 0；启动资金只能由这一笔 advance 交易入账（幂等）
    this.finance.registerCompany(company.id)
    this.finance.postTransaction({
      idempotencyKey: `init:${company.id}:opening-cash`,
      companyId: company.id,
      day: dayIndex,
      category: 'advance',
      amountCents: TUNING.company.startingCashCents,
      description: '公司启动资金',
    })
    this.syncCash(company)
    return company
  }

  getPlayerCompany(): Company | undefined {
    return this.world.companies.find((c) => c.isPlayer && c.status === 'active')
  }

  /** 返回玩家公司不考虑 status（用于破产命令守卫） */
  private getRawPlayerCompany(): Company | undefined {
    return this.world.companies.find((c) => c.isPlayer)
  }

  /** 破产守卫：公司 status!=='active' 时返回 FIN_COMPANY_BANKRUPT 错误（DESIGN-OI-21 §2.2） */
  private assertCompanyActive(): Company | CommandOutcome<never> {
    const company = this.getRawPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }
    if (company.status !== 'active') {
      return {
        success: false,
        errorCode: 'FIN_COMPANY_BANKRUPT',
        message: '公司已破产，无法执行此操作。',
      }
    }
    return company
  }

  isFinanciallyDistressed(company = this.getPlayerCompany()): boolean {
    return company !== undefined && this.finance.getCashBalance(company.id) < 0
  }

  /** D03 候选池只读视图（S5-1）：懒引导——空池时按当前日确定性补足（与每日 tick 同源同函数，§15.3 模式）。 */
  listCandidates(): import('@domain/entities/personnel').Candidate[] {
    const company = this.getPlayerCompany()
    if (!company) return []
    let list = this.withPersonnel(() => this.personnel.listCandidates())
    if (list.length === 0) {
      list = this.withPersonnel(() => {
        this.personnel.refreshCandidatePool(this.dayIndex, () => this.marketSalaryForCity(company.cityId), 'default')
        return this.personnel.listCandidates()
      })
    }
    return list
  }

  /** D03 候选池招聘转发（P-05）：playerOffer = 候选 askingSalary（§6.3 区间内），headcount 用管理容量。 */
  recruitFromCandidate(candidateId: string): CommandOutcome<{ feeCents: number; arrivalDay: number }> {
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company
    const candidate = this.withPersonnel(() =>
      this.personnel.listCandidates().find((c) => c.candidateId === candidateId),
    )
    if (candidate === undefined) {
      return { success: false, errorCode: 'D03_CANDIDATE_NOT_FOUND', message: '候选不存在或已被雇佣' }
    }
    const r = this.withPersonnel(() =>
      this.personnel.recruitFromCandidate(
        {
          candidateId,
          companyId: company.id,
          playerOfferCents: candidate.askingSalaryCents,
          day: this.dayIndex,
          headcountLimit: company.managementCapacity,
          employmentId: this.nextEmploymentId(),
        },
        () => this.marketSalaryForCity(company.cityId),
      ),
    )
    if (!r.ok || !r.value) {
      return { success: false, errorCode: r.error!.code, message: r.error!.message }
    }
    // 派生 Employee 视图同步（双轨桥，与 hireEmployee 同口径）：
    // 池招聘复用既有 Person（R-D03-1），legacy Employee 以 employmentId 为主键新建，
    // 使 reconcileEmployeeView 后续可按 id 对齐（reconcile 只更新已存在的行）。
    const employment = r.value.employment
    const legacyEmp: Employee = {
      id: employment.employmentId,
      companyId: employment.companyId,
      name: r.value.person.displayName,
      role: employment.role,
      primarySkill: 'gameplay',
      skillLevel: Math.max(1, Math.min(5, candidate.skillLevel)),
      salaryMonthlyCents: employment.salaryMonthlyCents,
      contractStartDay: employment.startDay,
      contractEndDay: employment.endDay,
      morale: r.value.person.baseMorale,
      fatigue: TUNING.employee.startingFatigue,
      experience: 0,
      status: 'hired',
      hireDay: employment.startDay,
      version: 1,
      createdAt: employment.startDay,
      updatedAt: employment.startDay,
    }
    this.world.employees.push(legacyEmp)
    this.world.employees = this.personnel.reconcileEmployeeView(this.world.employees)
    this.syncEmployeesFromWorld()
    this.syncCash(company)
    return { success: true, result: { feeCents: r.value.feeCents, arrivalDay: r.value.arrivalDay } }
  }

  /**
   * P-05 招聘影响预览（同源口径）：确认前展示 可用现金 前→后、跑道 前→后。
   * "后" = 追加候选的一次性中介费承诺 + 月薪承诺后用同一领域公式重算（ADJ-11 §5.4-6），
   * 不写回任何状态（纯派生，不造数）。
   */
  previewRecruitImpact(candidateId: string): RecruitImpactPreview | null {
    const company = this.getPlayerCompany()
    if (!company) return null
    const candidate = this.listCandidates().find((c) => c.candidateId === candidateId)
    if (candidate === undefined) return null
    const before = this.getFinancialOverview()
    if (!before) return null
    const tuning = DEFAULT_FINANCE_TUNING
    const salaryMonthlyCents = candidate.askingSalaryCents
    const feeCents = Math.round(salaryMonthlyCents * DEFAULT_PERSONNEL_PARAMS.recruitFeeMonths)
    const commitments = this.finance.getLedger().getCommitments(company.id)
    const month = monthKeyFromOffsetForRunway(dayIndexToGregorian(this.dayIndex))
    // 追加假设承诺：一次性中介费（当日兑现）+ 月薪承诺（当月起）
    const withHypothetical = [
      ...commitments,
      {
        commitmentId: 'preview-fee',
        companyId: company.id,
        sourceType: 'contract_obligation',
        sourceRef: candidateId,
        amountCents: feeCents,
        period: 'one_off',
        periodCount: 1,
        totalPlannedCents: feeCents,
        startAt: this.dayIndex,
        endAt: this.dayIndex,
        realizedCents: 0,
        state: 'committed',
        linkedTxIds: [],
        cancelEffectiveMonth: null,
        releasedPeriods: 0,
        releasedCents: 0,
        cancelledAtPeriods: null,
      } as import('@domain/entities/finance').BudgetCommitment,
      {
        commitmentId: 'preview-salary',
        companyId: company.id,
        sourceType: 'employment_salary',
        sourceRef: candidateId,
        amountCents: salaryMonthlyCents,
        period: 'monthly',
        periodCount: Math.max(1, tuning.horizonMonths),
        totalPlannedCents: salaryMonthlyCents * Math.max(1, tuning.horizonMonths),
        startAt: this.dayIndex,
        endAt: this.dayIndex + Math.round(tuning.horizonMonths * 30.44),
        realizedCents: 0,
        state: 'committed',
        linkedTxIds: [],
        cancelEffectiveMonth: null,
        releasedPeriods: 0,
        releasedCents: 0,
        cancelledAtPeriods: null,
      } as import('@domain/entities/finance').BudgetCommitment,
    ]
    const availableCashCents = computeAvailableCash(
      { cashBalanceCents: before.cashBalanceCents, commitments: withHypothetical, payables: [], receivables: [] },
      tuning,
    )
    const windowEnd = monthKeyFromOffsetForRunway(dayIndexToGregorian(this.dayIndex + Math.round(tuning.horizonMonths * 30.44)))
    const runwayMonths = computeRunwayMonths({
      cashBalanceCents: before.cashBalanceCents,
      commitments: annotateCommitmentsForRunway(withHypothetical, month, windowEnd),
      expectedInflowsByMonth: [],
      horizonMonths: tuning.horizonMonths,
      startMonth: month,
    })
    const after: GameFinancialOverview = {
      ...before,
      availableCashCents,
      committedCents: Math.max(0, before.cashBalanceCents - availableCashCents),
      runwayMonths,
    }
    return { before, after, feeCents, salaryMonthlyCents }
  }

  /** 月薪承诺合计（P-05 employees 页 KPI）：sourceType=employment_salary 且 active 的月度承诺之和。 */
  monthlySalaryCommitmentCents(): number {
    const company = this.getPlayerCompany()
    if (!company) return 0
    return this.finance
      .getLedger()
      .getCommitments(company.id, { state: 'committed' })
      .filter((c) => c.sourceType === 'employment_salary' && c.period === 'monthly')
      .reduce((sum, c) => sum + c.amountCents, 0)
  }

  // ===== P-03 / P-04 立项向导（S03+S04，批次 07A）=====

  /**
   * 立项预览（P-04）：内核同源派生 Budget_cap / Cost_est / ratio / verdict / WP 清单。
   * 零负载 + 空团队 → Cost_est=+∞（UI 显示"暂不可估"，禁止显示 Infinity）；
   * 模块词表缺种子（OPEN-CONTENT-MODULES）→ workload 全零 fail-closed。
   */
  previewExecutionProject(params: BlueprintDraftInput | { hrb: number; budgetCapacityCents: number }): CommandOutcome<ExecutionProjectPreview> {
    if ('kind' in params) return this.previewRec03(params)
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company
    const availableCashCents = this.getFinancialOverview()?.availableCashCents ?? 0
    // ADJ-2026-11-24-30 §3.1：守卫校验对象是"承诺额"（hrb × 预算容量），不是整笔容量。
    // HRB 语义 = 玩家承诺现金的比例（new-project.tsx:57 budgetCapCents = round(hrb × capacity)），
    // 真正占用现金的是承诺额；纪律"承诺额 ≤ 可用现金"不变，只是对齐语义（非 weaken）。
    const commitmentCents = Math.round(params.hrb * params.budgetCapacityCents)
    if (commitmentCents > availableCashCents) {
      return {
        success: false,
        errorCode: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH',
        message: `预算承诺额 $${(commitmentCents / 100).toLocaleString()} 超出可用现金 $${(availableCashCents / 100).toLocaleString()}（PROJ_BUDGET_CAPACITY_EXCEEDS_CASH）。`,
      }
    }
    try {
      const projectId = `preview-${uuid()}`
      const state = createProjectExecution(
        {
          projectId,
          companyId: company.id,
          studioId: company.id,
          versionId: `draft-${projectId}`,
          snapshotId: `draft-open-modules-${projectId}`,
          formulaVersion: 'open-content-modules',
          day: this.dayIndex,
          hrb: params.hrb,
          budgetCapacityCents: params.budgetCapacityCents,
          availableCashCents,
          decomposition: {
            projectId,
            snapshotId: `draft-open-modules-${projectId}`,
            workload: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
            instances: [],
            contentPacks: [],
            requireRules: [],
          },
        },
        DEFAULT_PROJECT_FORMULA_PARAMS,
      )
      const est = estimateCost(state, [], this.dayIndex, 0, 0, DEFAULT_PROJECT_FORMULA_PARAMS)
      // 规格（P1 清单 §二）：团队为 0 或 audio Cap=0 → Cost_est=+∞；UI 显示"暂不可估"禁止显示 Infinity。
      // 当前无团队 → 无论 workload 是否为零均按 +∞ 口径 fail-closed。
      const teamEmpty = true
      const infinite = teamEmpty || !Number.isFinite(est.costEstCents)
      return {
        success: true,
        result: {
          budgetCapCents: state.project.budgetCapCents,
          costEstCents: infinite ? null : est.costEstCents,
          costEstInfinite: infinite,
          ratio: est.ratio,
          verdict: est.verdict,
          reasoning: est.reasoning,
          workPackages: state.workPackages.map((wp) => ({
            workPackageId: wp.workPackageId,
            discipline: wp.discipline,
            baselineWorkUnits: wp.baselineWorkUnits,
            dependsOn: wp.sourceRef.instanceId ? [wp.sourceRef.instanceId] : [],
          })),
        },
      }
    } catch (error) {
      if (error instanceof ProjectError) {
        return { success: false, errorCode: error.code, message: error.message }
      }
      throw error
    }
  }

  /**
   * 立项确认（P-04）：预算承诺额（round(hrb × 预算容量)）≤ AvailableCash（PROJ_BUDGET_CAPACITY_EXCEEDS_CASH，ADJ-30 §3.1）；
   * 承诺登记 = one_off project_budget, amount = Budget_cap（内核 setupBudgetCommitment，C2/A-8）；
   * 失败整体回滚不留半成品（原子性）。ExecutionProject 状态入内存 Map（持久化 OPEN-PROJ-EXEC-PERSIST）。
   */
  createExecutionProject(params: BlueprintDraftInput | {
    name: string
    genreId: string
    hrb: number
    budgetCapacityCents: number
  }): CommandOutcome<{ projectId: string }> {
    if ('kind' in params) return this.createRec03(params)
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company
    const availableCashCents = this.getFinancialOverview()?.availableCashCents ?? 0
    // ADJ-2026-11-24-30 §3.1：校验承诺额（hrb × 预算容量）≤ 可用现金，非整笔容量；纪律不放宽。
    const commitmentCents = Math.round(params.hrb * params.budgetCapacityCents)
    if (commitmentCents > availableCashCents) {
      return {
        success: false,
        errorCode: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH',
        message: `预算承诺额 $${(commitmentCents / 100).toLocaleString()} 超出可用现金 $${(availableCashCents / 100).toLocaleString()}（PROJ_BUDGET_CAPACITY_EXCEEDS_CASH）。`,
      }
    }
    // 立项 = 立约承诺登记（不改现金，A-7 红线）：承诺先行，失败即整体拒绝；
    // legacy Project 随后创建，其失败则回滚承诺（原子性）。
    const projectId = uuid()
    let execution: ProjectExecutionState
    try {
      execution = createProjectExecution(
        {
          projectId,
          companyId: company.id,
          studioId: company.id,
          versionId: `draft-${projectId}`,
          snapshotId: `draft-open-modules-${projectId}`,
          formulaVersion: 'open-content-modules',
          day: this.dayIndex,
          hrb: params.hrb,
          budgetCapacityCents: params.budgetCapacityCents,
          availableCashCents,
          plannedLaunchDay: this.dayIndex + TUNING.project.defaultLaunchHorizonDays,
          decomposition: {
            projectId,
            snapshotId: `draft-open-modules-${projectId}`,
            workload: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
            instances: [],
            contentPacks: [],
            requireRules: [],
          },
        },
        DEFAULT_PROJECT_FORMULA_PARAMS,
      )
      execution = setupBudgetCommitment(execution, { ledger: this.finance.getLedger(), day: this.dayIndex })
    } catch (error) {
      if (error instanceof ProjectError) {
        return { success: false, errorCode: error.code, message: error.message }
      }
      throw error
    }
    // legacy Project（现有列表/详情 UI 载体）——budgetTotalCapCents = Budget_cap 对齐展示
    const created = this.createProject({
      name: params.name,
      genreId: params.genreId,
      budgetTotalCapCents: execution.project.budgetCapCents,
      plannedLaunchDay: this.dayIndex + TUNING.project.defaultLaunchHorizonDays,
      targetPlatformIds: [],
      audienceSegmentIds: [],
    })
    if (!created.success) {
      // 回滚承诺（不留半成品）：取消承诺，生效月 = 当月
      for (const cid of execution.project.commitmentIds) {
        this.finance.getLedger().releaseCommitment(
          company.id,
          cid,
          monthKeyFromOffsetForRunway(dayIndexToGregorian(this.dayIndex)),
        )
      }
      return { success: false, errorCode: created.errorCode, message: created.message }
    }
    this.executionProjects.set(projectId, execution)
    if (created.result) {
      // 双索引：内核 projectId + legacy Project id（P-06 详情页按 legacy id 取 ExecutionProject）
      this.executionProjects.set(created.result.id, execution)
    }
    return { success: true, result: { projectId } }
  }

  /** ExecutionProject 只读（P-06 后续接线；内存暂存）。 */
  private rec03Draft(params: BlueprintDraftInput): { snapshot: DesignVersionSnapshot; decomposition: DecompositionInput; estimates: import('@domain/entities/product-blueprint').EstimateBundle; violations: import('@domain/entities/product-blueprint').BlueprintViolation[]; name: string; genreId: string; plannedLaunchDay: number } | CommandOutcome<ExecutionProjectPreview> {
    validateRec03Catalog()
    if (!params.requestId.trim()) return { success: false, errorCode: 'REC03_INPUT_INVALID', message: 'requestId required' }
    if (params.kind === 'snapshotRef') {
      const saved = this.rec03Snapshots.get(params.snapshotId)
      if (saved === undefined || saved.snapshot.versionId !== params.versionId || saved.name !== params.workingTitle || saved.genreId !== params.genreId || saved.plannedLaunchDay !== params.plannedLaunchDay || saved.projectId === undefined) return { success: false, errorCode: 'REC03_SNAPSHOT_REF_MISMATCH', message: 'snapshotRef does not match an associated project' }
      return { snapshot: saved.snapshot, decomposition: saved.decomposition, estimates: saved.snapshot.estimates ?? estimateFourChannels({ structure: saved.snapshot.frozenBlueprint, templatesById: Object.fromEntries(REC03_MODULES.map((m) => [m.templateId, m])), archetype: null, capabilities: {}, platformTechStandards: [], synergyPenaltySum: 0 }, DEFAULT_BLUEPRINT_TUNING), violations: [], name: saved.name, genreId: saved.genreId, plannedLaunchDay: saved.plannedLaunchDay }
    }
    const targetTags = [...new Set(params.targetSegmentClaims)]
    const typeAliases: Record<string, string> = {
      action: 'SEED-PLATFORMER', platformer: 'SEED-PLATFORMER', shooter: 'SEED-PLATFORMER', fighting: 'SEED-PLATFORMER', arcade: 'SEED-PLATFORMER', racing: 'SEED-PLATFORMER',
      simulation: 'SEED-MGMT_SIM', sim: 'SEED-MGMT_SIM', strategy: 'SEED-MGMT_SIM', puzzle: 'SEED-MGMT_SIM', sports: 'SEED-MGMT_SIM',
      adventure: 'SEED-RPG', rpg: 'SEED-RPG',
      'SEED-MGMT_SIM': 'SEED-MGMT_SIM', 'SEED-PLATFORMER': 'SEED-PLATFORMER', 'SEED-RPG': 'SEED-RPG',
    }
    const primaryTypeId = typeAliases[params.primaryTypeId]
    const catalog = createP1Catalog()
    const tags = new Set(catalog.vocabulary.tags.map((x) => x.tagId))
    const platforms = new Set(catalog.platforms.map((x) => x.platformId))
    const platformAliases: Record<string, string> = { arcade: 'PLT-ARCADE', arcade_pre_1975: 'PLT-ARCADE', arcade_classic: 'PLT-ARCADE', home_console_atari2600: 'PLT-HOME_CONSOLE_ATARI2600', home_console_g2: 'PLT-HOME_CONSOLE_ATARI2600', pc: 'PLT-HOME_COMPUTER_APPLEII', pc_pre_ibm: 'PLT-HOME_COMPUTER_APPLEII' }
    const platformTargets = params.platformTargets.map((id) => platformAliases[id] ?? id)
    const violations: import('@domain/entities/product-blueprint').BlueprintViolation[] = []
    const genreKnown = genresContent.some((genre) => genre.id === params.genreId)
    if (!params.workingTitle.trim() || !genreKnown || primaryTypeId === undefined || !tags.size || targetTags.some((x) => !tags.has(x)) || platformTargets.some((x) => !platforms.has(x))) return { success: false, errorCode: 'REC03_INPUT_INVALID', message: 'invalid title, genre, segment, or platform' }
    const modules = params.modules
    const core = modules.filter((m) => m.slotId === 'REC03-SLOT-CORE')
    const content = modules.filter((m) => m.slotId === 'REC03-SLOT-CONTENT')
    const support = modules.filter((m) => m.slotId === 'REC03-SLOT-SUPPORT')
    if (core.length !== 1 || content.length !== 1 || support.length > 2 || new Set(modules.map((m) => m.instanceId)).size !== modules.length) return { success: false, errorCode: 'REC03_INPUT_INVALID', message: 'REC03 requires one core, one content, and at most two support modules' }
    const templatesById = Object.fromEntries(REC03_MODULES.map((m) => [m.templateId, m]))
    if (modules.some((m) => { const t = templatesById[m.templateId]; const slot = REC03_SLOTS.find((s) => s.slotId === m.slotId); return t === undefined || slot === undefined || !t.allowedSlotKinds.includes(slot.slotKind) })) return { success: false, errorCode: 'REC03_TEMPLATE_UNKNOWN', message: 'unknown REC03 module template or invalid slot' }
    const instances: ModuleInstance[] = modules.map((m) => { const t = templatesById[m.templateId]!; return { instanceId: m.instanceId, templateId: m.templateId, slotId: m.slotId, displayLabel: t.name, domain: t.domain, intensity: m.intensity, depthSelection: m.depthSelection, optionSelections: { ...m.optionSelections }, contentPackId: m.contentPackId, state: 'active', sourceOrigin: 'player' } })
    const packs = modules.filter((m) => m.contentPackId !== null).map((m) => REC03_CONTENT_PACKS.find((p) => p.packId === m.contentPackId)).filter((p): p is typeof REC03_CONTENT_PACKS[number] => p !== undefined)
    if (packs.length !== content.length) return { success: false, errorCode: 'REC03_CONTENT_PACK_INVALID', message: 'content module requires a valid REC03 content pack' }
    const positioning: PositioningProfile = { primaryTypeId, secondaryTypeIds: [], settingIds: [], perspectiveId: 'side_scroll', structureId: 'linear', targetSegmentClaims: targetTags, sellingPoints: [], platformTargets: [...platformTargets], commercialPositioning: 'premium', presetId: null }
    const slots = REC03_SLOTS.map((s) => ({ ...s, domainAcceptance: [...s.domainAcceptance], bindings: instances.filter((i) => i.slotId === s.slotId).map((i) => i.instanceId), outsourcingEligible: false }))
    const frozen: FrozenBlueprint = { positioning, slots, instances, contentPacks: packs.map((p) => ({ ...p, workUnitsPerTier: { ...p.workUnitsPerTier } })) }
    const composition = checkCompositionRules(frozen, templatesById, { combineRules: [], requireRules: [], conflictRules: [] } as CompositionRules, DEFAULT_BLUEPRINT_TUNING)
    violations.push(...composition.violations)
    const estimates = estimateFourChannels({ structure: frozen, templatesById, archetype: catalog.archetypes.find((a) => a.archetypeId === primaryTypeId) ?? null, capabilities: {}, platformTechStandards: [], synergyPenaltySum: composition.penaltySum }, DEFAULT_BLUEPRINT_TUNING)
    const projectId = `preview-${params.requestId}`
    const sourceInstances = instances.map((instance) => {
      const template = templatesById[instance.templateId]!
      const rawWorkload = Object.fromEntries(Object.entries(template.baseWorkUnits).map(([discipline, base]) => {
        const optionDelta = template.optionGroups.reduce((sum, group) => {
          const selected = group.options.find((option) => option.optionId === instance.optionSelections[group.optionGroupId])
          return sum + (selected?.costDelta[discipline as keyof typeof estimates.workUnits.raw] ?? 0)
        }, 0)
        const value = base * (template.intensityCurve[instance.intensity] ?? 1) * DEFAULT_BLUEPRINT_TUNING.depthMultiplier[instance.depthSelection] + optionDelta
        return [discipline, Math.max(0, value)]
      })) as typeof estimates.workUnits.raw
      return { instanceId: instance.instanceId, displayLabel: instance.displayLabel, rawWorkload }
    })
    const sourcePacks = packs.map((pack) => ({
      packId: pack.packId,
      rawWorkload: Object.fromEntries(Object.entries(pack.workUnitsPerTier).map(([discipline, value]) => [discipline, value * Math.pow(pack.tier, DEFAULT_BLUEPRINT_TUNING.contentTierAlpha)])) as typeof estimates.workUnits.raw,
    }))
    const decomposition: DecompositionInput = { projectId, snapshotId: `rec03-${params.requestId}`, workload: estimates.workUnits.byDiscipline, instances: sourceInstances, contentPacks: sourcePacks, requireRules: [] }
    const version: BlueprintVersion = { versionId: `rec03-version-${params.requestId}`, blueprintId: `rec03-blueprint-${params.requestId}`, versionNo: 0, state: 'IN_REVIEW', positioning, slots, instances, contentPacks: packs.map((p) => ({ ...p })), lockTargetReleaseForm: params.kind === 'draft' ? params.deliveryForm : 'full', lockedAt: null, lockedBy: null, changeHistory: [], supersedesVersionId: null, birthState: 'LOCKED' }
    const locked = lockVersion(version, decomposition.snapshotId, templatesById, this.dayIndex, 'player', estimates)
    return { snapshot: locked.snapshot, decomposition, estimates, violations, name: params.workingTitle, genreId: params.genreId, plannedLaunchDay: this.dayIndex + TUNING.project.defaultLaunchHorizonDays }
  }

  private previewRec03(params: BlueprintDraftInput): CommandOutcome<ExecutionProjectPreview> {
    const availableCashCents = this.getFinancialOverview()?.availableCashCents ?? 0
    const commitmentCents = Math.round(params.hrb * params.budgetCapacityCents)
    if (commitmentCents > availableCashCents) return { success: false, errorCode: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH', message: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH' }
    const built = this.rec03Draft(params)
    if ('success' in built) return { success: false, errorCode: built.errorCode, message: built.message }
    const state = createProjectExecution({ projectId: built.decomposition.projectId, companyId: this.getPlayerCompany()!.id, studioId: this.getPlayerCompany()!.id, versionId: built.snapshot.versionId, snapshotId: built.snapshot.snapshotId, formulaVersion: REC03_FORMULA_VERSION, day: this.dayIndex, hrb: params.hrb, budgetCapacityCents: params.budgetCapacityCents, availableCashCents: this.getFinancialOverview()?.availableCashCents ?? 0, plannedLaunchDay: built.plannedLaunchDay, deliveryFormTarget: params.kind === 'draft' ? params.deliveryForm : 'full', decomposition: built.decomposition }, DEFAULT_PROJECT_FORMULA_PARAMS)
    const result: ExecutionProjectPreview = { requestId: params.requestId, snapshotId: built.snapshot.snapshotId, versionId: built.snapshot.versionId, snapshot: built.snapshot, decomposition: built.decomposition, estimates: built.estimates, violations: built.violations, budgetCapCents: state.project.budgetCapCents, costEstCents: null, costEstInfinite: true, ratio: 0, verdict: 'need_more_budget_or_delay', reasoning: ['REC-03 preview'], workPackages: state.workPackages.map((wp) => ({ workPackageId: wp.workPackageId, discipline: wp.discipline, baselineWorkUnits: wp.baselineWorkUnits, dependsOn: wp.sourceRef.instanceId ? [wp.sourceRef.instanceId] : [] })) }
    return { success: true, result }
  }

  private createRec03(params: BlueprintDraftInput): CommandOutcome<{ projectId: string }> {
    const payloadHash = JSON.stringify(params)
    const prior = this.rec03Requests.get(params.requestId)
    if (prior !== undefined && prior.hash !== payloadHash) return { success: false, errorCode: 'REC03_REQUEST_PAYLOAD_MISMATCH', message: 'requestId payload mismatch' }
    if (prior !== undefined) return { success: true, result: { projectId: prior.result.projectId }, idempotent: true }
    const availableCashCents = this.getFinancialOverview()?.availableCashCents ?? 0
    const commitmentCents = Math.round(params.hrb * params.budgetCapacityCents)
    if (commitmentCents > availableCashCents) return { success: false, errorCode: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH', message: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH' }
    const built = this.rec03Draft(params)
    if ('success' in built) return { success: false, errorCode: built.errorCode, message: built.message }
    if (built.violations.some((v) => v.severity === 'E')) return { success: false, errorCode: 'REC03_BLUEPRINT_VIOLATION', message: built.violations.map((v) => v.message).join('; '), result: undefined }
    const company = this.getPlayerCompany(); if (company === undefined) return { success: false, errorCode: 'COMPANY_NOT_FOUND', message: 'company unavailable' }
    if (params.kind === 'snapshotRef') {
      const saved = this.rec03Snapshots.get(params.snapshotId)!
      const execution = this.executionProjects.get(saved.projectId!)
      if (execution === undefined) return { success: false, errorCode: 'REC03_SNAPSHOT_REF_MISMATCH', message: 'snapshotRef has no execution project' }
      const result = { projectId: execution.project.projectId, snapshotId: params.snapshotId, versionId: params.versionId, commitmentId: execution.project.commitmentIds[0] ?? '' }
      this.rec03Requests.set(params.requestId, { hash: payloadHash, result })
      return { success: true, result: { projectId: result.projectId } }
    }
    const projectId = uuid()
    let execution = createProjectExecution({ projectId, companyId: company.id, studioId: company.id, versionId: built.snapshot.versionId, snapshotId: built.snapshot.snapshotId, formulaVersion: REC03_FORMULA_VERSION, day: this.dayIndex, hrb: params.hrb, budgetCapacityCents: params.budgetCapacityCents, availableCashCents: this.getFinancialOverview()?.availableCashCents ?? 0, plannedLaunchDay: built.plannedLaunchDay, deliveryFormTarget: params.kind === 'draft' ? params.deliveryForm : 'full', decomposition: { ...built.decomposition, projectId } }, DEFAULT_PROJECT_FORMULA_PARAMS)
    execution = setupBudgetCommitment(execution, { ledger: this.finance.getLedger(), day: this.dayIndex })
    const legacyPlatformIds = params.platformTargets.map((id) => id === 'PLT-ARCADE' ? 'arcade_pre_1975' : id === 'PLT-HOME_CONSOLE_ATARI2600' ? 'home_console_g2' : id === 'PLT-HOME_COMPUTER_APPLEII' ? 'pc_pre_ibm' : id)
    const legacySegmentIds = [...new Set(params.targetSegmentClaims.map((x) => REC03_SEGMENT_MAP[x]).filter((x): x is string => x !== undefined))]
    const legacy = this.createProject({ name: built.name, genreId: built.genreId, budgetTotalCapCents: execution.project.budgetCapCents, plannedLaunchDay: built.plannedLaunchDay, targetPlatformIds: legacyPlatformIds, audienceSegmentIds: legacySegmentIds })
    if (!legacy.success || legacy.result === undefined) {
      for (const cid of execution.project.commitmentIds) this.finance.getLedger().releaseCommitment(company.id, cid, monthKeyFromOffsetForRunway(dayIndexToGregorian(this.dayIndex)))
      return { success: false, errorCode: legacy.errorCode, message: legacy.message }
    }
    this.executionProjects.set(projectId, execution); this.executionProjects.set(legacy.result.id, execution)
    this.rec03Snapshots.set(built.snapshot.snapshotId, { snapshot: built.snapshot, decomposition: { ...built.decomposition, projectId }, projectId: legacy.result.id, name: built.name, genreId: built.genreId, plannedLaunchDay: built.plannedLaunchDay })
    const commitmentId = execution.project.commitmentIds[0] ?? ''
    this.rec03Requests.set(params.requestId, { hash: payloadHash, result: { projectId, snapshotId: built.snapshot.snapshotId, versionId: built.snapshot.versionId, commitmentId } })
    return { success: true, result: { projectId }, idempotent: prior !== undefined }
  }

  getExecutionProject(projectId: string): ProjectExecutionState | undefined {
    return this.executionProjects.get(projectId)
  }

  /**
   * P-06：产能 Cap_d 与瓶颈学科（§5.3-2）+ Cost_est / ratio / verdict（内核 estimateCost 同源）。
   * ExecutionProject 未登记（旧项目/未走新向导）→ null（UI 显示缺省"按现有预算面板口径"）。
   */
  getExecutionSummary(projectId: string): ExecutionSummary | null {
    const execution = this.executionProjects.get(projectId)
    if (execution === undefined) return null
    const company = this.getPlayerCompany()
    const members = company === undefined ? [] : this.world.employees
      .filter((e) => e.companyId === company.id && e.status === 'hired')
      .map((e) => ({
        employmentId: e.id,
        salaryCentsPerMonth: e.salaryMonthlyCents,
        skillLevels: {},
      }))
    const est = estimateCost(execution, members, this.dayIndex, 0, 0, DEFAULT_PROJECT_FORMULA_PARAMS)
    const infinite = members.length === 0 || !Number.isFinite(est.costEstCents)
    // Cap_d（§5.3-2）：按学科在职员工数近似产能（D-06 技能档 P1 未接线 → 计数口径，不造数值）
    const capacityByDiscipline: Record<string, number> = { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
    for (const e of this.world.employees) {
      if (e.companyId !== company?.id || e.status !== 'hired') continue
      if (e.role === 'designer') capacityByDiscipline['design'] = (capacityByDiscipline['design'] ?? 0) + e.skillLevel
      else if (e.role === 'programmer') capacityByDiscipline['code'] = (capacityByDiscipline['code'] ?? 0) + e.skillLevel
      else if (e.role === 'artist') capacityByDiscipline['art'] = (capacityByDiscipline['art'] ?? 0) + e.skillLevel
      else if (e.role === 'qa') capacityByDiscipline['qa'] = (capacityByDiscipline['qa'] ?? 0) + e.skillLevel
    }
    // 瓶颈 = 有 WP 工作量的学科中产能最小者；无 WP → null
    const disciplinesWithWork = new Set(execution.workPackages.filter((wp) => wp.state !== 'DEACTIVATED').map((wp) => wp.discipline))
    let bottleneckDiscipline: string | null = null
    let minCap = Number.POSITIVE_INFINITY
    for (const d of disciplinesWithWork) {
      const cap = capacityByDiscipline[d] ?? 0
      if (cap < minCap) { minCap = cap; bottleneckDiscipline = d }
    }
    return {
      costEstCents: infinite ? null : est.costEstCents,
      costEstInfinite: infinite,
      ratio: est.ratio,
      verdict: est.verdict,
      budgetCapCents: execution.project.budgetCapCents,
      workPackages: execution.workPackages.map((wp) => ({
        workPackageId: wp.workPackageId,
        discipline: wp.discipline,
        state: wp.state,
        kind: wp.kind,
        baselineWorkUnits: wp.baselineWorkUnits,
        remainingWorkUnits: wp.remainingWorkUnits,
      })),
      capacityByDiscipline,
      bottleneckDiscipline,
    }
  }

  // ===== CODE-07B REVISION / U4：返工预估 + 确认后执行（application 层接线内核纯函数） =====

  /**
   * 返工 scope 派生（预估与确认共用同一口径，零分叉）：从 ExecutionProject 的真实 WP 生成 affected，
   * 单位成本由 estimateCost 的 costPerWorkUnit 派生。δ 由玩家滑块 modulate W_d(new)。
   * 预览（无副作用）不校验 state/A 类——那些是 planRework 在「确认后执行」时强制的内核规则；
   * 预览仅在项目未登记 ExecutionProject 时 fail-closed。无 WP 时 breakdown 真值为 0（非造数）。
   */
  private reworkScopeFor(
    projectId: string,
    category: ReworkCategory,
    deltaPercent: number,
  ): {
    execution: ProjectExecutionState
    affected: ReworkAffectedItemInput[]
    costPerUnit: number[]
    baseTotal: number
  } | { reason: string } {
    const execution = this.executionProjects.get(projectId)
    if (execution === undefined) return { reason: '项目未登记 ExecutionProject（未走立项向导或旧档），返工预估不可用' }
    const company = this.getPlayerCompany()
    const members = company === undefined ? [] : this.world.employees
      .filter((e) => e.companyId === company.id && e.status === 'hired')
      .map((e) => ({ employmentId: e.id, salaryCentsPerMonth: e.salaryMonthlyCents, skillLevels: {} }))
    const est = estimateCost(execution, members, this.dayIndex, 0, 0, DEFAULT_PROJECT_FORMULA_PARAMS)
    const loaded = new Set(
      execution.workPackages
        .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED' && wp.baselineWorkUnits > 0)
        .map((wp) => wp.discipline),
    )
    const costPerUnit = DISCIPLINE_ORDER
      .filter((d) => loaded.has(d))
      .map((d) => est.costPerWorkUnit[d])
      .filter((c) => Number.isFinite(c) && c > 0)

    const baseTotal = execution.workPackages
      .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
      .reduce((s, wp) => s + wp.baselineWorkUnits, 0)
    const affected: ReworkAffectedItemInput[] = execution.workPackages
      .filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED' && wp.baselineWorkUnits > 0)
      .map((wp) => {
        const oldWorkUnits = wp.baselineWorkUnits
        const ratio = Math.max(0, 1 + (category === 'B' ? -1 : 1) * deltaPercent / 100)
        return {
          instanceId: wp.workPackageId,
          discipline: wp.discipline,
          oldWorkUnits,
          deliveredWorkUnits: wp.deliveredWorkUnits,
          newWorkUnits: oldWorkUnits * ratio,
        }
      })
    // 无 WP（OPEN-CONTENT-MODULES）时 affected/baseTotal 为 0，downstream 纯函数给出真值 0，
    // 不做任何数值伪造；确认执行时 planRework 会以 PROJ_REWORK_SCOPE_UNKNOWN fail-closed。
    return { execution, affected, costPerUnit, baseTotal }
  }

  /**
   * U4：确认前的返工预估只读投影（零副作用，不建会话、不写状态）。
   * 数值全部来自内核纯函数；`available=false` 时 UI 显示不可用原因并禁用确认。
   */
  getReworkEstimate(projectId: string, category: ReworkCategory, deltaPercent: number): ReworkEstimate {
    const scope = this.reworkScopeFor(projectId, category, deltaPercent)
    if ('reason' in scope) {
      return {
        projectId, category, mode: 'minimal', changeRatio: 0, disciplineUnits: [],
        reworkWorkUnits: 0, sunkWorkUnits: 0,
        costLowCents: null, costHighCents: null, costInfinite: false,
        delayLowDays: 0, delayHighDays: 0, available: false, unavailableReason: scope.reason,
      }
    }
    const { affected, costPerUnit, baseTotal } = scope
    const params = DEFAULT_PROJECT_FORMULA_PARAMS
    const breakdown = computeReworkCostBreakdown({ category, affected, workTotal: baseTotal }, params)
    const range = estimateReworkCostRange(breakdown.reworkWorkUnits, costPerUnit, params)

    // 与 planRework 相同的逐项占比分摊，得到「按学科分列」的返工工作量（unit）。
    const perItem = affected.map((item) =>
      computeChangeWorkUnits({ category, affected: [item], workTotal: baseTotal }, params),
    )
    const changeSum = perItem.reduce((s, v) => s + v, 0)
    const byDiscipline = new Map<ExecutionDiscipline, number>()
    if (changeSum > 0) {
      affected.forEach((item, i) => {
        const share = (breakdown.reworkWorkUnits * perItem[i]!) / changeSum
        if (share <= 0) return
        byDiscipline.set(item.discipline, (byDiscipline.get(item.discipline) ?? 0) + share)
      })
    }
    const costInfinite = !Number.isFinite(range.lowCents) || !Number.isFinite(range.highCents)
    return {
      projectId,
      category,
      mode: breakdown.mode,
      changeRatio: breakdown.changeRatio,
      disciplineUnits: DISCIPLINE_ORDER
        .filter((d) => byDiscipline.has(d))
        .map((d) => ({ discipline: d, workUnits: byDiscipline.get(d)! })),
      reworkWorkUnits: breakdown.reworkWorkUnits,
      sunkWorkUnits: breakdown.sunkWorkUnits,
      costLowCents: costInfinite ? null : range.lowCents,
      costHighCents: costInfinite ? null : range.highCents,
      costInfinite,
      delayLowDays: breakdown.durationExtension.low,
      delayHighDays: breakdown.durationExtension.high,
      available: true,
      unavailableReason: null,
    }
  }

  /**
   * U4「确认后才执行」：经 planRework + beginRework 创建真实 ReworkSession 并并入执行态。
   * 预估不可用 / scope 未知 ⇒ fail-closed 返回错误，不建假会话。
   */
  confirmRework(
    projectId: string,
    category: ReworkCategory,
    deltaPercent: number,
  ): CommandOutcome<{ sessionId: string; reworkWorkUnits: number }> {
    const scope = this.reworkScopeFor(projectId, category, deltaPercent)
    if ('reason' in scope) {
      return { success: false, errorCode: 'PROJ_REWORK_SCOPE_UNKNOWN', message: scope.reason }
    }
    const { execution, affected, costPerUnit } = scope
    const sessionId = `rw-${uuid()}`
    const changeId = `chg-${sessionId}`
    try {
      const plan = planRework(
        execution,
        {
          sessionId,
          category,
          affected,
          targetDraftVersionId: execution.project.versionId,
          targetSnapshotId: execution.project.snapshotId,
          changes: [{ changeId, instanceIds: affected.map((a) => a.instanceId) }],
          day: this.dayIndex,
          costPerUnit,
        },
        DEFAULT_PROJECT_FORMULA_PARAMS,
      )
      const next = beginRework(execution, plan, this.dayIndex)
      // 双索引同步：内核 projectId + legacy Project id 两键都指向更新后的状态。
      for (const [key, value] of this.executionProjects) {
        if (value === execution) this.executionProjects.set(key, next)
      }
      this.executionProjects.set(projectId, next)
      return { success: true, result: { sessionId, reworkWorkUnits: plan.breakdown.reworkWorkUnits } }
    } catch (error) {
      if (error instanceof ProjectError) {
        return { success: false, errorCode: error.code, message: error.message }
      }
      throw error
    }
  }

  /**
   * 交付提交（内核 submitDelivery 单一入口，fail-closed）：PASS ⇒ COMPLETED + Build；
   * FAIL ⇒ 仅记录 deliveryFailures / lastDeliveryFailure，state 保持 READY_TO_DELIVER（R14）。
   */
  submitDeliveryForProject(
    projectId: string,
    gate: { pass: boolean; violations: ReadonlyArray<{ code: string; severity: string }> },
    deliveryForm: import('@domain/entities/project-execution').DeliveryForm = 'full',
  ): CommandOutcome<{ completed: boolean; buildId: string | null }> {
    const execution = this.executionProjects.get(projectId)
    if (execution === undefined) {
      return { success: false, errorCode: 'PROJ_NOT_FOUND', message: '项目未登记 ExecutionProject' }
    }
    try {
      const result = submitDelivery(execution, {
        day: this.dayIndex,
        gate,
        versionLabel: execution.project.versionId,
        deliveryForm,
        actualCostCents: 0,
        deliveredTier: 0,
      })
      this.executionProjects.set(projectId, result.state)
      for (const [key, value] of this.executionProjects) {
        if (value === execution && key !== projectId) this.executionProjects.set(key, result.state)
      }
      return {
        success: true,
        result: { completed: result.completed, buildId: result.build?.buildId ?? null },
      }
    } catch (error) {
      if (error instanceof ProjectError) {
        return { success: false, errorCode: error.code, message: error.message }
      }
      throw error
    }
  }

  // ----- 07B REVISION2：P-09 交付闸门评估只读视图（fail-closed） -----

  /**
   * 只读查询：把已登记的 `evaluateDeliveryGate` 真实判定结果暴露给 UI。
   * fail-closed：缺快照 / 项目非可交付态 / 快照非 PASS 一律返回 pass=false，
   * 并给出结构化原因，UI 据此禁用提交并展示原因，绝不伪造 pass=true。
   */
  getDeliveryGateEvaluation(
    projectId: string,
    form: import('@domain/entities/project-execution').DeliveryForm = 'full',
    disclosureProvided = false,
  ): DeliveryGateEvaluation {
    const fail = (unavailableReason: string): DeliveryGateEvaluation => ({
      available: false,
      pass: false,
      gate: { pass: false, violations: [] },
      reasonCodes: [],
      unavailableReason,
      source: 'unavailable',
      checkedAt: null,
    })

    const exec = this.executionProjects.get(projectId)
    if (exec === undefined) return fail('项目未登记 ExecutionProject')
    if (exec.project.state !== 'READY_TO_DELIVER') {
      return fail('项目未处于可交付态（READY_TO_DELIVER）')
    }

    // P2 SUP-01：生产路径真实求值 + 登记（非测试夹具）。项目处于可交付态时，
    // 每次查询都用真实 ExecutionProject + legacy Project + 已发布目录派生 EvaluationContext，
    // 交领域纯函数 evaluateDeliveryGate 判定后写入快照 Map；求值任一环节失败一律 fail-closed。
    try {
      this.refreshDeliveryGateEvaluation(projectId, form, disclosureProvided)
    } catch (error) {
      return fail(`D-02 交付闸门评估不可用：${error instanceof Error ? error.message : String(error)}`)
    }
    const snapshot = this.deliveryGateEvaluations.get(`${projectId}::${form}`)
    if (snapshot === undefined) return fail('D-02 交付闸门评估快照不可用')

    const violations = [...(snapshot.violations ?? [])]
    const eFree = violations.every((v) => v.severity !== 'E')
    const pass = snapshot.pass === true && eFree
    return {
      available: true,
      pass,
      gate: { pass, violations },
      reasonCodes: [...(snapshot.reasonCodes ?? [])],
      unavailableReason: null,
      source: snapshot.source ?? 'd02-evaluateDeliveryGate',
      checkedAt: snapshot.checkedAt ?? null,
    }
  }

  /**
   * P2 SUP-01：生产路径求值入口（真玩家路径调用，非夹具、非 UI 直接注入）。
   * 从真实运行状态派生 EvaluationContext，调用领域 evaluateDeliveryGate，把真实判定登记为快照。
   * 返回值即登记产物，供测试断言"快照由真实内核计算"；不修改内核 submitDelivery 语义。
   */
  refreshDeliveryGateEvaluation(
    projectId: string,
    form: import('@domain/entities/project-execution').DeliveryForm = 'full',
    disclosureProvided = false,
  ): DeliveryGateEvaluationInput {
    const exec = this.executionProjects.get(projectId)
    if (exec === undefined) throw new Error('项目未登记 ExecutionProject')
    // 双索引：projectId 可能是 legacy id，find 时用任一 id 命中真实 Project。
    const project = this.world.projects.find((p) => p.id === projectId)
      ?? this.world.projects.find((p) => p.id === exec.project.projectId)
    if (project === undefined) throw new Error('legacy Project 不存在，无法派生 EvaluationContext')

    const evaluated = evaluateRuntimeDeliveryGate({
      execution: exec,
      project,
      dayIndex: this.dayIndex,
      disclosureProvided,
      form,
      snapshot: this.rec03Snapshots.get(exec.project.snapshotId)?.snapshot,
    })
    const { result } = evaluated
    const input: DeliveryGateEvaluationInput = {
      pass: result.gate === 'PASS',
      // FAIL 的五码均为闸门阻断，按 E 级映射，保证 UI pass 与内核 evaluateGate 同语义。
      violations: result.errorCodes.map((code) => ({ code, severity: 'E' })),
      reasonCodes: [...result.errorCodes],
      checkedAt: result.checkedAt,
      source: 'd02-evaluateDeliveryGate',
    }
    this.registerDeliveryGateEvaluation(projectId, form, input)
    return input
  }

  /**
   * 登记 D-02 判定快照（编排层在评估后写入，UI 不调用）。
   * 入参必须来自 `evaluateDeliveryGate` 的真实判定产物，不得手写 pass=true 绕过闸门。
   */
  registerDeliveryGateEvaluation(
    projectId: string,
    form: import('@domain/entities/project-execution').DeliveryForm,
    evaluation: DeliveryGateEvaluationInput,
  ): void {
    this.deliveryGateEvaluations.set(`${projectId}::${form}`, {
      pass: evaluation.pass === true,
      violations: [...(evaluation.violations ?? [])],
      reasonCodes: [...(evaluation.reasonCodes ?? [])],
      checkedAt: evaluation.checkedAt ?? this.dayIndex,
      source: evaluation.source ?? 'd02-evaluateDeliveryGate',
    })
  }

  // ----- Employee -----

  hireEmployee(params: {
    name: string
    role: EmployeeRole
    skillLevel: number
    salaryMonthlyCents: number
    primarySkill?: string
  }): CommandOutcome<Employee> {
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company

    // CODE-06（R3 口径变更声明）：headcount 判定改用 countOccupyingByCompany（含 probation/resigning，
    // 防"resigning 不占名额"超招）；迁移日志见实施报告。数值与旧 hired 计数在双轨下等价。
    this.withPersonnel(() => undefined)
    const activeCount = this.personnel.countOccupyingByCompany(company.id)
    if (activeCount >= company.managementCapacity) {
      return {
        success: false,
        errorCode: 'EMP_CAPACITY_FULL',
        message: `管理容量已满（${company.managementCapacity} 人），无法继续招聘。`,
      }
    }
    if (this.isFinanciallyDistressed(company)) {
      return {
        success: false,
        errorCode: 'FIN_DISTRESS',
        message: '公司现金为负（财务困难），无法招聘新员工。',
      }
    }

    // 薪资必须是有限的正整数美分（拒绝 NaN / Infinity / 0 / 负数 / 小数）
    if (
      !Number.isFinite(params.salaryMonthlyCents) ||
      !Number.isInteger(params.salaryMonthlyCents) ||
      params.salaryMonthlyCents <= 0
    ) {
      return {
        success: false,
        errorCode: 'EMP_INVALID_SALARY',
        message: '月薪必须是大于 0 的整数（美分）。',
      }
    }
    if (!Number.isFinite(params.skillLevel)) {
      return { success: false, errorCode: 'EMP_INVALID_SKILL', message: '技能等级必须是 1–5 的整数。' }
    }

    // 城市工资系数应用于基础薪资
    const effectiveSalary = Math.round(params.salaryMonthlyCents * citySalaryMultiplier(company.cityId))
    // 招聘一次性中介费（ADJ-2026-11-22-12 S5-3）：= negotiatedSalary × recruitFeeMonths（初值 ×1，TUNING）。
    // 经 one_off 承诺在 arrivalDay（=确认日）兑现，category=project_expense（§6.3/§7.2），不直改现金。
    const hireCostCents = Math.round(effectiveSalary * DEFAULT_PERSONNEL_PARAMS.recruitFeeMonths)
    if (this.finance.getCashBalance(company.id) < hireCostCents) {
      return {
        success: false,
        errorCode: 'FIN_INSUFFICIENT_CASH',
        message: `现金不足，入职成本需要 $${(hireCostCents / 100).toLocaleString()}。`,
      }
    }

    // B-01a：employmentId 必须由 seed + 递增序号确定性派生（R9 同 seed 可复现）。
    // 该 ID 同时作为 Employee.id 与 PersonnelService 的 employmentId，参与 hash01 离职判定。
    const empId = this.nextEmploymentId()
    this.syncEmployeesFromWorld()
    const result = this.employees.hire({
      id: empId,
      companyId: company.id,
      name: params.name,
      role: params.role,
      primarySkill: params.primarySkill ?? 'gameplay',
      skillLevel: Math.max(1, Math.min(5, params.skillLevel)),
      salaryMonthlyCents: effectiveSalary,
      contractStartDay: this.dayIndex,
      contractEndDay: null,
    })
    if (!result.success || !result.result) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '招聘失败' }
    }
    const emp = result.result

    // D-03 双轨：Person + Employment(probation) + 薪资承诺（§7.2）+ 招聘费承诺（one_off，S5-3）。
    // employmentId = emp.id（emp.id 即上面确定性派生的 empId，§15.1 #2）；财务失败则不提交。
    const hired = this.withPersonnel(() =>
      this.personnel.hire({
        companyId: company.id,
        employmentId: empId,
        name: params.name,
        role: params.role,
        skillLevel: Math.max(1, Math.min(5, params.skillLevel)),
        salaryMonthlyCents: effectiveSalary,
        day: this.dayIndex,
        headcountLimit: company.managementCapacity,
      }),
    )
    if (!hired.ok || !hired.value) {
      // 财务/人才层失败：回滚 EmployeeService 内部状态（以 world.employees 为准，R-005）
      this.syncEmployeesFromWorld()
      return {
        success: false,
        errorCode: hired.error?.code ?? 'EMP_HIRE_FAILED',
        message: hired.error?.message ?? '招聘失败（人才层）',
      }
    }

    this.world.employees.push(emp)
    this.syncEmployeesFromWorld()
    this.syncCash(company)
    return { success: true, result: emp }
  }

  fireEmployee(employeeId: string): CommandOutcome<Employee> {
    // 破产后仍可解雇（DESIGN-OI-21 §2.2 / T-FIX-1）：不考虑 status 取玩家公司
    const company = this.getRawPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }
    const emp = this.world.employees.find((e) => e.id === employeeId)
    if (!emp) return { success: false, errorCode: 'EMP_NOT_FOUND', message: '员工未找到' }
    if (emp.status !== 'hired' && emp.status !== 'on_leave') {
      return { success: false, errorCode: 'EMP_ALREADY_TERMINATED', message: '该员工已离职，无法重复解雇。' }
    }

    // D-03（RULE-11）：解雇 = 立即 terminated + cancelCommitment(次月停) + 遣散 one_off 承诺
    // 当日创建并兑现（§6.4，category=severance）。遣散不再直改现金（R-D03-3）。
    const fired = this.withPersonnel(() => this.personnel.fire(employeeId, this.dayIndex))
    if (!fired.ok || !fired.value) {
      return {
        success: false,
        errorCode: fired.error?.code ?? 'EMP_FIRE_FAILED',
        message: fired.error?.message ?? '解雇失败',
      }
    }

    // 从所有项目中移除
    this.withProjects(() => {
      for (const p of this.world.projects) {
        if (!p.teamAssignments.some((a) => a.employeeId === employeeId)) continue
        const remaining = p.teamAssignments.filter((a) => a.employeeId !== employeeId)
        const all: TeamAssignment[] = []
        for (const other of this.world.projects) {
          all.push(...(other.id === p.id ? remaining : other.teamAssignments))
        }
        this.projects.reassignTeam({
          projectId: p.id,
          assignments: remaining,
          allAssignmentsInCompany: all,
        })
      }
    })

    this.world.employees = this.world.employees.map((e) =>
      e.id === employeeId
        ? { ...e, status: 'fired' as const, version: e.version + 1, updatedAt: this.dayIndex }
        : e,
    )
    this.syncEmployeesFromWorld()
    this.syncCash(company)
    return { success: true, result: { ...emp, status: 'fired' as const } }
  }

  // ----- Project -----

  createProject(params: {
    name: string
    genreId: string
    budgetTotalCapCents: number
    plannedLaunchDay: number
    audienceSegmentIds?: string[]
    targetPlatformIds?: string[]
  }): CommandOutcome<Project> {
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company

    if (this.isFinanciallyDistressed(company)) {
      return { success: false, errorCode: 'FIN_DISTRESS', message: '公司现金为负（财务困难），无法创建新项目。' }
    }

    const platformIds = params.targetPlatformIds ?? []
    for (const id of platformIds) {
      if (!isPlatformAvailable(id, this.dayIndex)) {
        return {
          success: false,
          errorCode: 'PRJ_PLATFORM_UNAVAILABLE',
          message: `目标平台在 ${yearOfDay(this.dayIndex)} 年尚不可用。`,
        }
      }
    }
    const segmentIds = params.audienceSegmentIds ?? []
    for (const id of segmentIds) {
      if (!isSegmentAvailable(id, this.dayIndex)) {
        return {
          success: false,
          errorCode: 'PRJ_SEGMENT_UNAVAILABLE',
          message: `目标受众在 ${yearOfDay(this.dayIndex)} 年尚未形成。`,
        }
      }
    }

    const result = this.withProjects(() =>
      this.projects.create({
        name: params.name,
        companyId: company.id,
        genreId: params.genreId,
        audienceSegmentIds: segmentIds,
        targetPlatformIds: platformIds,
        budgetTotalCapCents: params.budgetTotalCapCents,
        plannedLaunchDay: params.plannedLaunchDay,
        plannedStartDay: this.dayIndex,
      }),
    )
    if (!result.success || !result.result) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '创建项目失败' }
    }
    return { success: true, result: result.result }
  }

  advanceProjectPhase(projectId: string): CommandOutcome<Project> {
    const project = this.world.projects.find((p) => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    if (project.isPaused) return { success: false, message: '项目已暂停，请先恢复后再推进。' }

    this.syncEmployeesFromWorld()
    const result = this.withProjects(() => this.projects.advancePhaseGeneric(projectId, this.dayIndex))
    if (!result.success || !result.result) {
      return {
        success: false,
        errorCode: result.errorCode,
        message: this.describeProjectError(result.errorCode, result.errorMessage, project),
      }
    }
    return { success: true, result: result.result }
  }

  launchProject(projectId: string): CommandOutcome<Product> {
    // 破产后仍可上市（DESIGN-OI-21 §2.2 / T-FIX-2）：不考虑 status 取玩家公司
    const company = this.getRawPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }

    const before = this.world.projects.find((p) => p.id === projectId)
    const result = this.withProjects(() => this.projects.launch(projectId, this.dayIndex))
    if (!result.success || !result.result) {
      return {
        success: false,
        errorCode: result.errorCode,
        message: before
          ? this.describeProjectError(result.errorCode, result.errorMessage, before)
          : (result.errorMessage ?? '上市失败'),
      }
    }

    this.world.products.push(result.result.product)
    const launched = this.world.projects.find((p) => p.id === projectId)
    if (launched) {
      company.brand = Math.max(0, Math.min(100, company.brand + result.result.product.brandImpact))
    }
    // M2-H §4.2：上市建立初始认知度（首发曝光），否则产品永远进不了任何市场
    const product = this.world.products.find((p) => p.sourceProjectId === projectId)
    if (product !== undefined && Object.keys(product.awarenessByMarket).length === 0) {
      product.awarenessByMarket = seedInitialAwareness(company.brand, this.dayIndex)
    }
    if (product !== undefined && product.awarenessByScope === undefined) {
      product.awarenessByScope = awarenessByScopeOf(product)
    }
    this.syncCash(company)
    return { success: true, result: result.result.product }
  }

  toggleProjectPause(projectId: string): CommandOutcome<Project> {
    const project = this.world.projects.find((p) => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    const result = this.withProjects(() =>
      project.isPaused ? this.projects.resume(projectId) : this.projects.pause(projectId),
    )
    if (!result.success || !result.result) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '操作失败' }
    }
    return { success: true, result: result.result }
  }

  /**
   * 追加项目预算（TASK-M1.1-G05-001-D / DESIGN-G05 §9、G05-R9）。
   *
   * - 前置守卫：金额必须为正整数美分（BGT_INVALID_AMOUNT）；终态项目拒绝（PRJ_TERMINAL）。
   * - 幂等键 `budget:topup:{projectId}:{seq}`：同一 seq 重复调用返回既有结果，不重复加 totalCap。
   * - 效果：totalCap += amount，记录 changeLog（金额/原因/执行日/新 totalCap）。
   * - **不自动恢复**：isPaused / budgetExhausted / pausedDays 保持不变，
   *   玩家须显式执行 resumeProject（经 toggleProjectPause）后恢复。
   */
  topUpBudget(cmd: TopUpBudgetCmd): CommandOutcome<Project> {
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard

    const project = this.world.projects.find((p) => p.id === cmd.projectId)
    if (!project) return { success: false, errorCode: 'PRJ_NOT_FOUND', message: '项目未找到' }

    if (
      !Number.isFinite(cmd.amountCents) ||
      !Number.isInteger(cmd.amountCents) ||
      cmd.amountCents <= 0
    ) {
      return {
        success: false,
        errorCode: 'BGT_INVALID_AMOUNT',
        message: '追加金额必须是大于 0 的整数（美分）。',
      }
    }

    if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') {
      return { success: false, errorCode: 'PRJ_TERMINAL', message: '项目已结束，无法追加预算。' }
    }

    const idempotencyKey = topUpIdempotencyKey(cmd.projectId, cmd.seq)
    if (project.changeLog.some((entry) => entry.details?.idempotencyKey === idempotencyKey)) {
      return {
        success: true,
        result: project,
        idempotent: true,
        message: '该 seq 已追加过预算，返回既有结果。',
      }
    }

    const newTotalCapCents = project.budgetTotalCapCents + cmd.amountCents
    const next: Project = {
      ...project,
      budgetTotalCapCents: newTotalCapCents,
      changeLog: [
        ...project.changeLog,
        createTopUpChangeLogEntry({
          id: uuid(),
          projectId: cmd.projectId,
          seq: cmd.seq,
          amountCents: cmd.amountCents,
          reason: cmd.reason,
          newTotalCapCents,
          day: this.dayIndex,
        }),
      ],
      version: project.version + 1,
      updatedAt: this.dayIndex,
      // 不清除 isPaused / budgetExhausted / pausedDays：必须玩家显式 resume
    }
    this.world.projects = this.world.projects.map((p) => (p.id === cmd.projectId ? next : p))
    this.projects.reset(this.world.projects)
    return { success: true, result: next, message: '预算已追加，需手动恢复项目。' }
  }

  cancelProject(projectId: string): CommandOutcome<Project> {
    const result = this.withProjects(() =>
      this.projects.cancel(projectId, 'player_decision', this.calendar.currentDayIndex),
    )
    if (!result.success || !result.result) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '取消失败' }
    }
    return { success: true, result: result.result }
  }

  /**
   * 砍范围 descope（DESIGN-C-01 §3.3）。
   * 破产守卫（DESIGN-OI-21 §2.2）：破产公司仍允许 descope（自救手段）。
   */
  descopeProject(projectId: string, cutRatio: number): CommandOutcome<Project> {
    const result = this.withProjects(() =>
      this.projects.descope({ projectId, cutRatio, dayIndex: this.dayIndex }),
    )
    if (!result.success || !result.result) {
      return {
        success: false,
        errorCode: result.errorCode,
        message: result.errorMessage ?? '砍范围失败',
      }
    }
    return { success: true, result: result.result }
  }

  /**
   * 延期上市 delayLaunch（DESIGN-C-02 §3.3）。
   * 破产守卫（DESIGN-OI-21 §2.2）：破产公司仍允许延期（绝望操作）。
   */
  delayLaunch(projectId: string, extraDays: number): CommandOutcome<Project> {
    const company = this.getRawPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }

    const result = this.withProjects(() =>
      this.projects.delayLaunch({ projectId, extraDays, dayIndex: this.dayIndex }),
    )
    if (!result.success || !result.result) {
      return {
        success: false,
        errorCode: result.errorCode,
        message: result.errorMessage ?? '延期上市失败',
      }
    }

    // 品牌惩罚（DESIGN-C-02 §2.2）——只在公司 active 时执行
    if (company.status === 'active') {
      company.brand = Math.max(0, company.brand - result.result.brandPenalty)
    }
    return { success: true, result: result.result.project }
  }

  assignEmployeeToProject(
    employeeId: string,
    projectId: string,
    allocationRatio: number,
    roleOnProject: ProjectRole,
  ): CommandOutcome {
    const employee = this.world.employees.find((e) => e.id === employeeId)
    const project = this.world.projects.find((p) => p.id === projectId)
    if (!employee || !project) return { success: false, message: '员工或项目未找到' }
    if (employee.status !== 'hired') return { success: false, message: '该员工已不在职，无法分配。' }
    if (employee.companyId !== project.companyId) {
      return { success: false, message: '员工不属于该公司，无法分配。' }
    }
    if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') {
      return { success: false, message: '项目已结束，无法分配团队。' }
    }
    if (project.teamAssignments.some((a) => a.employeeId === employeeId)) {
      return { success: false, message: '该员工已在此项目中。' }
    }
    if (!Number.isFinite(allocationRatio) || allocationRatio <= 0 || allocationRatio > 1) {
      return { success: false, message: '投入比例必须是 1%–100% 之间的有效数值。' }
    }

    const existing: TeamAssignment[] = []
    for (const p of this.world.projects) existing.push(...p.teamAssignments)
    const newAssignment: TeamAssignment = {
      employeeId,
      projectId,
      allocationRatio,
      roleOnProject,
    }

    const result = this.withProjects(() =>
      this.projects.reassignTeam({
        projectId,
        assignments: [...project.teamAssignments, newAssignment],
        allAssignmentsInCompany: [...existing, newAssignment],
      }),
    )
    if (!result.success) {
      return { success: false, errorCode: result.errorCode, message: this.describeTeamError(result.errorCode) }
    }
    return { success: true }
  }

  unassignEmployeeFromProject(employeeId: string, projectId: string): CommandOutcome {
    const project = this.world.projects.find((p) => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') {
      return { success: false, message: '项目已结束，无法调整团队。' }
    }
    const remaining = project.teamAssignments.filter((a) => a.employeeId !== employeeId)
    const all: TeamAssignment[] = []
    for (const p of this.world.projects) {
      all.push(...(p.id === projectId ? remaining : p.teamAssignments))
    }
    const result = this.withProjects(() =>
      this.projects.reassignTeam({ projectId, assignments: remaining, allAssignmentsInCompany: all }),
    )
    if (!result.success) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '取消分配失败' }
    }
    return { success: true }
  }

  // ----- Refund（M2-C） -----

  /** 玩家退款请求：窗口判定、上限判定、即时入账（DESIGN-M2-001-C §10.6） */
  requestPlayerRefund(cmd: PlayerRefundRequest): CommandOutcome<RefundRequestResult> {
    try {
      const result = this.refunds.requestPlayerRefund(this.world, cmd)
      this.world = result.world
      if (result.errorCode !== undefined) {
        return { success: false, errorCode: result.errorCode, message: result.errorCode }
      }
      return { success: true, result }
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const code = String((error as { code: unknown }).code)
        return { success: false, errorCode: code, message: error.message }
      }
      throw error
    }
  }

  // ----- Pricing / Lifecycle（M2-D） -----

  /** 首次定价 / 改价（DESIGN-M2-001-D §6.1） */
  setProductPrice(cmd: SetPriceCmd): CommandOutcome<PricingResult> {
    const blocked = this.controlLock(cmd.productId)
    if (blocked !== null) return blocked
    return this.runPricing((world) => this.pricing.setPrice(world, cmd, this.dayIndex))
  }

  /** 发行商 `controlLevel:'full'` 生效期内，玩家不能改价、折扣或改营销。 */
  private controlLock(productId: string): CommandOutcome<PricingResult> | null {
    if (!hasFullControl(this.world, productId)) return null
    return {
      success: false,
      errorCode: 'CONTRACT_CONTROL_LOCKED',
      message: '发行商持有全控制权：合同生效期内不能改价/折扣/营销',
    }
  }

  /** 折扣 / 取消折扣（§6.2） */
  applyProductDiscount(cmd: ApplyDiscountCmd): CommandOutcome<PricingResult> {
    const blocked = this.controlLock(cmd.productId)
    if (blocked !== null) return blocked
    return this.runPricing((world) => this.pricing.applyDiscount(world, cmd, this.dayIndex))
  }

  /** 手动退市（§6.4）；重复退市幂等成功 */
  retireProduct(cmd: RetireProductCmd): CommandOutcome<PricingResult> {
    return this.runPricing((world) => this.pricing.retire(world, cmd, this.dayIndex))
  }

  private runPricing(fn: (world: WorldState) => PricingResult): CommandOutcome<PricingResult> {
    const result = fn(this.world)
    this.world = result.world
    if (!result.ok) {
      return {
        success: false,
        errorCode: result.errorCode,
        message: result.errorMessage ?? result.errorCode ?? '定价操作失败',
      }
    }
    return { success: true, result }
  }

  // ----- Simulation -----

  /** 唯一推进入口：日历推进 + 统一调度器 */
  /** 按当日入场表补齐 AI 公司；幂等，且为每家补一笔初始资本流水（AI 与玩家同账本） */
  private seedAiCompanies(dayIndex: number): void {
    if (!this.aiCompetitionEnabled) return
    const { companies, seeded } = seedDueAiCompanies(this.world.companies, dayIndex)
    if (seeded.length === 0) return
    const staff: Employee[] = []
    for (const company of seeded) {
      this.finance.registerCompany(company.id)
      this.finance.postTransaction({
        idempotencyKey: `ai-capital:${company.id}`,
        companyId: company.id,
        day: dayIndex,
        category: 'advance',
        amountCents: company.cashBalanceCents,
        description: `${company.name} 初始资本`,
      })
      const spec = findAiSpec(company.id)
      if (spec !== undefined) staff.push(...createAiStaff(company, spec, dayIndex))
    }
    this.world = { ...this.world, companies, employees: [...this.world.employees, ...staff] }
    // CODE-06（R15）：AI 公司员工与玩家共用同一迁移路径（Person+Employment+薪资承诺）；
    // AI 员工不进候选池（RULE-05 按 occupying 过滤已覆盖），不参与玩家人事命令。
    if (staff.length > 0) {
      this.withPersonnel(() => {
        const migration = migrateEmployees({
          employees: staff,
          day: dayIndex,
          params: this.personnel.tuning,
          regionOf: () => 'default',
        })
        this.personnel.mergeMigration(migration)
        for (const c of migration.salaryCommitments) {
          this.finance.getLedger().registerCommitment(c)
        }
        return undefined
      })
    }
  }

  /** AI 决策日志（内存态，FIFO 24 个月；A02/A03 审计用） */
  private aiDecisionLog: AiPlan[] = []

  getAiDecisions(): readonly AiPlan[] {
    return [...this.aiDecisionLog]
  }

  private buildAiView(company: Company): AiCompanyView {
    const staff = this.world.employees.filter(
      (e) => e.companyId === company.id && e.status === 'hired',
    )
    const activeProjects = this.world.projects
      .filter((p) => p.companyId === company.id && p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED')
      .sort((a, b) => Number(b.isPaused) - Number(a.isPaused) || a.id.localeCompare(b.id))
    const activeProject = activeProjects[0]
    const assignedFte = new Map<string, number>()
    for (const p of activeProjects) {
      for (const a of p.teamAssignments) {
        assignedFte.set(a.employeeId, (assignedFte.get(a.employeeId) ?? 0) + a.allocationRatio)
      }
    }
    const monthlyPayrollCents = staff.reduce((sum, e) => sum + e.salaryMonthlyCents, 0)
    const rentCents = Math.round(
      TUNING.company.baseMonthlyRentCents *
        cityRentMultiplier(company.cityId) *
        (company.officeLevel || 1),
    )
    const corporateSalaryCents = staff.reduce((sum, e) => {
      const assigned = Math.min(1, Math.max(0, assignedFte.get(e.id) ?? 0))
      return sum + Math.round(e.salaryMonthlyCents * (1 - assigned))
    }, 0)
    let existingProjectMonthlyBurnCents = 0
    for (const p of activeProjects) {
      if (p.isPaused) continue
      const dev = p.developmentBudgetCents ?? p.budgetTotalCapCents
      existingProjectMonthlyBurnCents += projectMonthlyBurnCents(
        {
          isPaused: false,
          developmentRemainingCents: Math.max(0, dev - p.budgetSpentCents - p.budgetCommittedCents),
          plannedLaunchDay: p.plannedLaunchDay,
        },
        this.dayIndex,
      )
    }
    return {
      id: company.id,
      persona: company.persona ?? 'indie',
      status: company.status,
      cashCents: this.finance.getCashBalance(company.id),
      monthlyFixedExpenseCents: rentCents + corporateSalaryCents,
      monthlyPayrollCents,
      activeProjectCount: activeProjects.length,
      existingProjectMonthlyBurnCents,
      accountsPayableCents: activeProjects.reduce((sum, p) => sum + p.budgetCommittedCents, 0),
      brand: company.brand,
      project:
        activeProject === undefined
          ? null
          : {
              id: activeProject.id,
              phase: activeProject.phase,
              isPaused: activeProject.isPaused,
              plannedLaunchDay: activeProject.plannedLaunchDay,
              budgetRemainingCents: Math.max(
                0,
                (activeProject.developmentBudgetCents ?? activeProject.budgetTotalCapCents) -
                  activeProject.budgetSpentCents -
                  activeProject.budgetCommittedCents,
              ),
              monthlyBurnCents: Math.round(
                Math.max(
                  0,
                  (activeProject.developmentBudgetCents ?? activeProject.budgetTotalCapCents) -
                    activeProject.budgetSpentCents,
                ) / Math.max(1, (activeProject.plannedLaunchDay - this.dayIndex) / 30),
              ),
              launchMarketingReservedCents: activeProject.launchMarketingReservedCents ?? 0,
              launchMarketingSpentCents: activeProject.launchMarketingSpentCents ?? 0,
              qualityScore:
                Object.values(activeProject.qualityEstimate).reduce((a, b) => a + b, 0) /
                Math.max(1, Object.keys(activeProject.qualityEstimate).length),
              genreId: activeProject.genreId,
              platformIds: activeProject.targetPlatformIds,
              segmentIds: activeProject.audienceSegmentIds,
            },
      products: this.world.products
        .filter((p) => p.companyId === company.id)
        .map((p) => ({
          id: p.id,
          priceCents: p.pricePerUnitCents ?? p.launchPriceCents,
          status: p.status,
          launchDay: p.launchDay,
          genreId: p.genreId,
          qualityScore: p.finalQualityScore,
          supportedPlatformIds: p.supportedPlatformIds,
          audienceSegmentIds: p.audienceSegmentIds,
          activeCampaignCount: this.world.marketingCampaigns.filter(
            (c) => c.productId === p.id && c.status === 'active',
          ).length,
          launchMarketingReservedCents:
            this.world.projects.find((proj) => proj.id === p.sourceProjectId)
              ?.launchMarketingReservedCents ?? 0,
          launchMarketingSpentCents:
            this.world.projects.find((proj) => proj.id === p.sourceProjectId)
              ?.launchMarketingSpentCents ?? 0,
        })),
      lastMonthRevenueCents: this.finance
        .getTransactionsByCompany(company.id)
        .filter((t) => t.category === 'sales_revenue' && t.day >= this.dayIndex - 30)
        .reduce((sum, t) => sum + t.amountCents, 0),
      ...(company.bankruptcyPhase !== undefined ? { bankruptcyPhase: company.bankruptcyPhase } : {}),
      ...(company.restructuringDeadlineDay !== undefined
        ? { restructuringDeadlineDay: company.restructuringDeadlineDay }
        : {}),
      saleableAssets: this.listSaleableAssets(company),
      staffCount: this.world.employees.filter(
        (e) => e.companyId === company.id && e.status === 'hired',
      ).length,
    }
  }

  /** C1-T8：可处置资产清单（产品；保守估值，受“唯一收入来源”保护）。 */
  private listSaleableAssets(company: Company): { assetId: string; assetType: 'product'; minPriceCents: number }[] {
    const products = this.world.products.filter(
      (p) => p.companyId === company.id && p.status === 'active',
    )
    if (products.length === 0) return []
    const revenue12 = (productId: string): number =>
      this.finance
        .getTransactionsByCompany(company.id, { fromDay: this.dayIndex - 365, toDay: this.dayIndex })
        .filter((t) => t.category === 'sales_revenue' && t.referenceId === productId)
        .reduce((sum, t) => sum + t.amountCents, 0)
    const total12 = products.reduce((sum, p) => sum + revenue12(p.id), 0)
    return products
      .map((product) => {
        const rev = revenue12(product.id)
        const project = this.world.projects.find((p) => p.id === product.sourceProjectId)
        const book = project?.budgetTotalCapCents ?? 0
        const value = Math.max(Math.round(rev * 0.5), Math.round(book * 0.2), 100_000)
        return { product, value, dominant: total12 > 0 && rev / total12 > 0.5 }
      })
      .filter((entry, _i, all) => !entry.dominant || all.length === 1)
      .map((entry) => ({
        assetId: entry.product.id,
        assetType: 'product' as const,
        minPriceCents: entry.value,
      }))
      .sort((a, b) => a.minPriceCents - b.minPriceCents)
  }

  private applyPrelaunchAwareness(product: Product, project: Project): void {
    const spent = project.launchMarketingSpentCents ?? 0
    if (spent <= 0) return
    const base = project.developmentBudgetCents ?? project.budgetTotalCapCents
    const lift = computeMarketingLift(spent, Math.max(1, base))
    const boost = (map: Record<string, number>): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const [marketId, value] of Object.entries(map)) {
        out[marketId] = Math.max(0, Math.min(0.6, value * lift))
      }
      return out
    }
    product.awarenessByMarket = boost(product.awarenessByMarket)
    if (product.awarenessByScope !== undefined) product.awarenessByScope = boost(product.awarenessByScope)
  }

  /** C1-T7：上市前 90 天按月启动项目投放，日预算 = 预留 / 90。 */
  private maybeStartAiPrelaunch(dayIndex: number): void {
    for (const project of this.world.projects) {
      const owner = this.world.companies.find((c) => c.id === project.companyId)
      if (owner === undefined || owner.isPlayer) continue
      if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') continue
      const daysToLaunch = project.plannedLaunchDay - dayIndex
      if (daysToLaunch < 0 || daysToLaunch > 90) continue
      if (this.world.marketingCampaigns.some(
        (c) => c.prelaunch === true && c.projectId === project.id && c.status === 'active',
      )) {
        continue
      }
      const reserve = project.launchMarketingReservedCents ?? 0
      const spent = project.launchMarketingSpentCents ?? 0
      const remaining = reserve - spent
      if (remaining <= 0) continue
      const daily = Math.max(
        MARKETING_BUDGET_MIN_CENTS,
        Math.min(MARKETING_BUDGET_MAX_CENTS, Math.round(remaining / 90)),
      )
      const channels: MarketingChannel[] = ['social', 'expo', 'ads']
      const channel = channels[Math.abs(project.plannedLaunchDay + project.genreId.length) % 3]!
      const result = this.marketing.setPrelaunchBudget(
        this.world,
        { projectId: project.id, channel, dailyBudgetCents: daily },
        dayIndex,
      )
      if (result.ok) this.world = result.world
    }
  }

  private assignAiTeam(companyId: string, projectId: string): void {
    const staff = this.world.employees.filter((e) => e.companyId === companyId && e.status === 'hired')
    if (staff.length === 0) return
    this.withProjects(() => {
      this.projects.reassignTeam({
        projectId,
        assignments: staff.map((e) => ({
          employeeId: e.id,
          projectId,
          allocationRatio: 1,
          roleOnProject: 'generalist' as const,
        })),
        allAssignmentsInCompany: this.world.projects.flatMap((p) => p.teamAssignments),
      })
    })
  }

  /** C1-T6：AI 裁员——按薪资从高到低，付一个月补偿，释放项目分配。 */
  /** C1-T8：出售产品资产。90 天窗口最多 1 次、episode 最多 3 次；买家须现金 ≥ 2× 价格。 */
  private sellAsset(company: Company, assetId: string, minPriceCents: number, dayIndex: number): void {
    const product = this.world.products.find(
      (p) => p.id === assetId && p.companyId === company.id && p.status === 'active',
    )
    if (product === undefined) return
    const since = company.bankruptSinceDay ?? dayIndex
    const windowStart = since + Math.floor((dayIndex - since) / 90) * 90
    const sales = (company.assetSales ?? []).filter((entry) => entry.day >= windowStart)
    if (sales.length >= 1 || (company.assetSales ?? []).length >= 3) return
    const buyers = this.world.companies
      .filter((c) => c.id !== company.id && c.status === 'active')
      .sort((a, b) => this.finance.getCashBalance(b.id) - this.finance.getCashBalance(a.id))
    const buyer = buyers.find((c) => this.finance.getCashBalance(c.id) >= minPriceCents * 2)
    if (buyer === undefined) return
    const price = Math.min(minPriceCents, Math.floor(this.finance.getCashBalance(buyer.id) * 0.5))
    if (price <= 0) return
    const posted = this.finance.postTransaction(
      {
        idempotencyKey: `asset_sale:${assetId}:${dayIndex}`,
        companyId: company.id,
        day: dayIndex,
        category: 'asset_sale',
        amountCents: price,
        description: `资产出售：${product.name}`,
        referenceId: assetId,
      },
      { allowNegativeBalance: true },
    )
    if (!posted.success) return
    this.world = {
      ...this.world,
      companies: this.world.companies.map((c) =>
        c.id === company.id
          ? {
              ...c,
              // 派生回写（A-2）：值来自账本，非第二个写源。
              cashBalanceCents: this.finance.getCashBalance(c.id),
              assetSales: [
                ...(c.assetSales ?? []),
                { assetId, buyerId: buyer.id, priceCents: price, day: dayIndex },
              ],
              version: c.version + 1,
              updatedAt: dayIndex,
            }
          : c,
      ),
      products: this.world.products.map((p) =>
        p.id === assetId
          ? { ...p, companyId: buyer.id, status: 'retired' as const, version: p.version + 1, updatedAt: dayIndex }
          : p,
      ),
      events: [
        ...this.world.events,
        createCompanyAssetSoldEvent(uuid(), {
          companyId: company.id,
          buyerId: buyer.id,
          assetId,
          assetType: 'product',
          priceCents: price,
          day: dayIndex,
        }),
      ],
    }
  }

  private cutAiStaff(company: Company, percent: number, dayIndex: number): void {
    const staff = this.world.employees
      .filter((e) => e.companyId === company.id && e.status === 'hired')
      .sort((a, b) => b.salaryMonthlyCents - a.salaryMonthlyCents || a.id.localeCompare(b.id))
    const keepAtLeast = 1
    const target = Math.max(
      1,
      Math.min(staff.length - keepAtLeast, Math.ceil((staff.length * percent) / 100)),
    )
    if (staff.length <= keepAtLeast || target <= 0) return
    const cut = staff.slice(0, target)
    const cutIds = new Set(cut.map((e) => e.id))
    for (const emp of cut) {
      this.finance.postTransaction(
        {
          idempotencyKey: `severance:${emp.id}`,
          companyId: company.id,
          day: dayIndex,
          category: 'severance',
          amountCents: -Math.round(emp.salaryMonthlyCents * TUNING.employee.severanceMonths),
          description: `解雇补偿：${emp.name}`,
          referenceId: emp.id,
        },
        { allowNegativeBalance: true },
      )
    }
    this.world = {
      ...this.world,
      employees: this.world.employees.map((e) =>
        cutIds.has(e.id) ? { ...e, status: 'fired' as const, version: e.version + 1 } : e,
      ),
      projects: this.world.projects.map((p) =>
        p.companyId === company.id && p.teamAssignments.some((a) => cutIds.has(a.employeeId))
          ? {
              ...p,
              teamAssignments: p.teamAssignments.filter((a) => !cutIds.has(a.employeeId)),
              version: p.version + 1,
              updatedAt: dayIndex,
            }
          : p,
      ),
    }
    company.monthlyFixedExpenseCents = Math.max(
      TUNING.company.baseMonthlyRentCents,
      company.monthlyFixedExpenseCents - cut.reduce((sum, e) => sum + e.salaryMonthlyCents, 0),
    )
    this.syncEmployeesFromWorld()
  }

  private runAiMonthly(dayIndex: number): void {
    if (!this.aiCompetitionEnabled) return
    this.maybeStartAiPrelaunch(dayIndex)
    const aiCompanies = this.world.companies
      .filter((c) => !c.isPlayer && c.status !== 'dissolved')
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    for (const company of aiCompanies) {
      const plan = planAiMonth(this.buildAiView(company), dayIndex, this.world.saveSeed)
      const params = plan.params
      switch (params.action) {
        case 'START_PROJECT': {
          const budget = suggestedStartBudget(this.buildAiView(company), dayIndex, this.world.saveSeed, 120)
          if (budget.totalBudgetCents <= 0) break
          const segmentIds = params.segmentIds.length > 0 ? params.segmentIds : ['arcade_enthusiasts']
          const platformIds = params.platformIds.length > 0 ? params.platformIds : ['arcade_pre_1975']
          const created = this.withProjects(() =>
            this.projects.create({
              name: `${company.name} 新作`,
              companyId: company.id,
              genreId: params.genreId,
              audienceSegmentIds: segmentIds,
              targetPlatformIds: platformIds,
              budgetTotalCapCents: budget.totalBudgetCents,
              developmentBudgetCents: budget.developmentBudgetCents,
              launchMarketingReservedCents: budget.launchMarketingReservedCents,
              plannedStartDay: dayIndex,
              plannedLaunchDay: dayIndex + 120,
            }),
          )
          if (created.success && created.result) this.assignAiTeam(company.id, created.result.id)
          break
        }
        case 'ADVANCE_PHASE': {
          this.withProjects(() => this.projects.advancePhaseGeneric(params.projectId, dayIndex))
          break
        }
        case 'LAUNCH': {
          const launched = this.withProjects(() => this.projects.launch(params.projectId, dayIndex))
          if (launched.success && launched.result) {
            this.world.products.push(launched.result.product)
            const product = this.world.products.find((p) => p.sourceProjectId === params.projectId)
            if (product !== undefined && Object.keys(product.awarenessByMarket).length === 0) {
              product.awarenessByMarket = seedInitialAwareness(company.brand, dayIndex)
              product.awarenessByScope = awarenessByScopeOf(product)
            }
            company.brand = Math.max(0, Math.min(100, company.brand + launched.result.product.brandImpact))
            const launchedProject = this.world.projects.find((p) => p.id === params.projectId)
            if (product !== undefined && launchedProject !== undefined) {
              this.applyPrelaunchAwareness(product, launchedProject)
            }
            this.world = this.marketing.endPrelaunch(this.world, params.projectId, dayIndex)
            if (product !== undefined && params.priceCents > 0) {
              const priced = this.pricing.setPrice(
                this.world,
                { productId: product.id, priceCents: params.priceCents },
                dayIndex,
              )
              if (priced.ok) this.world = priced.world
            }
          }
          break
        }
        case 'SET_PRICE': {
          const priced = this.pricing.setPrice(
            this.world,
            { productId: params.productId, priceCents: params.priceCents },
            dayIndex,
          )
          if (priced.ok) this.world = priced.world
          break
        }
        case 'SET_MARKETING': {
          const result = this.marketing.setBudget(
            this.world,
            {
              productId: params.productId,
              channel: params.channel,
              dailyBudgetCents: params.dailyBudgetCents,
            },
            dayIndex,
          )
          if (result.ok) this.world = result.world
          break
        }
        case 'FUND_PROJECT': {
          this.withProjects(() => this.projects.fund(params.projectId, params.amountCents, dayIndex))
          break
        }
        case 'CANCEL_PROJECT': {
          this.withProjects(() =>
            this.projects.cancel(params.projectId, 'budget_exhausted', dayIndex),
          )
          break
        }
        case 'CUT_STAFF': {
          this.cutAiStaff(company, params.percent, dayIndex)
          break
        }
        case 'RESTRUCTURE': {
          this.cutAiStaff(company, Math.max(0, Math.min(30, params.cutStaffPercent)), dayIndex)
          for (const projectId of params.cancelProjectIds) {
            this.withProjects(() => this.projects.cancel(projectId, 'restructuring', dayIndex))
          }
          break
        }
        case 'SELL_ASSET': {
          this.sellAsset(company, params.assetId, params.minPriceCents, dayIndex)
          break
        }
        case 'CLEARANCE_PRICING': {
          const rate = Math.max(30, Math.min(50, params.discountRatePercent))
          const ids = new Set(params.productIds)
          this.world = {
            ...this.world,
            products: this.world.products.map((product) =>
              ids.has(product.id) && product.companyId === company.id && product.status === 'active'
                ? { ...product, clearanceDiscountRatePercent: rate, version: product.version + 1, updatedAt: dayIndex }
                : product,
            ),
          }
          break
        }
        default:
          break
      }
      this.aiDecisionLog.push(plan)
    }

    // FIFO 24 个月：按日切 30 天近似，保留最近 24 个窗口
    const window = 30
    const keepFrom = dayIndex - TUNING.ai.decisionRecordMonths * window
    this.aiDecisionLog = this.aiDecisionLog.filter((r) => r.day >= keepFrom)
  }

  advanceSimulation(days: number): { totalDays: number; events: DomainEvent[] } {
    const events: DomainEvent[] = []
    const startDay = this.calendar.currentDayIndex
    for (let i = 0; i < days; i++) {
      this.calendar.advanceDay()
      this.rng.setCurrentDayIndex(this.calendar.currentDayIndex)
      const beforeEvents = this.world.events.length
      try {
        this.seedAiCompanies(this.calendar.currentDayIndex)
        if (this.aiCompetitionEnabled) {
          const g = dayIndexToGregorian(this.calendar.currentDayIndex)
          if (g.day === 1) this.runAiMonthly(this.calendar.currentDayIndex)
        }
        this.world = this.scheduler.executeDay(this.world, this.calendar.currentDayIndex)
      } catch (error) {
        // 单日结算失败：日历回退到本批起点，避免“日期前进但世界未推进”造成的跳日；
        // 错误继续上抛，由 UI 边界转成可见提示（M2-I）。
        this.calendar.rewindTo(startDay)
        this.rng.setCurrentDayIndex(startDay)
        this.projects.reset(this.world.projects)
        this.employees.reset(this.world.employees)
        throw error
      }
      if (this.world.events.length > beforeEvents) {
        events.push(...this.world.events.slice(beforeEvents))
      }
    }
    // CRT-01 / P1-03：推进结束后对全部公司再断言一次"任意时刻一致"（fail-loud，不静默对齐）。
    // 已解散公司为终态：清算已把 cashBalanceCents 置 0 且不再接受交易，不参与 INV-1。
    if (days > 0) {
      for (const company of this.world.companies) {
        if (company.status === 'dissolved') continue
        this.finance.assertCashConsistent(company)
      }
    }
    this.projects.reset(this.world.projects)
    this.employees.reset(this.world.employees)
    // CODE-06：推进结束后把派生 Employee 视图与 Employment 状态对齐（双轨一致性）
    this.reconcileEmployeeView()
    this.employees.reset(this.world.employees)
    return { totalDays: days, events }
  }

  // ----- Messaging -----

  private describeProjectError(code: string | undefined, fallback: string | undefined, project: Project): string {
    const pct = (d: Discipline) => Math.round(completionRatio(project, d) * 100)
    switch (code) {
      case 'PRJ_QA_NOT_READY':
      case 'PRJ_PRODUCTION_NOT_COMPLETE':
        return `制作完成度不足 ${Math.round(TUNING.project.productionCompletionThreshold * 100)}%，暂时不能进入测试（当前：设计 ${pct('design')}% / 程序 ${pct('programming')}% / 美术 ${pct('art')}%）。`
      case 'PRJ_QA_INCOMPLETE':
        return `测试（QA）必须完成 100% 才能进入上市准备（当前 ${pct('qa')}%）。请分配 QA 员工并继续推进日期。`
      case 'PRJ_CANNOT_ADVANCE':
        return `当前阶段（${project.phase}）无法继续手动推进。`
      case 'PRJ_WRONG_PHASE':
        return `当前阶段不匹配，无法执行该操作（当前：${project.phase}）。`
      case 'PRJ_INVALID_TRANSITION':
        return '阶段转换不合法，已被拒绝。'
      case 'PRJ_NOT_READY':
        return '项目尚未进入「上市准备」阶段，无法上市。'
      case 'PRJ_PAUSED':
        return '项目已暂停，请先恢复。'
      case 'PRJ_LAUNCH_TOO_EARLY':
        return `还没到计划上市日期，无法提前上市（计划 Day ${project.plannedLaunchDay}）。`
      case 'PRJ_QA_INCOMPLETE_LAUNCH':
        return '测试未完成，无法上市。'
      case 'PRJ_PLATFORM_UNAVAILABLE':
        return '目标平台在当前年代不可用，无法上市。'
      case 'PRJ_COMPANY_INACTIVE':
        return '公司当前不处于正常经营状态，无法上市。'
      case 'PRJ_PRODUCT_EXISTS':
        return '该项目已经生成过产品，不能重复上市。'
      default:
        return fallback ?? '操作失败'
    }
  }

  private describeTeamError(code: string | undefined): string {
    if (code === 'EMP_ALLOCATION_EXCEEDS_100_PERCENT') {
      return '该员工在多个项目上的投入比例合计超过 100%，请降低分配比例。'
    }
    return '分配失败：不满足项目团队约束。'
  }

  // ----- M2-F：营销与发行合同命令 -----

  setMarketingBudget(cmd: {
    productId: string
    channel: MarketingChannel
    dailyBudgetCents: number
  }): { success: boolean; errorCode?: string | undefined; message: string; result?: unknown } {
    if (hasFullControl(this.world, cmd.productId)) {
      return { success: false, errorCode: 'CONTRACT_CONTROL_LOCKED', message: '发行商持有全控制权：合同生效期内不能改营销' }
    }
    const r = this.marketing.setBudget(this.world, cmd, this.dayIndex)
    if (!r.ok) return { success: false, errorCode: r.errorCode, message: r.errorMessage ?? '营销设置失败' }
    this.world = r.world
    return { success: true, message: r.ended === true ? '已停止投放' : '营销预算已更新', result: r.campaign }
  }

  signRevenueShareContract(cmd: {
    productId: string
    ratePercent: number
    durationDays: number | null
  }): { success: boolean; errorCode?: string | undefined; message: string; result?: unknown } {
    const r = this.contracts.signRevenueShare(this.world, cmd, this.dayIndex)
    if (!r.ok) return { success: false, errorCode: r.errorCode, message: r.errorMessage ?? '签约失败' }
    this.world = r.world
    return { success: true, message: '分成合同已签署', result: r.contract }
  }

  signMilestoneContract(cmd: {
    productId: string
    thresholdNetRevenueCents: number
    payoutCents: number
    durationDays: number | null
  }): { success: boolean; errorCode?: string | undefined; message: string; result?: unknown } {
    const r = this.contracts.signMilestone(this.world, cmd, this.dayIndex)
    if (!r.ok) return { success: false, errorCode: r.errorCode, message: r.errorMessage ?? '签约失败' }
    this.world = r.world
    return { success: true, message: '里程碑合同已签署', result: r.contract }
  }

  signContractTemplate(cmd: {
    productId: string
    template: 'channel' | 'co_marketing' | 'advance'
    ratePercent: number
    durationDays: number | null
    partnerId: string
    marketScope?: string[]
    platformScope?: string[]
    prepaymentCents?: number
    recoupRatePercent?: number
    marketingCommitmentCents?: number
    qualityThreshold?: number
    deliveryDay?: number
    controlLevel?: 'full' | 'shared' | 'none'
  }): { success: boolean; errorCode?: string | undefined; message: string; result?: unknown } {
    const r = this.contracts.signTemplate(this.world, cmd, this.dayIndex)
    if (!r.ok) return { success: false, errorCode: r.errorCode, message: r.errorMessage ?? '签约失败' }
    this.world = { ...r.world, transactions: this.finance.getAllTransactions() }
    return { success: true, message: '合同已签署', result: r.contract }
  }

  estimateContract(cmd: {
    productId: string
    template: 'channel' | 'co_marketing' | 'advance'
    ratePercent: number
    durationDays: number | null
    partnerId: string
    marketScope?: string[]
    platformScope?: string[]
    prepaymentCents?: number
    recoupRatePercent?: number
    marketingCommitmentCents?: number
    qualityThreshold?: number
    deliveryDay?: number
    controlLevel?: 'full' | 'shared' | 'none'
  }): ContractEstimate {
    return estimateContractProceeds(this.world, cmd, this.dayIndex)
  }

  // ----- Persistence -----

  serialize(): WorldState {
    return {
      ...this.world,
      currentDayIndex: this.calendar.currentDayIndex,
      // 财务流水以 FinanceService 为准（唯一现金记账处）
      transactions: this.finance.getAllTransactions(),
      // CODE-04：承诺集合由账本持久化（唯一来源），读档时随 replay 重放。
      commitments: this.world.companies.flatMap((c) => this.finance.getLedger().getCommitments(c.id)),
      aiDecisionLog: [...this.aiDecisionLog],
      // CODE-07B REVISION / U3（A-25）：ExecutionProject 双索引切片随档持久化。
      // 同一 state 在 Map 中以「内核 projectId + legacy Project id」两键登记，逐键落盘以完整还原索引。
      executionProjects: Array.from(this.executionProjects.entries()).map(([key, state]) => ({ key, state })),
      rec03Snapshots: Array.from(this.rec03Snapshots.entries()).map(([key, value]) => ({ key, value })),
      rec03Requests: Array.from(this.rec03Requests.entries()).map(([key, value]) => ({ key, value })),
      // DESIGN-G05 §7.3：写入预算权威公式快照，供读档一致性校验。
      // 快照在此处按权威公式即时重算，避免领域对象中的旧快照被写入存档。
      projects: this.world.projects.map((p) => ({
        ...p,
        remainingCapCents:
          p.budgetTotalCapCents - p.budgetCommittedCents - p.budgetSpentCents,
      })),
    }
  }

  restore(state: WorldState): void {
    // M2-H §4.3：旧档空认知度回填（只写认知度，不回补历史销量/现金），并留事件
    for (const product of state.products) {
      if (product.status === 'active' && product.awarenessByScope === undefined) {
        product.awarenessByScope = awarenessByScopeOf(product)
      }
      if (product.status !== 'active' || Object.keys(product.awarenessByMarket).length > 0) continue
      const company = state.companies.find((c) => c.id === product.companyId)
      product.awarenessByMarket = seedInitialAwareness(company?.brand ?? 0, state.currentDayIndex)
      product.awarenessByScope = awarenessByScopeOf(product)
      state.events = [
        ...state.events,
        createProductLifecycleChangedEvent(`product-awareness-backfill:${product.id}`, {
          productId: product.id,
          from: product.lifecycleStage,
          to: product.lifecycleStage,
          day: state.currentDayIndex,
          reason: 'awareness_backfill',
        }),
      ]
    }
    // ENDGAME-002 §D6：旧档破产但无起算日 → 读档当日回填，宽限从读档起算，不得立即解散
    for (const company of state.companies) {
      if (company.status === 'bankrupt' && company.bankruptSinceDay === undefined) {
        company.bankruptSinceDay = state.currentDayIndex
      }
    }
    this.world = state
    // B-01a：从存档已有 emp-<seed>-<seq> 还原招聘序号，保证读档续跑的新 ID 仍唯一且确定性。
    this.restoreEmploymentSeq(state)
    // CODE-07B REVISION / U3（A-25）：先清空旧内存态再按存档重建双索引，
    // 避免同一 GameWorld 上 load() 残留旧档 ExecutionProject（含交付失败审计）。
    this.executionProjects.clear()
    for (const entry of state.executionProjects ?? []) {
      this.executionProjects.set(entry.key, entry.state as ProjectExecutionState)
    }
    this.rec03Snapshots.clear()
    for (const entry of state.rec03Snapshots ?? []) this.rec03Snapshots.set(entry.key, entry.value as never)
    this.rec03Requests.clear()
    for (const entry of state.rec03Requests ?? []) this.rec03Requests.set(entry.key, entry.value as never)
    this.aiDecisionLog = (state.aiDecisionLog ?? []) as AiPlan[]
    this.calendar = new GameCalendar(state.currentDayIndex)
    this.rng = new RandomService(state.saveSeed)
    this.rng.setCurrentDayIndex(state.currentDayIndex)

    // A-2：读档 hydrate 单点——新账本 → replay 重建（交易 + 承诺）→ 逐公司派生回写 + 断言。
    this.finance = new FinanceService(new UnifiedLedger())
    for (const company of state.companies) this.finance.registerCompany(company.id)
    // 读档重建：交易与承诺一并重放（承诺集合的唯一来源就是账本，不做第二份拷贝）。
    this.finance.replay(
      state.transactions,
      state.companies.map((c) => c.id),
      state.commitments ?? [],
    )
    for (const company of state.companies) {
      // 读档 hydrate：先按账本派生回写，再做 A-3 一致性断言（旧档 cash 字段与流水不符即拒绝读档）。
      this.finance.syncCash(company)
      this.finance.assertCashConsistent(company)
    }

    // 重建销售服务与 scheduler（finance/rng 实例已替换）；解释缓存随新实例清空
    // CODE-06：PersonnelService 同样持有 finance 引用（承诺注册/停付/遣散兑现），
    // 必须与账本一起重建，否则读档后人事命令会写到构造时的旧账本（silent fail）。
    this.personnel = new PersonnelService({
      finance: this.finance,
      nextEmploymentId: () => this.nextEmploymentId(),
    })
    this.sales = new MarketSimulationService({
      finance: this.finance,
      rng: this.rng,
      inputs: this.salesInputs,
      demandMode: true,
    })
    this.refunds = this.createRefundService()
    this.pricing = new ProductPricingService()
    this.marketing = new MarketingService({ finance: this.finance, tuning: TUNING.sales })
    this.contracts = new ContractService(this.finance)
    this.scheduler = new DailyScheduler({
      finance: this.finance,
      sales: this.sales,
      refunds: this.refunds,
      pricing: this.pricing,
      marketing: this.marketing,
      contracts: this.contracts,
      personnelTick: this.personnelTick,
    })

    this.projects.reset(state.projects)
    this.employees.reset(state.employees)

    // CODE-06：D-03 人才层恢复（§11 S1/S2 + §15.3 四步迁移）。
    // 新档（d03SchemaVersion=3）：直接采用已持久化切片（承诺已随 state.commitments replay）。
    // 旧档：employees → Person+Employment 两步迁移 + Step3 承诺注册 + Step4 校验（E4 修复不调 FIN）。
    if (state.employments !== undefined && state.employments.length > 0) {
      this.personnel.adopt({
        persons: state.persons ?? [],
        employments: state.employments,
        candidates: state.candidates ?? [],
        personEvents: state.personEvents ?? [],
      }, state.personnelFormulaSnapshot)
    } else if (state.employees.length > 0) {
      const migration = migrateEmployees({
        employees: state.employees,
        day: state.currentDayIndex,
        params: DEFAULT_PERSONNEL_PARAMS,
        regionOf: () => 'default',
      })
      state.persons = migration.persons
      state.employments = migration.employments
      state.personEvents = migration.personEvents
      state.candidates = []
      state.d03SchemaVersion = D03_SCHEMA_VERSION
      state.personnelFormulaSnapshot = createPersonnelSnapshot(state.currentDayIndex)
      for (const log of migration.logs) {
        console.info(`[d03-migrate] ${log.legacyId}: ${log.message}`)
      }
      for (const repair of migration.repairs) {
        console.info(`[d03-repair] ${repair.code}: ${repair.message}`)
      }
      // Step 3：为每条 occupying Employment 注册薪资承诺（读档后可兑现；历史流水不回算）。
      for (const c of migration.salaryCommitments) {
        this.finance.getLedger().registerCommitment(c)
      }
      this.personnel.adopt({
        persons: state.persons,
        employments: state.employments,
        candidates: state.candidates,
        personEvents: state.personEvents,
      }, state.personnelFormulaSnapshot)
    }
  }

  /** 项目缺陷等级（UI 只读） */
  getDefectLevel(project: Project): number {
    return defectLevelOf(project)
  }

  /** QA 是否完成（UI 只读） */
  isQaDone(project: Project): boolean {
    return isQaComplete(project)
  }

  /**
   * CODE-07B P-02（S02）：市场调研动作（ADJ-12 S2-1 / ADJ-16 R-4/R-6）。
   * 走账本 research 交易（复用 FIN 12 类 marketing，不扩枚举），失败不发结果卡；
   * 方向标签为内容亲和度的定性档（非数值，数值机会模型 OPEN-P2），竞品数取静态档案。
   */
  conductMarketResearch(): CommandOutcome<MarketResearchResult> {
    const guard = this.assertCompanyActive()
    if (!('id' in guard)) return guard
    const company = guard as Company
    const costCents = P1_UI_TUNING.market.researchCostCents
    const availableCashCents = this.getFinancialOverview()?.availableCashCents ?? 0
    if (availableCashCents < costCents) {
      return {
        success: false,
        errorCode: 'FIN_INSUFFICIENT_CASH',
        message: `可用现金不足，市场调研需要 $${(costCents / 100).toLocaleString()}。`,
      }
    }
    // 幂等键：同日多次调研按序号递增（一次性结果卡由 UI 持有，不持久化）
    const prior = this.finance
      .getTransactionsByCompany(company.id)
      .filter((tx) => tx.description === '市场调研').length
    const idempotencyKey = `market-research:${company.id}:${this.dayIndex}:${prior + 1}`
    const posted = this.finance.postTransaction({
      idempotencyKey,
      companyId: company.id,
      day: this.dayIndex,
      category: 'marketing',
      amountCents: -costCents,
      description: '市场调研',
    })
    if (!posted.success || !posted.result) {
      return { success: false, errorCode: posted.errorCode, message: posted.errorMessage }
    }
    this.syncCash(company)

    // 竞品档案条数（ADJ-12 S2-2 静态档案，真实 AI 公司归 P3+）
    const competitorCount = AI_COMPANIES.length
    // 方向档：取每个类别跨群体的最大亲和度 → 定性档（阈值 >0.8 高 / ≥0.6 中 / 其余低），不展示数值
    const maxByGenre = new Map<string, number>()
    for (const row of genreSegmentAffinity) {
      maxByGenre.set(row.genreId, Math.max(maxByGenre.get(row.genreId) ?? 0, row.affinity))
    }
    const directionTags = genresContent
      .map((g) => {
        const max = maxByGenre.get(g.id) ?? 0
        return {
          genreId: g.id,
          displayName: g.displayNameZh,
          band: (max > 0.8 ? 'high' : max >= 0.6 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        }
      })
      .sort((a, b) => (maxByGenre.get(b.genreId) ?? 0) - (maxByGenre.get(a.genreId) ?? 0))
      .slice(0, 3)
    return {
      success: true,
      result: {
        txId: posted.result.id,
        costCents,
        competitorCount,
        directionTags,
      },
    }
  }

  /**
   * CODE-07A 全局层（G1）：公司级财务派生视图（UI 只读，不写回）。
   * 口径（FIN §6.1/§6.2，ADJ-11 修复后）：availableCash=computeAvailableCash，
   * runway=computeRunwayMonths（起点恒 CashBalance）；无应付/应收数据源时传空数组（fail-closed）。
   * crisisLevel 由派生信号即时归一（CrisisState 持久化未接线 → OPEN-FIN-CRISIS-WIRING，
   * 补救窗口剩余天数 UI 侧 fail-closed '—'）。
   */
  getFinancialOverview(): GameFinancialOverview | null {
    const company = this.getPlayerCompany()
    if (!company) return null
    const tuning = DEFAULT_FINANCE_TUNING
    const cashBalanceCents = this.finance.getCashBalance(company.id)
    const commitments = this.finance.getLedger().getCommitments(company.id)
    // 无应付/应收权威数据源（P1 未接线）：传空数组，不造数（C-2 纪律）
    const availableCashCents = computeAvailableCash(
      { cashBalanceCents, commitments, payables: [], receivables: [] },
      tuning,
    )
    const today = this.dayIndex
    const month = monthKeyFromOffsetForRunway(dayIndexToGregorian(today))
    const windowEnd = monthKeyFromOffsetForRunway(dayIndexToGregorian(today + Math.round(tuning.horizonMonths * 30.44)))
    const annotated = annotateCommitmentsForRunway(commitments, month, windowEnd)
    const runwayMonths = computeRunwayMonths({
      cashBalanceCents,
      commitments: annotated,
      expectedInflowsByMonth: [],
      horizonMonths: tuning.horizonMonths,
      startMonth: month,
    })
    const signals = {
      today,
      cashBalanceCents,
      availableCashCents,
      runwayMonths,
      hasOverduePayable: false,
      budgetOverrunRatio: 0,
      hasReworkSunk: false,
    }
    const reasonCodes = reasonCodesForSignals(signals, tuning)
    const crisisLevel: CrisisLevel = company.status === 'bankrupt'
      ? 'bankrupt'
      : cashBalanceCents < 0 || runwayMonths < tuning.runwayCriticalMonths
        ? 'critical'
        : cashBalanceCents < tuning.cashWarningThresholdCents
          ? 'warning'
          : runwayMonths < tuning.runwayWarningMonths
            ? 'watch'
            : 'healthy'
    return {
      dayIndex: today,
      cashBalanceCents,
      availableCashCents,
      committedCents: Math.max(0, cashBalanceCents - availableCashCents),
      runwayMonths,
      crisisLevel,
      reasonCodes,
    }
  }

  /**
   * P-11：现金流预测只读投影（FIN §6.1/§6.3，包装 finance-formulas.computeCashForecast）。
   * 无应付/应收/预计流入数据源时传空数组（fail-closed，不造数）；netCashByMonth 供财务页逐月净额表。
   */
  getCashForecast(): import('@domain/entities/finance').CashForecast | null {
    const company = this.getPlayerCompany()
    if (!company) return null
    const tuning = DEFAULT_FINANCE_TUNING
    const cashBalanceCents = this.finance.getCashBalance(company.id)
    const commitments = this.finance.getLedger().getCommitments(company.id)
    return computeCashForecast(
      {
        forecastId: `forecast-${company.id}-${this.dayIndex}`,
        companyId: company.id,
        asOfDay: this.dayIndex,
        cashBalanceCents,
        commitments,
        payables: [],
        receivables: [],
        expectedInflowsByMonth: [],
      },
      tuning,
    )
  }
}

/** dayIndex → YYYY-MM（用于跑道窗口标注；复用内核日历换算）。 */
function monthKeyFromOffsetForRunway(g: { year: number; month: number }): string {
  return `${g.year}-${String(g.month).padStart(2, '0')}`
}
