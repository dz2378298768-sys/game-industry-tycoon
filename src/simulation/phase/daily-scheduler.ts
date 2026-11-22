import type { CancellationReason, Discipline, ProjectPhase } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import type { Company } from '@domain/entities/company'
import type { Project } from '@domain/entities/project'
import type { WorldState } from '@simulation/services/world-state'
import type { DomainEvent } from '@domain/events'
import type { FinanceService } from '@simulation/services/finance-service'
import type { MarketSimulationService } from '@simulation/services/market-simulation-service'
import type { RefundService } from '@simulation/services/refund-service'
import type { ProductPricingService } from '@simulation/services/product-pricing-service'
import type { MarketingService } from '@simulation/services/marketing-service'
import type { ContractService } from '@simulation/services/contract-service'
import { uuid } from '@domain/types'
import {
  budgetExhaustedEventKey,
  createBudgetExhaustedEvent,
  createPauseTimeoutCancelledEvent,
  createCompanyBankruptedEvent,
  createCompanyRecoveredEvent,
  createCompanyDissolvedEvent,
  createCompanyRestructuringExtendedEvent,
  createCompanyWinddownStartedEvent,
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
  /** 退款阶段（M2-C）；未注入时跳过到期兑现，保持 M2-A/B 行为不变 */
  refunds?: RefundService
  /** 生命周期阶段（M2-D）；未注入时阶段不推进，保持既有行为不变 */
  pricing?: ProductPricingService
  /** 营销投放（M2-F）；未注入时跳过 */
  marketing?: MarketingService
  /** 发行合同（M2-F）；未注入时跳过结算 */
  contracts?: ContractService
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
    // 生命周期阶段只改 Product 元数据（DESIGN-M2-001-D §6.3），不碰批次/流水，故不破坏退款相邻性
    if (this.deps.pricing !== undefined) {
      state = this.deps.pricing.advanceLifecycles(state, dayIndex)
    }
    // 退款到期兑现紧随销售之后（DESIGN-M2-001-C §10.10.2）：保证当日 sales 已落账再判 remaining
    if (this.deps.refunds !== undefined) {
      state = this.deps.refunds.processDueRefunds(state, dayIndex).world
    }
    // 营销与合同在退款之后（DESIGN-M2-001-F §8）：分成基数含当日退款冲减
    if (this.deps.marketing !== undefined) {
      state = this.deps.marketing.tick(state, dayIndex).world
    }
    if (this.deps.contracts !== undefined) {
      state = this.deps.contracts.settle(state, dayIndex).world
    }
    state = this.applyProjectWork(state, dayIndex)
    state = this.applyEmployeeDailyUpdate(state, dayIndex)
    state = this.applyMonthlySettlement(state, dayIndex)
    // 预算耗尽在当日所有工资分摊/合同付款/直接支出入账后统一判定一次（DESIGN-G05 §6.1）
    state = this.applyBudgetExhaustion(state, dayIndex)
    state = this.syncCompanyCash(state)
    // 破产检查：公司现金为负时触发 status='bankrupt'（DESIGN-OI-21 §2.3）
    state = this.applyBankruptcyCheck(state, dayIndex)
    state = this.applyClearanceMode(state)
    state = this.applyRestructuringClock(state, dayIndex)
    // 终局：破产满 360 天仍未恢复 → dissolved（仅月末判定，DECISION-M3-P0-ENDGAME-002 §D1）
    state = this.applyDissolutionCheck(state, dayIndex)
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
      // 已解散公司不再产生任何固定支出（DECISION-M3-P0-ENDGAME-002 §D2）
      if (company.status === 'dissolved') continue
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

  /**
   * 每日现金派发（R7 / CRT-01）：**先识别第二写入者，再按账本回写**，不静默修正。
   *
   * 调度期间所有现金变动都经唯一入口 `FinanceService`（账本求和），但它只把余额回写到
   * **被操作的那一个对象**上；而 `executeDay` 各步骤会重建相当一部分公司对象
   * （`applyBankruptcyCheck` / `applyRestructuringClock` / `applyDissolutionCheck` / `applyClearanceMode`），
   * 破产检查本身又直接读账本余额。因此本步的职责是：把账本余额**派发**到当前世界状态的公司对象上。
   *
   * 但"无条件覆盖"会把任何被篡改的 `cashBalanceCents` 悄悄修回去，使"第二写入者 ⇒ fail-loud"
   * 在运行期永不触发。故用**基线值**识别：
   *  - 有基线且对象现金 == 基线 ⇒ 对象仍是上次账本回写的值（账本此后可能因交易变化），直接派发新值；
   *  - 有基线但对象现金 != 基线 ⇒ 有人在账本之外改了它（第二写入者）⇒ 断言并 fail-loud；
   *  - 无基线（新建公司 / 读档 / AI 入场等桥接路径）⇒ 必须先账实一致，否则 fail-loud，
   *    一致才接管并登记基线。
   *
   * 因此"篡改一个已由账本回写过的公司对象"会在本步当场抛 `FIN_CASH_MISMATCH`（A3 运行时反证）。
   * 基线按公司 id 记录，故步骤重建对象（`{ ...c }`）不会丢失判定能力。
   */
  private syncCompanyCash(state: WorldState): WorldState {
    const companies = state.companies.map((c) => {
      // 已解散公司是终态：账本不再接受其任何交易，`cashBalanceCents` 已被清算置 0，
      // 是一个冻结的展示值，不再参与 INV-1（否则"解散即归零"必然与账本求和冲突）。
      if (c.status === 'dissolved') return c
      const baseline = this.deps.finance.getSyncedCash(c.id)
      if (baseline === undefined || c.cashBalanceCents !== baseline) {
        // 桥接路径（无基线）或第二写入者：都必须账实一致，否则抛 FIN_CASH_MISMATCH（不静默对齐）。
        this.deps.finance.assertCashConsistent(c)
      }
      const balance = this.deps.finance.getCashBalance(c.id)
      this.deps.finance.rememberSyncedCash(c.id, balance)
      return balance === c.cashBalanceCents ? c : { ...c, cashBalanceCents: balance }
    })
    return { ...state, companies }
  }

  /**
   * 破产检查与自救恢复（DESIGN-OI-21 §2.3/§2.4，修订见 DECISION-M3-P0-BANKRUPTCY-CLOSURE-001）：
   *
   * - 唯一检查时点：每日调度末尾、syncCompanyCash 之后执行一次。
   * - 破产判据：status==='active' 且 balance < cashBankruptThresholdCents（默认 0）
   *   → status='bankrupt' + CompanyBankrupted。
   * - 恢复判据：status==='bankrupt' 且 balance >= cashRecoveryThresholdCents（$4,000）
   *   → status='active' + CompanyRecovered；0 ~ $4,000 为滞回区间，不来回切换。
   * - 幂等：只对对应前置状态的公司在同一日内触发一次，已终态（dissolved）不参与。
   */
  private applyBankruptcyCheck(state: WorldState, dayIndex: number): WorldState {
    const bankruptAt = TUNING.finance.cashBankruptThresholdCents
    const events: DomainEvent[] = []
    let changed = false

    const companies = state.companies.map((c) => {
      if (c.status === 'dissolved') return c
      const balance = this.deps.finance.getCashBalance(c.id)
      if (c.status === 'active' && balance < bankruptAt) {
        changed = true
        events.push(createCompanyBankruptedEvent(uuid(), c.id, dayIndex, balance))
        return {
          ...c,
          status: 'bankrupt' as const,
          bankruptSinceDay: dayIndex,
          bankruptcyPhase: 'restructuring' as const,
          restructuringStartedDay: dayIndex,
          restructuringDeadlineDay: dayIndex + 90,
          restructuringExtended: false,
          restructuringStartCashCents: balance,
          restructuringStartFixedCents: c.monthlyFixedExpenseCents,
          assetSales: [],
          version: c.version + 1,
          updatedAt: dayIndex,
        }
      }
      if (c.status === 'bankrupt') {
        const recoveryLine = this.computeRecoveryLine(c, state.projects)
        if (balance >= recoveryLine && this.hasPositiveOperatingCashFlow(c.id, dayIndex, 30)) {
          changed = true
          events.push(createCompanyRecoveredEvent(uuid(), c.id, dayIndex, balance))
          const revived: Company = {
            ...c,
            status: 'active' as const,
            version: c.version + 1,
            updatedAt: dayIndex,
          }
          delete revived.bankruptSinceDay
          delete revived.bankruptcyPhase
          delete revived.restructuringStartedDay
          delete revived.restructuringDeadlineDay
          delete revived.restructuringExtended
          delete revived.restructuringStartCashCents
          return revived
        }
      }
      return c
    })

    if (!changed) return state
    return {
      ...state,
      companies,
      events: [...state.events, ...events],
    }
  }
  /** 破产/恢复时切换清仓价：重整 40%，winddown 50%，恢复后清除。 */
  private applyClearanceMode(state: WorldState): WorldState {
    const byId = new Map(state.companies.map((c) => [c.id, c]))
    let changed = false
    const products = state.products.map((p) => {
      if (p.status !== 'active') return p
      const company = byId.get(p.companyId)
      if (!company) return p
      if (company.status === 'active' && p.clearanceDiscountRatePercent !== undefined) {
        changed = true
        const next = { ...p }
        delete next.clearanceDiscountRatePercent
        return next
      }
      if (company.status === 'bankrupt') {
        const target = company.bankruptcyPhase === 'winddown' ? 50 : 40
        if (p.clearanceDiscountRatePercent !== target) {
          changed = true
          return { ...p, clearanceDiscountRatePercent: target }
        }
      }
      return p
    })
    return changed ? { ...state, products } : state
  }

  /** 恢复线 = max($4,000, 6 × 缩减后固定月支出 + 保留项目月 burn)；P0-2 v2.2 §2.2。 */
  private computeRecoveryLine(c: Company, projects: readonly Project[]): number {
    const fixed = Math.max(0, c.monthlyFixedExpenseCents ?? 0)
    const retainedBurn = projects
      .filter((p) => p.companyId === c.id && p.phase !== 'CANCELLED' && p.phase !== 'LAUNCHED')
      .reduce((sum, p) => {
        const remaining = Math.max(0, p.budgetTotalCapCents - p.budgetSpentCents)
        const start = p.actualStartDay ?? p.plannedStartDay
        const days = Math.max(1, p.plannedLaunchDay - start)
        return sum + Math.round(remaining / (days / 30))
      }, 0)
    return Math.max(
      TUNING.finance.cashRecoveryThresholdCents,
      6 * (fixed + retainedBurn),
    )
  }

  /** 经营现金流窗口是否非负：用已入账流水近似“连续 30 天经营现金流≥0”。 */
  private hasPositiveOperatingCashFlow(companyId: string, dayIndex: number, days: number): boolean {
    const txs = this.deps.finance.getTransactionsByCompany(companyId, {
      fromDay: Math.max(0, dayIndex - days + 1),
      toDay: dayIndex,
    })
    const net = txs
      .filter((t) => t.status === 'posted')
      .reduce((sum, t) => sum + t.amountCents, 0)
    return net >= 0
  }

  /**
   * 重整 90/180 天状态机（P0-2 v2.2 §2.4/§2.5）：
   * - 到 90 天未恢复，满足条件可延长一次到 180 天；
   * - 到 180 天转 winddown，只清仓/收款/处置；
   * - 360 天由 applyDissolutionCheck 解散。
   */
  private applyRestructuringClock(state: WorldState, dayIndex: number): WorldState {
    if (state.companies.every((c) => c.status !== 'bankrupt')) return state
    const events: DomainEvent[] = []
    let changed = false
    const companies = state.companies.map((c) => {
      if (c.status !== 'bankrupt') return c
      const since = c.bankruptSinceDay ?? dayIndex
      const phase = c.bankruptcyPhase ?? 'restructuring'
      if (phase === 'restructuring') {
        const deadline = c.restructuringDeadlineDay ?? since + 90
        if (dayIndex < deadline) return c
        if (!c.restructuringExtended) {
          const startCash = c.restructuringStartCashCents ?? c.cashBalanceCents
          const positiveWindows =
            this.hasPositiveOperatingCashFlow(c.id, deadline - 31, 30) &&
            this.hasPositiveOperatingCashFlow(c.id, deadline - 61, 30)
          const cashImproved = this.deps.finance.getCashBalance(c.id) > startCash
          const startFixed = c.restructuringStartFixedCents
          const reduced =
            (startFixed !== undefined &&
              (c.monthlyFixedExpenseCents ?? 0) <= startFixed * 0.9) ||
            state.projects.some(
              (p) => p.companyId === c.id && p.cancellationReason === 'restructuring',
            )
          if (positiveWindows && cashImproved && reduced) {
            changed = true
            events.push(
              createCompanyRestructuringExtendedEvent(
                uuid(), c.id, dayIndex, deadline, deadline + 90,
              ),
            )
            return {
              ...c,
              restructuringExtended: true,
              restructuringDeadlineDay: deadline + 90,
              version: c.version + 1,
              updatedAt: dayIndex,
            }
          }
        }
        changed = true
        events.push(createCompanyWinddownStartedEvent(uuid(), c.id, dayIndex))
        return {
          ...c,
          bankruptcyPhase: 'winddown' as const,
          restructuringDeadlineDay: since + 360,
          version: c.version + 1,
          updatedAt: dayIndex,
        }
      }
      if (phase === 'winddown') return c
      return c
    })
    return changed ? { ...state, companies, events: [...state.events, ...events] } : state
  }

  /**
   * 终局检查（DECISION-M3-P0-ENDGAME-002）：
   *
   * - 仅月末执行一次，且在所有结算与破产检查之后。
   * - 条件：status==='bankrupt' 且 bankruptSinceDay + 360 ≤ 当日，且余额仍 < 恢复线。
   * - 清算：产品 retired、合同 terminated、项目 CANCELLED、员工 fired（不付遣散费），不新增交易。
   * - 终态：status='dissolved'，写 CompanyDissolved；再次执行不重复触发。
   */
  private applyDissolutionCheck(state: WorldState, dayIndex: number): WorldState {
    const g = dayIndexToGregorian(dayIndex)
    if (g.day !== daysInMonth(g.year, g.month)) return state
    const graceDays = TUNING.ai.dissolutionGraceDays
    const doomed = new Set<string>()
    const events: DomainEvent[] = []
    const companies = state.companies.map((c) => {
      if (c.status !== 'bankrupt') return c
      const since = c.bankruptSinceDay ?? dayIndex
      const balance = this.deps.finance.getCashBalance(c.id)
      if (dayIndex - since < graceDays) return c
      doomed.add(c.id)
      events.push(
        createCompanyDissolvedEvent(
          uuid(),
          c.id,
          dayIndex,
          balance,
          dayIndex - c.foundingDay,
        ),
      )
      const dissolved: Company = {
        ...c,
        status: 'dissolved' as const,
        cashBalanceCents: 0,
        version: c.version + 1,
        updatedAt: dayIndex,
      }
      delete dissolved.bankruptSinceDay
      return dissolved
    })

    if (doomed.size === 0) return state

    const doomedProducts = new Set(
      state.products.filter((p) => doomed.has(p.companyId)).map((p) => p.id),
    )
    const products = state.products.map((p) => {
      if (!doomed.has(p.companyId)) return p
      const next = { ...p, status: 'retired' as const, version: p.version + 1, updatedAt: dayIndex }
      delete next.clearanceDiscountRatePercent
      return next
    })
    const campaigns = state.marketingCampaigns.map((campaign) =>
      doomedProducts.has(campaign.productId) && campaign.status === 'active'
        ? { ...campaign, status: 'ended' as const, version: campaign.version + 1, updatedAt: dayIndex }
        : campaign,
    )
    const contracts = state.publishingContracts.map((c) =>
      doomedProducts.has(c.productId) && c.status === 'active'
        ? { ...c, status: 'terminated' as const, version: c.version + 1, updatedAt: dayIndex }
        : c,
    )
    const projects = state.projects.map((p) =>
      doomed.has(p.companyId) && p.phase !== 'CANCELLED'
        ? {
            ...p,
            phase: 'CANCELLED' as const,
            cancellationReason: 'company_dissolved' as const,
            version: p.version + 1,
            updatedAt: dayIndex,
          }
        : p,
    )
    const employees = state.employees.map((e) =>
      doomed.has(e.companyId) && e.status === 'hired'
        ? { ...e, status: 'fired' as const, version: e.version + 1, updatedAt: dayIndex }
        : e,
    )

    return {
      ...state,
      companies,
      products,
      publishingContracts: contracts,
      projects,
      employees,
      marketingCampaigns: campaigns,
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
