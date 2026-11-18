import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 受控 mock 隔离 store，专注 001-E 整改的展示口径（runway / 金额符号 / 恢复入口）；
// seq 推导、错误码、恢复提示走真实 store（见 budget-store-fix.test.ts）
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
import type { Project } from '@domain/entities/project'
import type { ProjectCostAllocation } from '@domain/entities/project-cost-allocation'

function makeAllocation(overrides: Partial<ProjectCostAllocation> = {}): ProjectCostAllocation {
  return {
    id: 'COST-1',
    companyId: 'c1',
    projectId: 'p1',
    sourceType: 'salary',
    sourceRefId: 'e1',
    cashTransactionId: 'tx1',
    amountCents: 1_000,
    allocationRatio: 1,
    periodKey: 'm1970-1',
    idempotencyKey: 'k1',
    day: 90,
    description: '工资分摊',
    status: 'spent',
    version: 1,
    createdAt: 90,
    updatedAt: 90,
    ...overrides,
  }
}

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

describe('TASK-M1.1-G05-001-E-FIX 预算面板显示口径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.dayIndex = 100
    mockStore.projects = [makeProject()]
    mockStore.transactions = []
    mockStore.company = null
  })

  // T6a runway 有值分支：3 条近 30 天分摊合计 3000 分、span=30 → daily=100，remaining=1000 → 10 天
  it('runway 有支出记录时显示 N 天与计算日，不再声称无法估算', () => {
    mockStore.projects = [makeProject({
      budgetTotalCapCents: 1_000_000,
      budgetCommittedCents: 0,
      budgetSpentCents: 999_000,
      costAllocations: [
        makeAllocation({ id: 'C1', day: 90, amountCents: 1_000 }),
        makeAllocation({ id: 'C2', day: 95, amountCents: 1_000 }),
        makeAllocation({ id: 'C3', day: 100, amountCents: 1_000 }),
      ],
    })]
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    expect(text).toContain('10 天')
    expect(text).toContain('估计值')
    expect(text).toContain('计算于第 100 天')
    expect(text).not.toContain('暂无法估算')
  })

  // T6b runway 无值分支：无分摊 → dailyBurn=0 → null → 明确"尚无支出记录"，且不得出现天数
  it('runway 无支出记录时显示暂无法估算（尚无支出记录）', () => {
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    expect(text).toContain('暂无法估算（尚无支出记录）')
    expect(text).not.toContain('计算于第')
    // 不得在无计算时出现"30 天"字样
    expect(text).not.toContain('30 天')
  })

  // T7 金额口径：cap 不带正号；|remaining|<100 分时保留分精度
  it('预算面板金额不带正号，剩余额度 40 分时显示 $0.40', () => {
    mockStore.projects = [makeProject({
      budgetTotalCapCents: 1_000_000,
      budgetCommittedCents: 0,
      budgetSpentCents: 999_960,
    })]
    const { container } = renderDetail()
    const text = container.textContent ?? ''
    expect(text).toContain('$10,000')
    expect(text).not.toMatch(/\+\$/)
    expect(text).toContain('$0.40')
    // 剩余 40 分 > 0，不显示耗尽徽标；徽标判定走分精度而非显示值
    expect(text).not.toContain('预算耗尽')
  })

  // T5a 耗尽态点击【恢复项目】触发 store.resumeProject
  it('耗尽横幅点击恢复项目调用 resumeProject', () => {
    mockStore.projects = [makeProject({
      isPaused: true,
      budgetExhausted: true,
      pauseReason: 'budget_exhausted',
      pausedDays: 3,
    })]
    const { container } = renderDetail()
    const resumeButtons = screen.getAllByText('恢复项目')
    expect(resumeButtons.length).toBeGreaterThan(0)
    fireEvent.click(resumeButtons[0]!)
    expect(mockStore.resumeProject).toHaveBeenCalledWith('p1')
    expect(container.textContent).toContain('预算已耗尽')
  })
})
