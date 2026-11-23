import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { makeWorld, makeProject, makeEmployee, makeEmployment, seedOpeningCash, seedSalaryCommitment } from '../../__tests__/helpers'

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
  // R7：每日现金回写改为"先断言后写入"，世界状态里的公司现金必须由账本派生量给出
  const worldOf = (parts: Parameters<typeof makeWorld>[0] = {}) => {
    const world = makeWorld(parts)
    // CODE-06：月薪唯一产出点 = ②流水线（承诺兑现）——夹具按 §15.1 同步注册
    // D-03 Employment + 薪资承诺（旧行为"月末按 status 结算"的薪资分支已停用）。
    if (world.employments === undefined) {
      const employments = world.employees
        .filter((e) => e.status === 'hired' || e.status === 'on_leave')
        .map((e) =>
          makeEmployment({
            employmentId: e.id,
            personId: `d03-per-${e.id}`,
            companyId: e.companyId,
            role: e.role,
            salaryMonthlyCents: e.salaryMonthlyCents,
            status: 'active',
          }),
        )
      if (employments.length > 0) {
        world.employments = employments
        for (const emp of employments) seedSalaryCommitment(finance, emp)
      }
    }
    seedOpeningCash(finance, world.companies)
    return world
  }
  return { finance, scheduler: new DailyScheduler({ finance }), worldOf }
}

describe('DailyScheduler 阶段门控', () => {
  it('CONCEPT 阶段不累计工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const project = makeProject({ phase: 'CONCEPT' })
    const world = worldOf({ projects: [project] })

    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
    expect(next.projects[0]?.workRemainingByDiscipline.design).toBe(100)
  })

  it('PRE_PRODUCTION 阶段不累计工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [makeProject({ phase: 'PRE_PRODUCTION' })] })
    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
  })

  it('PRODUCTION 阶段按岗位学科累计工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [makeProject({ phase: 'PRODUCTION' })] })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    // programmer: 5 × 1.0(技能3) × 1.1(士气70) × 1.0(疲劳20) = 5.5
    expect(p?.workRemainingByDiscipline.programming).toBeCloseTo(94.5, 5)
    expect(p?.workRemainingByDiscipline.design).toBe(100)
    expect(p?.workRemainingByDiscipline.art).toBe(100)
  })

  it('QA 阶段只累计 QA 工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const qaEmp = makeEmployee({ id: 'qa-1', role: 'qa' })
    const project = makeProject({
      phase: 'QA',
      teamAssignments: [
        { employeeId: 'qa-1', projectId: 'project-1', allocationRatio: 1, roleOnProject: 'generalist' },
      ],
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 100 },
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
    })
    const world = worldOf({ employees: [qaEmp], projects: [project] })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    expect(p?.workRemainingByDiscipline.qa).toBeCloseTo(94.5, 5)
    expect(p?.workRemainingByDiscipline.design).toBe(0)
  })

  it('READY_TO_LAUNCH 阶段不累计工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({
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
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [makeProject({ isPaused: true })] })
    const next = scheduler.executeDay(world, 1)
    expect(next.projects[0]?.workRemainingByDiscipline.programming).toBe(100)
  })
})

describe('DailyScheduler 幂等性', () => {
  it('同一天重复执行不会重复扣减工作量', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [makeProject()] })

    const day1 = scheduler.executeDay(world, 1)
    const again = scheduler.executeDay(day1, 1)

    expect(again.projects[0]?.workRemainingByDiscipline.programming).toBe(
      day1.projects[0]?.workRemainingByDiscipline.programming,
    )
    expect(again.employees[0]?.fatigue).toBe(day1.employees[0]?.fatigue)
  })

  it('同一天重复执行不会重复产生财务交易', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const world = worldOf()
    // day 30 = 1 月 31 日，月末结算
    const next = scheduler.executeDay(world, 30)
    scheduler.executeDay(next, 30)
    // 1 笔初始化 + 1 笔工资 + 1 笔租金
    expect(finance.getAllTransactions()).toHaveLength(3)
  })
})

describe('DailyScheduler 员工状态', () => {
  it('士气按浮点公式向 70 回归，不被取整抹掉', () => {
    const { scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ morale: 50, fatigue: 0 })
    const world = worldOf({ employees: [emp], projects: [] })

    const next = scheduler.executeDay(world, 1)
    // 50 + (70-50)*0.02 = 50.4
    expect(next.employees[0]?.morale).toBeCloseTo(50.4, 5)
  })

  it('有研发任务时疲劳按投入比例增加', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [makeProject()] })
    const next = scheduler.executeDay(world, 1)
    // 20 + 0.5 × 1.0 = 20.5
    expect(next.employees[0]?.fatigue).toBeCloseTo(20.5, 5)
  })

  it('未分配工作时疲劳恢复', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ employees: [makeEmployee({ fatigue: 40 })], projects: [] })
    const next = scheduler.executeDay(world, 1)
    expect(next.employees[0]?.fatigue).toBe(39)
  })

  it('项目暂停时员工按休息规则恢复疲劳', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({
      employees: [makeEmployee({ fatigue: 40 })],
      projects: [makeProject({ isPaused: true })],
    })
    const next = scheduler.executeDay(world, 1)
    expect(next.employees[0]?.fatigue).toBe(39)
  })
})
