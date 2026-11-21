import { describe, it, expect } from 'vitest'
import platforms from '@content/platforms.json'
import { RandomService } from '@simulation/services/random-service'
import {
  ALGORITHM_VERSION,
  FORMULA_CONSTANTS_VERSION,
  PLATFORM_CATEGORY_MAP,
  SalesError,
  canonicalJson,
  clampAwareness,
  clampPerturbation,
  computeConsiderationLift,
  computeConsiderationRate,
  computeGrossUnits,
  computeMarketingResponse,
  computePlatformFee,
  computePriceDeltaEffect,
  computePurchaseConversion,
  computePurchaseConversionLift,
  computeQualityScoreBonus,
  computeRefundRate,
  computeReviewLift,
  computeSalesPipeline,
  computeUnitPriceAtSaleCents,
  computeWeightedQuality,
  explainSalesPipeline,
  marketingScaleKeyOf,
  resolvePlatformFeeRate,
  resolveQualityWeights,
  resolveRandomPerturbation,
  salesTuningValuesHash,
  validateSalesTuning,
} from '@simulation/services/sales-formulas'
import {
  SALES_TUNING,
  SALES_DAY,
  makePipelineInput,
} from './sales-fixtures'

const META = {
  tuningVersion: '3',
  tuningValuesHash: salesTuningValuesHash(SALES_TUNING),
  formulaConstantsVersion: FORMULA_CONSTANTS_VERSION,
  algorithmVersion: ALGORITHM_VERSION,
}

