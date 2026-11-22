import { describe, it, expect } from 'vitest'
import { ProductPricingService } from '@simulation/services/product-pricing-service'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { GameWorld } from '@application/mediators/game-world'
import { parseSave } from '@infrastructure/storage/save-schema'
import { marketingScaleKeyOf } from '@simulation/services/sales-formulas'
import { TUNING } from '@content/tuning'
import { PRODUCT_LIFECYCLE_CHANGED_EVENT, PRODUCT_RETIRED_EVENT } from '@domain/events'
import { makeAutoBatch, makeFixtureWorld, makeService } from './m2c-fixtures'
import { makeProduct, makeRecord, makeWorld, D_PRODUCT_ID } from './m2d-pricing-fixtures'
import { FIXTURE, SALES_DAY, makeSalesProduct, makeSalesService, makeSalesWorld, makeStubRng } from './sales-fixtures'
import { seedOpeningCash } from '../../__tests__/helpers'

const service = new ProductPricingService()

function productOf(world: ReturnType<typeof makeWorld>) {
  return world.products.find((p) => p.id === D_PRODUCT_ID)
}

describe('生命周期推进（D25–D30b）', () => {
  it('D25 Day 21 推进到 growth 并写事件', () => {
    const world = makeWorld([makeProduct()], 21)
    const result = service.advanceLifecycles(world, 21)
    expect(productOf(result)?.lifecycleStage).toBe('growth')
    const evt = result.events.find((e) => e.type === PRODUCT_LIFECYCLE_CHANGED_EVENT)
    expect(evt?.payload).toMatchObject({ from: 'launch', to: 'growth', day: 21 })
  })

  it('D26 同日重复调用幂等：事件仅一条', () => {
    const once = service.advanceLifecycles(makeWorld([makeProduct()], 21), 21)
    const twice = service.advanceLifecycles(once, 21)
    expect(twice.events.filter((e) => e.type === PRODUCT_LIFECYCLE_CHANGED_EVENT)).toHaveLength(1)
  })

  it('D27 只升不降：已是 long_tail 时回到 Day 30 不回退', () => {
    const world = makeWorld([makeProduct({ lifecycleStage: 'long_tail' })], 30)
    const result = service.advanceLifecycles(world, 30)
    expect(productOf(result)?.lifecycleStage).toBe('long_tail')
  })

  it('D28 已退市产品被跳过：状态与事件均不变', () => {
    const world = makeWorld([makeProduct({ status: 'retired', lifecycleStage: 'retired' })], 200)
    const result = service.advanceLifecycles(world, 200)
    expect(result.events).toHaveLength(0)
    expect(productOf(result)?.status).toBe('retired')
  })

  it('D29 阶段→营销系数取键齐全（五档表与 TUNING 一一对应）', () => {
    const stages = ['launch', 'growth', 'mature', 'decline', 'long_tail'] as const
    for (const stage of stages) {
      const key = marketingScaleKeyOf(stage)
      expect(TUNING.sales.marketingResponseScaleCents[key]).toBeTypeOf('number')
    }
    expect(TUNING.sales.marketingResponseScaleCents.launch).toBe(50_000)
    expect(TUNING.sales.marketingResponseScaleCents.long_tail).toBe(300_000)
  })

  it('D30 阶段推进 version/updatedAt 同步递增', () => {
    const result = service.advanceLifecycles(makeWorld([makeProduct()], 21), 21)
    expect(productOf(result)?.version).toBe(2)
    expect(productOf(result)?.updatedAt).toBe(21)
  })

  it('D30b 阶段推进不触碰退款批次（C 批相邻性不被破坏）', () => {
    const batch = makeAutoBatch({ id: 'b-lifecycle', status: 'pending' })
    const world = { ...makeWorld([makeProduct()], 21), refundBatches: [batch] }
    const result = service.advanceLifecycles(world, 21)
    expect(result.refundBatches).toHaveLength(1)
    expect(result.refundBatches[0]?.status).toBe('pending')
  })
})

