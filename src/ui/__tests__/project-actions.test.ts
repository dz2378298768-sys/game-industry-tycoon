import { describe, expect, it } from 'vitest'
import {
  selectProjectActionState,
  selectDescopeTiers,
  selectDelayTiers,
  selectRiskBadges,
} from '@ui/components/project-actions'
import { makeCompany, makeUiProject } from './fixtures'

describe('project-actions 纯逻辑（DESIGN-UI-LAYER §8：V3/V4/V5/V10）', () => {
  // V3：破产三维启用矩阵 —— 禁用追加预算，但保留砍范围/延期/上市等自救动作
  it('V3：破产禁用 topUp（含原因键），但 PRODUCTION 下 descope/delay 仍可用', () => {
    const project = makeUiProject({ phase: 'PRODUCTION', plannedLaunchDay: 200 })
    const bankrupt = makeCompany({ status: 'bankrupt' })
    const state = selectProjectActionState(project, bankrupt, 100)

    expect(state.topUp.enabled).toBe(false)
    expect(state.topUp.reasonKeys).toContain('finance.bankrupt.blocked.topUp')
    // 自救命令不被破产阻断
    expect(state.descope.enabled).toBe(true)
    expect(state.delay.enabled).toBe(true)
  })

  it('V3：非破产时 topUp 可用', () => {
    const state = selectProjectActionState(makeUiProject({ phase: 'PRODUCTION' }), makeCompany(), 0)
    expect(state.topUp.enabled).toBe(true)
    expect(state.topUp.reasonKeys).toEqual([])
  })

  // V4：descope 累计上限 50%（严格小于才允许，等于 0.5 仍允许，>0.5 禁用）
  it('V4：descope 累计已砍 40% 时，仅 10% 档可用，20%/30% 档超限禁用', () => {
    const tiers = selectDescopeTiers(makeUiProject({ scopeCutRatio: 0.4 }))
    expect(tiers.map((t) => t.enabled)).toEqual([true, false, false])
    expect(tiers[1]?.reasonKey).toBe('project.descope.maxReached')
    expect(tiers[2]?.reasonKey).toBe('project.descope.maxReached')
  })

  it('V4：descope 未砍过时三档全可用', () => {
    const tiers = selectDescopeTiers(makeUiProject({ scopeCutRatio: 0 }))
    expect(tiers.map((t) => t.enabled)).toEqual([true, true, true])
  })

  // V5：延期上限 = originalPlannedLaunchDay × 1.5
  it('V5：延期 plannedLaunchDay 100（original null）→ max 150，仅 30 天档可用', () => {
    const tiers = selectDelayTiers(makeUiProject({ plannedLaunchDay: 100, originalPlannedLaunchDay: null }))
    expect(tiers.map((t) => t.enabled)).toEqual([true, false, false])
  })

  // V10：风险徽标数值化 + 统一排序
  it('V10：徽标按 RISK_ORDER 排序，砍范围/延期带数值', () => {
    const badges = selectRiskBadges(
      makeUiProject({
        scopeCutRatio: 0.3,
        launchDelayDays: 60,
        riskFlags: ['budget_exhausted', 'launch_delayed', 'scope_descoped'],
      }),
    )
    expect(badges.map((b) => b.flag)).toEqual(['scope_descoped', 'launch_delayed', 'budget_exhausted'])
    const [scope, delay] = badges
    expect(scope?.key).toBe('project.risk.scope_descoped')
    expect(scope?.placeholder).toBe('{pct}')
    expect(scope?.value).toBe(30)
    expect(delay?.key).toBe('project.risk.launch_delayed')
    expect(delay?.placeholder).toBe('{days}')
    expect(delay?.value).toBe(60)
  })

  it('V10：有 flag 但数值为 0（旧存档缺失）时回退 risk.generic 键', () => {
    const badges = selectRiskBadges(makeUiProject({ scopeCutRatio: 0, riskFlags: ['scope_descoped'] }))
    expect(badges.map((b) => b.key)).toContain('project.risk.generic')
  })
})
