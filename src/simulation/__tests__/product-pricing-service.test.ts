import { describe, it, expect } from 'vitest'
import { ProductPricingService } from '@simulation/services/product-pricing-service'
import { effectivePriceCents } from '@domain/value-objects'
import { PRODUCT_DISCOUNT_APPLIED_EVENT, PRODUCT_PRICED_EVENT, PRODUCT_RETIRED_EVENT } from '@domain/events'
import { makeProduct, makeRecord, makeWorld, D_PRODUCT_ID } from './m2d-pricing-fixtures'

const service = new ProductPricingService()

function productOf(world: ReturnType<typeof makeWorld>, id = D_PRODUCT_ID) {
  return world.products.find((p) => p.id === id)
}

function eventTypes(world: ReturnType<typeof makeWorld>): string[] {
  return world.events.map((e) => e.type)
}

/** 已定价产品（上市 2000，Day 0 首次定价） */
function pricedWorld(overrides: Parameters<typeof makeProduct>[0] = {}, day = 0) {
  const world = makeWorld([makeProduct(overrides)], day)
  return service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2000 }, 0).world
}

describe('首次定价与改价（D09–D17）', () => {
  it('D09 首次定价同时写 launchPriceCents 与 pricePerUnitCents，事件 isFirstPricing=true', () => {
    const world = makeWorld()
    const result = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2000 }, 0)
    expect(result.ok).toBe(true)
    const product = productOf(result.world)
    expect(product?.launchPriceCents).toBe(2000)
    expect(product?.pricePerUnitCents).toBe(2000)
    expect(product?.lastPriceChangeDay).toBe(0)
    const priced = result.world.events.find((e) => e.type === PRODUCT_PRICED_EVENT)
    expect(priced?.payload).toMatchObject({ priceCents: 2000, isFirstPricing: true, day: 0 })
  })

  it('D10 二次定价只改挂牌价，launchPriceCents 保持不变', () => {
    const world = pricedWorld()
    const result = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2500 }, 20)
    expect(result.ok).toBe(true)
    expect(productOf(result.world)?.launchPriceCents).toBe(2000)
    expect(productOf(result.world)?.pricePerUnitCents).toBe(2500)
  })

  it('D11 改价不触碰历史销售记录（unitPriceAtSaleCents 逐字段不变）', () => {
    const record = makeRecord(10, 10, 2000)
    const world = pricedWorld({ salesByPeriod: [record] })
    const before = JSON.stringify(productOf(world)?.salesByPeriod)
    const result = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2600 }, 20)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(productOf(result.world)?.salesByPeriod)).toBe(before)
    expect(productOf(result.world)?.salesByPeriod[0]?.unitPriceAtSaleCents).toBe(2000)
  })

  it('D12 非整数价格拒绝：PRICE_INVALID_AMOUNT', () => {
    const result = service.setPrice(makeWorld(), { productId: D_PRODUCT_ID, priceCents: 2000.5 }, 0)
    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('PRICE_INVALID_AMOUNT')
  })

  it('D13 超过上市价 5 倍拒绝；恰好 5 倍允许', () => {
    const world = pricedWorld()
    expect(
      service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 10_001 }, 20).errorCode,
    ).toBe('PRICE_INVALID_AMOUNT')
    const ok = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 10_000 }, 20)
    expect(ok.ok).toBe(true)
  })

  it('D14 同价幂等：changed=false 且不新增事件', () => {
    const world = pricedWorld()
    const eventCount = world.events.length
    const result = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2000 }, 5)
    expect(result.ok).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.world.events).toHaveLength(eventCount)
  })

  it('D15 7 天冷却：第 6 天拒绝，第 7 天允许', () => {
    const world = pricedWorld()
    const early = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2500 }, 6)
    expect(early.errorCode).toBe('PRICE_COOLDOWN')
    const ok = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2500 }, 7)
    expect(ok.ok).toBe(true)
  })

  it('D16 lastPriceChangeDay 缺省视为从未变更（无冷却）', () => {
    const world = makeWorld([makeProduct({ launchPriceCents: 2000, pricePerUnitCents: 2000 })], 1)
    const result = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2500 }, 1)
    expect(result.ok).toBe(true)
  })

  it('D17 退市产品改价拒绝：LIFECYCLE_IMMUTABLE', () => {
    const world = makeWorld([makeProduct({ status: 'retired', lifecycleStage: 'retired' })])
    expect(
      service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 2000 }, 0).errorCode,
    ).toBe('LIFECYCLE_IMMUTABLE')
  })
})

