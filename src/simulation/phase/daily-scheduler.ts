import type { CancellationReason, Discipline, ProjectPhase } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { WorldState } from '@simulation/services/world-state'
import type { DomainEvent } from '@domain/events'
import type { FinanceService } from '@simulation/services/finance-service'
import type { MarketSimulationService } from '@simulation/services/market-simulation-service'
import { uuid } from '@domain/types'
import {
  budgetExhaustedEventKey,
  createBudgetExhaustedEvent,
  createPauseTimeoutCancelledEvent,
  createCompanyBankruptedEvent,
} from '@domain/events'
import { TUNING } from '@content/tuning'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'
import { computeSalaryAllocations } from '@domain/entities/project-cost-allocation'
import { recomputeRemaining } from '@domain/value-objects/project-budget'
import {
  advanceProjectWork,
  allowedDisciplinesForPhase,
  allProductionDisciplinesCompleteAtLeast,
  isQaComplete,
} from '@simulation/systems/project-progress'
import {
  baseEffectiveWorkPerDay,
  clamp,
  roleToDiscipline,
  round2,
} from '@simulation/systems/work-systems'
import {
  isTerminalProjectPhase,
  PAUSE_TIMEOUT_DAYS,
  transitionProject,
} from '@simulation/systems/phase-rules'
import { growQualityEstimate } from '@simulation/systems/qa-quality'
import { cityRentMultiplier } from '@content/queries'

export interface DailySchedulerDeps {
  finance: FinanceService
  /** 销售阶段（M2-B）；未注入时跳过，保持 M1 行为不变 */
  sales?: MarketSimulationService
}

const ZERO_WORK: Record<Discipline, number> = { design: 0, programming: 0, art: 0, qa: 0 }

/**
 * DailyScheduler —— 唯一每日调度实现。
 *
 * GameWorld 只负责推进 GameCalendar 并调用本类，不得再复制一套
 * 项目工作量、员工状态或阶段推进公式。
 *
 * 幂等：同一天重复调用不会重复扣工作量、重复更新士气/疲劳或重复结算财务。
 */
export class DailyScheduler {
  private deps: DailySchedulerDeps

  constructor(deps: DailySchedulerDeps) {
    this.deps = deps
  }

  executeDay(world: WorldState, dayIndex: number): WorldState {
    // 同一天只执行一次（含 Day 0）
    if (world.currentDayIndex === dayIndex) return world

    let state: WorldState = { ...world, currentDayIndex: dayIndex }
    // 先累计暂停天数/触发超时取消，再推进研发：被取消的项目当日即不再产出
    state = this.applyPauseTimeout(state, dayIndex)
    // 销售阶段先于研发（08/04 Phase 4 → Phase 5）：当日研发完成上市的产品最早 D+1 销售
    if (this.deps.sales !== undefined) {
      state = this.deps.sales.simulateDailySales(state, dayIndex)
    }
    state = this.applyProjectWork(state, dayIndex)
    state = this.applyEmployeeDailyUpdate(state, dayIndex)
    state = this.applyMonthlySettlement(state, dayIndex)
    // 预算耗尽在当日所有工资分摊/合同付款/直接支出入账后统一判定一次（DESIGN-G05 §6.1）
    state = this.applyBudgetExhaustion(state, dayIndex)
    state = this.syncCompanyCash(state)
    // 破产检查：公司现金为负时触发 status='bankrupt'（DESIGN-OI-21 §2.3）
    state = this.applyBankruptcyCheck(state, dayIndex)
    return state
  }

  // ---------- 暂停计时与超时自动取消（D-01） ----------

