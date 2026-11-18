import { describe, it, expect } from 'vitest'
import { createBudget, recomputeRemaining, budgetUsageRatio } from '../project-budget'
import type { ProjectBudget } from '../project-budget'

const make = (totalCapCents: number, committedCents: number, spentCents: number): ProjectBudget => ({
  totalCapCents,
  committedCents,
  spentCents,
  remainingCapCents: 0, // 由 recomputeRemaining 计算
})

describe('G05 预算权威公式（G05-R1 / G05-R2）', () => {
  it('权威公式：remainingCap = totalCap - committed - spent，usageRatio = (committed+spent)/totalCap', () => {
    const b = recomputeRemaining(make(1_000_000, 200_000, 300_000))
    expect(b.remainingCapCents).toBe(500_000)
    expect(budgetUsageRatio(b)).toBe(0.5)
  })

  it('旧公式回归防护（Δ-07）：remainingCap 不得等于 totalCap - committed', () => {
    const b = recomputeRemaining(make(1_000_000, 200_000, 300_000))
    expect(b.remainingCapCents).not.toBe(1_000_000 - 200_000) // 不得为 800_000
  })

  it('remainingCap 可为负（超支）', () => {
    const b = recomputeRemaining(make(100, 80, 50))
    expect(b.remainingCapCents).toBe(-30)
  })

  it('budgetUsageRatio：totalCap=0 时返回 0（避免除零）', () => {
    expect(budgetUsageRatio(make(0, 100, 200))).toBe(0)
  })

  it('budgetUsageRatio：committed 或 spent 增大时单调不减', () => {
    const base = make(1_000_000, 100_000, 100_000)
    const moreCommitted = make(1_000_000, 200_000, 100_000)
    const moreSpent = make(1_000_000, 100_000, 200_000)
    expect(budgetUsageRatio(moreCommitted)).toBeGreaterThan(budgetUsageRatio(base))
    expect(budgetUsageRatio(moreSpent)).toBeGreaterThan(budgetUsageRatio(base))
  })

  it('createBudget 初始化：committed/spent 为 0，remainingCap = totalCap', () => {
    const b = createBudget(1_000_000)
    expect(b).toEqual({
      totalCapCents: 1_000_000,
      committedCents: 0,
      spentCents: 0,
      remainingCapCents: 1_000_000,
    })
    expect(budgetUsageRatio(b)).toBe(0)
  })
})
