import { describe, it, expect } from 'vitest'
import {
  resolveLifecycleStage,
  effectivePriceCents,
  isPriceChangeAllowed,
  resolveDiscount,
} from '@domain/value-objects'
import { makeProduct } from '../../../simulation/__tests__/m2d-pricing-fixtures'

describe('定价纯函数（D01–D08）', () => {
  it('D01 阶段边界 20/21：20 天仍是 launch，21 天进入 growth', () => {
    expect(resolveLifecycleStage(0, 20)).toBe('launch')
    expect(resolveLifecycleStage(0, 21)).toBe('growth')
  })

  it('D02 阶段边界 89/90：89 天 growth，90 天 mature', () => {
    expect(resolveLifecycleStage(0, 89)).toBe('growth')
    expect(resolveLifecycleStage(0, 90)).toBe('mature')
  })

  it('D03 阶段边界 179/180：179 天 mature，180 天 decline', () => {
    expect(resolveLifecycleStage(0, 179)).toBe('mature')
    expect(resolveLifecycleStage(0, 180)).toBe('decline')
  })

  it('D04 阶段边界 364/365：364 天 decline，365 天 long_tail', () => {
    expect(resolveLifecycleStage(0, 364)).toBe('decline')
    expect(resolveLifecycleStage(0, 365)).toBe('long_tail')
  })

  it('D05 上市前（elapsed<0）归 launch，不抛错', () => {
    expect(resolveLifecycleStage(100, 90)).toBe('launch')
  })

  it('D06 未定价返回 null；discountRatePercent 缺省 ≡ 0', () => {
    expect(effectivePriceCents(makeProduct())).toBeNull()
    expect(effectivePriceCents({ launchPriceCents: 2000 })).toBe(2000)
    expect(effectivePriceCents({ launchPriceCents: 2000, discountRatePercent: 0 })).toBe(2000)
  })

  it('D07 折扣取整：8 折 1600 / 5% 折 1900 / 50% 折 1000', () => {
    expect(effectivePriceCents({ launchPriceCents: 2000, discountRatePercent: 20 })).toBe(1600)
    expect(effectivePriceCents({ launchPriceCents: 2000, discountRatePercent: 5 })).toBe(1900)
    expect(effectivePriceCents({ launchPriceCents: 2000, discountRatePercent: 50 })).toBe(1000)
    // 挂牌价优先于上市价（当前价与销售时价分离）
    expect(
      effectivePriceCents({ launchPriceCents: 2000, pricePerUnitCents: 2500, discountRatePercent: 20 }),
    ).toBe(2000)
  })

  it('D08 整数守卫：非整数价格/越界折扣返回 null，阶段推导抛 TypeError', () => {
    expect(effectivePriceCents({ launchPriceCents: 20.5 })).toBeNull()
    expect(effectivePriceCents({ launchPriceCents: 0 })).toBeNull()
    expect(effectivePriceCents({ launchPriceCents: 2000, discountRatePercent: 51 })).toBeNull()
    expect(() => resolveLifecycleStage(0, 1.5)).toThrow(TypeError)
    expect(isPriceChangeAllowed(undefined, 0)).toBe(true)
  })
})

describe('折扣判定纯函数（补充：冷静期与下限）', () => {
  it('冷静期内（13 天）拒绝，满 14 天允许', () => {
    const early = resolveDiscount({
      priceCents: 2000,
      launchPriceCents: 2000,
      ratePercent: 20,
      launchDay: 0,
      dayIndex: 13,
    })
    expect(early).toEqual({ ok: false, reasonCode: 'PRICE_DISCOUNT_COOLDOWN' })
    const ok = resolveDiscount({
      priceCents: 2000,
      launchPriceCents: 2000,
      ratePercent: 20,
      launchDay: 0,
      dayIndex: 14,
    })
    expect(ok).toEqual({ ok: true, effectivePriceCents: 1600 })
  })

  it('50% 折恰好等于半价下限（≥ 放行），51% 折拒绝', () => {
    expect(
      resolveDiscount({
        priceCents: 2000,
        launchPriceCents: 2000,
        ratePercent: 50,
        launchDay: 0,
        dayIndex: 20,
      }),
    ).toEqual({ ok: true, effectivePriceCents: 1000 })
    expect(
      resolveDiscount({
        priceCents: 2000,
        launchPriceCents: 2000,
        ratePercent: 51,
        launchDay: 0,
        dayIndex: 20,
      }),
    ).toEqual({ ok: false, reasonCode: 'PRICE_DISCOUNT_RANGE' })
  })
})
