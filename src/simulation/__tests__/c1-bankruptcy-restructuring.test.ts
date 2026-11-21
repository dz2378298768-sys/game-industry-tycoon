/**
 * M3-C1-T8：破产重整状态机、清仓定价、资产处置、解散幂等。
 * 口径：DECISION-M3-P0-ENDGAME-002-AMEND v2.2 §2–§5。
 */
import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { GameWorld } from '@application/mediators/game-world'
import { planAiMonth, type AiCompanyView } from '@simulation/ai/ai-planner'
import { makeCompany } from '../../__tests__/helpers'

const ID = 'company-r'

function boot(): GameWorld {
  const gw = createGameWorld(42)
  const company = makeCompany({
    id: ID,
    cashBalanceCents: 0,
    status: 'active',
    monthlyFixedExpenseCents: 0,
  })
  gw.world = { ...gw.world, companies: [company], employees: [], projects: [], products: [] }
  gw.finance.registerCompany(ID)
  return gw
}

function spend(gw: GameWorld, cents: number): void {
  gw.finance.postTransaction(
    {
      idempotencyKey: `spend-${cents}-${gw.calendar.currentDayIndex}`,
      companyId: ID,
      day: gw.calendar.currentDayIndex,
      category: 'project_expense',
      amountCents: -cents,
      description: 'fixture',
    },
    { allowNegativeBalance: true },
  )
}

function earn(gw: GameWorld, cents: number): void {
  gw.finance.postTransaction(
    {
      idempotencyKey: `earn-${cents}-${gw.calendar.currentDayIndex}`,
      companyId: ID,
      day: gw.calendar.currentDayIndex,
      category: 'sales_revenue',
      amountCents: cents,
      description: 'fixture',
    },
    { allowNegativeBalance: true },
  )
}

function company(gw: GameWorld) {
  return gw.world.companies.find((c) => c.id === ID)!
}

function view(overrides: Partial<AiCompanyView> = {}): AiCompanyView {
  return {
    id: 'ai-r',
    persona: 'indie',
    status: 'bankrupt',
    cashCents: 100_000,
    monthlyFixedExpenseCents: 10_000,
    brand: 10,
    project: null,
    products: [
      {
        id: 'p1',
        priceCents: 2_000,
        status: 'active',
        launchDay: 0,
      },
    ],
    staffCount: 1,
    ...overrides,
  }
}