describe('销售管线公式层（T01–T13 / T33 / T39–T41）', () => {
  it('T01 考虑比例链：0.5×0.6×1.07625×1.2×0.85 = 0.3293325', () => {
    const rate = computeConsiderationRate(0.5, 0.6, 1.07625, 1.2, 0.15)
    expect(rate.clamped).toBeCloseTo(0.3293325, 10)
    const lift = computeConsiderationLift(75.25, SALES_TUNING)
    expect(lift.clamped).toBeCloseTo(1.07625, 10)
  })

  it('T02 评分提升 clamp/缺失：72→1.2；200→1.8；null 用质量分', () => {
    expect(computeReviewLift(72, 75.25, SALES_TUNING).clamped).toBeCloseTo(1.2, 10)
    expect(computeReviewLift(200, 75.25, SALES_TUNING).clamped).toBeCloseTo(1.8, 10)
    const fallback = computeReviewLift(null, 75.25, SALES_TUNING)
    expect(fallback.effectiveReviewScore).toBe(75.25)
    expect(fallback.clamped).toBeCloseTo(75.25 / 60, 10)
    expect(computeReviewLift(null, 200, SALES_TUNING).clamped).toBeCloseTo(1.8, 10)
  })

  it('T03 涨价弹性：priceRelative=1.10 → purchaseConversionLift=0.88', () => {
    const price = computePriceDeltaEffect(3300, 3000, SALES_TUNING)
    expect(price.priceRelative).toBeCloseTo(1.1, 10)
    expect(price.effect).toBeCloseTo(0.12, 10)
    expect(computePurchaseConversionLift(price.effect, 0, SALES_TUNING).clamped).toBeCloseTo(
      0.88,
      10,
    )
  })

  it('T04 降价弹性：priceRelative=0.90 → purchaseConversionLift=1.0884358971', () => {
    const price = computePriceDeltaEffect(2700, 3000, SALES_TUNING)
    expect(price.priceRelative).toBeCloseTo(0.9, 10)
    expect(price.effect).toBeCloseTo(-0.0884358971, 6)
    expect(computePurchaseConversionLift(price.effect, 0, SALES_TUNING).clamped).toBeCloseTo(
      1.0884358971,
      6,
    )
    expect(computePriceDeltaEffect(3000, 3000, SALES_TUNING).effect).toBe(0)
  })

  it('T05 质量加成：(q−60)/100×0.5', () => {
    expect(computeQualityScoreBonus(75.25)).toBeCloseTo(0.07625, 10)
    expect(computeQualityScoreBonus(60)).toBe(0)
    expect(computeQualityScoreBonus(80)).toBeCloseTo(0.1, 10)
    expect(computeQualityScoreBonus(50)).toBeCloseTo(-0.05, 10)
  })

  it('T06 营销响应：0 中性；$1,000/$1,000 → 1.6321；$10,000 未触顶 2.0', () => {
    expect(computeMarketingResponse(0, 100_000, SALES_TUNING)).toEqual({ lift: 0, multiplier: 1 })
    const ten = computeMarketingResponse(100_000, 100_000, SALES_TUNING)
    expect(ten.lift).toBeCloseTo(0.6321205588, 9)
    expect(ten.multiplier).toBeCloseTo(1.6321205588, 9)
    const hundred = computeMarketingResponse(1_000_000, 100_000, SALES_TUNING)
    expect(hundred.lift).toBeCloseTo(0.9999546, 6)
    expect(hundred.multiplier).toBeCloseTo(1.9999546, 6)
    expect(hundred.multiplier).toBeLessThan(2)
  })

  it('T07 双重 clamp：lift∈[0.2,2]、conversion∈[0.01,0.5]', () => {
    expect(computePurchaseConversionLift(5, 0, SALES_TUNING).clamped).toBeCloseTo(0.2, 10)
    expect(computePurchaseConversionLift(-5, 0, SALES_TUNING).clamped).toBeCloseTo(2, 10)
    expect(computePurchaseConversion(10, 10, 10, 10, SALES_TUNING).clamped).toBeCloseTo(0.5, 10)
    expect(computePurchaseConversion(0, 0, 0, 0, SALES_TUNING).clamped).toBeCloseTo(0.01, 10)
  })

  it('小市场保底：默认 0 概率不补件；开启且命中时补 1 件', () => {
    expect(computeGrossUnits(1593.17, SALES_TUNING)).toBe(1593)
    expect(computeGrossUnits(0.5, SALES_TUNING)).toBe(0)
    const floorOn = { ...SALES_TUNING, smallMarketFloorChance: 1 }
    const ctx = {
      subsystemId: 'sales',
      entityId: 'prod-1',
      dayIndex: SALES_DAY,
      purposeId: 'sales_small_market_floor',
      scopeId: 'japan:arcade_pre_1975:arcade_enthusiasts',
      sampleIndex: 0,
    }
    expect(computeGrossUnits(0.5, floorOn, { gauss: () => 0, chance: () => true }, ctx)).toBe(1)
    expect(computeGrossUnits(0.5, floorOn, { gauss: () => 0, chance: () => false }, ctx)).toBe(0)
    expect(computeGrossUnits(0, floorOn)).toBe(0)
  })

  it('T08 随机扰动：1+采样；越界 clamp；同 ctx 可复现', () => {
    expect(clampPerturbation(0.02, SALES_TUNING)).toBeCloseTo(1.02, 10)
    expect(clampPerturbation(5, SALES_TUNING)).toBeCloseTo(1.2, 10)
    expect(clampPerturbation(-5, SALES_TUNING)).toBeCloseTo(0.8, 10)

    const ctx = {
      subsystemId: 'sales',
      entityId: 'prod-1',
      dayIndex: SALES_DAY,
      purposeId: 'purchase_conversion_perturbation',
      scopeId: 'japan:arcade_pre_1975:arcade_enthusiasts',
      sampleIndex: 0,
    }
    const a = resolveRandomPerturbation(new RandomService(42), ctx, SALES_TUNING)
    const b = resolveRandomPerturbation(new RandomService(42), ctx, SALES_TUNING)
    expect(a).toBe(b)
  })

  it('T09 认知度只出现一次并被上限截断', () => {
    expect(clampAwareness(0.9, 0.6)).toBeCloseTo(0.6, 10)
    const input = makePipelineInput({ awareness: 0.45 })
    const computation = computeSalesPipeline(input, SALES_TUNING)
    expect(computation.consideringConsumers).toBeCloseTo(
      input.eligibleAudience! * 0.45 * computation.considerationRate.clamped,
      10,
    )
    expect(computation.considerationRate.clamped).not.toBe(0)
  })

  it('T12 收入与单价：gross = units × price；unitPrice = round(gross/units)', () => {
    expect(1593 * 2999).toBe(4_777_407)
    expect(computeUnitPriceAtSaleCents(4_777_407, 1593)).toBe(2999)
    expect(computeUnitPriceAtSaleCents(4_777_407 + 1, 1593)).toBe(2999)
  })

  it('T13 抽成：round(gross × rate)；0% 与 30% 两态', () => {
    expect(computePlatformFee(4_777_407, 0.3)).toBe(1_433_222)
    expect(computePlatformFee(4_777_407, 0)).toBe(0)
    expect(computePlatformFee(4_777_407, 0.5)).toBe(2_388_704)
  })

  it('T33 逐步公式链与工作示例一致（含 4 个中间量）', () => {
    const computation = computeSalesPipeline(
      makePipelineInput({ randomPerturbation: 1.02 }),
      SALES_TUNING,
    )
    expect(computation.considerationLift.clamped).toBeCloseTo(1.07625, 10)
    expect(computation.considerationRate.clamped).toBeCloseTo(0.3293325, 10)
    expect(computation.consideringConsumers).toBeCloseTo(17_783.955, 6)
    expect(computation.purchaseConversion.clamped).toBeCloseTo(0.089585057, 8)
    expect(computation.rawUnits).toBeCloseTo(1593.1766, 3)
    expect(computation.grossUnits).toBe(1593)
    expect(computation.grossRevenueCents).toBe(4_777_407)
    expect(computation.platformFeeCents).toBe(1_433_222)
    expect(computation.netSalesRevenueCents).toBe(3_344_185)
    expect(computation.refundRate).toBeCloseTo(0.02, 10)
    expect(computation.estimatedRefundUnits).toBe(31)
  })

  it('T39 平台映射 14 条表驱动与三态解析', () => {
    const entries = Object.entries(PLATFORM_CATEGORY_MAP)
    expect(entries).toHaveLength(14)
    // 映射与 platforms.json 一一对应：无遗漏、无死键
    expect(new Set(entries.map(([platformId]) => platformId))).toEqual(
      new Set(platforms.map((platform) => platform.id)),
    )
    expect(PLATFORM_CATEGORY_MAP.pc_online).toBe('pc')
    expect(PLATFORM_CATEGORY_MAP.home_console_g2).toBe('console')
    expect(PLATFORM_CATEGORY_MAP.digital_download).toBe('digital')

    // 表驱动：逐条 14 平台在记录值缺失/非数时回落类别默认
    for (const [platformId, category] of entries) {
      const expected = {
        rate: SALES_TUNING.platformFeeRateByCategory[category],
        source: 'category',
        unknownPlatform: false,
      }
      expect(resolvePlatformFeeRate(platformId, undefined, SALES_TUNING)).toEqual(expected)
      expect(resolvePlatformFeeRate(platformId, Number.NaN, SALES_TUNING)).toEqual(expected)
    }

    expect(resolvePlatformFeeRate('arcade_pre_1975', 0.3, SALES_TUNING)).toEqual({
      rate: 0.3,
      source: 'platform',
      unknownPlatform: false,
    })
    // 记录值 0 是合法值，不得回落类别默认
    expect(resolvePlatformFeeRate('pc_windows', 0, SALES_TUNING)).toEqual({
      rate: 0,
      source: 'platform',
      unknownPlatform: false,
    })
    const unknown = resolvePlatformFeeRate('future_platform', undefined, SALES_TUNING)
    expect(unknown.rate).toBeCloseTo(0.3, 10)
    expect(unknown.source).toBe('tuning')
    expect(unknown.unknownPlatform).toBe(true)
  })

  it('T40 质量权重来源 segment→genre→tuning 与画像兜底', () => {
    const seg = { gameplay: 1, technical: 0, content: 0, art: 0, innovation: 0 }
    const genre = { gameplay: 0, technical: 1, content: 0, art: 0, innovation: 0 }
    const fallback = { gameplay: 0, technical: 0, content: 0, art: 0, innovation: 1 }

    expect(resolveQualityWeights(seg, genre, fallback).source).toBe('segment')
    expect(resolveQualityWeights(null, genre, fallback).source).toBe('genre')
    expect(resolveQualityWeights(undefined, undefined, fallback).source).toBe('tuning')

    const tuned = computeWeightedQuality(
      { gameplay: 80, technical: 70, content: 75, art: 85, innovation: 65 },
      SALES_TUNING.qualityPrefWeightDefault,
      SALES_TUNING.qualityScoreFallback,
    )
    expect(tuned.score).toBeCloseTo(75.25, 10)
    expect(tuned.source).toBe('profile')

    expect(
      computeWeightedQuality(null, SALES_TUNING.qualityPrefWeightDefault, 50),
    ).toEqual({ score: 50, source: 'fallback' })
    expect(
      computeWeightedQuality({ gameplay: 101 } as never, SALES_TUNING.qualityPrefWeightDefault, 50)
        .source,
    ).toBe('fallback')
  })

  it('T41 启动校验：版本 3、必填键、映射完整性', () => {
    expect(() => validateSalesTuning(SALES_TUNING, 3)).not.toThrow()
    expect(() => validateSalesTuning(SALES_TUNING, 2)).toThrow(SalesError)
    expect(() =>
      validateSalesTuning({ ...SALES_TUNING, awarenessCap: undefined as unknown as number }, 3),
    ).toThrow(/SALES_TUNING_INVALID/)
    expect(marketingScaleKeyOf('long_tail')).toBe('long_tail')
    expect(marketingScaleKeyOf('retired')).toBe('long_tail')
  })
})

