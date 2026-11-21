import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { ProjectService } from '@simulation/services/project-service'
import { GameWorld } from '@application/mediators/game-world'
import { parseSave } from '@infrastructure/storage/save-schema'
import { PAUSE_TIMEOUT_DAYS } from '@simulation/systems/phase-rules'
import type { WorldState } from '@simulation/services/world-state'
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

/** 连续推进 days 个游戏日（从 fromDay 起，每个 dayIndex 只调度一次） */
function tick(scheduler: DailyScheduler, world: WorldState, days: number, fromDay = 1): WorldState {
  let state = world
  for (let i = 0; i < days; i++) state = scheduler.executeDay(state, fromDay + i)
  return state
}

function saveSafeWorld(pausedDays: number): WorldState {
  const gw = new GameWorld(9)
  gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  const emp = gw.hireEmployee({
    name: 'Dev',
    role: 'programmer',
    skillLevel: 3,
    salaryMonthlyCents: 100_000,
  }).result
  const project = gw.createProject({
    name: 'Saved Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (emp && project) gw.assignEmployeeToProject(emp.id, project.id, 1, 'generalist')
  const world = gw.serialize()
  return { ...world, projects: world.projects.map((p) => ({ ...p, pausedDays })) }
}

describe('D-01 暂停计时与超时自动取消', () => {
  it(`连续暂停满 ${PAUSE_TIMEOUT_DAYS} 天在当日调度触发自动取消`, () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [makeProject({ isPaused: true, pauseReason: 'manual' })],
    })

    const final = tick(scheduler, world, PAUSE_TIMEOUT_DAYS)
    const p = final.projects[0]
    // 终态清理口径（DESIGN-G05 §6.3）：超时取消不留暂停计数
    expect(p?.pausedDays).toBe(0)
    expect(p?.phase).toBe('CANCELLED')
    expect(p?.isPaused).toBe(false)
    expect(p?.cancellationReason).toBe('pause_timeout')

    const event = final.events.find((e) => e.type === 'ProjectCancelled')
    expect(event?.day).toBe(PAUSE_TIMEOUT_DAYS)
    expect(event?.payload).toMatchObject({
      projectId: 'project-1',
      reasonCode: 'pause_timeout',
      actor: 'system',
    })
  })

  it('第 59 天仍暂停，不取消', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [makeProject({ isPaused: true, pausedDays: PAUSE_TIMEOUT_DAYS - 2 })],
    })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    expect(p?.pausedDays).toBe(PAUSE_TIMEOUT_DAYS - 1)
    expect(p?.phase).toBe('PRODUCTION')
    expect(p?.isPaused).toBe(true)
    expect(p?.cancellationReason).toBeNull()
    expect(next.events.filter((e) => e.type === 'ProjectCancelled')).toHaveLength(0)
  })

  it('进入暂停当天计 0，次日调度起 +1', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({ projects: [makeProject({ isPaused: true, pausedDays: 0 })] })

    const sameDay = scheduler.executeDay(world, 0)
    expect(sameDay.projects[0]?.pausedDays).toBe(0)

    const nextDay = scheduler.executeDay(world, 1)
    expect(nextDay.projects[0]?.pausedDays).toBe(1)
  })

  it('恢复后 pausedDays 清零，再次暂停重新累计', () => {
    const { scheduler } = makeScheduler()
    const service = new ProjectService()
    service.reset([makeProject({ isPaused: true, pausedDays: 30, pauseReason: 'manual' })])

    const resumed = service.resume('project-1')
    expect(resumed.result?.isPaused).toBe(false)
    expect(resumed.result?.pausedDays).toBe(0)
    expect(resumed.result?.pauseReason).toBeNull()

    // 再次暂停后从 0 开始，旧的 30 天计数不会带入
    const world = makeWorld({ projects: [makeProject({ isPaused: true, pausedDays: 0 })] })
    const afterOneDay = scheduler.executeDay(world, 1)
    expect(afterOneDay.projects[0]?.pausedDays).toBe(1)
  })

  it('玩家暂停命令记录 manual 原因并清零计数', () => {
    const service = new ProjectService()
    service.reset([makeProject({ pausedDays: 12, pauseReason: null })])

    const paused = service.pause('project-1')
    expect(paused.result?.isPaused).toBe(true)
    expect(paused.result?.pausedDays).toBe(0)
    expect(paused.result?.pauseReason).toBe('manual')
  })

  it('预算耗尽暂停（budget_exhausted）同样计入并在第 60 天取消', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [
        makeProject({ isPaused: true, pauseReason: 'budget_exhausted' }),
      ],
    })

    const final = tick(scheduler, world, PAUSE_TIMEOUT_DAYS)
    const p = final.projects[0]
    expect(p?.pausedDays).toBe(0)
    expect(p?.phase).toBe('CANCELLED')
    expect(p?.cancellationReason).toBe('pause_timeout')
  })

  it('超时自动取消清除预算耗尽过程态标记（终态清理口径 DESIGN-G05 §6.3）', () => {
    const { scheduler } = makeScheduler()
    // 预算耗尽态叠加暂停超时：次日起即达 60 天触发自动取消
    const world = makeWorld({
      projects: [
        makeProject({
          isPaused: true,
          pauseReason: 'budget_exhausted',
          budgetExhausted: true,
          pausedDays: PAUSE_TIMEOUT_DAYS - 1,
          riskFlags: ['budget_exhausted', 'quality_risk'],
        }),
      ],
    })

    const next = scheduler.executeDay(world, 1)
    const p = next.projects[0]
    expect(p?.phase).toBe('CANCELLED')
    expect(p?.cancellationReason).toBe('pause_timeout')
    expect(p?.isPaused).toBe(false)
    expect(p?.pauseReason).toBeNull()
    expect(p?.budgetExhausted).toBe(false)
    expect(p?.pausedDays).toBe(0)
    expect(p?.riskFlags).not.toContain('budget_exhausted')
    // 其他风险标记不受影响
    expect(p?.riskFlags).toContain('quality_risk')
  })

  it('终态项目（LAUNCHED/CANCELLED）不累计暂停也不判超时', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [
        makeProject({ id: 'launched', phase: 'LAUNCHED', isPaused: true, pausedDays: 0 }),
        makeProject({ id: 'cancelled', phase: 'CANCELLED', isPaused: true, pausedDays: 0 }),
      ],
    })

    const next = tick(scheduler, world, PAUSE_TIMEOUT_DAYS + 1)
    expect(next.projects[0]?.pausedDays).toBe(0)
    expect(next.projects[1]?.pausedDays).toBe(0)
    expect(next.events.filter((e) => e.type === 'ProjectCancelled')).toHaveLength(0)
  })

  it('超过计划上市日不自动失败或取消', () => {
    const { scheduler } = makeScheduler()
    const world = makeWorld({
      projects: [makeProject({ isPaused: true, plannedLaunchDay: 10, pausedDays: 0 })],
    })

    // day 11 起推进 59 天：早已超过 plannedLaunchDay，但仍未到暂停超时
    const next = tick(scheduler, world, PAUSE_TIMEOUT_DAYS - 1, 11)
    const p = next.projects[0]
    expect(p?.phase).toBe('PRODUCTION')
    expect(p?.isPaused).toBe(true)
    expect(p?.cancellationReason).toBeNull()
    expect(p?.pausedDays).toBe(PAUSE_TIMEOUT_DAYS - 1)
  })

  it('取消后停止研发产出、人员项目产出与新支出', () => {
    const { finance, scheduler } = makeScheduler()
    const world = makeWorld({
      employees: [makeEmployee({ fatigue: 40 })],
      projects: [makeProject({ isPaused: true, pausedDays: PAUSE_TIMEOUT_DAYS - 1 })],
    })

    const cancelled = scheduler.executeDay(world, 1)
    const p1 = cancelled.projects[0]!
    expect(p1.phase).toBe('CANCELLED')
    const remaining = { ...p1.workRemainingByDiscipline }
    const fatigueAfterCancel = cancelled.employees[0]!.fatigue
    const txCount = finance.getAllTransactions().length

    const next = scheduler.executeDay(cancelled, 2)
    expect(next.projects[0]?.workRemainingByDiscipline).toEqual(remaining)
    // 不再有项目投入，员工按休息恢复疲劳（而非继续增加）
    expect(next.employees[0]!.fatigue).toBeLessThan(fatigueAfterCancel)
    // 取消本身与取消后不产生新的直接支出
    expect(finance.getAllTransactions()).toHaveLength(txCount)
  })

  it('存档保留 pausedDays；缺字段缺省 0，非法值拒绝加载', () => {
    const world = saveSafeWorld(42)
    const parsed = parseSave(world)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.state.projects[0]?.pausedDays).toBe(42)

    const missing = structuredClone(world)
    delete (missing.projects[0] as unknown as Record<string, unknown>).pausedDays
    const defaulted = parseSave(missing)
    expect(defaulted.ok).toBe(true)
    if (defaulted.ok) expect(defaulted.state.projects[0]?.pausedDays).toBe(0)

    for (const bad of [-1, 1.5, NaN, Infinity]) {
      const broken = structuredClone(world)
      ;(broken.projects[0] as unknown as Record<string, unknown>).pausedDays = bad
      const result = parseSave(broken)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errorCode).toBe('SAVE_SCHEMA_INVALID')
    }
  })
})