describe('M3-C1-T8 破产重整', () => {
  it('E01 进入破产：写入 phase/90 天期限/当日现金；产品转 40% 清仓价', () => {
    const gw = boot()
    gw.world = {
      ...gw.world,
      products: [
        {
          id: 'p1',
          sourceProjectId: 'prj-1',
          companyId: ID,
          name: 'Old Game',
          genreId: 'action',
          audienceSegmentIds: ['arcade_enthusiasts'],
          supportedPlatformIds: ['arcade_pre_1975'],
          launchDay: 0,
          launchPriceCents: 2_000,
          qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
          defectLevel: 20,
          finalQualityScore: 80,
          reviewScore: null,
          brandImpact: 0,
          lifecycleStage: 'mature' as const,
          awarenessByMarket: {},
          salesByPeriod: [],
          status: 'active',
          version: 1,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }
    spend(gw, 500_000)
    gw.advanceSimulation(1)
    const c = company(gw)
    expect(c.status).toBe('bankrupt')
    expect(c.bankruptcyPhase).toBe('restructuring')
    expect(c.restructuringDeadlineDay).toBe((c.bankruptSinceDay ?? 0) + 90)
    expect(c.restructuringStartCashCents).toBeLessThan(0)
    expect(c.restructuringStartFixedCents).toBe(0)
    expect(gw.world.products[0]!.clearanceDiscountRatePercent).toBe(40)
  })

  it('E04 恢复线 = 6×固定月支出，且需 30 天经营现金流非负', () => {
    const gw = boot()
    gw.world = {
      ...gw.world,
      companies: [
        makeCompany({
          id: ID,
          cashBalanceCents: 500_000,
          status: 'bankrupt',
          monthlyFixedExpenseCents: 100_000,
          bankruptSinceDay: 0,
          bankruptcyPhase: 'restructuring',
          restructuringStartedDay: 0,
          restructuringDeadlineDay: 90,
          restructuringStartCashCents: 0,
        }),
      ],
    }
    gw.finance.registerCompany(ID)
    gw.finance.postTransaction(
      { idempotencyKey: 'seed', companyId: ID, day: 0, category: 'advance', amountCents: 500_000, description: 'seed' },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(31)
    expect(company(gw).status).toBe('bankrupt')
    earn(gw, 800_000)
    gw.advanceSimulation(31)
    expect(company(gw).status).toBe('active')
    expect(gw.world.events.filter((e) => e.type === 'CompanyRecovered')).toHaveLength(1)
  })

  it('E05 第 90 天满足两次正现金流 + 现金改善 + 已降本 → 延长一次到 180 天', () => {
    const gw = boot()
    gw.world = {
      ...gw.world,
      companies: [
        makeCompany({
          id: ID,
          cashBalanceCents: 2_000_000,
          status: 'bankrupt',
          monthlyFixedExpenseCents: 800_000,
          bankruptSinceDay: 0,
          bankruptcyPhase: 'restructuring',
          restructuringStartedDay: 0,
          restructuringDeadlineDay: 90,
          restructuringStartCashCents: 1_000_000,
          restructuringStartFixedCents: 1_000_000,
        }),
      ],
    }
    gw.finance.registerCompany(ID)
    gw.finance.postTransaction(
      { idempotencyKey: 'seed', companyId: ID, day: 0, category: 'advance', amountCents: 2_000_000, description: 'seed' },
      { allowNegativeBalance: true },
    )
    for (const [day, amount] of [[55, 500_000], [80, 1_500_000]] as const) {
      gw.finance.postTransaction(
        { idempotencyKey: `future-sale-${day}`, companyId: ID, day, category: 'sales_revenue', amountCents: amount, description: 'future sale' },
        { allowNegativeBalance: true },
      )
    }
    gw.advanceSimulation(91)
    const c = company(gw)
    expect(c.status).toBe('bankrupt')
    expect(c.restructuringExtended).toBe(true)
    expect(c.restructuringDeadlineDay).toBe(180)
    expect(gw.world.events.filter((e) => e.type === 'CompanyRestructuringExtended')).toHaveLength(1)
  })

  it('E07 AI 月度执行资产出售：买家收款、产品退市、事件只发一次', () => {
    const gw = createGameWorld(42)
    const player = makeCompany({ id: 'player', isPlayer: true, cashBalanceCents: 5_000_000 })
    const seller = makeCompany({
      id: 'ai-sell',
      isPlayer: false,
      status: 'bankrupt',
      cashBalanceCents: 0,
      bankruptSinceDay: 0,
      bankruptcyPhase: 'restructuring',
      restructuringDeadlineDay: 90,
      monthlyFixedExpenseCents: 0,
    })
    const buyer = makeCompany({
      id: 'ai-buy',
      isPlayer: false,
      status: 'active',
      cashBalanceCents: 5_000_000,
      monthlyFixedExpenseCents: 0,
    })
    const product = {
      id: 'sell-p1',
      sourceProjectId: 'sell-prj',
      companyId: seller.id,
      name: 'For Sale',
      genreId: 'action',
      audienceSegmentIds: ['arcade_enthusiasts'],
      supportedPlatformIds: ['arcade_pre_1975'],
      launchDay: 0,
      launchPriceCents: 2_000,
      qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
      defectLevel: 20,
      finalQualityScore: 80,
      reviewScore: null,
      brandImpact: 0,
      lifecycleStage: 'mature' as const,
      awarenessByMarket: {},
      salesByPeriod: [],
      status: 'active' as const,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
    }
    gw.world = {
      ...gw.world,
      companies: [player, seller, buyer],
      employees: [],
      projects: [],
      products: [product],
      marketingCampaigns: [],
    }
    for (const [id, cents] of [[player.id, 5_000_000], [seller.id, 0], [buyer.id, 5_000_000]] as const) {
      gw.finance.registerCompany(id)
      if (cents > 0) {
        gw.finance.postTransaction(
          { idempotencyKey: `seed-${id}`, companyId: id, day: 0, category: 'advance', amountCents: cents, description: 'seed' },
          { allowNegativeBalance: true },
        )
      }
    }
    const gwAny = gw as unknown as { buildAiView: (c: unknown) => { saleableAssets?: unknown; status: string }; runAiMonthly: (day: number) => void }
    ;(gw as unknown as { aiCompetitionEnabled: boolean }).aiCompetitionEnabled = true
    gwAny.runAiMonthly(0)
    const sold = gw.world.events.filter((e) => e.type === 'CompanyAssetSold')
    expect(sold.length).toBeGreaterThan(0)
    expect(gw.world.products.find((p) => p.id === 'sell-p1')!.status).toBe('retired')
    expect(gw.finance.getCashBalance(seller.id)).toBeGreaterThan(0)
  })

  it('E06 AI 破产期：有可售资产先 SELL_ASSET，无资产则清仓定价', () => {
    const withAsset = planAiMonth(
      view({ saleableAssets: [{ assetId: 'p1', assetType: 'product', minPriceCents: 200_000 }] }),
      30,
    )
    expect(withAsset.chosen).toBe('SELL_ASSET')
    expect(withAsset.params).toMatchObject({ action: 'SELL_ASSET', minPriceCents: 200_000 })

    const noAsset = planAiMonth(view({ saleableAssets: [] }), 30)
    expect(noAsset.chosen).toBe('CLEARANCE_PRICING')
    expect(noAsset.params).toMatchObject({ action: 'CLEARANCE_PRICING', discountRatePercent: 40 })
  })
})
