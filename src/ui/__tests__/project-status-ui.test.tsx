import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    projects: [] as any[],
    employees: [] as any[],
    transactions: [] as any[],
    products: [] as any[],
    company: null as any,
    dayIndex: 100,
    toggleProjectPause: vi.fn(),
    cancelProject: vi.fn(),
    advanceProjectPhase: vi.fn(),
    launchProject: vi.fn(),
    assignEmployeeToProject: vi.fn(),
    unassignEmployeeFromProject: vi.fn(),
    topUpBudget: vi.fn(() => ({ success: true })),
    resumeProject: vi.fn(() => ({ success: true })),
    toast: vi.fn(),
  },
}))

vi.mock('@ui/state/game-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@ui/state/game-store')>()
  return { ...actual, useGameStore: () => mockStore }
})

vi.mock('@simulation/systems/project-progress', () => ({
  completionRatio: () => 0.5,
  allProductionDisciplinesCompleteAtLeast: () => false,
  isQaComplete: () => false,
  estimateDaysToFinish: () => 10,
  totalCompletion: () => 0.5,
}))
vi.mock('@simulation/systems/work-systems', () => ({
  baseEffectiveWorkPerDay: () => ({ design: 1, programming: 1, art: 1, qa: 1 }),
}))
vi.mock('@simulation/systems/qa-quality', () => ({
  computeFinalQualityScore: () => 80,
  defectLevelOf: () => 10,
  computeInitialDefectLevel: () => 30,
}))
vi.mock('@content/tuning', () => ({
  TUNING: { project: { productionCompletionThreshold: 0.9 } },
}))
vi.mock('@infrastructure/loading/content-loader', () => ({ content: { genres: [] } }))

import { Projects } from '@ui/pages/projects'
import { ProjectDetail } from '@ui/pages/project-detail'
import type { Project } from '@domain/entities/project'
import zhCN from '../../i18n/zh-CN.json'
import en from '../../i18n/en.json'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    companyId: 'c1',
    name: 'Test Game',
    genreId: 'action',
    audienceSegmentIds: [],
    targetPlatformIds: [],
    phase: 'PRODUCTION',
    subPhase: null,
    isPaused: false,
    plannedStartDay: 0,
    plannedLaunchDay: 200,
    actualStartDay: 0,
    actualLaunchDay: null,
    scope: [],
    budgetTotalCapCents: 1_000_000,
    budgetSpentCents: 300_000,
    budgetCommittedCents: 200_000,
    remainingCapCents: 500_000,
    costAllocations: [],
    teamAssignments: [],
    workRemainingByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    qualityTargets: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    qualityEstimate: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    riskFlags: [],
    changeLog: [],
    cancellationReason: null,
    pausedDays: 0,
    pauseReason: null,
    budgetExhausted: false,
    resumeSeq: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 100,
    ...overrides,
  }
}

const manual = makeProject({ id: 'p-manual', name: 'Manual Pause', isPaused: true, pauseReason: 'manual', pausedDays: 12 })
const exhausted = makeProject({ id: 'p-exhausted', name: 'Budget Out', isPaused: true, pauseReason: 'budget_exhausted', budgetExhausted: true, pausedDays: 3 })
const timeout = makeProject({ id: 'p-timeout', name: 'Timeout Cancel', phase: 'CANCELLED', cancellationReason: 'pause_timeout', updatedAt: 60 })
const userCancel = makeProject({ id: 'p-user', name: 'User Cancel', phase: 'CANCELLED', cancellationReason: 'player_decision', updatedAt: 70 })

const renderList = () => render(<Projects onNavigate={vi.fn()} />)
const renderDetail = (project: Project) => {
  mockStore.projects = [project]
  return render(<ProjectDetail projectId={project.id} onNavigate={vi.fn()} />)
}

