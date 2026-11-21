import { describe, it, expect, vi } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { ProjectService } from '@simulation/services/project-service'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { makeEmployee, makeProject, makeWorld } from '../../__tests__/helpers'

function buildStudio() {
  const gw = new GameWorld(7)
  gw.createCompany({ name: 'Guard Studios', cityId: 'san_francisco' })
  const emp = gw.hireEmployee({
    name: 'Dev',
    role: 'programmer',
    skillLevel: 3,
    salaryMonthlyCents: 50_000,
  }).result
  const project = gw.createProject({
    name: 'Guard Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (!emp || !project) throw new Error('setup failed')
  gw.advanceProjectPhase(project.id)
  gw.advanceProjectPhase(project.id)
  return { gw, emp, project }
}

describe('R-002 员工投入比例非法输入', () => {
  const invalid = [NaN, Infinity, -Infinity, 0, -0.5, 1.5]

  it.each(invalid)('GameWorld 拒绝非法比例 %s，且不改变项目/员工数据', (ratio) => {
    const { gw, emp, project } = buildStudio()
    const beforeEmployees = structuredClone(gw.world.employees)
    const beforeProject = structuredClone(gw.world.projects.find((p) => p.id === project.id))

    const result = gw.assignEmployeeToProject(emp.id, project.id, ratio, 'generalist')

    expect(result.success).toBe(false)
    expect(gw.world.employees).toEqual(beforeEmployees)
    expect(gw.world.projects.find((p) => p.id === project.id)).toEqual(beforeProject)
    expect(project.teamAssignments).toHaveLength(0)
  })

  it('ProjectService 直接调用时同样拒绝 NaN', () => {
    const svc = new ProjectService()
    const p = makeProject({ teamAssignments: [] })
    svc.reset([p])

    const result = svc.reassignTeam({
      projectId: p.id,
      assignments: [
        { employeeId: 'emp-1', projectId: p.id, allocationRatio: NaN, roleOnProject: 'generalist' },
      ],
      allAssignmentsInCompany: [
        { employeeId: 'emp-1', projectId: p.id, allocationRatio: NaN, roleOnProject: 'generalist' },
      ],
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('EMP_INVALID_ALLOCATION')
    expect(svc.getById(p.id)?.teamAssignments).toHaveLength(0)
  })
})

describe('R-005 薪资非法输入与回滚', () => {
  const invalidSalaries = [NaN, Infinity, -Infinity, 0, -1, 1000.5]

  it.each(invalidSalaries)('拒绝非法月薪 %s，且不产生员工与流水', (salary) => {
    const gw = new GameWorld(11)
    gw.createCompany({ name: 'Salary Studios', cityId: 'san_francisco' })
    const cashBefore = gw.finance.getCashBalance(gw.world.companies[0]!.id)
    const txBefore = gw.finance.getAllTransactions().length

    const result = gw.hireEmployee({
      name: 'Bad Salary',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: salary,
    })

    expect(result.success).toBe(false)
    expect(gw.world.employees).toHaveLength(0)
    expect(gw.employees.listAll()).toHaveLength(0)
    expect(gw.finance.getAllTransactions()).toHaveLength(txBefore)
    expect(gw.finance.getCashBalance(gw.world.companies[0]!.id)).toBe(cashBefore)
  })

  it('财务入账失败时回滚 EmployeeService 内部状态', () => {
    const gw = new GameWorld(12)
    gw.createCompany({ name: 'Rollback Studios', cityId: 'san_francisco' })
    vi.spyOn(gw.finance, 'postTransaction').mockReturnValue({
      success: false,
      errorCode: 'FIN_TEST_FAILURE',
      errorMessage: 'forced failure',
    })

    const result = gw.hireEmployee({
      name: 'Rollback Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 50_000,
    })

    expect(result.success).toBe(false)
    expect(gw.world.employees).toHaveLength(0)
    // world 与 EmployeeService 内部列表必须一致
    expect(gw.employees.listAll()).toHaveLength(0)
    expect(gw.world.employees).toEqual(gw.employees.listAll())
  })
})

describe('R-003 Day 0 同日幂等', () => {
  it('Day 0 重复执行不会扣工作量 / 更新士气疲劳 / 产生流水', () => {
    const world = makeWorld({
      employees: [makeEmployee({ id: 'emp-1', fatigue: 20, morale: 70 })],
      projects: [makeProject()],
      currentDayIndex: 0,
    })
    const scheduler = new DailyScheduler({ finance: new FinanceService() })

    const afterFirst = scheduler.executeDay(world, 0)
    const afterSecond = scheduler.executeDay(afterFirst, 0)

    // Day 0 是开局基线日：即使调用也必须是 no-op
    expect(afterFirst.projects[0]!.workRemainingByDiscipline.programming).toBe(100)
    expect(afterFirst.employees[0]!.fatigue).toBe(20)
    expect(afterFirst.employees[0]!.morale).toBe(70)

    // 重复调用不得产生任何累积
    expect(afterSecond.projects[0]!.workRemainingByDiscipline.programming).toBe(100)
    expect(afterSecond.employees[0]!.fatigue).toBe(20)
    expect(afterSecond.employees[0]!.morale).toBe(70)
    expect(afterSecond.transactions).toHaveLength(afterFirst.transactions.length)
  })
})

describe('R-004 疲劳只按实际可执行的工作计算', () => {
  it('跨岗位分配不增加疲劳，无有效工作按休息恢复', () => {
    const world = makeWorld({
      employees: [
        makeEmployee({ id: 'qa-1', role: 'qa' }),
        makeEmployee({ id: 'prog-1', role: 'programmer' }),
        makeEmployee({ id: 'prog-2', role: 'programmer' }),
      ],
      projects: [
        makeProject({
          id: 'p-production',
          phase: 'PRODUCTION',
          teamAssignments: [{ employeeId: 'qa-1', projectId: 'p-production', allocationRatio: 1, roleOnProject: 'generalist' }],
        }),
        makeProject({
          id: 'p-qa',
          phase: 'QA',
          teamAssignments: [{ employeeId: 'prog-1', projectId: 'p-qa', allocationRatio: 1, roleOnProject: 'generalist' }],
        }),
        makeProject({
          id: 'p-production-2',
          phase: 'PRODUCTION',
          teamAssignments: [{ employeeId: 'prog-2', projectId: 'p-production-2', allocationRatio: 1, roleOnProject: 'generalist' }],
        }),
      ],
      currentDayIndex: 0,
    })
    const scheduler = new DailyScheduler({ finance: new FinanceService() })
    const next = scheduler.executeDay(world, 1)

    const byId = new Map(next.employees.map((e) => [e.id, e]))
    // QA 在制作阶段：无可执行工作 → 休息
    expect(byId.get('qa-1')!.fatigue).toBe(19)
    // 程序员在 QA 阶段：无可执行工作 → 休息
    expect(byId.get('prog-1')!.fatigue).toBe(19)
    // 程序员在制作阶段：有效工作 → +0.5
    expect(byId.get('prog-2')!.fatigue).toBe(20.5)
  })
})
