/**
 * M3-A2 用例：AI 月度决策器（A01/A02/A05/A06）。
 * A03 克隆对照的完整长跑在 M3-A3，这里做同 seed 双世界等价性快照。
 */
import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { planAiMonth, type AiCompanyView } from '@simulation/ai/ai-planner'

function view(overrides: Partial<AiCompanyView> = {}): AiCompanyView {
  return {
    id: 'ai-1',
    persona: 'indie',
    status: 'active',
    cashCents: 80_000_00,
    monthlyFixedExpenseCents: 5_000_00,
    brand: 10,
    project: null,
    products: [],
    ...overrides,
  }
}

describe('AI 月度决策 — 纯函数', () => {
  it('A05 破产公司只允许 DO_NOTHING', () => {
    const plan = planAiMonth(view({ status: 'bankrupt', cashCents: -100_00 }), 30)
    expect(plan.chosen).toBe('DO_NOTHING')
    expect(plan.reason).toContain('破产')
    expect(plan.candidates.every((c) => c.action === 'DO_NOTHING' || c.action.startsWith('DO'))).toBe(true)
  })

  it('A05 现金低于三个月固定支出 → 立项被硬约束拒绝', () => {
    const plan = planAiMonth(view({ cashCents: 10_000_00, monthlyFixedExpenseCents: 5_000_00 }), 30)
    expect(plan.chosen).toBe('DO_NOTHING')
    const start = plan.candidates.find((c) => c.action === 'START_PROJECT')
    expect(start?.pass).toBe(false)
    expect(start?.failedConstraints).toContain('CASH_RESERVE')
  })

  it('A06 无项目且储备充足 → 立项；READY → 上市；未定价 → 定价', () => {
    expect(planAiMonth(view(), 30).chosen).toBe('START_PROJECT')
    expect(
      planAiMonth(view({ project: { id: 'p1', phase: 'READY_TO_LAUNCH', isPaused: false, plannedLaunchDay: 10 } }), 30).chosen,
    ).toBe('LAUNCH')
    expect(
      planAiMonth(
        view({ project: { id: 'p1', phase: 'READY_TO_LAUNCH', isPaused: false, plannedLaunchDay: 300 } }),
        30,
      ).chosen,
    ).toBe('DO_NOTHING')
    expect(
      planAiMonth(
        view({
          project: { id: 'p1', phase: 'PRODUCTION', isPaused: false, plannedLaunchDay: 300 },
          products: [{ id: 'prod1', priceCents: null, status: 'active', launchDay: 10 }],
        }),
        30,
      ).chosen,
    ).toBe('SET_PRICE')
  })

  it('T5 LAUNCH 必带价格与平台，START 内容随 seed 变化', () => {
    const launch = planAiMonth(
      view({
        project: {
          id: 'p1',
          phase: 'READY_TO_LAUNCH',
          isPaused: false,
          plannedLaunchDay: 10,
          genreId: 'action',
          platformIds: ['arcade_pre_1975'],
          segmentIds: ['arcade_enthusiasts'],
        },
      }),
      30,
    )
    expect(launch.params.action).toBe('LAUNCH')
    if (launch.params.action === 'LAUNCH') {
      expect(launch.params.priceCents).toBeGreaterThan(0)
      expect(launch.params.platformIds).toEqual(['arcade_pre_1975'])
    }

    const starts = [1, 2, 3, 4, 5].map((seed) => planAiMonth(view(), 30, seed).params)
    const signatures = new Set(starts.map((p) => JSON.stringify(p)))
    expect(signatures.size).toBeGreaterThan(1)
  })

  it('T5 已上市未投放产品会开营销，预算在允许区间', () => {
    const plan = planAiMonth(
      view({
        project: { id: 'p1', phase: 'PRODUCTION', isPaused: false, plannedLaunchDay: 300 },
        products: [
          {
            id: 'prod1',
            priceCents: 2999,
            status: 'active',
            launchDay: 10,
            activeCampaignCount: 0,
            genreId: 'action',
          },
        ],
      }),
      30,
      7,
    )
    expect(plan.chosen).toBe('SET_MARKETING')
    if (plan.params.action === 'SET_MARKETING') {
      expect(['social', 'expo', 'ads']).toContain(plan.params.channel)
      expect(plan.params.dailyBudgetCents).toBeGreaterThanOrEqual(1000)
      expect(plan.params.dailyBudgetCents).toBeLessThanOrEqual(500_000)
    }
  })

  it('A01 纯函数确定性：同输入同输出（含候选明细）', () => {
    const a = planAiMonth(view({ brand: 22 }), 61)
    const b = planAiMonth(view({ brand: 22 }), 61)
    expect(a).toEqual(b)
  })
})

describe('AI 月度决策 — 运行时', () => {
  it('A01/A02 同 seed 双世界 AI 决策与现金一致；记录含候选与理由', () => {
    const a = createGameWorld(42, { aiCompetition: true })
    const b = createGameWorld(42, { aiCompetition: true })
    a.advanceSimulation(400)
    b.advanceSimulation(400)

    const recordsA = a.getAiDecisions()
    expect(recordsA.length).toBeGreaterThan(0)
    expect(recordsA[0]?.inputsDigest).toBeDefined()
    expect(recordsA[0]?.candidates.length).toBeGreaterThan(0)

    const aiIds = a.world.companies.filter((c) => !c.isPlayer).map((c) => c.id)
    expect(aiIds.length).toBeGreaterThan(0)
    for (const id of aiIds) {
      expect(b.finance.getCashBalance(id)).toBe(a.finance.getCashBalance(id))
    }
    const simplifiedA = recordsA.map((r) => `${r.companyId}|${r.day}|${r.chosen}`)
    const simplifiedB = b.getAiDecisions().map((r) => `${r.companyId}|${r.day}|${r.chosen}`)
    expect(simplifiedB).toEqual(simplifiedA)
  })

  it('A02 AI 产品进入统一销售管线：有销量且账实相符', () => {
    const gw = createGameWorld(7, { aiCompetition: true })
    gw.advanceSimulation(500)
    const aiProducts = gw.world.products.filter((p) => {
      const company = gw.world.companies.find((c) => c.id === p.companyId)
      return company !== undefined && !company.isPlayer
    })
    expect(aiProducts.length).toBeGreaterThan(0)
    const aiCompanyIds = gw.world.companies.filter((c) => !c.isPlayer).map((c) => c.id)
    const salesTx = aiCompanyIds.flatMap((id) =>
      gw.finance.getTransactionsByCompany(id).filter((t) => t.category === 'sales_revenue'),
    )
    expect(salesTx.length).toBeGreaterThan(0)

    for (const company of gw.world.companies.filter((c) => !c.isPlayer)) {
      const ledger = gw.finance.getTransactionsByCompany(company.id).reduce((sum, t) => sum + t.amountCents, 0)
      expect(gw.finance.getCashBalance(company.id)).toBe(ledger)
    }
  })
})
