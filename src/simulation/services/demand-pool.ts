/**
 * DemandPool —— M3-C1 Stage 0 纯函数（DECISION-M3-C1-001 v1.3 §3/§7）。
 *
 * 单位所有权：installBase × activity × marketShare × segmentShare × purchaseIntent。
 * 价格只进 attraction.value，不进 purchaseIntent。
 * 份额守恒：同一 scope Σ allocatedUnits ≤ audienceUnits。
 */
import { TUNING } from '@content/tuning'

export interface DemandScopeInput {
  marketId: string
  platformId: string
  segmentId: string
  installBaseUnits: number
  activityRate: number
  marketShare: number
  segmentShare: number
  /** 0 = 平台已退市/不可售；缺省 1 */
  availability?: number
}

export interface DemandProductInput {
  productId: string
  companyId: string
  status: 'active' | 'retired'
  supportedPlatformIds: string[]
  audienceSegmentIds: string[]
  awarenessByScope: Record<string, number>
  quality01: number
  brand01: number
  referencePriceCents: number
  effectivePriceCents: number
  /** 类型×受众亲和，0–1；缺省 0.5 */
  genreAffinityBySegment: Record<string, number>
  /** 平台×类型匹配，0–1；缺省 1 */
  platformFitByPlatform?: Record<string, number>
  /** 上市前 90 天的认知下限，已由调用方按质量门算好；0 = 不启用 */
  launchAwarenessFloor?: number
  launchDay: number
  /** 清仓期 availability 乘数，缺省 1 */
  clearanceAvailability?: number
}

export interface DemandScopeResult {
  scopeKey: string
  marketId: string
  platformId: string
  segmentId: string
  audienceUnits: number
  poolUnitsTotal: number
  allocatedUnitsTotal: number
  rows: DemandRow[]
}

export interface DemandRow {
  productId: string
  companyId: string
  scopeKey: string
  audienceUnits: number
  poolUnits: number
  purchaseIntent: number
  awareness01: number
  attraction: number
  share: number
  allocatedUnits: number
}

export interface DemandDayResult {
  dayIndex: number
  scopes: DemandScopeResult[]
  totalAllocatedUnits: number
  totalAudienceUnits: number
}

export interface DemandTuning {
  theta: number
  awarenessCap: number
  launchFloorDays: number
  attractionExponents: {
    awareness: number
    quality: number
    value: number
    fit: number
    brand: number
  }
}

export const DEFAULT_DEMAND_TUNING: DemandTuning = {
  theta: 1.5,
  awarenessCap: 0.6,
  launchFloorDays: 90,
  attractionExponents: {
    awareness: 0.35,
    quality: 0.30,
    value: 0.15,
    fit: 0.10,
    brand: 0.05,
  },
}