describe('TASK-M1.1-UI-001 四态状态展示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.projects = [manual, exhausted, timeout, userCancel]
  })

  it('列表用图标+文案+暂停天数区分四类状态（不依赖颜色）', () => {
    const { container } = renderList()
    const text = container.textContent ?? ''
    const badgeText = (kind: string) =>
      container.querySelector(`[data-project-status="${kind}"]`)?.textContent ?? ''

    expect(text).toContain('⏸')
    expect(text).toContain('已手动暂停')
    expect(text).toContain('已暂停 12/60 天')

    expect(text).toContain('⚠')
    expect(text).toContain('预算耗尽')
    expect(text).toContain('已暂停 3/60 天')

    expect(text).toContain('⛔')
    // 取消徽标按原因分流（TASK-M1.1-UI-001-FIX3）：不再统一显示「玩家已取消」
    expect(badgeText('cancelled_timeout')).toContain('暂停超时')

    expect(text).toContain('✕')
    expect(badgeText('cancelled_user')).toContain('主动取消')
    expect(badgeText('cancelled_user')).not.toContain('玩家已取消')

    // 四种状态在 DOM 上各自有独立标识，可断言互不相同
    const kinds = Array.from(container.querySelectorAll('[data-project-status]')).map(
      el => el.getAttribute('data-project-status'),
    )
    expect(new Set(kinds)).toEqual(new Set(['manual_pause', 'budget_exhausted', 'cancelled_timeout', 'cancelled_user']))
  })

  it('筛选：全部/暂停/取消 三档生效，取消档仅显示已取消项目', () => {
    renderList()
    expect(screen.getByText('全部 (4)')).toBeTruthy()
    expect(screen.getByText('暂停中 (2)')).toBeTruthy()
    expect(screen.getByText('已取消 (2)')).toBeTruthy()

    fireEvent.click(screen.getByText('已取消 (2)'))
    expect(screen.getByText('Timeout Cancel')).toBeTruthy()
    expect(screen.getByText('User Cancel')).toBeTruthy()
    expect(screen.queryByText('Manual Pause')).toBeNull()

    fireEvent.click(screen.getByText('暂停中 (2)'))
    expect(screen.getByText('Manual Pause')).toBeTruthy()
    expect(screen.getByText('Budget Out')).toBeTruthy()
    expect(screen.queryByText('Timeout Cancel')).toBeNull()
  })

  it('无项目时显示空状态「暂无项目」', () => {
    mockStore.projects = []
    const { container } = renderList()
    expect(container.textContent).toContain('暂无项目')
  })
})

describe('TASK-M1.1-UI-001 取消原因弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.projects = [timeout, userCancel]
  })

  it('从列表打开超时取消：代码 pause_timeout、仅一个关闭按钮、Esc 可关', () => {
    renderList()
    const row = screen.getByText('Timeout Cancel').closest('tr')!
    fireEvent.click(within(row).getByText('查看原因'))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('项目取消详情')).toBeTruthy()
    expect(within(dialog).getByText('pause_timeout')).toBeTruthy()
    expect(within(dialog).getByText('连续暂停达到 60 个游戏日，系统按规则自动取消。')).toBeTruthy()
    expect(within(dialog).getByText('第 60 天')).toBeTruthy()
    expect(within(dialog).getAllByRole('button')).toHaveLength(1)
    expect(within(dialog).getByText('关闭')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('从详情分别打开超时取消与主动取消：文案不同且原因代码正确', () => {
    const timeoutView = renderDetail(timeout)
    fireEvent.click(screen.getByText('查看取消原因'))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('pause_timeout')).toBeTruthy()
    const timeoutText = dialog.textContent ?? ''
    timeoutView.unmount()

    const userView = renderDetail(userCancel)
    fireEvent.click(screen.getByText('查看取消原因'))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('player_decision')).toBeTruthy()
    expect(within(dialog).getByText('由玩家主动确认取消。')).toBeTruthy()
    const userText = dialog.textContent ?? ''
    userView.unmount()

    expect(timeoutText).not.toBe(userText)
  })

  it('边界：budget_exhausted 不作为取消原因展示，null 原因宽容显示', () => {
    const legacy = makeProject({
      id: 'p-legacy',
      name: 'Legacy',
      phase: 'CANCELLED',
      cancellationReason: 'budget_exhausted' as Project['cancellationReason'],
      updatedAt: 42,
    })
    const view = renderDetail(legacy)
    expect(screen.queryByText('恢复项目')).toBeNull()
    fireEvent.click(screen.getByText('查看取消原因'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).not.toContain('budget_exhausted')
    expect(within(dialog).getByText('—')).toBeTruthy()
    expect(within(dialog).getByText('历史数据未记录取消原因。')).toBeTruthy()
    view.unmount()

    const noReason = makeProject({ id: 'p-null', name: 'Unknown', phase: 'CANCELLED', cancellationReason: null })
    const { container } = renderDetail(noReason)
    expect(container.textContent).toContain('已取消（历史数据未记录原因）')
    fireEvent.click(screen.getByText('查看取消原因'))
    expect(within(screen.getByRole('dialog')).getByText('历史存档未记录取消原因。')).toBeTruthy()
  })

  it('终态项目不显示暂停/恢复/取消操作按钮', () => {
    const { container } = renderDetail(timeout)
    const buttons = Array.from(container.querySelectorAll('button')).map(b => (b.textContent ?? '').trim())
    expect(buttons).not.toContain('恢复项目')
    expect(buttons).not.toContain('暂停')
    expect(buttons).not.toContain('取消')
  })
})