  /**
   * 每个游戏日累计一次完整暂停天数：进入暂停当天计 0，次日起 +1。
   * 只要 isPaused=true 即累计，不区分手动/预算耗尽原因（TASK-D01 §9.8）。
   * 达到 60 天当日触发系统自动取消；终态项目不累计、不判超时。
   */
  private applyPauseTimeout(state: WorldState, dayIndex: number): WorldState {
    const events: DomainEvent[] = []
    let changed = false

    const projects = state.projects.map((project) => {
      if (!project.isPaused || isTerminalProjectPhase(project.phase)) return project

      const pausedDays = project.pausedDays + 1
      changed = true

      if (pausedDays >= PAUSE_TIMEOUT_DAYS) {
        events.push(createPauseTimeoutCancelledEvent(uuid(), project.id, dayIndex))
        const cancelled: Project = {
          ...project,
          phase: 'CANCELLED' as ProjectPhase,
          isPaused: false,
          // 终态清理口径（DESIGN-G05 §6.3）：过程态标记不留入终态，超时计数统一清零
          pausedDays: 0,
          pauseReason: null,
          budgetExhausted: false,
          riskFlags: project.riskFlags.filter((f) => f !== 'budget_exhausted'),
          cancellationReason: 'pause_timeout' as CancellationReason,
          // 终态解除团队分配（DESIGN-G05 v1.7 §3.3）：超时取消同样必须释放员工
          teamAssignments: [],
          version: project.version + 1,
          updatedAt: dayIndex,
        }
        return cancelled
      }

      return {
        ...project,
        pausedDays,
        version: project.version + 1,
        updatedAt: dayIndex,
      }
    })

    if (!changed) return state
    return {
      ...state,
      projects,
      events: events.length > 0 ? [...state.events, ...events] : state.events,
    }
  }

  // ---------- 项目研发 ----------

  private applyProjectWork(state: WorldState, dayIndex: number): WorldState {
    const events: DomainEvent[] = []
    const employeesById = new Map<string, Employee>()
    for (const e of state.employees) {
      if (e.status === 'hired') employeesById.set(e.id, e)
    }

    const projects = state.projects.map((project) => {
      // 暂停门控复用：手动暂停与预算耗尽暂停均在此停止研发产出（DESIGN-G05 §6.2，自下日起生效）
      if (project.isPaused) return project
      if (isTerminalProjectPhase(project.phase)) return project

      const allowed = allowedDisciplinesForPhase(project.phase)
      if (allowed.length === 0) return project

      const daily = this.collectDailyWork(project, allowed, employeesById)
      let next = advanceProjectWork(project, daily, allowed)

      if (next !== project) {
        if (project.phase === 'PRODUCTION') {
          next = { ...next, qualityEstimate: growQualityEstimate(next, { design: daily.design, programming: daily.programming, art: daily.art }) }
        }
        next = { ...next, version: next.version + 1, updatedAt: dayIndex }
      }

      if (project.phase === 'PRODUCTION') {
        if (allProductionDisciplinesCompleteAtLeast(next, TUNING.project.productionCompletionThreshold)) {
          const transitioned = transitionProject(next, 'QA', dayIndex)
          if (transitioned) {
            next = transitioned
            events.push({
              id: uuid(),
              type: 'ProjectPhaseChanged',
              day: dayIndex,
              payload: { projectId: next.id, from: 'PRODUCTION', to: 'QA' },
            })
          }
        }
      } else if (project.phase === 'QA') {
        if (isQaComplete(next)) {
          const transitioned = transitionProject(next, 'READY_TO_LAUNCH', dayIndex)
          if (transitioned) {
            next = transitioned
            events.push({
              id: uuid(),
              type: 'ProjectPhaseChanged',
              day: dayIndex,
              payload: { projectId: next.id, from: 'QA', to: 'READY_TO_LAUNCH' },
            })
          }
        }
      }

      return next
    })

    return {
      ...state,
      projects,
      events: events.length > 0 ? [...state.events, ...events] : state.events,
    }
  }

