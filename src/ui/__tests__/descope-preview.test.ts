import { describe, expect, it } from 'vitest'
import { computeDescopePreview } from '@ui/components/descope-preview'
import { formatMoneyDisplay } from '@ui/components/money-format'
import { makeUiProject } from './fixtures'

describe('descope 预览与金额格式（DESIGN-C-01 §3.2 / V20~V22）', () => {
  const daily = { design: 5, programming: 5, art: 5, qa: 5 }

  it('预览按比例缩减 total/remaining，质量上限先乘后取整', () => {
    const preview = computeDescopePreview(makeUiProject(), daily, 0.2, 10_000)
    expect(preview.newTotal.design).toBe(80)
    expect(preview.newRemaining.design).toBe(80)
    expect(preview.qualityCeiling).toBe(54)
    expect(preview.newQuality.gameplay).toBe(54)
    expect(preview.savedDays).toBe(4)
    expect(preview.savedBudgetCents).toBe(40_000)
    expect(preview.qaReset).toBe(false)
  })

  it('QA 阶段不回滚工作但质量重掷，节省天数/预算为 null', () => {
    const preview = computeDescopePreview(makeUiProject({ phase: 'QA' }), daily, 0.1, 10_000)
    expect(preview.savedDays).toBeNull()
    expect(preview.savedBudgetCents).toBeNull()
    expect(preview.qaReset).toBe(true)
  })

  it('无日产出时节省天数为 null（展示 -）', () => {
    const preview = computeDescopePreview(makeUiProject(), { design: 0, programming: 5, art: 5, qa: 5 }, 0.1, 10_000)
    expect(preview.savedDays).toBeNull()
    expect(preview.savedBudgetCents).toBeNull()
  })

  it('金额规则：0 → $0，|值|<$1 → <$1 / -<$1，其余整数美元', () => {
    expect(formatMoneyDisplay(0)).toBe('$0')
    expect(formatMoneyDisplay(99)).toBe('<$1')
    expect(formatMoneyDisplay(-99)).toBe('-<$1')
    expect(formatMoneyDisplay(100)).toBe('$1')
    expect(formatMoneyDisplay(-150_000)).toBe('-$1,500')
  })
})
