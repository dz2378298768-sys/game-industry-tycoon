import { describe, it, expect } from 'vitest'
import { ProjectService } from '@simulation/services/project-service'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { GameWorld } from '@application/mediators/game-world'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'
import { makeWorld, makeProject, makeEmployee } from '../../__tests__/helpers'
import type { Project } from '@domain/entities/project'
import type { TeamAssignment } from '@domain/value-objects'

const MONTH_END = gregorianToDayIndex(1970, 1, 31) // day 30

function assignment(projectId: string): TeamAssignment[] {
  return [{ employeeId: 'emp-1', projectId, allocationRatio: 1, roleOnProject: 'generalist' }]
}

function makeScheduler() {
  const finance = new FinanceService()
  finance.registerCompany('company-1')
  finance.postTransaction({
    idempotencyKey: 'opening',
    companyId: 'company-1',
    day: 0,
    category: 'advance',
    amountCents: 5_000_000,
    description: 'opening',
  })
  return { finance, scheduler: new DailyScheduler({ finance }) }
}

describe('TASK-M1.1-TERMINAL-RELEASE-001 终态解除团队分配', () => {
  it('① launch 成功后 teamAssignments 清空', () => {
    const service = new ProjectService()
    service.reset([
      makeProject({
        phase: 'READY_TO_LAUNCH',
        plannedLaunchDay: 10,
        teamAssignments: assignment('project-1'),
      }),
    ])

    const result = service.launch('project-1', 10)
    expect(result.success).toBe(true)
    expect(result.result?.product.name).toBe('Test Game')

    const launched = service.getById('project-1')!
    expect(launched.phase).toBe('LAUNCHED')
    expect(launched.teamAssignments).toHaveLength(0)
  })

  it('② cancel 成功后 teamAssignments 清空', () => {
    const service = new ProjectService()
    service.reset([
      makeProject({ phase: 'PRODUCTION', teamAssignments: assignment('project-1') }),
    ])

    const result = service.cancel('project-1', 'player_decision', 5)
    expect(result.success).toBe(true)

    const cancelled = service.getById('project-1')!
    expect(cancelled.phase).toBe('CANCELLED')
    expect(cancelled.teamAssignments).toHaveLength(0)
  })

  it('③ 终态项目推进 30 天：budgetSpentCents 不变、costAllocations 不增（scheduler 双层防护）', () => {
    const { scheduler } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    // 直接构造带残留分配的历史终态项目，绕过 F1，单独验证 F2 的调度器过滤
    const world = makeWorld({
      employees: [emp],
      projects: [
        makeProject({ id: 'launched', phase: 'LAUNCHED', teamAssignments: assignment('launched') }),
        makeProject({ id: 'cancelled', phase: 'CANCELLED', teamAssignments: assignment('cancelled') }),
      ],
    })

    let state = world
    for (let day = 1; day <= MONTH_END; day++) state = scheduler.executeDay(state, day)

    for (const id of ['launched', 'cancelled']) {
      const p = state.projects.find((x) => x.id === id)!
      expect(p.budgetSpentCents).toBe(0)
      expect(p.costAllocations ?? []).toHaveLength(0)
    }
  })

  it('④ 取消项目后原员工可成功分配到新项目（S-1 功能回归）', () => {
    const gw = new GameWorld(11)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const emp = gw.hireEmployee({
      name: 'Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 100_000,
    }).result!
    const a = gw.createProject({
      name: 'Game A',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
    }).result!
    const b = gw.createProject({
      name: 'Game B',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
    }).result!

    expect(gw.assignEmployeeToProject(emp.id, a.id, 1, 'generalist').success).toBe(true)
    expect(gw.cancelProject(a.id).success).toBe(true)

    const promoted = gw.assignEmployeeToProject(emp.id, b.id, 1, 'generalist')
    expect(promoted.success).toBe(true)
    expect(gw.world.projects.find((p) => p.id === b.id)!.teamAssignments).toHaveLength(1)
  })

  it('⑤ 旧存档（终态 + 残留分配）读档后分配被清空且加载成功', () => {
    const gw = new GameWorld(12)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const emp = gw.hireEmployee({
      name: 'Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 100_000,
    }).result!
    const project = gw.createProject({
      name: 'Legacy',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
    }).result!
    gw.assignEmployeeToProject(emp.id, project.id, 1, 'generalist')

    // 模拟旧版本存档：终态项目仍带着团队分配
    const legacy = structuredClone(gw.serialize())
    const saved = legacy.projects[0]!
    saved.phase = 'CANCELLED' as Project['phase']
    saved.cancellationReason = 'player_decision'
    saved.teamAssignments = assignment(saved.id)
    expect(saved.teamAssignments).toHaveLength(1)

    const r = parseSave(legacy)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.state.projects[0]!.teamAssignments).toHaveLength(0)
    // 只做规整，不动存档结构
    expect(r.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION)

    // 规整后的 world 可正常恢复，且员工不再被视为占用
    const restored = new GameWorld(12)
    restored.restore(r.state)
    const reused = restored.assignEmployeeToProject(
      emp.id,
      restored.world.projects[0]!.id,
      1,
      'generalist',
    )
    // 目标项目本身是终态 → 仍应拒绝（团队只能投新项目），这里验证的是"不被旧分配占死"
    expect(reused.success).toBe(false)
    const fresh = restored.createProject({
      name: 'Fresh',
      genreId: 'action',
      budgetTotalCapCents: 1_000_000,
      plannedLaunchDay: 300,
    }).result!
    expect(restored.assignEmployeeToProject(emp.id, fresh.id, 1, 'generalist').success).toBe(true)
  })
})