  /** 汇总某项目今日各学科产能，只保留 allowed 内的学科 */
  private collectDailyWork(
    project: Project,
    allowed: Discipline[],
    employeesById: Map<string, Employee>,
  ): Record<Discipline, number> {
    const daily: Record<Discipline, number> = { ...ZERO_WORK }
    for (const assignment of project.teamAssignments) {
      const emp = employeesById.get(assignment.employeeId)
      if (!emp || emp.companyId !== project.companyId) continue
      if (assignment.allocationRatio <= 0) continue
      const work = baseEffectiveWorkPerDay(emp, assignment.allocationRatio)
      for (const d of allowed) {
        daily[d] = round2(daily[d] + work[d])
      }
    }
    return daily
  }

  // ---------- 员工状态 ----------

  private applyEmployeeDailyUpdate(state: WorldState, dayIndex: number): WorldState {
    const { moraleBaseline, moraleRecoveryRate, fatigueGainPerAllocation, fatigueRestRecovery } = TUNING.employee
    const allocations = this.activeAllocationByEmployee(state)

    const employees = state.employees.map((e) => {
      if (e.status !== 'hired') return e

      // 士气：向基准回归，保留小数精度
      let morale = e.morale + (moraleBaseline - e.morale) * moraleRecoveryRate
      morale = round2(clamp(morale, 0, 100))

      // 疲劳：有可推进的研发任务则增加，否则休息恢复
      const ratio = allocations.get(e.id) ?? 0
      let fatigue = ratio > 0
        ? e.fatigue + fatigueGainPerAllocation * Math.min(1, ratio)
        : e.fatigue - fatigueRestRecovery
      fatigue = round2(clamp(fatigue, 0, 100))

      return { ...e, morale, fatigue, version: e.version + 1, updatedAt: dayIndex }
    })

    return { ...state, employees }
  }

  /** 员工在当前「可推进且未暂停」项目中、且岗位学科被该阶段允许的投入比例合计 */
  private activeAllocationByEmployee(state: WorldState): Map<string, number> {
    const out = new Map<string, number>()
    const employeesById = new Map<string, Employee>()
    for (const e of state.employees) {
      if (e.status === 'hired') employeesById.set(e.id, e)
    }

    for (const p of state.projects) {
      if (p.isPaused) continue
      const allowed = allowedDisciplinesForPhase(p.phase)
      if (allowed.length === 0) continue
      for (const a of p.teamAssignments) {
        const emp = employeesById.get(a.employeeId)
        if (!emp || emp.companyId !== p.companyId) continue
        // 只有岗位学科在该阶段能产生有效工作时，才计入疲劳
        const discipline = roleToDiscipline(emp.role)
        if (!discipline || !allowed.includes(discipline)) continue
        out.set(a.employeeId, (out.get(a.employeeId) ?? 0) + a.allocationRatio)
      }
    }
    return out
  }

  // ---------- 月度结算 ----------

