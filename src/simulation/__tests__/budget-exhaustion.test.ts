import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { ProjectService } from '@simulation/services/project-service'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { makeEmployee, makeEmployment, makeProject, makeWorld, seedOpeningCash, seedSalaryCommitment } from '../../__tests__/helpers'
import type { WorldState } from '@simulation/services/world-state'
import type { Project } from '@domain/entities/project'
import type { DomainEvent } from '@domain/events'

const JAN_END = gregorianToDayIndex(1970, 1, 31) // day 30
const FEB_END = gregorianToDayIndex(1970, 2, 28) // day 58

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
  // R7：每日现金回写改为"先断言后写入"，世界状态里的公司现金必须由账本派生量给出（不在账本中入账＝第二写入者）
  const worldOf = (parts: Parameters<typeof makeWorld>[0] = {}) => {
    const world = makeWorld(parts)
    seedOpeningCash(finance, world.companies)
    return world
  }
  return { finance, scheduler: new DailyScheduler({ finance }), worldOf }
}

/** remainingCap 恰好为 0（判据 <=0 含等号）的 active 项目 */
function exhaustedProject(overrides: Partial<Project> = {}): Project {
  return makeProject({
    id: 'project-1',
    budgetTotalCapCents: 100,
    budgetSpentCents: 100,
    ...overrides,
  })
}

function budgetExhaustedEvents(world: WorldState): DomainEvent[] {
  return world.events.filter((e) => e.type === 'ProjectBudgetExhausted')
}

