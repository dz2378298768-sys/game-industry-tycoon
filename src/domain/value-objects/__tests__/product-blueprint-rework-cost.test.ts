/**
 * §15.2 返工分档成本测试（T4 / TC-20）。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyReworkMode, computeReworkCost, isReworkCountExcessive,
} from '../product-blueprint-rework-cost'
import { withTuningOverrides } from '../product-blueprint-tuning'
import { tuning } from './product-blueprint-fixtures'

describe('§15.2 A/B/C/D/E 五类与 minimal/partial/full 三档', () => {
  it('A 元数据：成本 0，不返工', () => {
    const cost = computeReworkCost({ category: 'A', invested: 100, workDelta: 0, workTotal: 1000, newWork: 0 }, tuning())
    expect(cost.total).toBe(0)
    expect(cost.mode).toBe('minimal')
    expect(cost.sunk).toBe(0)
  })

  it('B 停用：已投入全额沉没 + 少量清理（reusable=0）', () => {
    const cost = computeReworkCost({ category: 'B', invested: 100, workDelta: -100, workTotal: 1000, newWork: 0 }, tuning())
    expect(cost.reusable).toBe(0)
    expect(cost.sunk).toBe(100)
    expect(cost.additionalWork).toBeCloseTo(5) // 100 × 0.05
    expect(cost.total).toBeGreaterThan(100)
  })

  it('缩减类变更（content tier 3→2）产生正沉没成本（任务卡验收项）', () => {
    const cost = computeReworkCost({ category: 'C', invested: 100, workDelta: -20, workTotal: 1000, newWork: 0 }, tuning())
    expect(cost.mode).toBe('minimal')
    expect(cost.reusable).toBeCloseTo(70) // minimal 档 70% 可复用
    expect(cost.sunk).toBeCloseTo(30)
    expect(cost.sunk).toBeGreaterThan(0)
  })

  it('C 参数调整：additional = |ΔW| × progress_d', () => {
    const cost = computeReworkCost({ category: 'C', invested: 50, workDelta: 200, workTotal: 1000, newWork: 0, progress: 0.5 }, tuning())
    expect(cost.additionalWork).toBeCloseTo(100)
    expect(cost.mode).toBe('partial')
  })

  it('D 新增：完整 W_d(新) + k_integ × W_d(新)；reusable 只作用已投入部分', () => {
    const cost = computeReworkCost({ category: 'D', invested: 0, workDelta: 300, workTotal: 1000, newWork: 300 }, tuning())
    expect(cost.additionalWork).toBeCloseTo(300 * 1.3)
    expect(cost.reusable).toBe(0) // 新增工作量不计入可复用
    expect(cost.total).toBe(cost.additionalWork)

    const withInvested = computeReworkCost({ category: 'D', invested: 40, workDelta: 300, workTotal: 1000, newWork: 300 }, tuning())
    expect(withInvested.reusable).toBeLessThanOrEqual(40) // 不超过已投入
  })

  it('E 定位变更：强制 full + k_reposition 全局惩罚', () => {
    const input = { category: 'E' as const, invested: 100, workDelta: 100, workTotal: 1000, newWork: 0 }
    expect(classifyReworkMode(input, tuning())).toBe('full')
    const cost = computeReworkCost(input, tuning())
    expect(cost.additionalWork).toBeCloseTo(100 + 0.25 * 1000)
    expect(cost.reusable).toBeCloseTo(20) // full 档 20% 可复用
  })

  it('档位阈值 10%/40% 与可复用比例可注入（TC-20，非硬编码）', () => {
    const input = { category: 'C' as const, invested: 100, workDelta: 450, workTotal: 1000, newWork: 0 }
    const defaultCost = computeReworkCost(input, tuning())
    expect(defaultCost.mode).toBe('full') // 45% > 40%
    const custom = computeReworkCost(input, withTuningOverrides({ reworkFullRatio: 0.5, reworkReusableRatio: { partial: 0.9 } }))
    expect(custom.mode).toBe('partial') // 45% ≤ 50%
    expect(custom.reusable).toBeCloseTo(90) // partial 档可复用比例被注入为 0.9
  })

  it('区间呈现：low/mid/high 按 Δ 生成，实际值推进时由 Project 落实', () => {
    const cost = computeReworkCost({ category: 'D', invested: 0, workDelta: 100, workTotal: 1000, newWork: 100 }, tuning())
    expect(cost.range.mid).toBe(cost.total)
    expect(cost.range.low).toBeCloseTo(cost.total * 0.75)
    expect(cost.range.high).toBeCloseTo(cost.total * 1.25)
  })

  it('§15.2 reworkCount ≥ k_rework_limit 提示（风险在 Project 侧计入）', () => {
    expect(isReworkCountExcessive(2, tuning())).toBe(false)
    expect(isReworkCountExcessive(3, tuning())).toBe(true)
    expect(isReworkCountExcessive(2, withTuningOverrides({ kReworkLimit: 2 }))).toBe(true)
  })
})
