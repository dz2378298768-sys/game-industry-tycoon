import { createEmptyWorld, type WorldState } from '@simulation/services/world-state'
import { GameCalendar } from '@simulation/services/game-calendar'
import { FinanceService } from '@simulation/services/finance-service'
import { EmployeeService } from '@simulation/services/employee-service'
import { ProjectService } from '@simulation/services/project-service'
import { RandomService } from '@simulation/services/random-service'
import { uuid } from '@domain/types'
import { advanceProjectWork, allProductionDisciplinesCompleteAtLeast, totalCompletion } from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'
import { content } from '@infrastructure/loading/content-loader'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { DomainEvent } from '@domain/events'
import type { EmployeeRole, Discipline } from '@domain/enums'
import type { TeamAssignment } from '@domain/value-objects'

export class GameWorld {
  public world: WorldState
  public calendar: GameCalendar
  public finance: FinanceService
  public employees: EmployeeService
  public projects: ProjectService
  public rng: RandomService

  constructor(seed = 42) {
    this.world = createEmptyWorld(seed)
    this.calendar = new GameCalendar(0)
    this.rng = new RandomService(seed)
    this.finance = new FinanceService()
    this.projects = new ProjectService()
    this.employees = new EmployeeService({
      getAssignmentsByCompany: (companyId) => {
        const all: TeamAssignment[] = []
        for (const p of this.world.projects) {
          if (p.companyId === companyId) all.push(...p.teamAssignments)
        }
        return all
      },
    })
  }

  // ----- Company -----
  createCompany(params: { name: string; cityId: string }): Company {
    const econ = content.economyBalance.company
    const dayIndex = this.calendar.currentDayIndex
    const company: Company = {
      id: uuid(),
      name: params.name,
      foundingDay: dayIndex,
      cityId: params.cityId,
      industryStartYear: 1970,
      brand: econ.startingBrand,
      technologyCapacity: econ.startingTechnologyCapacity,
      managementCapacity: econ.startingManagementCapacity,
      cashBalanceCents: econ.startingCashCents,
      growthStage: 'startup',
      isPlayer: true,
      status: 'active',
      monthlyFixedExpenseCents: econ.monthlyFixedExpenseCents,
      officeLevel: 1,
      version: 1,
      createdAt: dayIndex,
      updatedAt: dayIndex,
    }
    this.world.companies.push(company)
    // 注册到 finance 并写入启动资金
    this.finance.registerCompany(company.id, econ.startingCashCents)
    this.finance.postTransaction({
      idempotencyKey: `init:${company.id}:seed`,
      companyId: company.id,
      day: dayIndex,
      category: 'advance',
      amountCents: econ.startingCashCents,
      description: '公司启动资金',
    })
    return company
  }

  getPlayerCompany(): Company | undefined {
    return this.world.companies.find(c => c.isPlayer && c.status === 'active')
  }

  // ----- Employee -----
  hireEmployee(params: {
    name: string
    role: EmployeeRole
    skillLevel: number
    salaryMonthlyCents: number
    primarySkill?: string
  }): Employee | null {
    const company = this.getPlayerCompany()
    if (!company) return null
    const dayIndex = this.calendar.currentDayIndex
    const hireCostCents = Math.round(params.salaryMonthlyCents * content.economyBalance.employee.hireCostRatio)
    if (company.cashBalanceCents < hireCostCents) return null

    // 使用 EmployeeService 并同步到 world 列表
    const result = this.employees.hire({
      companyId: company.id,
      name: params.name,
      role: params.role,
      primarySkill: params.primarySkill ?? 'gameplay',
      skillLevel: Math.max(1, Math.min(5, params.skillLevel)),
      salaryMonthlyCents: params.salaryMonthlyCents,
      contractStartDay: dayIndex,
      contractEndDay: null,
    })
    if (!result.success || !result.result) return null
    const emp = result.result
    this.world.employees.push(emp)

    // 入职成本
    const txResult = this.finance.postTransaction({
      idempotencyKey: `hire:${emp.id}:cost`,
      companyId: company.id,
      day: dayIndex,
      category: 'project_expense',
      amountCents: -hireCostCents,
      description: `入职成本：${emp.name}`,
      referenceId: emp.id,
    })
    if (!txResult.success) {
      // 如果余额不足，回滚员工
      this.world.employees = this.world.employees.filter(e => e.id !== emp.id)
      return null
    }
    company.cashBalanceCents = this.finance.getCashBalance(company.id)
    return emp
  }