  private applyMonthlySettlement(state: WorldState, dayIndex: number): WorldState {
    const g = dayIndexToGregorian(dayIndex)
    if (g.day !== daysInMonth(g.year, g.month)) return state

    // 与既有薪资流水幂等键保持同一格式，确保改造不改变现金结算行为
    const periodKey = `m${g.year}-${g.month}`

    // 分摊幂等键随存档生命周期保留（DESIGN-G05 §7.2）：先收集既有键
    const existingKeys = new Set<string>()
    for (const p of state.projects) {
      for (const a of p.costAllocations ?? []) existingKeys.add(a.idempotencyKey)
    }

    // 仅在真正新增分摊时克隆项目，避免无谓的对象变更
    const updatedProjects = new Map<string, Project>()

    for (const company of state.companies) {
      // 破产公司仍需继续支付工资和租金（DESIGN-OI-21 §6.3：固定结算不受破产状态影响）

      for (const emp of state.employees) {
        // 离职员工不参与工资分摊（DESIGN-G05 §3.3 唯一例外）
        if (emp.companyId !== company.id || emp.status !== 'hired') continue

        // 每个员工月末仅一笔 salary 现金交易（allowNegativeBalance）
        const posted = this.deps.finance.postTransaction(
          {
            idempotencyKey: `salary:${emp.id}:${periodKey}`,
            companyId: company.id,
            day: dayIndex,
            category: 'salary',
            amountCents: -emp.salaryMonthlyCents,
            description: `工资：${emp.name} ${g.year}/${g.month}`,
            referenceId: emp.id,
          },
          { allowNegativeBalance: true },
        )
        const tx = posted.result
        if (
          !posted.success ||
          !tx ||
          !Number.isFinite(emp.salaryMonthlyCents) ||
          !Number.isInteger(emp.salaryMonthlyCents) ||
          emp.salaryMonthlyCents <= 0
        ) {
          continue
        }

        // 有效分配以 TeamAssignment 是否仍存在为准，暂停项目不归零（G05-R6）
        // 终态项目不入账（DESIGN-G05 v1.7 §3.3 / §6.1）：复用 isTerminalProjectPhase 的 active 定义，
        // 作为旧存档或遗漏路径的双保险；本过滤不引入 isPaused 判断（暂停项目仍然分摊）。
        const assignments: Array<{ projectId: string; allocationRatio: number }> = []
        for (const p of state.projects) {
          if (p.companyId !== company.id) continue
          if (isTerminalProjectPhase(p.phase)) continue
          for (const a of p.teamAssignments) {
            if (a.employeeId !== emp.id) continue
            assignments.push({ projectId: p.id, allocationRatio: a.allocationRatio })
          }
        }

        const { created } = computeSalaryAllocations({
          companyId: company.id,
          employeeId: emp.id,
          salaryMonthlyCents: emp.salaryMonthlyCents,
          periodKey,
          cashTransactionId: tx.id,
          day: dayIndex,
          assignments,
          existingIdempotencyKeys: existingKeys,
          description: `工资分摊：${emp.name} ${g.year}/${g.month}`,
        })

        for (const alloc of created) {
          const base =
            updatedProjects.get(alloc.projectId) ?? state.projects.find((p) => p.id === alloc.projectId)
          if (!base) continue

          // spentCents 随分摊累加，复用 001-A 的权威预算计算
          const budget = recomputeRemaining({
            totalCapCents: base.budgetTotalCapCents,
            committedCents: base.budgetCommittedCents,
            spentCents: base.budgetSpentCents + alloc.amountCents,
            remainingCapCents: 0,
          })
          updatedProjects.set(alloc.projectId, {
            ...base,
            budgetSpentCents: budget.spentCents,
            costAllocations: [...(base.costAllocations ?? []), alloc],
            version: base.version + 1,
            updatedAt: dayIndex,
          })
          existingKeys.add(alloc.idempotencyKey)
        }
      }

      const rentCents = Math.round(
        TUNING.company.baseMonthlyRentCents *
          cityRentMultiplier(company.cityId) *
          (company.officeLevel || 1),
      )
      this.deps.finance.postTransaction(
        {
          idempotencyKey: `rent:${company.id}:${periodKey}`,
          companyId: company.id,
          day: dayIndex,
          category: 'office_rent',
          amountCents: -rentCents,
          description: `办公室租金 ${g.year}/${g.month}`,
        },
        { allowNegativeBalance: true },
      )
    }

    if (updatedProjects.size === 0) return state
    return {
      ...state,
      projects: state.projects.map((p) => updatedProjects.get(p.id) ?? p),
    }
  }

  // ---------- 预算耗尽判定（G-05 / G05-R8） ----------