describe('折扣（D18–D24）', () => {
  it('D18 取消折扣回到挂牌价（0 不受冷静期限制，但仍受 7 天冷却）', () => {
    const world = pricedWorld({}, 0)
    const discounted = service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 20 }, 14)
    expect(discounted.ok).toBe(true)
    expect(effectivePriceCents(productOf(discounted.world)!)).toBe(1600)
    const cancelled = service.applyDiscount(
      discounted.world,
      { productId: D_PRODUCT_ID, ratePercent: 0 },
      21,
    )
    expect(cancelled.ok).toBe(true)
    expect(effectivePriceCents(productOf(cancelled.world)!)).toBe(2000)
    const evt = cancelled.world.events.find((e) => e.type === PRODUCT_DISCOUNT_APPLIED_EVENT && (e.payload as { toRate: number }).toRate === 0)
    expect(evt).toBeDefined()
  })

  it('D19 折扣冷静期：上市第 13 天拒绝，第 14 天允许', () => {
    const world = pricedWorld()
    expect(
      service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 20 }, 13).errorCode,
    ).toBe('PRICE_DISCOUNT_COOLDOWN')
    expect(service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 20 }, 14).ok).toBe(true)
  })

  it('D20 折扣率边界：5% 与 50% 均允许', () => {
    const w5 = pricedWorld()
    expect(service.applyDiscount(w5, { productId: D_PRODUCT_ID, ratePercent: 5 }, 30).ok).toBe(true)
    const w50 = pricedWorld()
    expect(service.applyDiscount(w50, { productId: D_PRODUCT_ID, ratePercent: 50 }, 30).ok).toBe(true)
  })

  it('D21 51% 越界拒绝：PRICE_DISCOUNT_RANGE', () => {
    const world = pricedWorld()
    expect(
      service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 51 }, 30).errorCode,
    ).toBe('PRICE_DISCOUNT_RANGE')
  })

  it('D22 折后价低于上市价一半拒绝（挂牌价 1000 打 5 折 → 500 < 1000）', () => {
    let world = pricedWorld()
    world = service.setPrice(world, { productId: D_PRODUCT_ID, priceCents: 1000 }, 20).world
    const result = service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 50 }, 30)
    expect(result.errorCode).toBe('PRICE_DISCOUNT_RANGE')
  })

  it('D23 未定价产品不能打折：PRICE_INVALID_AMOUNT', () => {
    const world = makeWorld()
    expect(
      service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 20 }, 30).errorCode,
    ).toBe('PRICE_INVALID_AMOUNT')
  })

  it('D24 折扣后 7 天内改价拒绝：PRICE_COOLDOWN', () => {
    const world = pricedWorld()
    const discounted = service.applyDiscount(world, { productId: D_PRODUCT_ID, ratePercent: 20 }, 14)
    const result = service.setPrice(
      discounted.world,
      { productId: D_PRODUCT_ID, priceCents: 2600 },
      20,
    )
    expect(result.errorCode).toBe('PRICE_COOLDOWN')
  })
})

describe('退市（D31–D34）', () => {
  it('D31 上市不足 7 天退市拒绝：LIFECYCLE_NOT_ELAPSED', () => {
    const world = pricedWorld()
    expect(service.retire(world, { productId: D_PRODUCT_ID }, 6).errorCode).toBe(
      'LIFECYCLE_NOT_ELAPSED',
    )
    expect(service.retire(world, { productId: D_PRODUCT_ID }, 7).ok).toBe(true)
  })

  it('D32 手动退市写 retired 状态与事件（reason=manual）', () => {
    const world = pricedWorld()
    const result = service.retire(world, { productId: D_PRODUCT_ID }, 7)
    expect(result.ok).toBe(true)
    expect(productOf(result.world)?.status).toBe('retired')
    expect(productOf(result.world)?.lifecycleStage).toBe('retired')
    const evt = result.world.events.find((e) => e.type === PRODUCT_RETIRED_EVENT)
    expect(evt?.payload).toMatchObject({ reason: 'manual', day: 7 })
  })

  it('D33 退市不改动既有退款批次（pending 保持 pending，由 C 批照常兑现）', () => {
    const world = pricedWorld()
    const batches = [{ id: 'b1', status: 'pending' as const }]
    const result = service.retire({ ...world, refundBatches: batches as never }, { productId: D_PRODUCT_ID }, 7)
    expect(result.world.refundBatches).toHaveLength(1)
  })

  it('D34 退市后改价/打折拒绝，重复退市幂等成功', () => {
    const world = pricedWorld()
    const retired = service.retire(world, { productId: D_PRODUCT_ID }, 7).world
    expect(service.setPrice(retired, { productId: D_PRODUCT_ID, priceCents: 2500 }, 20).errorCode).toBe(
      'LIFECYCLE_IMMUTABLE',
    )
    expect(
      service.applyDiscount(retired, { productId: D_PRODUCT_ID, ratePercent: 20 }, 20).errorCode,
    ).toBe('LIFECYCLE_IMMUTABLE')
    const again = service.retire(retired, { productId: D_PRODUCT_ID }, 20)
    expect(again.ok).toBe(true)
    expect(again.alreadyRetired).toBe(true)
    expect(eventTypes(retired).filter((t) => t === PRODUCT_RETIRED_EVENT)).toHaveLength(1)
  })
})
