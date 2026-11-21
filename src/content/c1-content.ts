/**
 * C1 Stage 0–2 内容读取：平台生命周期、市场/受众份额、参考价、类型亲和。
 * 年度值线性插值到日；边界 clamp；缺失按规格缺省规则。
 */
import platforms from '@content/platforms.json'
import marketRegions from '@content/market_regions.json'
import consumerSegments from '@content/consumer_segments.json'
import platformMarketShareRows from '@content/platform-market-share.json'
import platformSegmentShareRows from '@content/platform-segment-share.json'
import priceReferenceRows from '@content/price-reference.json'
import genreSegmentAffinityRows from '@content/genre-segment-affinity.json'
import { dayIndexToGregorian, gregorianToDayIndex, isLeapYear, dayOfYear } from '@domain/value-objects/day-index'
import type { DemandScopeInput } from '@simulation/services/demand-pool'

export const C1_DEFAULT_REFERENCE_PRICE_CENTS = 2999
export const C1_DEFAULT_AFFINITY = 0.5

export interface PlatformLifecycle {
  launchYear: number
  peakYear: number
  endYear: number
  peakUnits: number
  installBaseUnits: number[]
  activityRate: number[]
  relativeIndex: number[]
  source: string
}

interface PlatformWithLifecycle {
  id: string
  displayName: string
  displayNameZh: string
  platformType: string
  earliestAvailabilityYear: number
  platformFee: number
  lifecycle?: PlatformLifecycle
}

interface MarketShareRow {
  platformId: string
  marketId: string
  year: number
  share: number
}

interface SegmentShareRow {
  platformId: string
  marketId: string
  segmentId: string
  year: number
  share: number
}

interface PriceReferenceRow {
  genreId: string
  platformType: string
  segmentId: string
  referencePriceCents: number
  source: string
}

interface AffinityRow {
  genreId: string
  segmentId: string
  affinity: number
}

const platformList = platforms as PlatformWithLifecycle[]

const marketWeightById = new Map(
  marketRegions.map((m) => [m.id, (m as { populationWeight?: number }).populationWeight ?? 1 / marketRegions.length] as const),
)
const marketWeightSum = Array.from(marketWeightById.values()).reduce((sum, w) => sum + w, 0)

function buildYearIndex<T extends { year: number }>(rows: T[], keyOf: (row: T) => string): Map<string, Map<number, number>> {
  const index = new Map<string, Map<number, number>>()
  for (const row of rows) {
    const key = keyOf(row)
    let bucket = index.get(key)
    if (!bucket) {
      bucket = new Map<number, number>()
      index.set(key, bucket)
    }
    bucket.set(row.year, (row as unknown as { share?: number; referencePriceCents?: number }).share ?? (row as unknown as { referencePriceCents?: number }).referencePriceCents ?? 0)
  }
  return index
}

const marketShareIndex = buildYearIndex(platformMarketShareRows as MarketShareRow[], (r) => `${r.platformId}:${r.marketId}`)
const segmentShareIndex = buildYearIndex(
  platformSegmentShareRows as SegmentShareRow[],
  (r) => `${r.platformId}:${r.marketId}:${r.segmentId}`,
)
const priceByKey = new Map(
  (priceReferenceRows as PriceReferenceRow[]).map((r) => [`${r.genreId}:${r.platformType}:${r.segmentId}`, r.referencePriceCents] as const),
)
const affinityByKey = new Map(
  (genreSegmentAffinityRows as AffinityRow[]).map((r) => [`${r.genreId}:${r.segmentId}`, r.affinity] as const),
)

export function getPlatformLifecycle(platformId: string): PlatformLifecycle | null {
  return platformList.find((p) => p.id === platformId)?.lifecycle ?? null
}

export function getPlatformType(platformId: string): string | null {
  return platformList.find((p) => p.id === platformId)?.platformType ?? null
}