describe('自动退市与存档（D35–D36）', () => {
  it('D35 已定价且 90 日窗口无记录 → auto_zero_sales；未定价产品不自动退市（N-2）', () => {
    const priced = makeProduct({
      launchPriceCents: 2000,
      pricePerUnitCents: 2000,
      lifecycleStage: 'mature',
    })
    const unpriced = makeProduct({ id: 'PROD-UNPRICED' })
    const world = makeWorld([priced, unpriced], 100)
    const result = service.advanceLifecycles(world, 100)
    const retired = result.products.find((p) => p.id === D_PRODUCT_ID)
    expect(retired?.status).toBe('retired')
    expect(retired?.lifecycleStage).toBe('retired')
    expect(result.events.find((e) => e.type === PRODUCT_RETIRED_EVENT)?.payload).toMatchObject({
      reason: 'auto_zero_sales',
    })
    expect(result.products.find((p) => p.id === 'PROD-UNPRICED')?.status).toBe('active')
  })

  it('D35b 窗口内仍有销售记录则不退市', () => {
    const priced = makeProduct({
      launchPriceCents: 2000,
      pricePerUnitCents: 2000,
      salesByPeriod: [makeRecord(95)],
    })
    const result = service.advanceLifecycles(makeWorld([priced], 100), 100)
    expect(result.products[0]?.status).toBe('active')
  })

  it('D36 存档往返：三字段保留；v1 旧档由迁移补默认值（M2-E 后语义）', () => {
    const base = makeFixtureWorld()
    const priced = {
      ...base,
      products: base.products.map((p) => ({
        ...p,
        launchPriceCents: 2000,
        pricePerUnitCents: 2200,
        discountRatePercent: 20,
        lastPriceChangeDay: 5,
      })),
    }
    const parsed = parseSave(JSON.parse(JSON.stringify(priced)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const product = parsed.state.products[0]
    if (product === undefined) throw new Error('product missing after parse')
    expect(product.pricePerUnitCents).toBe(2200)
    expect(product.discountRatePercent).toBe(20)
    expect(product.lastPriceChangeDay).toBe(5)

    const legacy = {
      ...base,
      schemaVersion: 1,
      products: base.products.map((p) => ({
        ...p,
        launchPriceCents: 2000,
        pricePerUnitCents: undefined,
        discountRatePercent: undefined,
        lastPriceChangeDay: undefined,
      })),
    }
    const parsedLegacy = parseSave(JSON.parse(JSON.stringify(legacy)))
    expect(parsedLegacy.ok).toBe(true)
    if (!parsedLegacy.ok) return
    const legacyProduct = parsedLegacy.state.products[0]
    if (legacyProduct === undefined) throw new Error('legacy product missing after parse')
    // M2-E：v1 档读档即迁移，已定价产品补 pricePerUnitCents = 上市价
    expect(legacyProduct.pricePerUnitCents).toBe(2000)
  })
})

describe('链路与接线（调度器 / 命令入口 / 退款不受退市影响）', () => {
  it('调度器注入 pricing 后自动推进阶段；未注入则保持 launch', () => {
    // R7：调度器会断言"公司现金 == 账本求和"，故世界自带的 5,000,000 必须先作为期初资本入账。
    const financeWith = new FinanceService()
    const worldWith = makeWorld([makeProduct()], 20)
    seedOpeningCash(financeWith, worldWith.companies)
    const withPricing = new DailyScheduler({ finance: financeWith, pricing: service })
    const advanced = withPricing.executeDay({ ...worldWith, currentDayIndex: 20 }, 21)
    expect(advanced.products[0]?.lifecycleStage).toBe('growth')

    const financeWithout = new FinanceService()
    const worldWithout = makeWorld([makeProduct()], 20)
    seedOpeningCash(financeWithout, worldWithout.companies)
    const withoutPricing = new DailyScheduler({ finance: financeWithout })
    const frozen = withoutPricing.executeDay({ ...worldWithout, currentDayIndex: 20 }, 21)
    expect(frozen.products[0]?.lifecycleStage).toBe('launch')
  })

  it('GameWorld 命令入口可定价（无 UI 条件可达，P1-3）', () => {
    const game = new GameWorld()
    game.world.products = [makeProduct()]
    const result = game.setProductPrice({ productId: D_PRODUCT_ID, priceCents: 2000 })
    expect(result.success).toBe(true)
    expect(game.world.products[0]?.pricePerUnitCents).toBe(2000)
    const retired = game.retireProduct({ productId: D_PRODUCT_ID })
    expect(retired.success).toBe(false)
    expect(retired.errorCode).toBe('LIFECYCLE_NOT_ELAPSED')
  })

  it('定价后销售管线可产生记录（最小可玩脚本的销售段）', () => {
    const world = makeSalesWorld([makeSalesProduct({ launchPriceCents: null })])
    const priced = service.setPrice(world, { productId: FIXTURE.productId, priceCents: FIXTURE.priceCents }, SALES_DAY - 1)
    expect(priced.ok).toBe(true)
    const kit = makeSalesService(priced.world, { rng: makeStubRng(0.02) })
    const sold = kit.service.simulateDailySales(priced.world, SALES_DAY)
    expect(sold.products[0]?.salesByPeriod.length).toBeGreaterThan(0)
  })

  it('D33 退市后既有 pending 退款批次照常兑现为 posted', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const retired = service.retire(world, { productId: 'PROJ-001' }, 114)
    expect(retired.ok).toBe(true)
    const kit = makeService(retired.world)
    const result = kit.service.processDueRefunds(retired.world, 114)
    expect(result.world.refundBatches[0]?.status).toBe('posted')
  })
})