export function scopeKeyOf(scope: Pick<DemandScopeInput, 'marketId' | 'platformId' | 'segmentId'>): string {
  return `${scope.marketId}:${scope.platformId}:${scope.segmentId}`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 四层单位所有权，各乘一次。 */
export function computeAudienceUnits(scope: DemandScopeInput): number {
  return (
    nonNegative(scope.installBaseUnits) *
    clamp(scope.activityRate, 0, 1) *
    clamp(scope.marketShare, 0, 1) *
    clamp(scope.segmentShare, 0, 1)
  )
}

/** 购买意图只含类型/平台匹配；价格不在这里。 */
export function computePurchaseIntent(product: DemandProductInput, segmentId: string, platformId: string): number {
  const genreAffinity = clamp(product.genreAffinityBySegment[segmentId] ?? 0.5, 0, 1)
  const platformFit = clamp(product.platformFitByPlatform?.[platformId] ?? 1, 0, 1)
  return clamp(genreAffinity * platformFit, 0, 1)
}

export function computeLaunchAwarenessFloor(params: {
  storeVisibility: number
  genreMatch: number
  finalQualityScore: number
}): number {
  const qualityGate = clamp((params.finalQualityScore - 40) / 40, 0, 1)
  const base = 0.05 + 0.10 * clamp(params.storeVisibility, 0, 1) * clamp(params.genreMatch, 0, 1)
  return clamp(base, 0, 0.15) * qualityGate
}

export function computeAwareness01(params: {
  awareness: number
  launchAwarenessFloor: number
  dayIndex: number
  launchDay: number
  tuning?: Pick<DemandTuning, 'awarenessCap' | 'launchFloorDays'>
}): number {
  const tuning = params.tuning ?? DEFAULT_DEMAND_TUNING
  const raw = clamp(params.awareness / tuning.awarenessCap, 0, 1)
  const elapsed = params.dayIndex - params.launchDay
  if (elapsed < 0) return 0
  const floorWindow = tuning.launchFloorDays
  let floor = 0
  if (elapsed < floorWindow) {
    floor = clamp(params.launchAwarenessFloor, 0, 1)
  } else if (elapsed < floorWindow * 2) {
    // 窗口结束后 90 天线性淡出，避免第 90 天直接掉到 0
    const fade = 1 - (elapsed - floorWindow) / floorWindow
    floor = clamp(params.launchAwarenessFloor, 0, 1) * clamp(fade, 0, 1)
  }
  return Math.max(raw, floor)
}

export function computeValue(referencePriceCents: number, effectivePriceCents: number): number {
  if (effectivePriceCents <= 0) return 1.5
  return clamp(referencePriceCents / effectivePriceCents, 0.5, 1.5)
}

export function computeMarketingLift(spendCents: number, marketingBaseCents: number): number {
  const base = Math.max(1, marketingBaseCents)
  return clamp(1 + 0.5 * Math.log1p(nonNegative(spendCents) / base), 1.0, 2.0)
}

export function computeAttraction(params: {
  awareness01: number
  quality01: number
  value: number
  fit: number
  brand01: number
  marketingLift?: number
  availability?: number
  tuning?: Pick<DemandTuning, 'attractionExponents'>
}): number {
  const e = (params.tuning ?? DEFAULT_DEMAND_TUNING).attractionExponents
  return (
    Math.pow(clamp(params.awareness01, 0, 1), e.awareness) *
    Math.pow(clamp(params.quality01, 0, 1), e.quality) *
    Math.pow(clamp(params.value, 0, 1.5), e.value) *
    Math.pow(clamp(params.fit, 0, 1), e.fit) *
    Math.pow(clamp(params.brand01, 0, 1), e.brand) *
    nonNegative(params.marketingLift ?? 1) *
    clamp(params.availability ?? 1, 0, 1)
  )
}

function computeFit(product: DemandProductInput, scope: DemandScopeInput): number {
  const genre = clamp(product.genreAffinityBySegment[scope.segmentId] ?? 0.5, 0, 1)
  const platform = clamp(product.platformFitByPlatform?.[scope.platformId] ?? 1, 0, 1)
  return clamp(genre * platform, 0.05, 1)
}

function productSupportsScope(product: DemandProductInput, scope: DemandScopeInput): boolean {
  return (
    product.status === 'active' &&
    product.supportedPlatformIds.includes(scope.platformId) &&
    product.audienceSegmentIds.includes(scope.segmentId)
  )
}

/**
 * 同一 scope 内按 attraction^θ 分份额；整数用最大余数法。
 * 每个产品上限 floor(poolUnits)，总量上限 floor(audienceUnits)。
 */
export function allocateScope(params: {
  audienceUnits: number
  candidates: Array<{ productId: string; poolUnits: number; attraction: number }>
  theta?: number
}): { allocations: Map<string, { share: number; allocatedUnits: number }>; totalUnits: number; droppedUnits: number } {
  const theta = params.theta ?? DEFAULT_DEMAND_TUNING.theta
  const audience = Math.max(0, Math.floor(nonNegative(params.audienceUnits)))
  const candidates = params.candidates
    .filter((c) => nonNegative(c.poolUnits) > 0 && Number.isFinite(c.attraction) && c.attraction > 0)
    .slice()
    .sort((a, b) => a.productId.localeCompare(b.productId))

  const allocations = new Map<string, { share: number; allocatedUnits: number }>()
  if (candidates.length === 0 || audience === 0) {
    return { allocations, totalUnits: 0, droppedUnits: 0 }
  }

  const weights = candidates.map((c) => Math.pow(c.attraction, theta))
  const weightSum = weights.reduce((sum, w) => sum + w, 0)
  if (!Number.isFinite(weightSum) || weightSum <= 0) {
    return { allocations, totalUnits: 0, droppedUnits: 0 }
  }

  const raw = candidates.map((c, index) => {
    const share = weights[index]! / weightSum
    const rawUnits = nonNegative(c.poolUnits) * share
    const cap = Math.floor(nonNegative(c.poolUnits))
    const units = Math.min(cap, Math.floor(rawUnits))
    return {
      productId: c.productId,
      share,
      rawUnits,
      cap,
      units,
      remainder: rawUnits - Math.floor(rawUnits),
    }
  })

  let total = raw.reduce((sum, r) => sum + r.units, 0)
  const rawSum = raw.reduce((sum, r) => sum + r.rawUnits, 0)
  const target = Math.min(audience, Math.floor(rawSum), raw.reduce((sum, r) => sum + r.cap, 0))
  const residual = Math.max(0, target - total)

  const byRemainder = raw
    .slice()
    .sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder
      return a.productId.localeCompare(b.productId)
    })

  let left = residual
  for (const row of byRemainder) {
    if (left <= 0) break
    if (row.units >= row.cap) continue
    row.units += 1
    left -= 1
    total += 1
  }

  for (const row of raw) {
    allocations.set(row.productId, { share: row.share, allocatedUnits: row.units })
  }
  return { allocations, totalUnits: total, droppedUnits: Math.max(0, rawSum - total) }
}

