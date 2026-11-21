import { describe, it, expect } from 'vitest'
import {
  allocateScope,
  buildDailyDemand,
  computeAttraction,
  computeAudienceUnits,
  computeAwareness01,
  computeLaunchAwarenessFloor,
  computeMarketingLift,
  computePurchaseIntent,
  computeValue,
  scopeKeyOf,
} from '@simulation/services/demand-pool'
import type { DemandProductInput, DemandScopeInput } from '@simulation/services/demand-pool'

function scope(overrides: Partial<DemandScopeInput> = {}): DemandScopeInput {
  return {
    marketId: 'north_america',
    platformId: 'p1',
    segmentId: 's1',
    installBaseUnits: 1000,
    activityRate: 0.5,
    marketShare: 0.4,
    segmentShare: 0.25,
    ...overrides,
  }
}

function product(overrides: Partial<DemandProductInput> = {}): DemandProductInput {
  return {
    productId: 'prod-a',
    companyId: 'c1',
    status: 'active',
    supportedPlatformIds: ['p1'],
    audienceSegmentIds: ['s1'],
    awarenessByScope: { 'north_america:p1:s1': 0.3 },
    quality01: 0.8,
    brand01: 0.5,
    referencePriceCents: 2000,
    effectivePriceCents: 2000,
    genreAffinityBySegment: { s1: 0.8 },
    platformFitByPlatform: { p1: 1 },
    launchDay: 0,
    ...overrides,
  }
}

