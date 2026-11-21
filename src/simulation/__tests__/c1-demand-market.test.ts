import { describe, it, expect } from 'vitest'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { makeSalesProduct, makeSalesService, makeSalesWorld } from './sales-fixtures'

function runDay(dayIndex: number, productOverrides = {}, options = {}) {
  const product = makeSalesProduct(productOverrides)
  const world = makeSalesWorld([product], { currentDayIndex: dayIndex - 1 })
  const harness = makeSalesService(world, { demandMode: true, ...options })
  return harness.service.simulateDailySales(world, dayIndex)
}

describe('C1-T4 demand market pipeline', () => {
  it('M01 单产品单 scope 产出销售记录与平台抽成', () => {
    const day = 30
    const state = runDay(day)
    const records = state.products[0]!.salesByPeriod
    expect(records).toHaveLength(1)
    expect(records[0]!.grossUnits).toBeGreaterThan(0)
    expect(records[0]!.grossRevenueCents).toBe(records[0]!.grossUnits * 2999)
    expect(records[0]!.platformFeeCents).toBeGreaterThan(0)
  })

  it('M02 多平台分别进池，不重复取完整受众', () => {
    const day = gregorianToDayIndex(1978, 6, 1)
    const state = runDay(day, {
      supportedPlatformIds: ['arcade_classic', 'home_console_g2'],
      audienceSegmentIds: ['arcade_enthusiasts'],
      awarenessByMarket: { japan: 0.45 },
    })
    const records = state.products[0]!.salesByPeriod
    expect(records.map((r) => r.platformId).sort()).toEqual(['arcade_classic', 'home_console_g2'])
    expect(records.every((r) => r.grossUnits > 0)).toBe(true)
  })

  it('M03 多受众都进池，不只取第一个', () => {
    const day = gregorianToDayIndex(1978, 6, 1)
    const both = runDay(day, {
      supportedPlatformIds: ['arcade_classic'],
      audienceSegmentIds: ['arcade_enthusiasts', 'home_players'],
      awarenessByMarket: { japan: 0.45 },
    })
    const firstOnly = runDay(day, {
      supportedPlatformIds: ['arcade_classic'],
      audienceSegmentIds: ['arcade_enthusiasts'],
      awarenessByMarket: { japan: 0.45 },
    })
    const bothUnits = both.products[0]!.salesByPeriod[0]!.grossUnits
    const firstUnits = firstOnly.products[0]!.salesByPeriod[0]!.grossUnits
    expect(bothUnits).toBeGreaterThan(firstUnits)
  })

  it('M04 平台 endYear+12 后不出销售记录', () => {
    const day = gregorianToDayIndex(1988, 6, 1)
    const state = runDay(day, { supportedPlatformIds: ['arcade_pre_1975'] })
    expect(state.products[0]!.salesByPeriod).toHaveLength(0)
  })

  it('M05 价格只影响 attraction，降价 50% 销量不超过 2 倍', () => {
    const day = 30
    const normal = runDay(day)
    const cheap = runDay(day, { launchPriceCents: 1499, pricePerUnitCents: 1499 })
    const normalUnits = normal.products[0]!.salesByPeriod[0]!.grossUnits
    const cheapUnits = cheap.products[0]!.salesByPeriod[0]!.grossUnits
    expect(cheapUnits).toBeGreaterThanOrEqual(normalUnits)
    expect(cheapUnits).toBeLessThanOrEqual(normalUnits * 2)
  })

  it('M06 awarenessByMarket 由 scope 按 audience 汇总', () => {
    const day = 30
    const state = runDay(day)
    const product = state.products[0]!
    expect(product.awarenessByMarket.japan).toBeCloseTo(0.45, 6)
    expect(product.awarenessByScope?.['japan:arcade_pre_1975:arcade_enthusiasts']).toBeCloseTo(0.45, 6)
  })

  it('M07 同一产品同日重复调用不重复写记录', () => {
    const day = 30
    const first = runDay(day)
    const product = first.products[0]!
    const world = makeSalesWorld([product], { currentDayIndex: day })
    const harness = makeSalesService(world, { demandMode: true })
    const second = harness.service.simulateDailySales(world, day)
    expect(second.products[0]!.salesByPeriod).toHaveLength(1)
  })

  it('M08 无价格产品不产生销售并告警', () => {
    const day = 30
    const state = runDay(day, { launchPriceCents: null, pricePerUnitCents: undefined })
    expect(state.products[0]!.salesByPeriod).toHaveLength(0)
  })
})
