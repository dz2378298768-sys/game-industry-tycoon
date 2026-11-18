import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { TUNING } from '@content/tuning'
import { parseSave } from '@infrastructure/storage/save-schema'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { makeProject, makeWorld } from '../../__tests__/helpers'

function makeStudio(seed = 21) {
  const gw = new GameWorld(seed)
  const company = gw.createCompany({ name: 'Pause Studios', cityId: 'san_francisco' })
  const emp = gw.hireEmployee({
    name: 'Dev',
    role: 'programmer',
    skillLevel: 3,
    salaryMonthlyCents: 100_000,
  }).result
  const project = gw.createProject({
    name: 'Pause Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 500,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (!emp || !project) throw new Error('setup failed')
  return { gw, company, emp, project }
}

function projectOf(gw: GameWorld, projectId: string) {
  const p = gw.world.projects.find((x) => x.id === projectId)
  if (!p) throw new Error('project not found')
  return p
}

describe('D-01 连续暂停 60 天自动取消', () => {
  it('第 59 天不取消，第 60 天经状态机自动取消，第 61 天保持终态', () => {
    const { gw, project } = makeStudio()
    const pause = gw.toggleProjectPause(project.id)
    expect(pause.success).toBe(true)

    gw.advanceSimulation(TUNING.project.autoCancelAfterPausedDays - 1) // 59 天

    const at59 = projectOf(gw, project.id)
    expect(at59.phase).toBe('CONCEPT')
    expect(at59.isPaused).toBe(true)
    expect(at59.consecutivePauseDays).toBe(59)

    gw.advanceSimulation(1) // 第 60 天
    const at60 = projectOf(gw, project.id)
    expect(at60.phase).toBe('CANCELLED')
    expect(at60.isPaused).toBe(false)
    expect(at60.cancellationReason).toBe('pause_timeout')
    expect(at60.consecutivePauseDays).toBe(60)

    gw.advanceSimulation(1) // 第 61 天：终态不再累加
    const at61 = projectOf(gw, project.id)
    expect(at61.phase).toBe('CANCELLED')
    expect(at61.isPaused).toBe(false)
    expect(at61.consecutivePauseDays).toBe(60)
    expect(at61.version).toBe(at60.version)
  })

  it('未暂停的项目推进 60 天不会被自动取消', () => {
    const { gw, project } = makeStudio(22)
    gw.advanceSimulation(TUNING.project.autoCancelAfterPausedDays + 1)

    const p = projectOf(gw, project.id)
    expect(p.phase).not.toBe('CANCELLED')
    expect(p.consecutivePauseDays).toBe(0)
  })

  it('恢复运行后连续暂停天数清零，重新暂停重新计数', () => {
    const { gw, project } = makeStudio(23)
    gw.toggleProjectPause(project.id)
    gw.advanceSimulation(TUNING.project.autoCancelAfterPausedDays - 1) // 第 59 天
    expect(projectOf(gw, project.id).consecutivePauseDays).toBe(59)

    const resume = gw.toggleProjectPause(project.id)
    expect(resume.success).toBe(true)
    expect(projectOf(gw, project.id).isPaused).toBe(false)
    expect(projectOf(gw, project.id).consecutivePauseDays).toBe(0)

    gw.advanceSimulation(5)
    expect(projectOf(gw, project.id).consecutivePauseDays).toBe(0)

    gw.toggleProjectPause(project.id)
    gw.advanceSimulation(10)
    expect(projectOf(gw, project.id).consecutivePauseDays).toBe(10)
  })

  it('超过计划上市日期但未暂停 60 天，不会被自动取消（A5 与 D-01 并存）', () => {
    const { gw, project } = makeStudio(28)
    const p0 = projectOf(gw, project.id)
    expect(p0.plannedLaunchDay).toBe(500)

    // 不暂停，直接推进 600 天，远超计划上市日
    gw.advanceSimulation(600)

    const p = projectOf(gw, project.id)
    expect(p.phase).not.toBe('CANCELLED')
    expect(p.isPaused).toBe(false)
    expect(p.consecutivePauseDays).toBe(0)
  })

  it('同一天重复执行每日调度不会重复累加暂停天数', () => {
    const world = makeWorld({
      projects: [makeProject({ isPaused: true, consecutivePauseDays: 0 })],
      currentDayIndex: 0,
    })
    const scheduler = new DailyScheduler({ finance: new FinanceService() })

    const first = scheduler.executeDay(world, 1)
    const second = scheduler.executeDay(first, 1) // 同一天重复调度

    expect(first.projects[0]!.consecutivePauseDays).toBe(1)
    expect(second.projects[0]!.consecutivePauseDays).toBe(1)
  })

  it('自动取消后不再产生研发进度，团队分配保留但产出为 0', () => {
    const { gw, emp, project } = makeStudio(24)
    gw.advanceProjectPhase(project.id) // CONCEPT → PRE_PRODUCTION
    gw.advanceProjectPhase(project.id) // PRE_PRODUCTION → PRODUCTION
    const assign = gw.assignEmployeeToProject(emp.id, project.id, 1, 'generalist')
    expect(assign.success).toBe(true)

    const before = projectOf(gw, project.id)
    const remainingBefore = { ...before.workRemainingByDiscipline }
    const totalDesign = before.workTotalByDiscipline.design

    gw.toggleProjectPause(project.id)
    gw.advanceSimulation(TUNING.project.autoCancelAfterPausedDays)

    const after = projectOf(gw, project.id)
    expect(after.phase).toBe('CANCELLED')
    expect(after.workRemainingByDiscipline).toEqual(remainingBefore)
    expect(after.workRemainingByDiscipline.design).toBe(totalDesign)
    expect(after.teamAssignments).toHaveLength(1)
  })

  it('存档/读档后连续暂停天数正确保留', () => {
    const { gw, project } = makeStudio(25)
    gw.toggleProjectPause(project.id)
    gw.advanceSimulation(10)
    expect(projectOf(gw, project.id).consecutivePauseDays).toBe(10)

    const parsed = parseSave(gw.serialize())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const saved = parsed.state.projects.find((p) => p.id === project.id)
    expect(saved?.consecutivePauseDays).toBe(10)

    const restored = new GameWorld(25)
    restored.restore(parsed.state)
    expect(projectOf(restored, project.id).consecutivePauseDays).toBe(10)
    expect(projectOf(restored, project.id).isPaused).toBe(true)
  })
})

describe('DEF-002 取消项目后状态一致性', () => {
  it('玩家主动取消：phase=CANCELLED、isPaused=false、原因写入', () => {
    const { gw, project } = makeStudio(26)
    gw.toggleProjectPause(project.id)
    expect(projectOf(gw, project.id).isPaused).toBe(true)

    const cancelled = gw.cancelProject(project.id)
    expect(cancelled.success).toBe(true)

    const p = projectOf(gw, project.id)
    expect(p.phase).toBe('CANCELLED')
    expect(p.isPaused).toBe(false)
    expect(p.cancellationReason).toBe('player_decision')
  })

  it('已取消项目不能再次取消，也不能暂停/恢复', () => {
    const { gw, project } = makeStudio(27)
    gw.cancelProject(project.id)

    expect(gw.cancelProject(project.id).success).toBe(false)
    expect(gw.toggleProjectPause(project.id).success).toBe(false)
  })
})