describe('DemandPool Stage 0 (C1-T3)', () => {
  it('D01 audience 四层各乘一次', () => {
    expect(computeAudienceUnits(scope())).toBeCloseTo(50, 9)
  })

  it('D02 市场占比与受众占比分别收窄，不互相替代', () => {
    const base = computeAudienceUnits(scope())
    const halfMarket = computeAudienceUnits(scope({ marketShare: 0.2 }))
    const halfSegment = computeAudienceUnits(scope({ segmentShare: 0.125 }))
    expect(halfMarket).toBeCloseTo(base / 2, 9)
    expect(halfSegment).toBeCloseTo(base / 2, 9)
    expect(computeAudienceUnits(scope({ marketShare: 0.2, segmentShare: 0.125 }))).toBeCloseTo(base / 4, 9)
  })

  it('D03 purchaseIntent 不含价格', () => {
    const p = product()
    const intent = computePurchaseIntent(p, 's1', 'p1')
    const cheaper = product({ effectivePriceCents: 1000 })
    expect(computePurchaseIntent(cheaper, 's1', 'p1')).toBe(intent)

    const expensive = computeAttraction({ awareness01: 0.5, quality01: 0.8, value: computeValue(2000, 2000), fit: 0.8, brand01: 0.5 })
    const cheap = computeAttraction({ awareness01: 0.5, quality01: 0.8, value: computeValue(2000, 1000), fit: 0.8, brand01: 0.5 })
    expect(cheap).toBeGreaterThan(expensive)
  })

  it('D04 同 scope 守恒：Σ allocated ≤ audience', () => {
    const s = scope()
    const result = buildDailyDemand({
      dayIndex: 100,
      scopes: [s],
      products: [
        product({ productId: 'a', awarenessByScope: { 'north_america:p1:s1': 0.4 } }),
        product({ productId: 'b', awarenessByScope: { 'north_america:p1:s1': 0.2 } }),
      ],
    })
    const rowScope = result.scopes[0]!
    expect(rowScope.allocatedUnitsTotal).toBeLessThanOrEqual(rowScope.audienceUnits + 1e-9)
    expect(result.totalAllocatedUnits).toBeLessThanOrEqual(result.totalAudienceUnits + 1e-9)
    for (const row of rowScope.rows) expect(row.allocatedUnits).toBeLessThanOrEqual(Math.floor(row.poolUnits))
  })

  it('D05 最大余数：3 个等价产品分 10 单位，总和 10 且按 productId 补余', () => {
    const allocation = allocateScope({
      audienceUnits: 10,
      candidates: [
        { productId: 'c', poolUnits: 10, attraction: 1 },
        { productId: 'a', poolUnits: 10, attraction: 1 },
        { productId: 'b', poolUnits: 10, attraction: 1 },
      ],
      theta: 1,
    })
    expect(allocation.totalUnits).toBe(10)
    expect(allocation.allocations.get('a')?.allocatedUnits).toBe(4)
    expect(allocation.allocations.get('b')?.allocatedUnits).toBe(3)
    expect(allocation.allocations.get('c')?.allocatedUnits).toBe(3)
  })

  it('D06 无竞争者 share=1，units=floor(pool)', () => {
    const result = buildDailyDemand({ dayIndex: 1, scopes: [scope()], products: [product()] })
    const row = result.scopes[0]!.rows[0]!
    expect(row.share).toBe(1)
    expect(row.allocatedUnits).toBe(Math.floor(row.poolUnits))
  })

  it('D07 多平台：每个平台单独进池，不重复取完整 audience', () => {
    const result = buildDailyDemand({
      dayIndex: 1,
      scopes: [scope({ platformId: 'p1' }), scope({ platformId: 'p2' })],
      products: [product({ supportedPlatformIds: ['p1', 'p2'] })],
    })
    expect(result.scopes).toHaveLength(2)
    for (const s of result.scopes) expect(s.audienceUnits).toBeCloseTo(50, 9)
    expect(result.totalAudienceUnits).toBeCloseTo(100, 9)
  })

  it('D08 多受众：每个受众单独进池，不只取第一个', () => {
    const result = buildDailyDemand({
      dayIndex: 1,
      scopes: [scope({ segmentId: 's1' }), scope({ segmentId: 's2', segmentShare: 0.1 })],
      products: [product({ audienceSegmentIds: ['s1', 's2'], genreAffinityBySegment: { s1: 0.8, s2: 0.4 } })],
    })
    expect(result.scopes).toHaveLength(2)
    expect(result.scopes[1]!.rows).toHaveLength(1)
  })

  it('D09 质量 <40 时上市认知下限为 0；质量 80 时为正', () => {
    expect(computeLaunchAwarenessFloor({ storeVisibility: 1, genreMatch: 1, finalQualityScore: 30 })).toBe(0)
    expect(computeLaunchAwarenessFloor({ storeVisibility: 1, genreMatch: 1, finalQualityScore: 80 })).toBeGreaterThan(0)
  })

  it('D10 认知下限前 90 天生效，后 90 天线性淡出', () => {
    const params = { awareness: 0, launchAwarenessFloor: 0.1, launchDay: 0 }
    expect(computeAwareness01({ ...params, dayIndex: 89 })).toBe(0.1)
    expect(computeAwareness01({ ...params, dayIndex: 90 })).toBeCloseTo(0.1, 9)
    expect(computeAwareness01({ ...params, dayIndex: 135 })).toBeCloseTo(0.05, 9)
    expect(computeAwareness01({ ...params, dayIndex: 180 })).toBe(0)
  })

  it('D11 retired 产品不分配', () => {
    const result = buildDailyDemand({ dayIndex: 1, scopes: [scope()], products: [product({ status: 'retired' })] })
    expect(result.scopes[0]!.rows).toHaveLength(0)
    expect(result.totalAllocatedUnits).toBe(0)
  })

  it('D12 pool < 1 时不会靠余数白拿 1 单位', () => {
    const allocation = allocateScope({
      audienceUnits: 10,
      candidates: [{ productId: 'tiny', poolUnits: 0.2, attraction: 1 }],
      theta: 1,
    })
    expect(allocation.totalUnits).toBe(0)
  })

  it('D13 排序确定：输入顺序不影响结果', () => {
    const a = product({ productId: 'a', awarenessByScope: { 'north_america:p1:s1': 0.4 } })
    const b = product({ productId: 'b', awarenessByScope: { 'north_america:p1:s1': 0.2 } })
    const first = buildDailyDemand({ dayIndex: 1, scopes: [scope()], products: [a, b] })
    const second = buildDailyDemand({ dayIndex: 1, scopes: [scope()], products: [b, a] })
    expect(second).toEqual(first)
  })

  it('D14 marketingLift 有上限 2.0，分母为 0 不爆', () => {
    expect(computeMarketingLift(0, 0)).toBe(1)
    expect(computeMarketingLift(Number.MAX_SAFE_INTEGER, 0)).toBe(2)
  })

  it('D15 scopeKey 稳定', () => {
    expect(scopeKeyOf(scope())).toBe('north_america:p1:s1')
  })
})