describe('G-05 预算耗尽判定与事件（DESIGN-G05 §6 / G05-R8）', () => {
  it('耗尽触发：remainingCap<=0 置耗尽态、phase 不变、事件唯一且不自动取消', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [exhaustedProject()] })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]!

    expect(p.isPaused).toBe(true)
    expect(p.budgetExhausted).toBe(true)
    expect(p.phase).toBe('PRODUCTION')
    expect(p.pauseReason).toBe('budget_exhausted')
    expect(p.riskFlags).toContain('budget_exhausted')
    expect(p.cancellationReason).toBeNull()
    expect(p.changeLog.some((c) => c.details.event === 'ProjectBudgetExhausted')).toBe(true)

    const events = budgetExhaustedEvents(next)
    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe('event:budget_exhausted:project-1:0')
    expect(events[0]!.payload).toMatchObject({
      projectId: 'project-1',
      day: 1,
      remainingCapCents: 0,
    })
  })

  it('耗尽后既有义务继续：研发产出=0，工资仍按原比例分摊', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 300 })
    const project = makeProject({
      id: 'project-1',
      budgetTotalCapCents: 100,
      teamAssignments: [
        { employeeId: 'emp-1', projectId: 'project-1', allocationRatio: 1, roleOnProject: 'generalist' },
      ],
    })
    // CODE-06：夹具注册 D-03 Employment + 薪资承诺（月薪唯一产出点 = 承诺兑现）
    const employment = makeEmployment({ employmentId: emp.id, personId: `d03-per-${emp.id}`, salaryMonthlyCents: emp.salaryMonthlyCents })
    const world = worldOf({ employees: [emp], employments: [employment], projects: [project] })
    seedSalaryCommitment(finance, employment)

    // 月末：工资 300 分摊使 remainingCap = 100 - 300 = -200，触发耗尽
    const exhausted = scheduler.executeDay(world, JAN_END)
    const p1 = exhausted.projects[0]!
    expect(p1.budgetExhausted).toBe(true)
    expect(p1.budgetSpentCents).toBe(300)
    expect(p1.costAllocations).toHaveLength(1)
    const workAtExhaustion = { ...p1.workRemainingByDiscipline }

    // 次日：研发产出为 0（复用 isPaused 门控），事件不重复触发
    const nextDay = scheduler.executeDay(exhausted, JAN_END + 1)
    expect(nextDay.projects[0]!.workRemainingByDiscipline).toEqual(workAtExhaustion)
    expect(budgetExhaustedEvents(nextDay)).toHaveLength(1)

    // 次月末：工资仍分摊到项目（G05-R6），既有义务继续发生
    const nextMonth = scheduler.executeDay(nextDay, FEB_END)
    const p2 = nextMonth.projects[0]!
    expect(p2.costAllocations).toHaveLength(2)
    expect(p2.budgetSpentCents).toBe(600)
    expect(finance.getAllTransactions().filter((tx) => tx.category === 'salary')).toHaveLength(2)
    expect(budgetExhaustedEvents(nextMonth)).toHaveLength(1)
  })

  it('事件幂等：同一恢复周期仅一次；resume 后 resumeSeq+1 可再次触发', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({ projects: [exhaustedProject()] })

    const first = scheduler.executeDay(world, 1)
    expect(budgetExhaustedEvents(first)).toHaveLength(1)

    // 同一恢复周期内后续调度不再触发
    const repeated = scheduler.executeDay(first, 2)
    expect(budgetExhaustedEvents(repeated)).toHaveLength(1)

    // 恢复：清除 budgetExhausted、resumeSeq+1、pausedDays 清零
    const service = new ProjectService()
    service.reset([repeated.projects[0]!])
    const resumed = service.resume('project-1')
    expect(resumed.result?.isPaused).toBe(false)
    expect(resumed.result?.budgetExhausted).toBe(false)
    expect(resumed.result?.resumeSeq).toBe(1)
    expect(resumed.result?.pausedDays).toBe(0)

    // 追加预算（模拟 TopUpBudget：totalCap 增加、不自动恢复），remainingCap>0 不耗尽
    const topped: Project = { ...resumed.result!, budgetTotalCapCents: 1_000 }
    const afterTopUp = scheduler.executeDay({ ...repeated, projects: [topped] }, 3)
    expect(afterTopUp.projects[0]!.budgetExhausted).toBe(false)
    expect(budgetExhaustedEvents(afterTopUp)).toHaveLength(1)

    // 再次耗尽：remainingCap 重新 <=0，新一轮恢复周期产生新幂等键事件
    const spentAgain: Project = { ...afterTopUp.projects[0]!, budgetSpentCents: 1_000 }
    const second = scheduler.executeDay({ ...afterTopUp, projects: [spentAgain] }, 4)
    const events = budgetExhaustedEvents(second)
    expect(events).toHaveLength(2)
    expect(events[1]!.id).toBe('event:budget_exhausted:project-1:1')
    expect(events[1]!.payload).toMatchObject({ remainingCapCents: 0, day: 4 })
  })

  it('不自动取消且终态项目不判定耗尽；耗尽暂停计入 D01 计数', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({
      projects: [
        exhaustedProject({ id: 'active' }),
        exhaustedProject({ id: 'launched', phase: 'LAUNCHED' }),
        exhaustedProject({ id: 'cancelled', phase: 'CANCELLED' }),
      ],
    })

    let state = scheduler.executeDay(world, 1)
    // 推进若干天（远小于 60 天），不因耗尽而自动取消
    for (let day = 2; day <= 5; day++) state = scheduler.executeDay(state, day)

    const active = state.projects.find((p) => p.id === 'active')!
    expect(active.phase).toBe('PRODUCTION')
    expect(active.isPaused).toBe(true)
    expect(active.budgetExhausted).toBe(true)
    expect(active.cancellationReason).toBeNull()
    // day1 触发当日计 0，day2..day5 各 +1：耗尽暂停自然计入 D01 的 60 天计数
    expect(active.pausedDays).toBe(4)

    for (const id of ['launched', 'cancelled']) {
      const terminal = state.projects.find((p) => p.id === id)!
      expect(terminal.budgetExhausted).toBeFalsy()
      expect(terminal.phase).toBe(id.toUpperCase() as Project['phase'])
    }

    const events = budgetExhaustedEvents(state)
    expect(events).toHaveLength(1)
    expect(events[0]!.payload.projectId).toBe('active')
  })

  it('手动暂停项目仍参与耗尽判定（active 含暂停项目，GDR 边界）', () => {
    const { scheduler, worldOf } = makeScheduler()
    const world = worldOf({
      projects: [
        makeProject({
          id: 'manual-paused',
          isPaused: true,
          pauseReason: 'manual',
          budgetTotalCapCents: 100,
          budgetSpentCents: 100,
        }),
      ],
    })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]!
    expect(p.budgetExhausted).toBe(true)
    expect(p.pauseReason).toBe('budget_exhausted')
    expect(p.phase).toBe('PRODUCTION')
    const events = budgetExhaustedEvents(next)
    expect(events).toHaveLength(1)
    expect(events[0]!.payload.projectId).toBe('manual-paused')
  })
})
