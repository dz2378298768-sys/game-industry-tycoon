import type { Discipline } from '@domain/enums'
import type { WorldState } from '@simulation/services/world-state'
import {
  advanceProjectWork,
  allProductionDisciplinesCompleteAtLeast,
  completionRatio,
} from '@simulation/systems/project-progress'
import { baseEffectiveWorkPerDay } from '@simulation/systems/work-systems'
import type { Employee } from '@domain/entities/employee'

export interface DailySchedulerDeps {
  getEmployeesByCompany: (companyId: string) => Employee[]
  /** 从 ProjectService 获取所有项目 */
  getProjectsByCompany: (companyId: string) => WorldState['projects']
  /** 调用 ProjectService 的 transition 方法（实际由主系统注入） */
  transition: (
    projectId: string,
    phase: 'PRODUCTION_TO_QA' | 'QA_TO_READY' | 'READY_TO_LAUNCHED',
    dayIndex: number,
  ) => { world: WorldState; events: any[] }
}

/**
 * 按项目维度汇总今日的工作点（按 discipline）。
 * 规则：
 *   - 每个员工先算自身每日产能
 *   - 然后按该员工在项目上的 allocationRatio 分配
 *   - 汇总到 projectId → { design, programming, art, qa }
 */
export function aggregateDailyWorkByProject(
  employees: Employee[],
  assignments: Array<{ projectId: string; employeeId: string; allocationRatio: number }>,
): Record<string, Record<Discipline, number>> {
  // 1. 按 employeeId 索引员工
  const empMap = new Map<string, Employee>()
  for (const e of employees) empMap.set(e.id, e)

  // 2. 先算每位员工每日产能
  const empDaily = new Map<string, Record<Discipline, number>>()
  for (const e of employees) {
    empDaily.set(e.id, baseEffectiveWorkPerDay(e, 1.0))
  }

  // 3. 按 projectId 汇总
  const out: Record<string, Record<Discipline, number>> = {}
  for (const a of assignments) {
    const daily = empDaily.get(a.employeeId)
    if (!daily) continue
    const bucket = (out[a.projectId] ??= { design: 0, programming: 0, art: 0, qa: 0 })
    for (const d of ['design', 'programming', 'art', 'qa'] as Discipline[]) {
      bucket[d] += Math.round(daily[d] * a.allocationRatio)
    }
  }
  return out
}

/**
 * DailyScheduler —— 每天推进一次，纯函数、确定性、无 Date.now/Math.random
 */
export class DailyScheduler {
  deps: DailySchedulerDeps

  constructor(deps: DailySchedulerDeps) {
    this.deps = deps
  }

  executeDay(world: WorldState, dayIndex: number): WorldState {
    let state: WorldState = { ...world, currentDayIndex: dayIndex }

    // Phase 5 (R&D / Production Progress)
    state = this.applyProjectWork(state)

    // Phase 6 (Employee daily update —— 士气/疲劳自然恢复)
    state = this.applyEmployeeDailyUpdate(state)

    return state
  }

