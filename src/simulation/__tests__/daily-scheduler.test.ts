import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { makeWorld, makeProject, makeEmployee } from '../../__tests__/helpers'

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

describe('DailyScheduler 阶段门控', () => {
  it('CONCEPT 阶段不累计工作量', () => {
    const { scheduler } = makeScheduler()
    const project = makeProject({ phase: 'CONCEPT' })
    const world = makeWorld({ projects: [project] })

    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
    expect(next.projects[0]?.workRemainingByDiscipline.design).toBe(100)
  })

  it('PRE_PRODUCTION 阶段不累计工作量', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject({ phase: 'PRE_PRODUCTION' })] })
    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
  })

  it('PRODUCTION 阶段按岗位学科累计工作量', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject({ phase: 'PRODUCTION' })] })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    // programmer: 5 × 1.0(技能3) × 1.1(士气70) × 1.0(疲劳20) = 5.5
    expect(p?.workRemainingByDiscipline.programming).toBeCloseTo(94.5, 5)
    expect(p?.workRemainingByDiscipline.design).toBe(100)
    expect(p?.workRemainingByDiscipline.art).toBe(100)
  })

  it('QA 阶段只累计 QA 工作量', () => {
    const { scheduler } = makeScheduler()
    const qaEmp = makeEmployee({ id: 'qa-1', role: 'qa' })
    const project = makeProject({
      phase: 'QA',
      teamAssignments: [
        { employeeId: 'qa-1', projectId: 'project-1', allocationRatio: 1, roleOnProject: 'generalist' },
      ],
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 100 },
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
    })
    const world = makeWorld({ employees: [qaEmp], projects: [project] })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    expect(p?.workRemainingByDiscipline.qa).toBeCloseTo(94.5, 5)
    expect(p?.workRemainingByDiscipline.design).toBe(0)
  })

  it('READY_TO_LAUNCH 阶段不累计工作量', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [
        makeProject({
          phase: 'READY_TO_LAUNCH',
          workRemainingByDiscipline: { design: 10, programming: 10, art: 10, qa: 10 },
        }),
      ],
    })
    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(10)
    expect(next.projects[0]?.workRemainingByDiscipline.qa).toBe(10)
  })

  it('暂停项目不推进工作量', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject({ isPaused: true })] })
    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
  })
})

describe('DailyScheduler 幂等性', () => {
  it('同一天重复执行不会重复扣减工作量', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject()] })

    const day1 = scheduler.executeDay(world, 1)
    const again = scheduler.executeDay(day1, 1)

    expect(again.projects[0]?.workRemainingByDiscipline.programming).toBe(
      day1.projects[0]?.workRemainingByDiscipline.programming,
    )
    expect(again.employees[0]?.fatigue).toBe(day1.employees[0]?.fatigue)
  })

  it('同一天重复执行不会重复产生财务交易', () => {
    const { finance, scheduler } = makeScheduler()
    const world = makeWorld()
    // day 30 = 1 月 31 日，月末结算
    const next = scheduler.executeDay(world, 30)
    scheduler.executeDay(next, 30)
    // 1 笔初始化 + 1 笔工资 + 1 笔租金
    expect(finance.getAllTransactions()).toHaveLength(3)
  })
})

describe('DailyScheduler 员工状态', () => {
  it('士气按浮点公式向 70 回归，不被取整抹掉', () => {
    const { scheduler } = makeScheduler()
    const emp = makeEmployee({ morale: 50, fatigue: 0 })
    const world = makeWorld({ employees: [emp], projects: [] })

    const next = scheduler.executeDay(world, 1)
    // 50 + (70-50)*0.02 = 50.4
    expect(next.employees[0]?.morale).toBeCloseTo(50.4, 5)
  })

  it('有研发任务时疲劳按投入比例增加', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject()] })
    const next = scheduler.executeDay(world, 1)
    // 20 + 0.5 × 1.0 = 20.5
    expect(next.employees[0]?.fatigue).toBeCloseTo(20.5, 5)
  })

  it('未分配工作时疲劳恢复', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ employees: [makeEmployee({ fatigue: 40 })], projects: [] })
    const next = scheduler.executeDay(world, 1)
    expect(next.employees[0]?.fatigue).toBe(39)
  })

  it('项目暂停时员工按休息规则恢复疲劳', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      employees: [makeEmployee({ fatigue: 40 })],
      projects: [makeProject({ isPaused: true })],
    })
    const next = scheduler.executeDay(world, 1)
    expect(next.employees[0]?.fatigue).toBe(39)
  })
})
