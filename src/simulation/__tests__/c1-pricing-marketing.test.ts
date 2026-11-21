/**
 * C1-T7：真实质量定价、上市前营销、需求池切换。
 * 对应 DECISION-M3-C1-001 v1.3 §6、E08–E09。
 */
import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { suggestedPriceCents } from '@simulation/ai/ai-planner'
import { referencePriceCents } from '@content/c1-content'

describe('C1 Stage 3 — 定价', () => {
  it('P01 上市价使用真实质量，落在参考价 0.5–1.5 倍内', () => {
    const params = {
      genreId: 'action',
      platformId: 'arcade_pre_1975',
      segmentId: 'arcade_enthusiasts',
      companyId: 'ai-1',
      day: 30,
      seed: 7,
    }
    const low = suggestedPriceCents({ ...params, qualityScore: 40 })
    const high = suggestedPriceCents({ ...params, qualityScore: 90 })
    const ref = referencePriceCents(params.genreId, params.platformId, params.segmentId)
    expect(low).toBeGreaterThanOrEqual(Math.floor(ref * 0.5))
    expect(high).toBeLessThanOrEqual(Math.ceil(ref * 1.5))
    expect(high).toBeGreaterThan(low)
  })
})

describe('C1 Stage 3 — 运行时', () => {
  it('P02 AI 产品上市价非 null、有 scope 认知度、需求池有销量', () => {
    const gw = createGameWorld(11, { aiCompetition: true })
    gw.advanceSimulation(550)
    const aiProducts = gw.world.products.filter((p) => {
      const c = gw.world.companies.find((x) => x.id === p.companyId)
      return c !== undefined && !c.isPlayer && p.status === 'active'
    })
    expect(aiProducts.length).toBeGreaterThan(0)
    for (const product of aiProducts) {
      expect(product.launchPriceCents).not.toBeNull()
      if (product.launchDay <= 500) {
        expect(Object.keys(product.awarenessByScope ?? {}).length).toBeGreaterThan(0)
      }
    }
    const aiIds = gw.world.companies.filter((c) => !c.isPlayer).map((c) => c.id)
    const sales = aiIds.flatMap((id) =>
      gw.finance.getTransactionsByCompany(id).filter((t) => t.category === 'sales_revenue'),
    )
    expect(sales.length).toBeGreaterThan(0)
  })

  it('P03 上市前投放有财务流水，并累计到项目 launchMarketingSpentCents', () => {
    const gw = createGameWorld(23, { aiCompetition: true })
    gw.advanceSimulation(700)
    const prelaunchTx = gw.world.companies
      .filter((c) => !c.isPlayer)
      .flatMap((c) => gw.finance.getTransactionsByCompany(c.id))
      .filter((t) => t.description?.includes('上市前营销') === true)
    expect(prelaunchTx.length).toBeGreaterThan(0)
    const spentProjects = gw.world.projects.filter((p) => (p.launchMarketingSpentCents ?? 0) > 0)
    expect(spentProjects.length).toBeGreaterThan(0)
  })
})