/** 一天的完整需求池：先算 audience，再按 scope 分配。 */
export function buildDailyDemand(params: {
  dayIndex: number
  scopes: DemandScopeInput[]
  products: DemandProductInput[]
  tuning?: DemandTuning
}): DemandDayResult {
  const tuning = params.tuning ?? DEFAULT_DEMAND_TUNING
  const results: DemandScopeResult[] = []
  let totalAllocated = 0
  let totalAudience = 0

  for (const scope of params.scopes.slice().sort((a, b) => scopeKeyOf(a).localeCompare(scopeKeyOf(b)))) {
    const key = scopeKeyOf(scope)
    const audienceUnits = computeAudienceUnits(scope)
    const availability = clamp(scope.availability ?? 1, 0, 1)
    if (audienceUnits <= 0 || availability <= 0) {
      results.push({
        scopeKey: key,
        marketId: scope.marketId,
        platformId: scope.platformId,
        segmentId: scope.segmentId,
        audienceUnits,
        poolUnitsTotal: 0,
        allocatedUnitsTotal: 0,
        rows: [],
      })
      totalAudience += audienceUnits
      continue
    }

    const candidates = []
    for (const product of params.products) {
      if (!productSupportsScope(product, scope)) continue
      const purchaseIntent = computePurchaseIntent(product, scope.segmentId, scope.platformId)
      const poolUnits = audienceUnits * purchaseIntent
      if (poolUnits <= 0) continue
      const awareness = product.awarenessByScope[key]
      if (awareness === undefined) continue
      const awareness01 = computeAwareness01({
        awareness,
        launchAwarenessFloor: product.launchAwarenessFloor ?? 0,
        dayIndex: params.dayIndex,
        launchDay: product.launchDay,
        tuning,
      })
      const attraction = computeAttraction({
        awareness01,
        quality01: product.quality01,
        value: computeValue(product.referencePriceCents, product.effectivePriceCents),
        fit: computeFit(product, scope),
        brand01: product.brand01,
        availability: availability * clamp(product.clearanceAvailability ?? 1, 0, 1),
        tuning,
      })
      candidates.push({ productId: product.productId, companyId: product.companyId, purchaseIntent, poolUnits, awareness01, attraction })
    }

    const allocation = allocateScope({ audienceUnits, candidates, theta: tuning.theta })
    const rows: DemandRow[] = candidates
      .slice()
      .sort((a, b) => a.productId.localeCompare(b.productId))
      .map((candidate) => {
        const a = allocation.allocations.get(candidate.productId)
        return {
          productId: candidate.productId,
          companyId: candidate.companyId,
          scopeKey: key,
          audienceUnits,
          poolUnits: candidate.poolUnits,
          purchaseIntent: candidate.purchaseIntent,
          awareness01: candidate.awareness01,
          attraction: candidate.attraction,
          share: a?.share ?? 0,
          allocatedUnits: a?.allocatedUnits ?? 0,
        }
      })

    const allocated = rows.reduce((sum, row) => sum + row.allocatedUnits, 0)
    results.push({
      scopeKey: key,
      marketId: scope.marketId,
      platformId: scope.platformId,
      segmentId: scope.segmentId,
      audienceUnits,
      poolUnitsTotal: candidates.reduce((sum, c) => sum + c.poolUnits, 0),
      allocatedUnitsTotal: allocated,
      rows,
    })
    totalAllocated += allocated
    totalAudience += audienceUnits
  }

  return {
    dayIndex: params.dayIndex,
    scopes: results,
    totalAllocatedUnits: totalAllocated,
    totalAudienceUnits: totalAudience,
  }
}

/** 从 TUNING 读取 C1 需求池参数；缺省回退默认值。 */
export function demandTuningFromContent(): DemandTuning {
  const c1 = (TUNING as unknown as { c1?: { demand?: Partial<DemandTuning> } }).c1?.demand
  return {
    ...DEFAULT_DEMAND_TUNING,
    ...c1,
    attractionExponents: {
      ...DEFAULT_DEMAND_TUNING.attractionExponents,
      ...(c1?.attractionExponents ?? {}),
    },
  }
}
