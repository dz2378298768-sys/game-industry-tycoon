/**
 * §6.5 返工分段公式测试（C1）。
 * 覆盖 TC-12（档位阈值与 80→50 缩减）、B 类全额沉没、D 类新增全额、E 类全局惩罚、TC-21 场景 B 数值。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyReworkModeByRatio,
  computeChangeWorkUnits,
  computeReworkCostBreakdown,
  computeReworkWorkUnits,
  estimateReworkCostRange,
} from '@domain/value-objects/project-execution-rework'
import { params } from './project-execution-fixtures'

const p = params()

describe('TC-12 档位阈值：δ=0.09 minimal / 0.10 partial / 0.40 partial / 0.41 full / E ⇒ full', () => {
  it('阈值边界与 D-01 §15.2 一致（TUNING 10%/40%）', () => {
    expect(classifyReworkModeByRatio('C', 0.09, p)).toBe('minimal')
    expect(classifyReworkModeByRatio('C', 0.1, p)).toBe('partial')
    expect(classifyReworkModeByRatio('C', 0.4, p)).toBe('partial')
    expect(classifyReworkModeByRatio('C', 0.41, p)).toBe('full')
    expect(classifyReworkModeByRatio('E', 0.01, p)).toBe('full')
    expect(classifyReworkModeByRatio('A', 0.9, p)).toBe('minimal')
  })
})

describe('C1 场景 B 复现：content tier 3→2（C 类缩减，80→50，progress=0.6，W_total=100）', () => {
  const input = {
    category: 'C' as const,
    workTotal: 100,
    affected: [{ instanceId: 'PACK', discipline: 'art' as const, oldWorkUnits: 80, deliveredWorkUnits: 48, newWorkUnits: 50 }],
  }
  it('W_change = |50−80| × 0.6 = 18 ⇒ δ=0.18 ⇒ partial（不再是恒 0）', () => {
    expect(computeChangeWorkUnits(input, p)).toBeCloseTo(18, 9)
    const b = computeReworkCostBreakdown(input, p)
    expect(b.changeRatio).toBeCloseTo(0.18, 9)
    expect(b.mode).toBe('partial')
  })
  it('reworkWorkUnits = 18 × (1 − 0.5) = 9 > 0（partial 档无 k_clean）', () => {
    const b = computeReworkCostBreakdown(input, p)
    expect(b.reworkWorkUnits).toBeCloseTo(9, 9)
    expect(b.reworkWorkUnits).toBeGreaterThan(0)
  })
  it('正沉没：invested=48，reusable=24，sunk=24 > 0', () => {
    const b = computeReworkCostBreakdown(input, p)
    expect(b.investedWorkUnits).toBeCloseTo(48, 9)
    expect(b.reusableWorkUnits).toBeCloseTo(24, 9)
    expect(b.sunkWorkUnits).toBeCloseTo(24, 9)
    expect(b.sunkWorkUnits).toBeGreaterThan(0)
  })
  it('lowCents / highCents 均 > 0（区间估算，不锁死 actual）', () => {
    const b = computeReworkCostBreakdown(input, p)
    const r = estimateReworkCostRange(b.reworkWorkUnits, [20_000], p)
    expect(r.lowCents).toBeGreaterThan(0)
    expect(r.highCents).toBeGreaterThan(r.lowCents)
    expect(r.lowCents).toBe(Math.round(9 * 20_000 * 0.8))
    expect(r.highCents).toBe(Math.round(9 * 20_000 * 1.2))
  })
})

describe('B 类停用：已投入全额沉没，reusable 不适用', () => {
  const input = {
    category: 'B' as const,
    workTotal: 200,
    affected: [{ instanceId: 'M', discipline: 'code' as const, oldWorkUnits: 100, deliveredWorkUnits: 60, newWorkUnits: 0 }],
  }
  it('W_change = invested = 60；reworkWorkUnits = 60 × 1.05（含 k_clean）', () => {
    expect(computeChangeWorkUnits(input, p)).toBeCloseTo(60, 9)
    const b = computeReworkCostBreakdown(input, p)
    expect(b.mode).toBe('partial') // δ = 60/200 = 0.3 ∈ (0.1, 0.4]
    expect(b.reworkWorkUnits).toBeCloseTo(60 + 0.05 * 60, 9)
    expect(b.reusableWorkUnits).toBe(0)
    expect(b.sunkWorkUnits).toBeCloseTo(60, 9)
  })
  it('不论档位，B 类都不乘 reusable', () => {
    for (const mode of ['minimal', 'partial', 'full'] as const) {
      expect(computeReworkWorkUnits(input, mode, 60, p)).toBeCloseTo(63, 9)
    }
  })
})

describe('D 类新增：完整 W_d(新) + k_integ×W_d(新)，reusable 不适用', () => {
  const input = {
    category: 'D' as const,
    workTotal: 1000,
    affected: [{ instanceId: 'NEW', discipline: 'code' as const, oldWorkUnits: 0, deliveredWorkUnits: 0, newWorkUnits: 300 }],
  }
  it('W_change = 300 × (1 + 0.3) = 390；reworkWorkUnits = 390', () => {
    expect(computeChangeWorkUnits(input, p)).toBeCloseTo(390, 9)
    const b = computeReworkCostBreakdown(input, p)
    expect(b.mode).toBe('partial') // δ = 390/1000 = 0.39 ≤ 0.4
    expect(b.reworkWorkUnits).toBeCloseTo(390, 9)
    expect(b.reusableWorkUnits).toBe(0)
  })
})

describe('E 类定位变更：强制 full + k_reposition 全局惩罚不返还', () => {
  const input = {
    category: 'E' as const,
    workTotal: 1000,
    affected: [{ instanceId: 'X', discipline: 'code' as const, oldWorkUnits: 100, deliveredWorkUnits: 50, newWorkUnits: 200 }],
  }
  it('W_change = 100×0.5 + 0.25×1000 = 300；reworkWorkUnits = (300−250)×0.8 + 250', () => {
    const wc = computeChangeWorkUnits(input, p)
    expect(wc).toBeCloseTo(300, 9)
    const b = computeReworkCostBreakdown(input, p)
    expect(b.mode).toBe('full')
    expect(b.reworkWorkUnits).toBeCloseTo((300 - 250) * 0.8 + 250, 9)
    // 全局惩罚 250 全额计入（不返还）
    expect(b.reworkWorkUnits).toBeGreaterThanOrEqual(250)
  })
})

describe('边界：A 元数据不返工；W_total=0 时分母取 ε；无团队时区间为 +∞', () => {
  it('A 类成本 0', () => {
    const b = computeReworkCostBreakdown(
      { category: 'A', workTotal: 100, affected: [{ instanceId: 'a', discipline: 'design' as const, oldWorkUnits: 10, deliveredWorkUnits: 10, newWorkUnits: 10 }] },
      p,
    )
    expect(b.changeWorkUnits).toBe(0)
    expect(b.reworkWorkUnits).toBe(0)
    expect(b.sunkWorkUnits).toBe(0)
  })
  it('costPerUnit 全 +∞（团队=0）⇒ 区间两端 +∞（不伪造）', () => {
    const r = estimateReworkCostRange(9, [Number.POSITIVE_INFINITY], p)
    expect(r.lowCents).toBe(Number.POSITIVE_INFINITY)
    expect(r.highCents).toBe(Number.POSITIVE_INFINITY)
  })
  it('reworkWorkUnits=0 ⇒ 区间 0', () => {
    expect(estimateReworkCostRange(0, [100], p)).toEqual({ lowCents: 0, highCents: 0 })
  })
})
