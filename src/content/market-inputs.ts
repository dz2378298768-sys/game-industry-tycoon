/**
 * M2-H 内容层：市场输入权威表（DESIGN-M2-001-H v1.1 §4.1）。
 *
 * 约束：
 *   - 本表是 content 层唯一权威，调平衡只改这里，不改公式与服务；
 *   - 数值均为**设计初值**，无第三方数据来源，待 M5 经济校准（`M2-EXIT-VERIFICATION-002` 记录实测）；
 *   - 单位写在字段名里（人口=百万人、份额=比例、兴趣=比例）。
 */
import type { MarketInputBundle, MarketInputProvider } from '@simulation/services/sales-types'
import { yearOfDay } from './queries'
import { PLATFORM_CATEGORY_MAP } from '@simulation/services/sales-formulas'

export interface MarketProfile {
  populationMillions: number
  /** 市场开放年份（该年之前不发售） */
  launchYear: number
  /** 竞争强度，0–1 */
  competitionFactor: number
}

export interface SegmentProfile {
  /** 该定位占市场人口的比例 */
  audienceShare: number
  /** 品类兴趣，0–1 */
  categoryInterest: number
  /** 自然考虑集基准，0–1 */
  baseConsideration: number
}

/** 市场人口（百万人）/ 开放年 / 竞争（设计初值，待 M5 校准） */
export const MARKET_PROFILE: Readonly<Record<string, MarketProfile>> = Object.freeze({
  north_america: { populationMillions: 220, launchYear: 1970, competitionFactor: 0.22 },
  western_europe: { populationMillions: 350, launchYear: 1970, competitionFactor: 0.24 },
  japan: { populationMillions: 105, launchYear: 1970, competitionFactor: 0.18 },
  east_asia: { populationMillions: 800, launchYear: 1985, competitionFactor: 0.3 },
  south_america: { populationMillions: 200, launchYear: 1990, competitionFactor: 0.32 },
  rest_of_world: { populationMillions: 1200, launchYear: 1980, competitionFactor: 0.35 },
})

/** 定位份额 / 兴趣 / 考虑基准（校准目标：街机 vs 家用机 30 天差 30%–45%） */
export const SEGMENT_PROFILE: Readonly<Record<string, SegmentProfile>> = Object.freeze({
  arcade_enthusiasts: { audienceShare: 0.006, categoryInterest: 0.8, baseConsideration: 0.55 },
  home_players: { audienceShare: 0.013, categoryInterest: 0.55, baseConsideration: 0.5 },
  pc_gamers: { audienceShare: 0.012, categoryInterest: 0.65, baseConsideration: 0.52 },
  casual_players: { audienceShare: 0.05, categoryInterest: 0.4, baseConsideration: 0.45 },
  online_gamers: { audienceShare: 0.03, categoryInterest: 0.6, baseConsideration: 0.5 },
  mobile_gamers: { audienceShare: 0.12, categoryInterest: 0.45, baseConsideration: 0.42 },
})

/** 平台类别的触达比例（装机/铺货覆盖） */
export const PLATFORM_REACH: Readonly<Record<string, number>> = Object.freeze({
  arcade: 0.06,
  console: 0.12,
  pc: 0.1,
  digital: 0.2,
})

/** 初始认知度（上市首发曝光）：brand 0–100 → 0.03–0.09，夹在 0.02–0.12 */
export const INITIAL_AWARENESS = Object.freeze({
  base: 0.03,
  perBrandPoint: 0.0006,
  min: 0.02,
  max: 0.12,
})

export function seedInitialAwareness(
  brand: number,
  dayIndex: number,
): Record<string, number> {
  const year = yearOfDay(dayIndex)
  const raw = INITIAL_AWARENESS.base + (brand / 100) * (INITIAL_AWARENESS.perBrandPoint * 100)
  const value = Math.min(INITIAL_AWARENESS.max, Math.max(INITIAL_AWARENESS.min, raw))
  const out: Record<string, number> = {}
  for (const [marketId, profile] of Object.entries(MARKET_PROFILE)) {
    if (profile.launchYear <= year) out[marketId] = Number(value.toFixed(4))
  }
  return out
}

export function buildMarketInput(
  marketId: string,
  platformId: string,
  segmentId: string,
  dayIndex: number,
): MarketInputBundle | null {
  const market = MARKET_PROFILE[marketId]
  const segment = SEGMENT_PROFILE[segmentId]
  if (market === undefined || segment === undefined) return null
  if (market.launchYear > yearOfDay(dayIndex)) return null
  const category = PLATFORM_CATEGORY_MAP[platformId]
  if (category === undefined) return null
  const reach = PLATFORM_REACH[category] ?? 0
  if (reach <= 0) return null
  const eligibleAudience = Math.round(
    market.populationMillions * 1_000_000 * segment.audienceShare * reach,
  )
  return {
    eligibleAudience,
    competitionFactor: market.competitionFactor,
    categoryInterest: segment.categoryInterest,
    baseConsideration: segment.baseConsideration,
    dailyMarketingSpendCents: 0,
  }
}

export function createContentMarketInputProvider(): MarketInputProvider {
  return {
    getMarketInput: ({ marketId, platformId, segmentId, dayIndex }) =>
      buildMarketInput(marketId, platformId, segmentId, dayIndex),
  }
}