export function calendarOfDay(dayIndex: number): { year: number; dayOfYear: number; fraction: number } {
  const g = dayIndexToGregorian(dayIndex)
  const doy = dayOfYear(g.year, g.month, g.day)
  const yearDays = isLeapYear(g.year) ? 366 : 365
  return { year: g.year, dayOfYear: doy, fraction: (doy - 1) / yearDays }
}

function interpolateAnnual(index: Map<number, number> | undefined, dayIndex: number): number {
  if (!index || index.size === 0) return 0
  const { year, fraction } = calendarOfDay(dayIndex)
  const years = Array.from(index.keys()).sort((a, b) => a - b)
  const first = years[0]!
  const last = years[years.length - 1]!
  if (year < first) return index.get(first) ?? 0
  if (year >= last) return index.get(last) ?? 0
  if (index.has(year)) {
    const current = index.get(year)!
    const next = years.find((y) => y > year)
    if (next === undefined) return current
    return current + ((index.get(next) ?? current) - current) * fraction
  }
  const prev = [...years].reverse().find((y) => y < year)
  const next = years.find((y) => y > year)
  const prevValue = prev === undefined ? 0 : index.get(prev) ?? 0
  const nextValue = next === undefined ? prevValue : index.get(next) ?? prevValue
  return prevValue + (nextValue - prevValue) * fraction
}

function lifecycleYearOffset(lifecycle: PlatformLifecycle, year: number): number {
  return year - lifecycle.launchYear
}

function clampIndex(values: number[], index: number): number {
  if (values.length === 0) return 0
  return values[Math.min(values.length - 1, Math.max(0, index))] ?? 0
}

/** 平台累计装机/保有量，按年数组插值；结束年之后 12 个月线性归零。 */
export function platformInstallBaseUnits(platformId: string, dayIndex: number): number {
  const lifecycle = getPlatformLifecycle(platformId)
  if (!lifecycle) return 0
  const { year } = calendarOfDay(dayIndex)
  if (year < lifecycle.launchYear) return 0
  if (year <= lifecycle.endYear) {
    return interpolateAnnual(
      new Map(lifecycle.installBaseUnits.map((value, index) => [lifecycle.launchYear + index, value])),
      dayIndex,
    )
  }
  if (year > lifecycle.endYear + 1) return 0
  const endValue = lifecycle.installBaseUnits[lifecycle.installBaseUnits.length - 1] ?? 0
  const tailStart = gregorianToDayIndex(lifecycle.endYear + 1, 1, 1)
  const tailEnd = gregorianToDayIndex(lifecycle.endYear + 2, 1, 1)
  const progress = (dayIndex - tailStart) / Math.max(1, tailEnd - tailStart)
  return Math.max(0, endValue * (1 - progress))
}

export function platformActivityRate(platformId: string, dayIndex: number): number {
  const lifecycle = getPlatformLifecycle(platformId)
  if (!lifecycle) return 0.05
  const { year } = calendarOfDay(dayIndex)
  if (year < lifecycle.launchYear || year > lifecycle.endYear) {
    const edge = year < lifecycle.launchYear ? 0 : lifecycle.activityRate.length - 1
    return clampIndex(lifecycle.activityRate, edge)
  }
  return interpolateAnnual(
    new Map(lifecycle.activityRate.map((value, index) => [lifecycle.launchYear + index, value])),
    dayIndex,
  )
}

/** endYear + 12 个月之后 availability=0。 */
export function platformAvailability(platformId: string, dayIndex: number): number {
  const lifecycle = getPlatformLifecycle(platformId)
  if (!lifecycle) return 0
  const cutoff = gregorianToDayIndex(lifecycle.endYear + 2, 1, 1)
  return dayIndex >= cutoff ? 0 : 1
}

export function platformMarketShare(platformId: string, marketId: string, dayIndex: number): number {
  return interpolateAnnual(marketShareIndex.get(`${platformId}:${marketId}`), dayIndex)
}