describe('T27 explainSales 纯函数哈希（单元部分）', () => {
  it('相同输入 → 相同 inputHash；改 TUNING → tuningValuesHash 变化', () => {
    const input = makePipelineInput({ randomPerturbation: 1.02 })
    const a = explainSalesPipeline(input, SALES_TUNING, META)
    const b = explainSalesPipeline(input, SALES_TUNING, META)
    expect(a.inputHash).toBe(b.inputHash)
    expect(a.tuningVersion).toBe('3')
    expect(a.attributionResidualUnits).toBe(0)
    expect(a.topDrivers).toHaveLength(3)

    const changed = salesTuningValuesHash({ ...SALES_TUNING, baseConsideration: 0.4 })
    expect(changed).not.toBe(META.tuningValuesHash)
  })

  it('canonical JSON 键排序且拒绝非有限数/undefined', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/SALES_INVALID_INPUT/)
    expect(() => canonicalJson({ a: undefined })).toThrow(/SALES_INVALID_INPUT/)
  })

  it('退款率夹取与缺陷斜率', () => {
    expect(computeRefundRate(25, SALES_TUNING)).toBeCloseTo(0.02, 10)
    expect(computeRefundRate(30, SALES_TUNING)).toBeCloseTo(0.03, 10)
    expect(computeRefundRate(0, SALES_TUNING)).toBeCloseTo(0.02, 10)
    expect(computeRefundRate(100, SALES_TUNING)).toBeCloseTo(0.17, 10)
  })

  it('转化率夹取到 [0.01,0.5]', () => {
    expect(computePurchaseConversion(0.05, 1.07625, 1.6321, 1.02, SALES_TUNING).clamped).toBeCloseTo(
      0.089585,
      5,
    )
    expect(computePurchaseConversion(10, 10, 10, 10, SALES_TUNING).clamped).toBeCloseTo(0.5, 10)
    expect(computePurchaseConversion(0, 0, 0, 0, SALES_TUNING).clamped).toBeCloseTo(0.01, 10)
  })
})