  private applyProjectWork(state: WorldState): WorldState {
    const companies = new Set(state.companies.map((c) => c.id))
    // 聚合所有活跃项目的工作
    const activeProjects = state.projects.filter(
      (p) =>
        companies.has(p.companyId) &&
        p.phase !== 'LAUNCHED' &&
        p.phase !== 'CANCELLED' &&
        !p.isPaused,
    )

    if (activeProjects.length === 0) return state

    // 构建 assignments 列表（只保留活跃项目 + 活跃员工）
    const employeeMap = new Map<string, Employee>()
    for (const e of state.employees) {
      if (e.status === 'hired' || e.status === 'on_leave') {
        employeeMap.set(e.id, e)
      }
    }
    const activeProjectIds = new Set(activeProjects.map((p) => p.id))
    const assignments: Array<{ projectId: string; employeeId: string; allocationRatio: number }> = []
    for (const p of activeProjects) {
      for (const a of p.teamAssignments) {
        if (!activeProjectIds.has(a.projectId)) continue
        if (!employeeMap.has(a.employeeId)) continue
        assignments.push(a)
      }
    }

    const dailyWorkByProject = aggregateDailyWorkByProject(
      [...employeeMap.values()],
      assignments,
    )

    const nextProjects: typeof state.projects = []
    for (const p of state.projects) {
      let updated = p
      if (
        activeProjectIds.has(p.id) &&
        p.phase !== 'LAUNCHED' &&
        p.phase !== 'CANCELLED'
      ) {
        const daily = dailyWorkByProject[p.id] ?? { design: 0, programming: 0, art: 0, qa: 0 }
        updated = advanceProjectWork(updated, daily)
        updated = { ...updated, updatedAt: state.currentDayIndex }

        // 阶段自动推进
        updated = this.autoAdvanceIfReady(updated, state.currentDayIndex)
      }
      nextProjects.push(updated)
    }

    state = { ...state, projects: nextProjects }
    return state
  }

  /**
   * 在一个项目内部做自推进检查（PRODUCTION→QA 自动；QA→READY 需要外部显式调用；
   * READY→LAUNCHED 必须显式 launch）。
   * 为了保持纯函数，这里不调用 transition，而是直接返回新 phase 的 Project。
   */
  private autoAdvanceIfReady(p: WorldState['projects'][number], dayIndex: number): WorldState['projects'][number] {
    if (p.phase === 'PRODUCTION' && allProductionDisciplinesCompleteAtLeast(p, 1.0)) {
      // 100% 完成生产阶段三大领域 → 自动进入 QA
      // 注入 QA 工作量（与 ProjectService.enterQA 保持一致）
      const total = { ...p.workTotalByDiscipline }
      const remaining = { ...p.workRemainingByDiscipline }
      if (total.qa === 0) {
        total.qa = Math.round((total.design + total.programming + total.art) * 0.2)
        remaining.qa = total.qa
      }
      return {
        ...p,
        phase: 'QA',
        workTotalByDiscipline: total,
        workRemainingByDiscipline: remaining,
        version: p.version + 1,
        updatedAt: dayIndex,
      }
    }

    if (p.phase === 'QA' && completionRatio(p, 'qa') >= 1.0) {
      return {
        ...p,
        phase: 'READY_TO_LAUNCH',
        version: p.version + 1,
        updatedAt: dayIndex,
      }
    }

    return p
  }

  private applyEmployeeDailyUpdate(state: WorldState): WorldState {
    const nextEmployees = state.employees.map((e) => {
      if (e.status !== 'hired' && e.status !== 'on_leave') return e
      let morale = e.morale
      let fatigue = e.fatigue

      // 士气缓慢向 70 回归
      const moraleTarget = 70
      const moraleDelta = moraleTarget - morale
      morale += Math.sign(moraleDelta) * Math.min(1, Math.abs(moraleDelta) * 0.1)
      morale = Math.max(0, Math.min(100, morale))

      // 非暂停项目时，员工会略微疲劳；暂停时会恢复
      const anyActiveProject = this.employeeAssignedToActiveProject(e.id, state)
      if (anyActiveProject) {
        fatigue = Math.min(100, fatigue + 1)
      } else {
        fatigue = Math.max(0, fatigue - 2)
      }

      return { ...e, morale, fatigue, updatedAt: state.currentDayIndex }
    })
    return { ...state, employees: nextEmployees }
  }

  private employeeAssignedToActiveProject(
    employeeId: string,
    state: WorldState,
  ): boolean {
    for (const p of state.projects) {
      if (
        p.phase === 'LAUNCHED' ||
        p.phase === 'CANCELLED' ||
        p.isPaused
      ) continue
      if (p.teamAssignments.some((a) => a.employeeId === employeeId)) {
        return true
      }
    }
    return false
  }
}