export function platformSegmentShare(platformId: string, marketId: string, segmentId: string, dayIndex: number): number {
  const lifecycle = getPlatformLifecycle(platformId)
  const { year } = calendarOfDay(dayIndex)
  if (!lifecycle || year < lifecycle.launchYear || year > lifecycle.endYear + 1) return 0
  const exact = segmentShareIndex.get(`${platformId}:${marketId}:${segmentId}`)
  if (exact) {
    const firstYear = Math.min(...Array.from(exact.keys()))
    if (calendarOfDay(dayIndex).year < firstYear) return 0
    return interpolateAnnual(exact, dayIndex)
  }
  const marketRows = Array.from(segmentShareIndex.entries()).filter(([key]) => key.startsWith(`${platformId}:${marketId}:`))
  if (marketRows.length === 0) {
    const segment = consumerSegments.find((s) => s.id === segmentId)
    if (!segment || segment.availableYearStart > calendarOfDay(dayIndex).year) return 0
    const available = consumerSegments.filter((s) => s.availableYearStart <= calendarOfDay(dayIndex).year)
    return available.length > 0 ? 1 / available.length : 0
  }
  return 0
}

export function referencePriceCents(genreId: string, platformId: string, segmentId: string): number {
  const platformType = getPlatformType(platformId)
  if (!platformType) return C1_DEFAULT_REFERENCE_PRICE_CENTS
  return priceByKey.get(`${genreId}:${platformType}:${segmentId}`) ?? C1_DEFAULT_REFERENCE_PRICE_CENTS
}

export function genreSegmentAffinity(genreId: string, segmentId: string): number {
  return affinityByKey.get(`${genreId}:${segmentId}`) ?? C1_DEFAULT_AFFINITY
}

/** 某天所有可售平台×市场×受众的 scope；份额为 0 的跳过。 */
export function buildDemandScopesForDay(params: {
  dayIndex: number
  platformIds?: string[]
  marketIds?: string[]
  segmentIds?: string[]
}): DemandScopeInput[] {
  const { dayIndex } = params
  const { year } = calendarOfDay(dayIndex)
  const platformIds = params.platformIds ?? platformList.map((p) => p.id)
  const marketIds = params.marketIds ?? marketRegions.map((m) => m.id)
  const segmentIds =
    params.segmentIds ??
    consumerSegments.filter((s) => s.availableYearStart <= year).map((s) => s.id)

  const scopes: DemandScopeInput[] = []
  for (const platformId of platformIds) {
    const availability = platformAvailability(platformId, dayIndex)
    if (availability <= 0) continue
    const installBaseUnits = platformInstallBaseUnits(platformId, dayIndex)
    if (installBaseUnits <= 0) continue
    const activityRate = platformActivityRate(platformId, dayIndex)
    for (const marketId of marketIds) {
      const marketShare = platformMarketShare(platformId, marketId, dayIndex)
      if (marketShare <= 0) continue
      for (const segmentId of segmentIds) {
        const segmentShare = platformSegmentShare(platformId, marketId, segmentId, dayIndex)
        if (segmentShare <= 0) continue
        scopes.push({
          marketId,
          platformId,
          segmentId,
          installBaseUnits,
          activityRate,
          marketShare,
          segmentShare,
          availability,
        })
      }
    }
  }
  return scopes
}

/** 市场人口权重缺省份额（内容缺行时用）。 */
export function defaultMarketShare(marketId: string): number {
  const weight = marketWeightById.get(marketId) ?? 1 / marketRegions.length
  return marketWeightSum > 0 ? weight / marketWeightSum : 1 / marketRegions.length
}

export function platformYears(platformId: string): { launchYear: number; endYear: number } | null {
  const lifecycle = getPlatformLifecycle(platformId)
  if (!lifecycle) return null
  return { launchYear: lifecycle.launchYear, endYear: lifecycle.endYear }
}

export function lifecycleIndexForYear(platformId: string, year: number): number {
  const lifecycle = getPlatformLifecycle(platformId)
  if (!lifecycle) return -1
  return lifecycleYearOffset(lifecycle, year)
}
