/**
 * §6.2.1 HRB 单向可行性测试（ADJ-2026-11-21-01 / TC-05 / E-17 / R-08）。
 */
import { describe, it, expect } from 'vitest'
import { checkHrbFeasibility } from '../product-blueprint-hrb'
import { withTuningOverrides } from '../product-blueprint-tuning'
import { estimateWorkUnits, estimateFourChannels } from '../product-blueprint-estimation'
import { baseEstimationInput, tuning } from './product-blueprint-fixtures'

describe('§6.2.1 单向可行性检查', () => {
  it('ratio = Cost_est / (HRB × BudgetCapacity)；verdict 三档阈值', () => {
    const t = tuning()
    const feasible = checkHrbFeasibility(0.5, 1000, 400, t)
    expect(feasible.budgetCap).toBe(500)
    expect(feasible.ratio).toBeCloseTo(0.8)
    expect(feasible.verdict).toBe('feasible')

    const stretch = checkHrbFeasibility(0.5, 1000, 550, t)
    expect(stretch.verdict).toBe('need_more_budget_or_delay')
    const over = checkHrbFeasibility(0.5, 1000, 700, t)
    expect(over.verdict).toBe('need_reduce_scope_or_lower_goal')
  })

  it('阈值 1.0/1.2 可注入（TUNING 不硬编码）', () => {
    const t = withTuningOverrides({ hrbFeasibleRatioMax: 1.5, hrbStretchRatioMax: 2 })
    expect(checkHrbFeasibility(0.5, 1000, 700, t).verdict).toBe('feasible')
  })

  it('E-17：HRB=0 允许；Budget_cap=0 ⇒ ratio=+∞，只提示玩家决策', () => {
    const r = checkHrbFeasibility(0, 1000, 10, tuning())
    expect(r.budgetCap).toBe(0)
    expect(r.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(r.verdict).toBe('need_reduce_scope_or_lower_goal')
  })

  it('ADJ-01：HRB 不得反向缩放 W_d；预算不足不自动缩小工作量', () => {
    const workA = estimateWorkUnits(baseEstimationInput(), tuning())
    const workB = estimateWorkUnits(baseEstimationInput(), tuning())
    expect(workB.byDiscipline).toEqual(workA.byDiscipline)
    const feasible = checkHrbFeasibility(1, 1000, 900, tuning())
    const infeasible = checkHrbFeasibility(0.1, 1000, 900, tuning())
    // 成本估算由调用方传入，HRB 变化不改变 Cost_est，也不产生任何缩放字段
    expect(infeasible.costEst).toBe(feasible.costEst)
    expect(Object.keys(infeasible).join(',')).not.toContain('scaled')
  })

  it('OPEN-O5：输出不含 qualityCeilingBand；“降低质量目标”仅为文本提示，无数值带宽', () => {
    const r = checkHrbFeasibility(0.1, 1000, 900, tuning(), ['模块A', '选项B', '学科C', '模块D'])
    expect(Object.keys(r).join(',')).not.toContain('qualityCeilingBand')
    expect(r.reasons).toHaveLength(4) // 前三个成本驱动 + 一条文本提示
    expect(r.reasons[3]).toContain('降低质量目标')
  })

  it('四通道集合不含 HRB 字段（估算权威只由结构导出）', () => {
    const bundle = estimateFourChannels(baseEstimationInput(), tuning())
    expect(Object.keys(bundle).join(',')).not.toContain('hrb')
    expect(Object.keys(bundle).join(',')).not.toContain('qualityCeilingBand')
  })
})
