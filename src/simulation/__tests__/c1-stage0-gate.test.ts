import { describe, it, expect } from 'vitest'
import { runStage0GateForSeeds } from '@simulation/services/c1-stage0-gate'
import type { Stage0GateDay } from '@simulation/services/c1-stage0-gate'
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
    awarenessByScope: { 'north_america:p1:s1': 0.2 },
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

function day(): Stage0GateDay {
  return { scopes: [scope()], products: [product()], awarenessByMarket: { 'prod-a': { north_america: 0.2 } } }
}

describe('C1 Stage 0 shadow gate', () => {
  it('G01 守恒与认知汇总正常时 PASS，8 seed 均可复现', () => {
    const report = runStage0GateForSeeds(() => day(), { days: 30, seeds: [1, 2, 3, 4, 5, 6, 7, 8] })
    expect(report.status).toBe('PASS')
    expect(report.deterministic).toBe(true)
    expect(report.seedSummaries).toHaveLength(8)
    expect(report.failures).toEqual([])
  })

  it('G02 两个产品争同一 pool 时仍守恒，不超 audience', () => {
    const bad: Stage0GateDay = {
      scopes: [scope({ installBaseUnits: 10, activityRate: 1, marketShare: 1, segmentShare: 1 })],
      products: [
        product({ productId: 'a', awarenessByScope: { 'north_america:p1:s1': 1 } }),
        product({ productId: 'b', awarenessByScope: { 'north_america:p1:s1': 1 } }),
      ],
    }
    const report = runStage0GateForSeeds(() => bad, { days: 1, seeds: [1] })
    expect(report.status).toBe('PASS')
    expect(report.seedSummaries[0]!.totalAllocatedUnits).toBeLessThanOrEqual(10)
  })

  it('G03 认知汇总偏差超过 1% 时 FAIL', () => {
    const bad: Stage0GateDay = { ...day(), awarenessByMarket: { 'prod-a': { north_america: 0.5 } } }
    const report = runStage0GateForSeeds(() => bad, { days: 1, seeds: [1] })
    expect(report.status).toBe('FAIL')
    expect(report.failures.some((f) => f.check === 'awareness-rollup')).toBe(true)
  })

  it('G04 世界指纹变化时 FAIL（只读断言）', () => {
    let state = 'a'
    const report = runStage0GateForSeeds(
      () => {
        state = 'b'
        return day()
      },
      { days: 1, seeds: [1], fingerprint: () => state },
    )
    expect(report.status).toBe('FAIL')
    expect(report.readOnly).toBe(false)
    expect(report.failures.some((f) => f.check === 'read-only')).toBe(true)
  })
})
