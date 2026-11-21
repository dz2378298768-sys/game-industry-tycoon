import { describe, it, expect } from 'vitest'
import { GameWorld, type TopUpBudgetCmd } from '@application/mediators/game-world'
import { BUDGET_TOP_UP_EVENT, topUpIdempotencyKey } from '@domain/value-objects'
import type { Project } from '@domain/entities/project'
import { parseSave } from '@infrastructure/storage/save-schema'

function worldWithProject(): { gw: GameWorld; project: Project } {
  const gw = new GameWorld(9)
  gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  const project = gw.createProject({
    name: 'TopUp Target',
    genreId: 'action',
    budgetTotalCapCents: 1_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (!project) throw new Error('createProject failed')
  return { gw, project }
}

/** 模拟预算耗尽态：remainingCap=0、暂停、耗尽标记、D-01 暂停计数=30 */
function setExhausted(gw: GameWorld, project: Project, pausedDays = 30): void {
  gw.world.projects = gw.world.projects.map((p) =>
    p.id === project.id
      ? {
          ...p,
          budgetSpentCents: p.budgetTotalCapCents,
          isPaused: true,
          budgetExhausted: true,
          pauseReason: 'budget_exhausted' as const,
          pausedDays,
        }
      : p,
  )
}

const topUp = (
  gw: GameWorld,
  project: Project,
  overrides: Partial<TopUpBudgetCmd> = {},
): TopUpBudgetCmd => ({
  projectId: project.id,
  amountCents: 500_000,
  seq: 1,
  reason: '追加市场预算',
  ...overrides,
})

describe('TopUpBudget 命令与不自动恢复（TASK-M1.1-G05-001-D / DESIGN-G05 §9、G05-R9）', () => {
  it('追加成功：totalCap 增加、changeLog 记录金额/原因/执行日/新 totalCap、且不自动恢复', () => {
    const { gw, project } = worldWithProject()
    setExhausted(gw, project)

    const result = gw.topUpBudget(topUp(gw, project))

    expect(result.success).toBe(true)
    const next = result.result
    if (!next) throw new Error('topUpBudget 未返回结果')
    expect(next.budgetTotalCapCents).toBe(1_500_000)
    // G05-R9：追加不改变暂停/耗尽/暂停计数
    expect(next.isPaused).toBe(true)
    expect(next.budgetExhausted).toBe(true)
    expect(next.pausedDays).toBe(30)
    expect(next.changeLog).toHaveLength(1)

    const entry = next.changeLog[0]!
    expect(entry.type).toBe('update')
    expect(entry.timestampDay).toBe(gw.calendar.currentDayIndex)
    expect(entry.details).toMatchObject({
      event: BUDGET_TOP_UP_EVENT,
      idempotencyKey: topUpIdempotencyKey(project.id, 1),
      seq: 1,
      amountCents: 500_000,
      reason: '追加市场预算',
      newTotalCapCents: 1_500_000,
      day: gw.calendar.currentDayIndex,
    })
  })

  it('resume 后恢复且计数清零：isPaused=false、pausedDays=0、budgetExhausted=false、resumeSeq+1', () => {
    const { gw, project } = worldWithProject()
    setExhausted(gw, project)
    expect(gw.topUpBudget(topUp(gw, project)).success).toBe(true)

    const resumed = gw.toggleProjectPause(project.id)
    expect(resumed.success).toBe(true)
    const next = resumed.result
    if (!next) throw new Error('resume 未返回结果')
    expect(next.isPaused).toBe(false)
    expect(next.pausedDays).toBe(0)
    expect(next.budgetExhausted).toBe(false)
    expect(next.resumeSeq).toBe(1)
    // 追加的预算仍保留
    expect(next.budgetTotalCapCents).toBe(1_500_000)
  })

  it('幂等：同一 seq 重复追加不重复加 totalCap，不同 seq 可继续追加', () => {
    const { gw, project } = worldWithProject()
    const first = gw.topUpBudget(topUp(gw, project, { amountCents: 100_000, seq: 7 }))
    expect(first.success).toBe(true)
    expect(first.result?.budgetTotalCapCents).toBe(1_100_000)

    const duplicate = gw.topUpBudget(topUp(gw, project, { amountCents: 100_000, seq: 7 }))
    expect(duplicate.success).toBe(true)
    expect(duplicate.idempotent).toBe(true)
    expect(duplicate.result?.budgetTotalCapCents).toBe(1_100_000)
    expect(duplicate.result?.changeLog).toHaveLength(1)

    const nextSeq = gw.topUpBudget(topUp(gw, project, { amountCents: 50_000, seq: 8 }))
    expect(nextSeq.success).toBe(true)
    expect(nextSeq.result?.budgetTotalCapCents).toBe(1_150_000)
    expect(nextSeq.result?.changeLog).toHaveLength(2)
  })

  it('非法金额拒绝：0 / 负数 / 小数 / NaN / Infinity 均返回 BGT_INVALID_AMOUNT', () => {
    for (const amountCents of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { gw, project } = worldWithProject()
      const before = project.budgetTotalCapCents
      const result = gw.topUpBudget(topUp(gw, project, { amountCents }))
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('BGT_INVALID_AMOUNT')
      expect(gw.world.projects[0]!.budgetTotalCapCents).toBe(before)
      expect(gw.world.projects[0]!.changeLog).toHaveLength(0)
    }
  })

  it('终态项目拒绝：LAUNCHED / CANCELLED 均返回 PRJ_TERMINAL', () => {
    for (const phase of ['LAUNCHED', 'CANCELLED'] as const) {
      const { gw, project } = worldWithProject()
      gw.world.projects = gw.world.projects.map((p) => (p.id === project.id ? { ...p, phase } : p))
      const result = gw.topUpBudget(topUp(gw, project))
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe('PRJ_TERMINAL')
      expect(gw.world.projects[0]!.budgetTotalCapCents).toBe(project.budgetTotalCapCents)
    }
  })

  it('追加后存档公式快照一致，可正常读档', () => {
    const { gw, project } = worldWithProject()
    setExhausted(gw, project)
    expect(gw.topUpBudget(topUp(gw, project)).success).toBe(true)

    const parsed = parseSave(gw.serialize())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const saved = parsed.state.projects[0]!
      expect(saved.remainingCapCents).toBe(
        saved.budgetTotalCapCents - saved.budgetCommittedCents - saved.budgetSpentCents,
      )
      expect(saved.budgetTotalCapCents).toBe(1_500_000)
    }
  })
})
