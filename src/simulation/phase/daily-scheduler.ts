import type { Discipline } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { WorldState } from '@simulation/services/world-state'
import type { DomainEvent } from '@domain/events'
import type { FinanceService } from '@simulation/services/finance-service'
import { uuid } from '@domain/types'
import { TUNING } from '@content/tuning'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'
import {
  advanceProjectWork,
  allowedDisciplinesForPhase,
  allProductionDisciplinesCompleteAtLeast,
  isQaComplete,
} from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay, clamp, round2 } from '@simulation/systems/work-systems'
import { transitionProject } from '@simulation/systems/phase-rules'
import { growQualityEstimate } from '@simulation/systems/qa-quality'
import { cityRentMultiplier } from '@content/queries'

export interface DailySchedulerDeps {
  finance: FinanceService
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
    // 同一天只执行一次
    if (world.currentDayIndex === dayIndex && dayIndex !== 0) return world

    let state: WorldState = { ...world, currentDayIndex: dayIndex }
    state = this.applyProjectWork(state, dayIndex)
    state = this.applyEmployeeDailyUpdate(state, dayIndex)
    state = this.applyMonthlySettlement(state, dayIndex)
    return this.syncCompanyCash(state)
  }

  // ---------- 项目研发 ----------

  private applyProjectWork(state: WorldState, dayIndex: number): WorldState {
    const events: DomainEvent[] = []
    const employeesById = new Map<string, Employee>()
    for (const e of state.employees) {
      if (e.status === 'hired') employeesById.set(e.id, e)
    }

    const projects = state.projects.map((project) => {
      if (project.isPaused) return project
      if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') return project

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

  /** 员工在当前「可推进且未暂停」项目上的投入比例合计 */
  private activeAllocationByEmployee(state: WorldState): Map<string, number> {
    const out = new Map<string, number>()
    for (const p of state.projects) {
      if (p.isPaused) continue
      if (allowedDisciplinesForPhase(p.phase).length === 0) continue
      for (const a of p.teamAssignments) {
        out.set(a.employeeId, (out.get(a.employeeId) ?? 0) + a.allocationRatio)
      }
    }
    return out
  }

  // ---------- 月度结算 ----------

  private applyMonthlySettlement(state: WorldState, dayIndex: number): WorldState {
    const g = dayIndexToGregorian(dayIndex)
    if (g.day !== daysInMonth(g.year, g.month)) return state

    for (const company of state.companies) {
      if (company.status !== 'active') continue
      const monthKey = `m${g.year}-${g.month}`

      for (const emp of state.employees) {
        if (emp.companyId !== company.id || emp.status !== 'hired') continue
        this.deps.finance.postTransaction(
          {
            idempotencyKey: `salary:${emp.id}:${monthKey}`,
            companyId: company.id,
            day: dayIndex,
            category: 'salary',
            amountCents: -emp.salaryMonthlyCents,
            description: `工资：${emp.name} ${g.year}/${g.month}`,
            referenceId: emp.id,
          },
          { allowNegativeBalance: true },
        )
      }

      const rentCents = Math.round(
        TUNING.company.baseMonthlyRentCents *
          cityRentMultiplier(company.cityId) *
          (company.officeLevel || 1),
      )
      this.deps.finance.postTransaction(
        {
          idempotencyKey: `rent:${company.id}:${monthKey}`,
          companyId: company.id,
          day: dayIndex,
          category: 'office_rent',
          amountCents: -rentCents,
          description: `办公室租金 ${g.year}/${g.month}`,
        },
        { allowNegativeBalance: true },
      )
    }

    return state
  }

  private syncCompanyCash(state: WorldState): WorldState {
    const companies = state.companies.map((c) => {
      const balance = this.deps.finance.getCashBalance(c.id)
      return balance === c.cashBalanceCents ? c : { ...c, cashBalanceCents: balance }
    })
    return { ...state, companies }
  }
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30
}
