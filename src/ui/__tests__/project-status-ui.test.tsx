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

    expect(text).toContain('⏸')
    expect(text).toContain('已手动暂停')
    expect(text).toContain('已暂停 12/60 天')

    expect(text).toContain('⚠')
    expect(text).toContain('预算耗尽')
    expect(text).toContain('已暂停 3/60 天')

    expect(text).toContain('⛔')
    expect(text).toContain('暂停超时取消')

    expect(text).toContain('✕')
    expect(text).toContain('玩家已取消')

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
    expect(within(dialog).getByText('user_requested')).toBeTruthy()
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
    expect(within(dialog).getByText('历史存档未记录取消原因。')).toBeTruthy()
    view.unmount()

    const noReason = makeProject({ id: 'p-null', name: 'Unknown', phase: 'CANCELLED', cancellationReason: null })
    const { container } = renderDetail(noReason)
    expect(container.textContent).toContain('项目已取消（历史存档未记录原因）')
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

describe('TASK-M1.1-UI-001 i18n', () => {
  it('中英键集合一致且 OI-10 文案不再硬编码', () => {
    expect(new Set(Object.keys(zhCN))).toEqual(new Set(Object.keys(en)))
    expect((zhCN as Record<string, string>)['project.budget.runway.unavailable']).toContain('近 30 天无支出记录')
    expect((zhCN as Record<string, string>)['overview.products']).toBe('产品')
    expect((zhCN as Record<string, string>)['project.quality.headers.dimension']).toBe('维度')
    expect((zhCN as Record<string, string>)['company.create.intro']).toContain('{cash}')
  })
})
