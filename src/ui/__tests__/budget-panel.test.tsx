import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 用受控 mock 隔离 store，专注预算 UI 交互；t/formatMoney/formatDay 走真实实现
const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    projects: [] as any[],
    employees: [] as any[],
    transactions: [] as any[],
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

// 隔离仿真/内容依赖，避免测试依赖领域细节
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

import { ProjectDetail } from '@ui/pages/project-detail'
import { Finance } from '@ui/pages/finance'
import type { Project } from '@domain/entities/project'

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
    updatedAt: 0,
    ...overrides,
  }
}

const renderDetail = () => render(<ProjectDetail projectId="p1" onNavigate={vi.fn()} />)

describe('TASK-M1.1-G05-001-E 预算 UI 冒烟', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.projects = [makeProject()]
    mockStore.transactions = []
    mockStore.company = null
  })

  it('预算面板六字段齐全，金额用正符号，使用率按领域公式计算', () => {
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    for (const label of ['预算上限', '已承诺', '已花', '剩余额度', '预算使用率', '预计可用天数']) {
      expect(text).toContain(label)
    }
    // (committed + spent) / totalCap = 500000 / 1000000 = 50%
    expect(text).toContain('50.0%')
    // 正符号：已花 +$3,000 / 上限 +$10,000
    expect(text).toMatch(/\+\$[\d,]+/)
    // runwayDays 标注为估计值
    expect(text).toContain('估计值')
    expect(text).toContain('无法估算')
  })

  it('权威公式得负值 remainingCap 时标红并显示预算耗尽徽标', () => {
    // 权威公式 totalCap - committed - spent = 1,000,000 - 200,000 - 1,100,000 = -300,000
    mockStore.projects = [makeProject({ budgetSpentCents: 1_100_000 })]
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    expect(text).toContain('-$3,000')
    expect(text).toContain('预算耗尽')
  })

  it('耗尽横幅与手动暂停横幅图标/文案可区分', () => {
    const r1 = renderDetail()
    mockStore.projects = [makeProject({
      isPaused: true,
      budgetExhausted: true,
      pauseReason: 'budget_exhausted',
      pausedDays: 3,
    })]
    r1.unmount()
    const exhausted = renderDetail()
    let text = exhausted.container.textContent ?? ''
    expect(text).toContain('⚠')
    expect(text).toContain('预算已耗尽')
    expect(text).toContain('已连续暂停')
    exhausted.unmount()

    mockStore.projects = [makeProject({ isPaused: true, pauseReason: 'manual', pausedDays: 2 })]
    const manual = renderDetail()
    text = manual.container.textContent ?? ''
    expect(text).toContain('⏸')
    expect(text).toContain('项目已由你暂停')
    expect(text).not.toContain('预算已耗尽')
  })

  it('追加预算弹窗输入金额+原因后调用 topUpBudget 领域命令', () => {
    renderDetail()
    fireEvent.click(screen.getByText('追加预算'))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } })
    fireEvent.change(screen.getByPlaceholderText('例如：已签署发行协议'), {
      target: { value: '发行款到账' },
    })
    fireEvent.click(screen.getByText('确认追加'))
    expect(mockStore.topUpBudget).toHaveBeenCalledWith('p1', 50_000, '发行款到账')
  })

  it('已花点击下钻成本分摊明细', () => {
    mockStore.projects = [makeProject({
      budgetSpentCents: 600_000,
      costAllocations: [{
        id: 'COST-1',
        companyId: 'c1',
        projectId: 'p1',
        sourceType: 'salary',
        sourceRefId: 'e1',
        cashTransactionId: 'tx1',
        amountCents: 600_000,
        allocationRatio: 0.6,
        periodKey: 'm1970-1',
        idempotencyKey: 'k1',
        day: 30,
        description: '工资分摊',
        status: 'spent',
        version: 1,
        createdAt: 30,
        updatedAt: 30,
      }],
    })]
    const { container } = renderDetail()
    expect(screen.queryByText('成本分摊明细')).toBeNull()
    fireEvent.click(screen.getByTitle('成本分摊明细'))
    expect(screen.getByText('成本分摊明细')).toBeTruthy()
    expect(container.textContent).toContain('m1970-1')
    expect(container.textContent).toContain('工资')
  })

  it('财务页点击现金交易展开关联项目分摊并显示对账差额（一笔工资多项目）', () => {
    mockStore.transactions = [{
      id: 'tx1',
      day: 30,
      category: 'salary',
      description: '工资',
      amountCents: -1_000_000,
    }]
    mockStore.projects = [makeProject({
      name: 'Alpha',
      costAllocations: [
        {
          id: 'COST-1', companyId: 'c1', projectId: 'p1', sourceType: 'salary', sourceRefId: 'e1',
          cashTransactionId: 'tx1', amountCents: 600_000, allocationRatio: 0.6, periodKey: 'm1970-1',
          idempotencyKey: 'k1', day: 30, description: '工资分摊', status: 'spent', version: 1, createdAt: 30, updatedAt: 30,
        },
        {
          id: 'COST-2', companyId: 'c1', projectId: 'p2', sourceType: 'salary', sourceRefId: 'e1',
          cashTransactionId: 'tx1', amountCents: 400_000, allocationRatio: 0.4, periodKey: 'm1970-1',
          idempotencyKey: 'k2', day: 30, description: '工资分摊', status: 'spent', version: 1, createdAt: 30, updatedAt: 30,
        },
      ],
    })]
    const { container } = render(<Finance />)
    expect(screen.queryByText('项目成本归属')).toBeNull()
    const txRow = container.querySelector('tbody tr')!
    fireEvent.click(txRow)
    expect(screen.getByText('项目成本归属')).toBeTruthy()
    const text = container.textContent ?? ''
    expect(text).toContain('Alpha')
    expect(text).toContain('间接成本差额')
  })
})
