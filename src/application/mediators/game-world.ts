import { createEmptyWorld, type WorldState } from '@simulation/services/world-state'
import { GameCalendar } from '@simulation/services/game-calendar'
import { FinanceService } from '@simulation/services/finance-service'
import { EmployeeService } from '@simulation/services/employee-service'
import { ProjectService } from '@simulation/services/project-service'
import { RandomService } from '@simulation/services/random-service'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { uuid } from '@domain/types'
import { createNewCompany } from '@domain/entities/company'
import { TUNING } from '@content/tuning'
import {
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

export interface CommandOutcome<T = undefined> {
  success: boolean
  result?: T | undefined
  errorCode?: string | undefined
  message?: string | undefined
}

export class GameWorld {
  public world: WorldState
  public calendar: GameCalendar
  public finance: FinanceService
  public employees: EmployeeService
  public projects: ProjectService
  public rng: RandomService
  public scheduler: DailyScheduler

  constructor(seed = 42) {
    this.world = createEmptyWorld(seed)
    this.calendar = new GameCalendar(0)
    this.rng = new RandomService(seed)
    this.finance = new FinanceService()
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
    this.scheduler = new DailyScheduler({ finance: this.finance })
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
    const company = this.getPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }

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
    if (
      !Number.isFinite(params.skillLevel) ||
      !Number.isInteger(params.skillLevel) ||
      params.skillLevel < 1 ||
      params.skillLevel > 5
    ) {
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
      skillLevel: params.skillLevel,
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
    const company = this.getPlayerCompany()
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
    const company = this.getPlayerCompany()
    if (!company) return { success: false, errorCode: 'NO_COMPANY', message: '公司未找到' }
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
    const company = this.getPlayerCompany()
    if (!company) return { success: false, message: '公司未找到' }

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

  cancelProject(projectId: string): CommandOutcome<Project> {
    const result = this.withProjects(() => this.projects.cancel(projectId, 'player_decision'))
    if (!result.success || !result.result) {
      return { success: false, errorCode: result.errorCode, message: result.errorMessage ?? '取消失败' }
    }
    return { success: true, result: result.result }
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

  // ----- Simulation -----

  /** 唯一推进入口：日历推进 + 统一调度器 */
  advanceSimulation(days: number): { totalDays: number; events: DomainEvent[] } {
    const events: DomainEvent[] = []
    for (let i = 0; i < days; i++) {
      this.calendar.advanceDay()
      this.rng.setCurrentDayIndex(this.calendar.currentDayIndex)
      const beforeEvents = this.world.events.length
      this.world = this.scheduler.executeDay(this.world, this.calendar.currentDayIndex)
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

  // ----- Persistence -----

  serialize(): WorldState {
    return {
      ...this.world,
      currentDayIndex: this.calendar.currentDayIndex,
      // 财务流水以 FinanceService 为准（唯一现金记账处）
      transactions: this.finance.getAllTransactions(),
    }
  }

  restore(state: WorldState): void {
    this.world = state
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

    // 重建 scheduler（finance 实例已替换）
    this.scheduler = new DailyScheduler({ finance: this.finance })

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