  /**
   * 每日调度末尾统一判定一次预算耗尽（DESIGN-G05 §6.1）。
   *
   * - active = phase ∉ {LAUNCHED, CANCELLED}，含暂停项目；终态项目排除。
   * - 判据 remainingCapCents <= 0（含等号）；按当日已入账的预算三元组重算。
   * - 触发效果（§6.2 原子效果）：isPaused=true、budgetExhausted=true、phase 保持原值、
   *   加入 'budget_exhausted' 风险标记、追加 ProjectBudgetExhausted 事件与 changeLog；
   *   研发产出由 applyProjectWork 的 isPaused 门控自下日起停止，既有工资/合同义务继续；
   *   不自动取消（自动取消是 D-01 的 60 天逻辑）；暂停天数由 applyPauseTimeout 自然累计。
   * - 幂等：事件 id = event:budget_exhausted:{projectId}:{resumeSeq}，同一恢复周期内至多一次；
   *   恢复使 resumeSeq+1 后可再次触发（DESIGN-G05 §7.1 GDR R2 D-G05-R2-01）。
   */
  private applyBudgetExhaustion(state: WorldState, dayIndex: number): WorldState {
    const events: DomainEvent[] = []
    let triggered = false

    const projects = state.projects.map((project) => {
      // 终态项目不再产生成本，排除判定；暂停项目仍参与（§6.1）
      if (isTerminalProjectPhase(project.phase)) return project

      const remainingCapCents =
        project.budgetTotalCapCents - project.budgetCommittedCents - project.budgetSpentCents
      if (remainingCapCents > 0) return project // 判据为 <=0（含等号）

      const resumeSeq = project.resumeSeq ?? 0
      const idempotencyKey = budgetExhaustedEventKey(project.id, resumeSeq)

      // 同周期内已标记耗尽，或该幂等键事件已存在，均不再触发（幂等）
      if (project.budgetExhausted || state.events.some((e) => e.id === idempotencyKey)) {
        return project
      }

      triggered = true
      events.push(createBudgetExhaustedEvent(idempotencyKey, project.id, dayIndex, remainingCapCents))

      return {
        ...project,
        isPaused: true,
        budgetExhausted: true,
        pauseReason: 'budget_exhausted' as const,
        riskFlags: project.riskFlags.includes('budget_exhausted')
          ? project.riskFlags
          : [...project.riskFlags, 'budget_exhausted'],
        changeLog: [
          ...project.changeLog,
          {
            id: uuid(),
            type: 'update' as const,
            timestampDay: dayIndex,
            details: { event: 'ProjectBudgetExhausted', remainingCapCents, resumeSeq },
          },
        ],
        version: project.version + 1,
        updatedAt: dayIndex,
      }
    })

    if (!triggered) return state
    return {
      ...state,
      projects,
      events: [...state.events, ...events],
    }
  }

  private syncCompanyCash(state: WorldState): WorldState {
    const companies = state.companies.map((c) => {
      const balance = this.deps.finance.getCashBalance(c.id)
      return balance === c.cashBalanceCents ? c : { ...c, cashBalanceCents: balance }
    })
    return { ...state, companies }
  }

  /**
   * 破产检查（DESIGN-OI-21 §2.3）：
   *
   * - 唯一检查时点：每日调度末尾、syncCompanyCash 之后执行一次。
   * - 判据：balance < TUNING.finance.cashBankruptThresholdCents（默认 0）。
   * - 效果：company.status 从 'active' → 'bankrupt'，记录领域事件 CompanyBankrupted。
   * - 幂等：仅对 status==='active' 的公司执行，已 bankrupt/dissolved 的跳过。
   */
  private applyBankruptcyCheck(state: WorldState, dayIndex: number): WorldState {
    const threshold = TUNING.finance.cashBankruptThresholdCents
    const events: DomainEvent[] = []
    let changed = false

    const companies = state.companies.map((c) => {
      if (c.status !== 'active') return c
      const balance = this.deps.finance.getCashBalance(c.id)
      if (balance >= threshold) return c
      changed = true
      events.push(
        createCompanyBankruptedEvent(
          uuid(),
          c.id,
          dayIndex,
          balance,
        ),
      )
      return {
        ...c,
        status: 'bankrupt' as const,
        version: c.version + 1,
        updatedAt: dayIndex,
      }
    })

    if (!changed) return state
    return {
      ...state,
      companies,
      events: [...state.events, ...events],
    }
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30
}