describe('TASK-M1.1-UI-001-FIX 整改回归', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('F1：暂停行阶段文案仍可见，且状态徽标独立存在', () => {
    mockStore.projects = [manual]
    renderList()
    const row = screen.getByText('Manual Pause').closest('tr')!
    expect(within(row).getByText('制作中（暂停）')).toBeTruthy()
    expect(within(row).getByText('已手动暂停')).toBeTruthy()
  })

  it('F2/F9：列表包含风险与预计完成列，表头操作列走 i18n', () => {
    mockStore.projects = [makeProject({ id: 'p-risk', name: 'Risky', riskFlags: ['quality_risk', 'budget_exhausted'] })]
    const { container } = renderList()
    const headers = Array.from(container.querySelectorAll('th')).map(th => th.textContent)
    expect(headers).toContain('风险')
    expect(headers).toContain('预计完成')
    expect(headers).toContain('操作')
    expect(container.textContent).toContain('质量风险')
    expect(container.textContent).toContain('预计第 110 天')
  })

  it('F3：scope_became_unviable / team_dissolved / market_window_missed 文案互不相同且原因码为原值', () => {
    const scope = makeProject({ id: 'p-scope', name: 'Scope', phase: 'CANCELLED', cancellationReason: 'scope_became_unviable', updatedAt: 30 })
    const team = makeProject({ id: 'p-team', name: 'Team', phase: 'CANCELLED', cancellationReason: 'team_dissolved', updatedAt: 31 })
    const market = makeProject({ id: 'p-market', name: 'Market', phase: 'CANCELLED', cancellationReason: 'market_window_missed', updatedAt: 32 })
    mockStore.projects = [scope, team, market]
    renderList()

    const read = (name: string) => {
      const row = screen.getByText(name).closest('tr')!
      fireEvent.click(within(row).getByText('查看原因'))
      const text = screen.getByRole('dialog').textContent ?? ''
      fireEvent.click(within(screen.getByRole('dialog')).getByText('关闭'))
      return text
    }

    const scopeText = read('Scope')
    const teamText = read('Team')
    const marketText = read('Market')

    expect(scopeText).toContain('范围不可行')
    expect(teamText).toContain('核心团队解散')
    expect(marketText).toContain('市场窗口已错过')
    expect(scopeText).toContain('scope_became_unviable')
    expect(teamText).toContain('team_dissolved')
    expect(marketText).toContain('market_window_missed')
    expect(teamText).not.toContain('未记录')
    expect(new Set([scopeText, teamText, marketText]).size).toBe(3)
  })

  it('F4：第 10 天创建、第 50 天取消，弹窗显示第 50 天而非当前日', () => {
    const late = makeProject({
      id: 'p-late',
      name: 'Late Cancel',
      phase: 'CANCELLED',
      cancellationReason: 'player_decision',
      createdAt: 10,
      updatedAt: 50,
    })
    renderDetail(late)
    fireEvent.click(screen.getByText('查看取消原因'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('第 50 天')).toBeTruthy()
    expect(dialog.textContent).not.toContain('第 100 天')
  })

  it('F7：弹窗关闭后焦点归还触发按钮', () => {
    renderDetail(userCancel)
    const trigger = screen.getByText('查看取消原因')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(within(screen.getByRole('dialog')).getByText('关闭'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('TASK-M1.1-UI-001-FIX2 收尾微调', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('F1：team_dissolved 详情横幅按原因显示，不再说成「由你主动取消」，详情留在弹窗', () => {
    const team = makeProject({
      id: 'p-team-detail',
      name: 'Dissolved',
      phase: 'CANCELLED',
      cancellationReason: 'team_dissolved',
      updatedAt: 44,
    })
    const { container } = renderDetail(team)
    const text = container.textContent ?? ''

    expect(text).toContain('团队解散，项目终止')
    expect(text).not.toContain('由你主动取消')
    // 横幅只放标题，弹窗说明不重复出现
    expect(text).not.toContain('核心团队解散，项目无法继续。')

    fireEvent.click(screen.getByText('查看取消原因'))
    expect(within(screen.getByRole('dialog')).getByText('核心团队解散，项目无法继续。')).toBeTruthy()
  })

  it('F2（N-8）：父组件模拟每日 tick 重渲染后关闭弹窗，焦点仍回到触发按钮', () => {
    mockStore.dayIndex = 100
    const view = renderDetail(userCancel)
    const trigger = screen.getByText('查看取消原因')
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeTruthy()
    const focusCallsAfterOpen = focusSpy.mock.calls.length

    // 模拟 daily tick：推进一天 → 父组件重渲染 → 弹窗收到新的内联 onClose 引用
    mockStore.dayIndex = 101
    view.rerender(<ProjectDetail projectId={userCancel.id} onNavigate={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    // 重渲染不得重跑挂载 effect（否则会再次抢焦点/覆写触发元素记录）
    expect(focusSpy.mock.calls.length).toBe(focusCallsAfterOpen)

    fireEvent.click(within(screen.getByRole('dialog')).getByText('关闭'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    focusSpy.mockRestore()
  })
})

describe('TASK-M1.1-UI-001-FIX3 取消徽标按原因分流', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.dayIndex = 100
  })

  const badgeTexts = (container: HTMLElement, kind: string) =>
    Array.from(container.querySelectorAll(`[data-project-status="${kind}"]`)).map(el => el.textContent ?? '')

  it('N-1①：team_dissolved 徽标显示「团队解散」，不得说成「玩家已取消」，与横幅同义', () => {
    const team = makeProject({
      id: 'p-team-badge',
      name: 'Team Badge',
      phase: 'CANCELLED',
      cancellationReason: 'team_dissolved',
      updatedAt: 44,
    })
    mockStore.projects = [team]

    // 列表行徽标
    const list = renderList()
    const listBadge = badgeTexts(list.container, 'cancelled_user')[0] ?? ''
    // 反向断言在前：徽标一旦回退为固定「玩家已取消」，本用例必须先在此失败
    expect(listBadge).not.toContain('玩家已取消')
    expect(listBadge).toContain('团队解散')
    expect(listBadge).not.toContain('主动取消')
    list.unmount()

    // 详情抬头徽标与横幅必须同义（同屏不得出现两种含义）
    const detail = renderDetail(team)
    const detailBadge = badgeTexts(detail.container, 'cancelled_user')[0] ?? ''
    expect(detailBadge).toContain('团队解散')
    expect(detailBadge).not.toContain('玩家已取消')
    expect(detail.container.textContent).toContain('团队解散，项目终止')
  })

  it('N-1②：market_window_missed 徽标与 player_decision 徽标文本必须不同', () => {
    const market = makeProject({
      id: 'p-market-badge',
      name: 'Market Badge',
      phase: 'CANCELLED',
      cancellationReason: 'market_window_missed',
      updatedAt: 45,
    })
    mockStore.projects = [market, userCancel]
    const { container } = renderList()

    const badges = badgeTexts(container, 'cancelled_user')
    expect(badges).toHaveLength(2)
    expect(new Set(badges).size).toBe(2)

    const joined = badges.join('|')
    expect(joined).toContain('错过窗口')
    expect(joined).toContain('主动取消')
    expect(joined).not.toContain('玩家已取消')
  })

  it('N-4：ETA 未开工项目取「计划第 X 天」，已上市项目取「无法估算」', () => {
    const planned = makeProject({ id: 'p-planned', name: 'Planned ETA', phase: 'CONCEPT', plannedLaunchDay: 200 })
    const launched = makeProject({ id: 'p-launched', name: 'Launched ETA', phase: 'LAUNCHED' })
    mockStore.projects = [planned, launched]
    renderList()

    const plannedRow = screen.getByText('Planned ETA').closest('tr')!
    expect(plannedRow.textContent).toContain('计划第 200 天')

    const launchedRow = screen.getByText('Launched ETA').closest('tr')!
    expect(launchedRow.textContent).toContain('无法估算')
    expect(launchedRow.textContent).not.toContain('计划第')
  })
})

describe('TASK-M1.1-UI-001 i18n', () => {
  it('中英键集合一致且 OI-10 文案不再硬编码', () => {
    expect(new Set(Object.keys(zhCN))).toEqual(new Set(Object.keys(en)))
    expect((zhCN as Record<string, string>)['project.budget.runway.unavailable']).toContain('近 30 天无支出记录')
    expect((zhCN as Record<string, string>)['overview.products']).toBe('产品')
    expect((zhCN as Record<string, string>)['project.quality.headers.dimension']).toBe('维度')
    expect((zhCN as Record<string, string>)['company.create.intro']).toContain('{cash}')
  })
})
