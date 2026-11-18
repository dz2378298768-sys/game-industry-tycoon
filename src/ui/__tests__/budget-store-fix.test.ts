import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@ui/state/game-store'
import { BUDGET_TOP_UP_EVENT, topUpIdempotencyKey } from '@domain/value-objects'
import type { Project } from '@domain/entities/project'
import { t } from '@i18n'

// 本文件不 mock store：直接驱动真实 zustand store + 真实 GameWorld / 领域命令，
// 让 seq 推导、错误码映射与恢复提示进入回归（001-E 审核 N-1 / N-3 / R-2）。

function bootProject(): Project {
  useGameStore.setState({
    game: null,
    company: null,
    employees: [],
    projects: [],
    products: [],
    transactions: [],
    messages: [],
    dayIndex: 0,
    speed: 'paused',
  })
  const store = useGameStore.getState()
  store.init(11)
  useGameStore.getState().createCompany('Acme', 'san_francisco')
  const outcome = useGameStore.getState().createProject({
    name: 'TopUp Target',
    genreId: 'action',
    budgetTotalCapCents: 1_000_000,
    plannedLaunchDay: 200,
  })
  expect(outcome.error).toBeUndefined()
  const project = useGameStore.getState().projects[0]
  if (!project) throw new Error('createProject 未产出项目')
  return project
}

function currentProject(projectId: string): Project {
  const gw = useGameStore.getState().game
  const project = gw?.world.projects.find(p => p.id === projectId)
  if (!project) throw new Error('项目不存在')
  return project
}

function topUpEntries(projectId: string) {
  return currentProject(projectId).changeLog.filter(e => e.details?.event === BUDGET_TOP_UP_EVENT)
}

describe('TASK-M1.1-G05-001-E-FIX store 级回归（真实 store + 真实领域命令）', () => {
  beforeEach(() => {
    useGameStore.setState({ messages: [] })
  })

  // T1 首次追加 seq=1（DESIGN-G05 v1.4 §7.1）
  it('首次追加分配 seq=1，幂等键为 budget:topup:{projectId}:1', () => {
    const project = bootProject()
    const result = useGameStore.getState().topUpBudget(project.id, 50_000, '首笔追加')

    expect(result.success).toBe(true)
    const entries = topUpEntries(project.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.details?.seq).toBe(1)
    expect(entries[0]!.details?.idempotencyKey).toBe(topUpIdempotencyKey(project.id, 1))
    expect(entries[0]!.details?.idempotencyKey).not.toBe(topUpIdempotencyKey(project.id, 0))
  })

  // T2 二次追加 seq=2
  it('第二次追加分配 seq=2，预算累加', () => {
    const project = bootProject()
    useGameStore.getState().topUpBudget(project.id, 50_000, '第一笔')
    const second = useGameStore.getState().topUpBudget(project.id, 30_000, '第二笔')

    expect(second.success).toBe(true)
    const entries = topUpEntries(project.id)
    expect(entries.map(e => e.details?.seq)).toEqual([1, 2])
    expect(currentProject(project.id).budgetTotalCapCents).toBe(1_080_000)
  })

  // T3 旧存档含 seq=0 时，新 seq 从 1 起且键不冲突
  it('历史含 seq=0 的旧数据时新 seq=1，且与 :0 键不同', () => {
    const project = bootProject()
    const gw = useGameStore.getState().game
    if (!gw) throw new Error('game 未初始化')
    // 用领域命令直接写入一条 seq=0 的旧记录
    expect(gw.topUpBudget({ projectId: project.id, amountCents: 10_000, seq: 0, reason: '旧版本追加' }).success).toBe(true)

    const result = useGameStore.getState().topUpBudget(project.id, 20_000, '新版本追加')

    expect(result.success).toBe(true)
    const entries = topUpEntries(project.id)
    expect(entries.map(e => e.details?.seq)).toEqual([0, 1])
    expect(entries[1]!.details?.idempotencyKey).toBe(topUpIdempotencyKey(project.id, 1))
    expect(entries[1]!.details?.idempotencyKey).not.toBe(entries[0]!.details?.idempotencyKey)
  })

  // T4 错误码 → i18n 文案（BGT_INVALID_AMOUNT / PRJ_TERMINAL）
  it('错误码映射到 i18n 文案并 toast', () => {
    const project = bootProject()

    const invalid = useGameStore.getState().topUpBudget(project.id, 0, '零金额')
    expect(invalid.success).toBe(false)
    expect(invalid.errorCode).toBe('BGT_INVALID_AMOUNT')
    expect(invalid.message).toBe(t('error.bgtInvalidAmount'))

    const gw = useGameStore.getState().game
    if (!gw) throw new Error('game 未初始化')
    gw.world.projects = gw.world.projects.map(p => (p.id === project.id ? { ...p, phase: 'LAUNCHED' } : p))
    const terminal = useGameStore.getState().topUpBudget(project.id, 10_000, '已上市')

    expect(terminal.success).toBe(false)
    expect(terminal.errorCode).toBe('PRJ_TERMINAL')
    expect(terminal.message).toBe(t('error.projectTerminal'))

    const shown = useGameStore.getState().messages.map(m => m.text)
    expect(shown).toContain(t('error.bgtInvalidAmount'))
    expect(shown).toContain(t('error.projectTerminal'))
  })

  // T5b 恢复成功后，剩余额度仍为负时追加提示（v1.5 §10.1a-6）
  it('剩余额度为负时恢复成功，额外提示预算仍为负', () => {
    const project = bootProject()
    // 用真实命令暂停，再把支出推过上限，构造"预算为负"的耗尽态
    expect(useGameStore.getState().toggleProjectPause(project.id).success).toBe(true)
    const gw = useGameStore.getState().game
    if (!gw) throw new Error('game 未初始化')
    gw.world.projects = gw.world.projects.map(p => (
      p.id === project.id
        ? { ...p, budgetSpentCents: p.budgetTotalCapCents + 4_000, budgetExhausted: true, pauseReason: 'budget_exhausted' as const }
        : p
    ))

    const result = useGameStore.getState().resumeProject(project.id)

    expect(result.success).toBe(true)
    expect(currentProject(project.id).isPaused).toBe(false)
    const shown = useGameStore.getState().messages.map(m => m.text)
    expect(shown).toContain(t('project.budget.resume.success'))
    expect(shown).toContain(t('project.budget.resume.negativeWarning'))
  })
})