  // ----- Project -----
  createProject(params: {
    name: string
    genreId: string
    budgetTotalCapCents: number
    plannedLaunchDay: number
    audienceSegmentIds?: string[]
    targetPlatformIds?: string[]
  }): Project | null {
    const company = this.getPlayerCompany()
    if (!company) return null
    const dayIndex = this.calendar.currentDayIndex

    const result = this.projects.create({
      name: params.name,
      companyId: company.id,
      genreId: params.genreId,
      audienceSegmentIds: params.audienceSegmentIds ?? [],
      targetPlatformIds: params.targetPlatformIds ?? [],
      budgetTotalCapCents: params.budgetTotalCapCents,
      plannedLaunchDay: params.plannedLaunchDay,
      plannedStartDay: dayIndex,
    })
    if (!result.success || !result.result) return null
    const p = result.result
    this.world.projects.push(p)
    return p
  }

  advanceProjectPhase(projectId: string): { success: boolean; message?: string } {
    const project = this.world.projects.find(p => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    if (project.isPaused) return { success: false, message: '项目已暂停，请先恢复后再推进' }
    const dayIndex = this.calendar.currentDayIndex

    // 使用 ProjectService 泛化推进
    const result = this.projects.advancePhaseGeneric(projectId)
    if (!result.success) {
      return { success: false, message: this.describeProjectError(result.errorCode, result.errorMessage, project) }
    }
    if (result.result) {
      // 同步 world 列表
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = result.result

      // 如果推进到了 LAUNCHED，生成 Product
      if (result.result.phase === 'LAUNCHED') {
        // ProjectService.launch 需要 READY_TO_LAUNCH 状态；这里用 advancePhaseGeneric 已处理到 READY_TO_LAUNCH
        // 实际 launch 在玩家显式调用 launch() 时执行
      }
      void dayIndex
    }
    return { success: true }
  }

  /** 把领域错误码翻译成玩家能看懂的中文提示 */
  private describeProjectError(code: string | undefined, fallback: string | undefined, project: Project): string {
    switch (code) {
      case 'PRJ_QA_NOT_READY': {
        const parts = (['design', 'programming', 'art'] as Discipline[])
          .map(d => {
            const total = project.workTotalByDiscipline[d]
            const done = total - project.workRemainingByDiscipline[d]
            const pct = total === 0 ? 100 : Math.round((done / total) * 100)
            const name = d === 'design' ? '设计' : d === 'programming' ? '程序' : '美术'
            return `${name} ${pct}%`
          })
          .join(' / ')
        return `制作完成度不足 90%，暂时不能进入测试（当前：${parts}）。请先分配员工并推进日期。`
      }
      case 'PRJ_CANNOT_ADVANCE':
        return `当前阶段（${project.phase}）无法继续推进，请检查是否已到上市准备阶段。`
      case 'PRJ_WRONG_PHASE':
        return `当前阶段不匹配，无法执行该操作（当前：${project.phase}）。`
      case 'PRJ_INVALID_TRANSITION':
        return '阶段转换不合法，已被拒绝。'
      case 'PRJ_NOT_READY':
        return '项目尚未进入「上市准备」阶段，无法上市。'
      case 'PRJ_LAUNCH_TOO_EARLY':
        return `还没到计划上市日期，无法提前上市（计划 Day ${project.plannedLaunchDay}）。`
      default:
        return fallback ?? '操作失败'
    }
  }

  launchProject(projectId: string): { success: boolean; message?: string } {
    const company = this.getPlayerCompany()
    if (!company) return { success: false, message: '公司未找到' }
    const dayIndex = this.calendar.currentDayIndex

    const projectBefore = this.world.projects.find(p => p.id === projectId)
    const result = this.projects.launch(projectId, undefined, dayIndex)
    if (!result.success || !result.result) {
      return {
        success: false,
        message: projectBefore
          ? this.describeProjectError(result.errorCode, result.errorMessage, projectBefore)
          : (result.errorMessage ?? '上市失败'),
      }
    }
    const { product } = result.result
    this.world.products.push(product)
    // 同步 world projects 列表（launch 已更新了状态）
    const updated = this.projects.getById(projectId)
    if (updated) {
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = updated
    }
    // 更新公司品牌
    company.brand = Math.max(0, Math.min(100, company.brand + product.brandImpact))
    return { success: true }
  }

  toggleProjectPause(projectId: string): { success: boolean; message?: string } {
    const project = this.world.projects.find(p => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    const result = project.isPaused
      ? this.projects.resume(projectId)
      : this.projects.pause(projectId)
    if (!result.success) return { success: false, message: result.errorMessage ?? '操作失败' }
    // 同步 world
    const updated = this.projects.getById(projectId)
    if (updated) {
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = updated
    }
    return { success: true }
  }

  cancelProject(projectId: string, reason = 'player_decision' as const): { success: boolean; message?: string } {
    const result = this.projects.cancel(projectId, reason)
    if (!result.success) return { success: false, message: result.errorMessage ?? '取消失败' }
    const updated = this.projects.getById(projectId)
    if (updated) {
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = updated
    }
    return { success: true }
  }

  assignEmployeeToProject(
    employeeId: string,
    projectId: string,
    allocationRatio: number,
    roleOnProject: string,
  ): { success: boolean; message?: string } {
    const employee = this.world.employees.find(e => e.id === employeeId)
    const project = this.world.projects.find(p => p.id === projectId)
    if (!employee || !project) return { success: false, message: '员工或项目未找到' }
    if (employee.companyId !== project.companyId) return { success: false, message: '员工不属于该公司' }
    if (project.teamAssignments.some(a => a.employeeId === employeeId)) return { success: false, message: '已分配到该项目' }

    const existingAssignments: TeamAssignment[] = []
    for (const p of this.world.projects) existingAssignments.push(...p.teamAssignments)

    const newAssignment: TeamAssignment = {
      employeeId,
      projectId,
      allocationRatio,
      roleOnProject: roleOnProject as any,
    }

    const newAssignments = [...project.teamAssignments, newAssignment]
    const result = this.projects.reassignTeam({
      projectId,
      assignments: newAssignments,
      allAssignmentsInCompany: [...existingAssignments, newAssignment],
    })
    if (!result.success) return { success: false, message: result.errorMessage ?? '分配失败' }
    const updated = this.projects.getById(projectId)
    if (updated) {
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = updated
    }
    return { success: true }
  }

  unassignEmployeeFromProject(employeeId: string, projectId: string): { success: boolean; message?: string } {
    const project = this.world.projects.find(p => p.id === projectId)
    if (!project) return { success: false, message: '项目未找到' }
    const remaining = project.teamAssignments.filter(a => a.employeeId !== employeeId)
    const existingAssignments: TeamAssignment[] = []
    for (const p of this.world.projects) {
      if (p.id === projectId) {
        existingAssignments.push(...remaining)
      } else {
        existingAssignments.push(...p.teamAssignments)
      }
    }
    const result = this.projects.reassignTeam({
      projectId,
      assignments: remaining,
      allAssignmentsInCompany: existingAssignments,
    })
    if (!result.success) return { success: false, message: result.errorMessage ?? '取消分配失败' }
    const updated = this.projects.getById(projectId)
    if (updated) {
      const idx = this.world.projects.findIndex(p => p.id === projectId)
      if (idx >= 0) this.world.projects[idx] = updated
    }
    return { success: true }
  }

  // ----- Simulation advance -----
  advanceSimulation(days: number): { totalDays: number; events: DomainEvent[] } {
    const allEvents: DomainEvent[] = []
    for (let i = 0; i < days; i++) {
      this.calendar.advanceDay()
      this.rng.setCurrentDayIndex(this.calendar.currentDayIndex)
      const events = this._advanceOneDay()
      allEvents.push(...events)
    }
    // 将 ProjectService / EmployeeService 内部状态同步回 world
    this._syncServices()
    return { totalDays: days, events: allEvents }
  }

  _syncServices(): void {
    const allProjects = this.projects.listAll()
    for (const p of allProjects) {
      const idx = this.world.projects.findIndex(x => x.id === p.id)
      if (idx >= 0) this.world.projects[idx] = p
      else this.world.projects.push(p)
    }
    // 移除 world 中不存在于 service 的项目
    this.world.projects = this.world.projects.filter(p => allProjects.some(x => x.id === p.id))
  }

  _advanceOneDay(): DomainEvent[] {
    const events: DomainEvent[] = []
    const dayIndex = this.calendar.currentDayIndex

    for (const company of this.world.companies) {
      if (company.status !== 'active') continue
      const companyProjects = this.projects.listByCompany(company.id)

      for (const project of companyProjects) {
        if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') continue
        if (project.isPaused) continue

        // 汇总团队每日产能
        const dailyByDiscipline: Record<Discipline, number> = { design: 0, programming: 0, art: 0, qa: 0 }
        for (const assign of project.teamAssignments) {
          const emp = this.world.employees.find(e => e.id === assign.employeeId)
          if (!emp || emp.status !== 'hired') continue
          const work = baseEffectiveWorkPerDay(emp, assign.allocationRatio)
          for (const d of ['design', 'programming', 'art', 'qa'] as Discipline[]) {
            dailyByDiscipline[d] += work[d]
          }
        }

        // 直接修改 project.workRemainingByDiscipline
        const updatedProject = advanceProjectWork(project, dailyByDiscipline)
        project.workRemainingByDiscipline = updatedProject.workRemainingByDiscipline

        // 质量估计更新
        project.qualityEstimate = {
          gameplay: Math.min(100, Math.round(project.qualityEstimate.gameplay + dailyByDiscipline.design * 0.1)),
          technical: Math.min(100, Math.round(project.qualityEstimate.technical + dailyByDiscipline.programming * 0.1)),
          content: Math.min(100, Math.round(project.qualityEstimate.content + dailyByDiscipline.design * 0.05 + dailyByDiscipline.art * 0.05)),
          art: Math.min(100, Math.round(project.qualityEstimate.art + dailyByDiscipline.art * 0.1)),
          innovation: Math.min(100, Math.round(project.qualityEstimate.innovation + 0.01)),
        }
        project.version++
        project.updatedAt = dayIndex

        // 自动 QA 转移
        if (project.phase === 'PRODUCTION' && allProductionDisciplinesCompleteAtLeast(project, 0.9)) {
          const qaResult = this.projects.enterQA(project.id, undefined, false)
          if (qaResult.success && qaResult.result) {
            const idx = this.world.projects.findIndex(x => x.id === project.id)
            if (idx >= 0) this.world.projects[idx] = qaResult.result
            events.push({ id: uuid(), type: 'ProjectPhaseChanged', day: dayIndex, payload: { projectId: project.id, to: 'QA' } })
          }
        }
      }
    }

    // 员工每日漂移
    for (const employee of this.world.employees) {
      if (employee.status !== 'hired') continue
      const moraleDrift = (70 - employee.morale) * 0.02
      employee.morale = Math.max(0, Math.min(100, Math.round(employee.morale + moraleDrift)))
      const hasWork = this.world.projects.some(
        p => p.teamAssignments.some(a => a.employeeId === employee.id) && !p.isPaused && p.phase !== 'LAUNCHED' && p.phase !== 'CANCELLED',
      )
      if (hasWork) {
        employee.fatigue = Math.max(0, employee.fatigue - 0.5)
      }
      employee.version++
      employee.updatedAt = dayIndex
    }

    // 月末结算
    if (this.calendar.isMonthEnd()) {
      const today = this.calendar.currentGregorian()
      for (const company of this.world.companies) {
        if (company.status !== 'active') continue
        for (const emp of this.world.employees) {
          if (emp.companyId !== company.id || emp.status !== 'hired') continue
          this.finance.postTransaction({
            idempotencyKey: `salary:${emp.id}:m${today.year}-${today.month}`,
            companyId: company.id,
            day: dayIndex,
            category: 'salary',
            amountCents: -emp.salaryMonthlyCents,
            description: `工资：${emp.name} ${today.year}/${today.month}`,
            referenceId: emp.id,
          })
        }
        const rentCents = Math.round(company.monthlyFixedExpenseCents * 0.4)
        this.finance.postTransaction({
          idempotencyKey: `rent:${company.id}:m${today.year}-${today.month}`,
          companyId: company.id,
          day: dayIndex,
          category: 'office_rent',
          amountCents: -rentCents,
          description: `办公室租金 ${today.year}/${today.month}`,
        })
        company.cashBalanceCents = this.finance.getCashBalance(company.id)
      }
    }

    void totalCompletion
    return events
  }

  // Persistence
  serialize(): WorldState {
    return {
      ...this.world,
      currentDayIndex: this.calendar.currentDayIndex,
      saveSeed: this.world.saveSeed,
    }
  }

  restore(state: WorldState): void {
    this.world = state
    // GameCalendar.currentDayIndex 是 getter，没有 setter —— 构造新实例
    this.calendar = new GameCalendar(state.currentDayIndex)
    // 同步 services
    this.projects.reset(state.projects)
    this.employees.reset(state.employees)
    // 重建 finance 余额
    this.finance = new FinanceService()
    for (const company of state.companies) {
      this.finance.registerCompany(company.id, company.cashBalanceCents)
    }
    // 重放交易（简化：仅重建余额，不重放每笔交易）
    for (const tx of state.transactions) {
      const cmd: {
        idempotencyKey: string
        companyId: string
        day: number
        category: import('@domain/enums').TransactionCategory
        amountCents: number
        description: string
        referenceId?: string
      } = {
        idempotencyKey: tx.idempotencyKey ?? tx.id,
        companyId: tx.companyId,
        day: tx.day,
        category: tx.category,
        amountCents: tx.amountCents,
        description: tx.description,
      }
      if (tx.referenceId) cmd.referenceId = tx.referenceId
      this.finance.postTransaction(cmd)
    }
  }
}
