import { describe, it, expect } from 'vitest'
import platforms from '@content/platforms.json'
import markets from '@content/market_regions.json'
import segments from '@content/consumer_segments.json'
import marketRows from '@content/platform-market-share.json'
import segmentRows from '@content/platform-segment-share.json'
import priceRows from '@content/price-reference.json'
import affinityRows from '@content/genre-segment-affinity.json'
import {
  buildDemandScopesForDay,
  C1_DEFAULT_REFERENCE_PRICE_CENTS,
  genreSegmentAffinity,
  platformActivityRate,
  platformAvailability,
  platformInstallBaseUnits,
  platformMarketShare,
  platformSegmentShare,
  referencePriceCents,
} from '@content/c1-content'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

describe('C1 content tables', () => {
  it('C01 每个平台每年市场份額和 ≤1', () => {
    const sums = new Map<string, number>()
    for (const row of marketRows) {
      const key = `${row.platformId}:${row.year}`
      sums.set(key, (sums.get(key) ?? 0) + row.share)
    }
    for (const [key, sum] of sums) expect(sum, key).toBeLessThanOrEqual(1.000001)
  })

  it('C02 每个平台×市场×年受众份额和 ≤1', () => {
    const sums = new Map<string, number>()
    for (const row of segmentRows) {
      const key = `${row.platformId}:${row.marketId}:${row.year}`
      sums.set(key, (sums.get(key) ?? 0) + row.share)
    }
    for (const [key, sum] of sums) expect(sum, key).toBeLessThanOrEqual(1.000001)
  })

  it('C03 参考价为正，亲和度在 0–1', () => {
    for (const row of priceRows) expect(row.referencePriceCents).toBeGreaterThan(0)
    for (const row of affinityRows) {
      expect(row.affinity).toBeGreaterThanOrEqual(0)
      expect(row.affinity).toBeLessThanOrEqual(1)
    }
  })

  it('C04 平台生命周期年份单调、结束年大于上市年、装机非负', () => {
    for (const p of platforms) {
      expect(p.lifecycle.launchYear).toBeLessThanOrEqual(p.lifecycle.peakYear)
      expect(p.lifecycle.peakYear).toBeLessThanOrEqual(p.lifecycle.endYear)
      expect(p.lifecycle.endYear).toBeGreaterThan(p.lifecycle.launchYear)
      expect(p.lifecycle.installBaseUnits.length).toBe(p.lifecycle.endYear - p.lifecycle.launchYear + 1)
      for (const value of p.lifecycle.installBaseUnits) expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  it('C05 1970–2026 每一年至少一个平台可售', () => {
    for (let year = 1970; year <= 2026; year += 1) {
      const day = gregorianToDayIndex(year, 6, 1)
      const active = platforms.filter((p) => platformAvailability(p.id, day) > 0)
      expect(active.length, `year ${year}`).toBeGreaterThan(0)
    }
  })

  it('C06 装机在峰值年等于 peakUnits，结束后 12 个月归零', () => {
    const peakDay = gregorianToDayIndex(2015, 1, 1)
    expect(platformInstallBaseUnits('digital_download', peakDay)).toBeGreaterThan(0)
    const after = gregorianToDayIndex(2028, 1, 1)
    expect(platformInstallBaseUnits('digital_download', after)).toBe(0)
    expect(platformAvailability('digital_download', after)).toBe(0)
  })

  it('C07 年度份额线性插值，边界 clamp', () => {
    const before = platformMarketShare('home_console_g2', 'north_america', gregorianToDayIndex(1975, 1, 1))
    const atLaunch = platformMarketShare('home_console_g2', 'north_america', gregorianToDayIndex(1976, 1, 1))
    expect(before).toBeGreaterThan(0)
    expect(atLaunch).toBeGreaterThan(0)
    const afterEnd = platformMarketShare('home_console_g2', 'north_america', gregorianToDayIndex(1990, 1, 1))
    expect(afterEnd).toBeGreaterThan(0)
  })

  it('C08 价格与亲和度缺失时回退', () => {
    expect(referencePriceCents('unknown_genre', 'pc_windows', 'pc_gamers')).toBe(C1_DEFAULT_REFERENCE_PRICE_CENTS)
    expect(genreSegmentAffinity('unknown_genre', 'pc_gamers')).toBe(0.5)
  })

  it('C09 同一天同平台×市场的受众份额和 ≤1', () => {
    const day = gregorianToDayIndex(1988, 6, 1)
    for (const p of platforms) {
      for (const m of markets) {
        let sum = 0
        for (const s of segments) sum += platformSegmentShare(p.id, m.id, s.id, day)
        expect(sum, `${p.id}:${m.id}`).toBeLessThanOrEqual(1.000001)
      }
    }
  })

  it('C10 scope 构建不产生重复 key，且份额非零', () => {
    const day = gregorianToDayIndex(1988, 6, 1)
    const scopes = buildDemandScopesForDay({ dayIndex: day })
    const keys = new Set(scopes.map((s) => `${s.marketId}:${s.platformId}:${s.segmentId}`))
    expect(keys.size).toBe(scopes.length)
    for (const s of scopes) {
      expect(s.installBaseUnits).toBeGreaterThan(0)
      expect(s.activityRate).toBeGreaterThan(0)
      expect(s.marketShare).toBeGreaterThan(0)
      expect(s.segmentShare).toBeGreaterThan(0)
    }
    expect(scopes.length).toBeGreaterThan(0)
  })

  it('C11 平台活动率在生命周期内为正', () => {
    for (const p of platforms) {
      const day = gregorianToDayIndex(p.lifecycle.peakYear, 6, 1)
      expect(platformActivityRate(p.id, day)).toBeGreaterThan(0)
    }
  })
})
