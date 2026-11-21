import { createEmptyWorld, type WorldState } from '@simulation/services/world-state'
import { GameCalendar } from '@simulation/services/game-calendar'
import { FinanceService } from '@simulation/services/finance-service'
import { EmployeeService } from '@simulation/services/employee-service'
import { ProjectService } from '@simulation/services/project-service'
import { RandomService } from '@simulation/services/random-service'
import { MarketSimulationService } from '@simulation/services/market-simulation-service'
import { NULL_MARKET_INPUT_PROVIDER } from '@simulation/services/sales-types'
import type { MarketInputProvider } from '@simulation/services/sales-types'
import { seedInitialAwareness } from '@content/market-inputs'
import { awarenessByScopeOf } from '@simulation/services/product-awareness'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'
import { createProductLifecycleChangedEvent } from '@domain/events'
import { createAiStaff, findAiSpec, seedDueAiCompanies } from '@content/ai-companies'
import { planAiMonth, suggestedStartBudget, type AiCompanyView, type AiPlan } from '@simulation/ai/ai-planner'
import { projectMonthlyBurnCents } from '@simulation/ai/ai-runway'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
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
import { defectLevelOf } from '@simulation/systems/qa-quality'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { DomainEvent } from '@domain/events'
import type { EmployeeRole, Discipline, ProjectRole } from '@domain/enums'
import type { TeamAssignment } from '@domain/value-objects'
import { topUpIdempotencyKey, createTopUpChangeLogEntry } from '@domain/value-objects'

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

export class GameWorld {
  public world: WorldState
  public calendar: GameCalendar
  public finance: FinanceService
  public employees: EmployeeService
  public projects: ProjectService
  public rng: RandomService
  public sales: MarketSimulationService
  public refunds: RefundService
  public pricing: ProductPricingService
  public marketing: MarketingService
  public contracts: ContractService
  public scheduler: DailyScheduler
  private readonly salesInputs: MarketInputProvider

  /** AI 竞争开关：默认关闭，M3-A2 决策器接入后由生产工厂显式开启（避免既有 Tests 世界被 AI 公司污染） */
  private readonly aiCompetitionEnabled: boolean

  constructor(
    seed = 42,
    salesInputs: MarketInputProvider = NULL_MARKET_INPUT_PROVIDER,
    options: { aiCompetition?: boolean } = {},
  ) {
    this.aiCompetitionEnabled = options.aiCompetition === true
    this.world = createEmptyWorld(seed)
    this.calendar = new GameCalendar(0)
    this.rng = new RandomService(seed)
    this.finance = new FinanceService()
    this.salesInputs = salesInputs
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
    })
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

  private syncCash(company: Company): void {
    company.cashBalanceCents = this.finance.getCashBalance(company.id)
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

    const activeCount = this.world.employees.filter(
      (e) => e.companyId === company.id && e.status === 'hired',
    ).length
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
    const hireCostCents = Math.round(effectiveSalary * TUNING.employee.hireCostRatio)
    if (this.finance.getCashBalance(company.id) < hireCostCents) {
      return {
        success: false,
        errorCode: 'FIN_INSUFFICIENT_CASH',
        message: `现金不足，入职成本需要 $${(hireCostCents / 100).toLocaleString()}。`,
      }
    }

    this.syncEmployeesFromWorld()
    const result = this.employees.hire({
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

    const tx = this.finance.postTransaction({
      idempotencyKey: `hire:${emp.id}:cost`,
      companyId: company.id,
      day: this.dayIndex,
      category: 'project_expense',
      amountCents: -hireCostCents,
      description: `入职成本：${emp.name}`,
      referenceId: emp.id,
    })
    if (!tx.success) {
      // 财务失败则回滚员工：以 world.employees 为准重建 EmployeeService 内部状态
      this.syncEmployeesFromWorld()
      return { success: false, errorCode: tx.errorCode, message: tx.errorMessage ?? '入职成本支付失败' }
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

    const severanceCents = Math.round(emp.salaryMonthlyCents * TUNING.employee.severanceMonths)
    const tx = this.finance.postTransaction(
      {
        idempotencyKey: `severance:${emp.id}`,
        companyId: company.id,
        day: this.dayIndex,
        category: 'severance',
        amountCents: -severanceCents,
        description: `解雇补偿：${emp.name}`,
        referenceId: emp.id,
      },
      { allowNegativeBalance: true },
    )
    if (!tx.success) {
      return { success: false, errorCode: tx.errorCode, message: tx.errorMessage ?? '补偿支付失败' }
    }

    this.syncEmployeesFromWorld()
    const fired = this.employees.fire(employeeId)
    if (!fired.success || !fired.result) {
      return { success: false, errorCode: fired.errorCode, message: fired.errorMessage ?? '解雇失败' }
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

    this.world.employees = this.employees.listAll()
    this.syncCash(company)
    return { success: true, result: fired.result }
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
  }

  /** AI 决策日志（内存态，FIFO 24 个月；A02/A03 审计用） */
  private aiDecisionLog: AiPlan[] = []

  getAiDecisions(): readonly AiPlan[] {
    return [...this.aiDecisionLog]
  }

  private aiBudget(company: Company): number {
    const persona = company.persona ?? 'indie'
    const ratio = TUNING.ai.persona[persona].budgetRatioCap
    return Math.round(Math.min(this.finance.getCashBalance(company.id) * ratio, 5_000_000))
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
        })),
      staffCount: this.world.employees.filter(
        (e) => e.companyId === company.id && e.status === 'hired',
      ).length,
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
    this.projects.reset(this.world.projects)
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
      aiDecisionLog: [...this.aiDecisionLog],
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
      if (product.status !== 'active' || Object.keys(product.awarenessByMarket).length > 0) continue
      const company = state.companies.find((c) => c.id === product.companyId)
      product.awarenessByMarket = seedInitialAwareness(company?.brand ?? 0, state.currentDayIndex)
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
    this.aiDecisionLog = (state.aiDecisionLog ?? []) as AiPlan[]
    this.calendar = new GameCalendar(state.currentDayIndex)
    this.rng = new RandomService(state.saveSeed)
    this.rng.setCurrentDayIndex(state.currentDayIndex)

    this.finance = new FinanceService()
    for (const company of state.companies) this.finance.registerCompany(company.id)
    this.finance.replay(state.transactions, state.companies.map((c) => c.id))
    for (const company of state.companies) {
      this.finance.registerCompany(company.id)
      company.cashBalanceCents = this.finance.getCashBalance(company.id)
    }

    // 重建销售服务与 scheduler（finance/rng 实例已替换）；解释缓存随新实例清空
    this.sales = new MarketSimulationService({
      finance: this.finance,
      rng: this.rng,
      inputs: this.salesInputs,
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
    })

    this.projects.reset(state.projects)
    this.employees.reset(state.employees)
  }

  /** 项目缺陷等级（UI 只读） */
  getDefectLevel(project: Project): number {
    return defectLevelOf(project)
  }

  /** QA 是否完成（UI 只读） */
  isQaDone(project: Project): boolean {
    return isQaComplete(project)
  }
}
