/**
 * 销售管线纯公式层（TASK-M2-001-B §10.3 / §10.4 / §10.5）。
 *
 * 约束：
 *   - 本文件不得 import `@content/tuning`，所有可调数值由调用方注入 `SalesTuning` 快照。
 *   - 生产公式代码只出现 0 / 1 / −1 三个裸字面量；其余数值经 `SALES_FORMULA_CONSTANTS` 引用。
 *   - 纯函数：不读全局状态、不读写存档、不调用 `Date.now` / `Math.random`。
 */
import type { ProductLifecycleStage } from '@domain/enums'
import type { RngContext } from '@simulation/deterministic/prng'
import { fnv1a } from '@simulation/deterministic/prng'
import type {
  PlatformCategory,
  QualityWeights,
  SalesDemandFactorId,
  SalesDemandFactorTrace,
  SalesExplanation,
  SalesFinancialFactorTrace,
  SalesPipelineInput,
  SalesRandom,
  SalesStageTrace,
  SalesTuning,
  SalesFormulaMeta,
} from './sales-types'

// ===== 结构常量（冻结，非 TUNING；§10.5.2）=====
export const SALES_FORMULA_CONSTANTS = Object.freeze({
  QUALITY_BASELINE: 60,
  QUALITY_LIFT_COEFFICIENT: 0.5,
  REVIEW_BASELINE: 60,
  DEFECT_BASELINE: 30,
  REFUND_SLOPE: 0.2,
  PRICE_STEP_RATIO: 1.1,
  PERCENT_DENOMINATOR: 100,
  LOG_EPSILON: 1e-12,
  VERSION: 'sales-formulas-v1',
})

export const FORMULA_CONSTANTS_VERSION = SALES_FORMULA_CONSTANTS.VERSION
export const ALGORITHM_VERSION = 'mulberry32-v1'

/** 显式平台 → 类别映射（14 条，唯一权威，§10.2.1） */
export const PLATFORM_CATEGORY_MAP: Readonly<Record<string, PlatformCategory>> = Object.freeze({
  arcade_pre_1975: 'arcade',
  arcade_classic: 'arcade',
  pinball: 'arcade',
  home_console_g1: 'console',
  home_console_g2: 'console',
  home_console_g3: 'console',
  home_console_g4: 'console',
  home_console_g5: 'console',
  pc_pre_ibm: 'pc',
  pc_ibm_compatible: 'pc',
  pc_windows: 'pc',
  pc_online: 'pc',
  mobile_g1: 'digital',
  digital_download: 'digital',
})

export class SalesError extends Error {
  public readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'SalesError'
    this.code = code
  }
}

export interface PlatformFeeResolution {
  rate: number
  source: 'platform' | 'category' | 'tuning'
  unknownPlatform: boolean
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 消除 -0 */
export function normalizeZero(value: number): number {
  return value === 0 ? 0 : value
}

export function clampAwareness(awareness: number, cap: number): number {
  return normalizeZero(clamp(awareness, 0, cap))
}

/** 随机扰动：clamp(1 + 高斯采样, range) */
export function clampPerturbation(sample: number, tuning: SalesTuning): number {
  return normalizeZero(
    clamp(1 + sample, tuning.randomPerturbationRange.min, tuning.randomPerturbationRange.max),
  )
}

/**
 * 平台抽成三态解析（§10.2）：
 *   ① 平台不存在 → 由调用方跳过（本函数不处理存在性）
 *   ② 记录值为有限数 ∈ [0,1] → 记录值（platform）
 *   ③ 缺失/非数/越界 → 显式映射类别默认（category）
 *   ④ id 不在 14 条映射 → TUNING 兜底（tuning）并置 unknownPlatform
 */
export function resolvePlatformFeeRate(
  platformId: string,
  platformFee: number | null | undefined,
  tuning: SalesTuning,
): PlatformFeeResolution {
  if (
    typeof platformFee === 'number' &&
    Number.isFinite(platformFee) &&
    platformFee >= 0 &&
    platformFee <= 1
  ) {
    return { rate: platformFee, source: 'platform', unknownPlatform: false }
  }
  const category = PLATFORM_CATEGORY_MAP[platformId]
  if (category !== undefined) {
    return {
      rate: tuning.platformFeeRateByCategory[category],
      source: 'category',
      unknownPlatform: false,
    }
  }
  return {
    rate: tuning.platformFeeRateFallback,
    source: 'tuning',
    unknownPlatform: true,
  }
}

const QUALITY_DIMENSIONS = ['gameplay', 'technical', 'content', 'art', 'innovation'] as const

function isValidWeights(value: unknown): value is QualityWeights {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  let sum = 0
  for (const field of QUALITY_DIMENSIONS) {
    const n = candidate[field]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return false
    sum += n
  }
  return sum > 0
}

/** 质量权重来源：segment → genre → tuning（§10.2 输入解析表） */
export function resolveQualityWeights(
  segmentWeights: unknown,
  genreWeights: unknown,
  tuningDefault: QualityWeights,
): { weights: QualityWeights; source: 'segment' | 'genre' | 'tuning' } {
  if (isValidWeights(segmentWeights)) {
    return { weights: { ...segmentWeights }, source: 'segment' }
  }
  if (isValidWeights(genreWeights)) {
    return { weights: { ...genreWeights }, source: 'genre' }
  }
  return { weights: { ...tuningDefault }, source: 'tuning' }
}

/** 质量分 = Σ(维度 × 权重) / Σ权重；画像缺失/非法 → TUNING 兜底 */
export function computeWeightedQuality(
  profile: unknown,
  weights: QualityWeights,
  fallback: number,
): { score: number; source: 'profile' | 'fallback' } {
  if (!isValidWeights(profile)) {
    return { score: fallback, source: 'fallback' }
  }
  let weighted = 0
  let total = 0
  for (const field of QUALITY_DIMENSIONS) {
    const value = profile[field]
    if (value > SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR) {
      return { score: fallback, source: 'fallback' }
    }
    weighted += value * weights[field]
    total += weights[field]
  }
  return {
    score: normalizeZero(weighted / total),
    source: 'profile',
  }
}

export function computeConsiderationLift(
  qualityScore: number,
  tuning: SalesTuning,
): { raw: number; clamped: number } {
  const raw =
    1 +
    ((qualityScore - SALES_FORMULA_CONSTANTS.QUALITY_BASELINE) /
      SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR) *
      SALES_FORMULA_CONSTANTS.QUALITY_LIFT_COEFFICIENT
  return {
    raw,
    clamped: normalizeZero(
      clamp(raw, tuning.considerationLiftRange.min, tuning.considerationLiftRange.max),
    ),
  }
}

export function computeReviewLift(
  reviewScore: number | null,
  qualityScore: number,
  tuning: SalesTuning,
): { raw: number; clamped: number; effectiveReviewScore: number } {
  const effectiveReviewScore = reviewScore ?? qualityScore
  const raw = effectiveReviewScore / SALES_FORMULA_CONSTANTS.REVIEW_BASELINE
  return {
    raw,
    clamped: normalizeZero(clamp(raw, tuning.reviewLiftRange.min, tuning.reviewLiftRange.max)),
    effectiveReviewScore,
  }
}

export function computeConsiderationRate(
  baseConsideration: number,
  categoryInterest: number,
  considerationLift: number,
  reviewLift: number,
  competitionFactor: number,
): { raw: number; clamped: number } {
  const raw =
    baseConsideration * categoryInterest * considerationLift * reviewLift * (1 - competitionFactor)
  return { raw, clamped: normalizeZero(clamp(raw, 0, 1)) }
}

/** 质量分加成 = (quality − 60)/100 × 0.5 */
export function computeQualityScoreBonus(qualityScore: number): number {
  return normalizeZero(
    ((qualityScore - SALES_FORMULA_CONSTANTS.QUALITY_BASELINE) /
      SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR) *
      SALES_FORMULA_CONSTANTS.QUALITY_LIFT_COEFFICIENT,
  )
}

/** 价格效应 = log(price/base)/log(1.1) × 弹性（正数 = 抑制需求，负数 = 促进需求） */
export function computePriceDeltaEffect(
  priceCents: number,
  basePriceCents: number,
  tuning: SalesTuning,
): { priceRelative: number; effect: number } {
  const priceRelative = priceCents / basePriceCents
  let effect: number
  if (priceRelative > 1) {
    effect =
      (Math.log(priceRelative) / Math.log(SALES_FORMULA_CONSTANTS.PRICE_STEP_RATIO)) *
      tuning.priceElasticityUp
  } else if (priceRelative < 1) {
    effect =
      -(Math.log(1 / priceRelative) / Math.log(SALES_FORMULA_CONSTANTS.PRICE_STEP_RATIO)) *
      tuning.priceElasticityDown
  } else {
    effect = 0
  }
  return { priceRelative, effect: normalizeZero(effect) }
}

export function computeMarketingResponse(
  spendCents: number,
  scaleCents: number,
  tuning: SalesTuning,
): { lift: number; multiplier: number } {
  if (spendCents <= 0 || scaleCents <= 0) {
    return { lift: 0, multiplier: 1 }
  }
  const lift = 1 - Math.exp(-spendCents / scaleCents)
  return {
    lift,
    multiplier: Math.min(1 + lift, tuning.marketingResponseMultiplierMax),
  }
}

export function computePurchaseConversionLift(
  priceDeltaEffect: number,
  qualityScoreBonus: number,
  tuning: SalesTuning,
): { raw: number; clamped: number } {
  const raw = 1 - priceDeltaEffect + qualityScoreBonus
  return {
    raw,
    clamped: normalizeZero(
      clamp(
        raw,
        tuning.purchaseConversionLiftRange.min,
        tuning.purchaseConversionLiftRange.max,
      ),
    ),
  }
}

export function computePurchaseConversion(
  basePurchaseConversion: number,
  purchaseConversionLift: number,
  marketingResponseMultiplier: number,
  randomPerturbation: number,
  tuning: SalesTuning,
): { raw: number; clamped: number } {
  const raw =
    basePurchaseConversion *
    purchaseConversionLift *
    marketingResponseMultiplier *
    randomPerturbation
  return {
    raw,
    clamped: normalizeZero(
      clamp(raw, tuning.purchaseConversionRange.min, tuning.purchaseConversionRange.max),
    ),
  }
}

/** 毛销量 = floor(rawUnits)；小市场保底默认关闭（Q7） */
export function computeGrossUnits(
  rawUnits: number,
  tuning: SalesTuning,
  rng?: SalesRandom,
  ctx?: RngContext,
): number {
  if (rawUnits <= 0) return 0
  const floored = Math.floor(rawUnits)
  if (
    floored === 0 &&
    tuning.smallMarketFloorChance > 0 &&
    rng !== undefined &&
    ctx !== undefined
  ) {
    if (rng.chance(tuning.smallMarketFloorChance, ctx)) return 1
  }
  return floored
}

export function computeRefundRate(defectLevel: number, tuning: SalesTuning): number {
  const safeDefect = clamp(defectLevel, 0, SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR)
  const raw =
    tuning.refundRate +
    ((safeDefect - SALES_FORMULA_CONSTANTS.DEFECT_BASELINE) /
      SALES_FORMULA_CONSTANTS.PERCENT_DENOMINATOR) *
      SALES_FORMULA_CONSTANTS.REFUND_SLOPE
  return normalizeZero(clamp(raw, tuning.refundRateRange.min, tuning.refundRateRange.max))
}

export function computeUnitPriceAtSaleCents(
  grossRevenueCents: number,
  grossUnits: number,
): number {
  return Math.round(grossRevenueCents / grossUnits)
}

export function computePlatformFee(grossRevenueCents: number, platformFeeRate: number): number {
  return Math.round(grossRevenueCents * platformFeeRate)
}

export function resolveRandomPerturbation(
  rng: SalesRandom,
  ctx: RngContext,
  tuning: SalesTuning,
): number {
  return clampPerturbation(rng.gauss(0, tuning.randomPerturbationStddev, ctx), tuning)
}

/** 生命周期 → 营销响应尺度索引（long_tail 取 decline 档，Q8） */
export function marketingScaleKeyOf(
  stage: ProductLifecycleStage,
): keyof SalesTuning['marketingResponseScaleCents'] {
  if (stage === 'launch' || stage === 'growth' || stage === 'mature' || stage === 'decline') {
    return stage
  }
  return 'long_tail'
}

/** 扰动随机上下文（§10.9） */
export function perturbationContext(input: {
  productId: string
  dayIndex: number
  marketId: string
  platformId: string
  segmentId: string
}): RngContext {
  return {
    subsystemId: 'sales',
    entityId: input.productId,
    dayIndex: input.dayIndex,
    purposeId: 'purchase_conversion_perturbation',
    scopeId: `${input.marketId}:${input.platformId}:${input.segmentId}`,
    sampleIndex: 0,
  }
}

export interface SalesPipelineComputation {
  reviewLift: { raw: number; clamped: number; effectiveReviewScore: number }
  considerationLift: { raw: number; clamped: number }
  considerationRate: { raw: number; clamped: number }
  consideringConsumers: number
  qualityScoreBonus: number
  priceRelative: number
  priceDeltaEffect: number
  marketingResponseLift: number
  marketingResponseMultiplier: number
  purchaseConversionLift: { raw: number; clamped: number }
  purchaseConversion: { raw: number; clamped: number }
  rawUnits: number
  grossUnits: number
  unitPriceAtSaleCents: number
  grossRevenueCents: number
  platformFeeCents: number
  netSalesRevenueCents: number
  refundRate: number
  estimatedRefundUnits: number
}

/** S1–S6：单条输入 → 全部中间量与财务结果 */
export function computeSalesPipeline(
  input: SalesPipelineInput,
  tuning: SalesTuning,
  rng?: SalesRandom,
): SalesPipelineComputation {
  if (input.eligibleAudience === null || !Number.isFinite(input.eligibleAudience)) {
    throw new SalesError('SALES_INVALID_INPUT', 'eligibleAudience must be a finite number')
  }
  if (input.eligibleAudience < 0) {
    throw new SalesError('SALES_INVALID_INPUT', 'eligibleAudience must be non-negative')
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    throw new SalesError('SALES_INVALID_INPUT', 'priceCents must be a positive integer')
  }
  if (!Number.isInteger(input.basePriceCents) || input.basePriceCents <= 0) {
    throw new SalesError('SALES_INVALID_INPUT', 'basePriceCents must be a positive integer')
  }

  const reviewLift = computeReviewLift(input.reviewScore, input.qualityScore, tuning)
  const considerationLift = computeConsiderationLift(input.qualityScore, tuning)
  const considerationRate = computeConsiderationRate(
    input.baseConsideration,
    input.categoryInterest,
    considerationLift.clamped,
    reviewLift.clamped,
    input.competitionFactor,
  )
  const consideringConsumers =
    input.eligibleAudience * input.awareness * considerationRate.clamped
  const qualityScoreBonus = computeQualityScoreBonus(input.qualityScore)
  const price = computePriceDeltaEffect(input.priceCents, input.basePriceCents, tuning)
  const marketing = computeMarketingResponse(
    input.dailyMarketingSpendCents,
    input.marketingResponseScaleCents,
    tuning,
  )
  const purchaseConversionLift = computePurchaseConversionLift(
    price.effect,
    qualityScoreBonus,
    tuning,
  )
  const purchaseConversion = computePurchaseConversion(
    tuning.basePurchaseConversion,
    purchaseConversionLift.clamped,
    marketing.multiplier,
    input.randomPerturbation,
    tuning,
  )
  const rawUnits = consideringConsumers * purchaseConversion.clamped
  const floorContext: RngContext = {
    subsystemId: 'sales',
    entityId: input.productId,
    dayIndex: input.dayIndex,
    purposeId: 'sales_small_market_floor',
    scopeId: `${input.marketId}:${input.platformId}:${input.segmentId}`,
    sampleIndex: 0,
  }
  const grossUnits = computeGrossUnits(rawUnits, tuning, rng, floorContext)
  const grossRevenueCents = grossUnits * input.priceCents
  const unitPriceAtSaleCents =
    grossUnits > 0 ? computeUnitPriceAtSaleCents(grossRevenueCents, grossUnits) : 0
  const platformFeeCents = computePlatformFee(grossRevenueCents, input.platformFeeRate)
  const netSalesRevenueCents = grossRevenueCents - platformFeeCents
  const refundRate = computeRefundRate(input.defectLevel, tuning)
  const estimatedRefundUnits = Math.floor(grossUnits * refundRate)

  return {
    reviewLift,
    considerationLift,
    considerationRate,
    consideringConsumers,
    qualityScoreBonus,
    priceRelative: price.priceRelative,
    priceDeltaEffect: price.effect,
    marketingResponseLift: marketing.lift,
    marketingResponseMultiplier: marketing.multiplier,
    purchaseConversionLift,
    purchaseConversion,
    rawUnits,
    grossUnits,
    unitPriceAtSaleCents,
    grossRevenueCents,
    platformFeeCents,
    netSalesRevenueCents,
    refundRate,
    estimatedRefundUnits,
  }
}

// ===== canonical JSON / 哈希（§10.4 D-14）=====
function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new SalesError('SALES_INVALID_INPUT', 'canonical JSON forbids NaN/Infinity')
    }
    return JSON.stringify(normalizeZero(value))
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    const parts: string[] = []
    for (const key of keys) {
      const item = record[key]
      if (item === undefined) {
        throw new SalesError('SALES_INVALID_INPUT', `canonical JSON forbids undefined (${key})`)
      }
      parts.push(`${JSON.stringify(key)}:${canonicalize(item)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new SalesError('SALES_INVALID_INPUT', `canonical JSON unsupported type: ${typeof value}`)
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value)
}

export function salesTuningValuesHash(tuning: SalesTuning): string {
  return fnv1a(canonicalJson(tuning)).toString(16)
}

function buildInputHash(input: SalesPipelineInput, meta: SalesFormulaMeta): string {
  const payload = {
    inputs: input,
    segments: [{ segmentId: input.segmentId, inputs: input }],
    tuningVersion: meta.tuningVersion,
    tuningValuesHash: meta.tuningValuesHash,
    formulaConstantsVersion: meta.formulaConstantsVersion,
    algorithmVersion: meta.algorithmVersion,
  }
  return fnv1a(canonicalJson(payload)).toString(16)
}

// ===== 归因（§10.4）=====
const DEMAND_FACTOR_ORDER: SalesDemandFactorId[] = [
  'eligibleAudience',
  'awareness',
  'categoryInterest',
  'baseConsideration',
  'considerationLift',
  'reviewLift',
  'competitionFactor',
  'basePurchaseConversion',
  'purchaseConversionLift',
  'marketingResponseLift',
  'randomPerturbation',
]

function buildDemandFactors(
  input: SalesPipelineInput,
  c: SalesPipelineComputation,
  tuning: SalesTuning,
): { factors: SalesDemandFactorTrace[]; residual: number } {
  const values: Record<SalesDemandFactorId, { value: number; multiplier: number }> = {
    eligibleAudience: {
      value: input.eligibleAudience ?? 0,
      multiplier: input.eligibleAudience ?? 0,
    },
    awareness: { value: input.awareness, multiplier: input.awareness },
    categoryInterest: { value: input.categoryInterest, multiplier: input.categoryInterest },
    baseConsideration: { value: input.baseConsideration, multiplier: input.baseConsideration },
    considerationLift: {
      value: c.considerationLift.clamped,
      multiplier: c.considerationLift.clamped,
    },
    reviewLift: { value: c.reviewLift.clamped, multiplier: c.reviewLift.clamped },
    competitionFactor: { value: input.competitionFactor, multiplier: 1 - input.competitionFactor },
    basePurchaseConversion: {
      value: tuning.basePurchaseConversion,
      multiplier: tuning.basePurchaseConversion,
    },
    purchaseConversionLift: {
      value: c.purchaseConversionLift.clamped,
      multiplier: c.purchaseConversionLift.clamped,
    },
    marketingResponseLift: {
      value: c.marketingResponseLift,
      multiplier: 1 + c.marketingResponseLift,
    },
    randomPerturbation: {
      value: input.randomPerturbation,
      multiplier: input.randomPerturbation,
    },
  }

  let logSum = 0
  for (const factorId of DEMAND_FACTOR_ORDER) {
    const multiplier = values[factorId].multiplier
    if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
      throw new SalesError(
        'SALES_INVALID_INPUT',
        `demand factor ${factorId} must be a positive multiplier`,
      )
    }
    logSum += Math.log(multiplier)
  }

  const degenerate = Math.abs(logSum) < SALES_FORMULA_CONSTANTS.LOG_EPSILON
  let residual = 0
  const factors = DEMAND_FACTOR_ORDER.map((factorId) => {
    const share = degenerate ? 0 : Math.log(values[factorId].multiplier) / logSum
    const contributionUnits = degenerate ? 0 : normalizeZero(share * c.grossUnits)
    return {
      factorId,
      value: values[factorId].value,
      multiplier: values[factorId].multiplier,
      contributionUnits,
      contributionShare:
        c.grossUnits > 0 ? normalizeZero(contributionUnits / c.grossUnits) : 0,
    }
  })
  if (degenerate) residual = c.grossUnits
  return { factors, residual }
}

function buildFinancialFactors(
  input: SalesPipelineInput,
  c: SalesPipelineComputation,
): SalesFinancialFactorTrace[] {
  return [
    {
      factorId: 'price',
      value: input.priceCents,
      contributionCents: c.grossRevenueCents,
      shareOfNet: c.netSalesRevenueCents === 0 ? 0 : 1,
    },
    {
      factorId: 'platformFeeRate',
      value: input.platformFeeRate,
      contributionCents: -c.platformFeeCents,
      shareOfNet:
        c.netSalesRevenueCents === 0
          ? 0
          : normalizeZero(-c.platformFeeCents / c.netSalesRevenueCents),
    },
  ]
}

function buildTopDrivers(factors: SalesDemandFactorTrace[]): SalesDemandFactorTrace[] {
  const order = new Map<string, number>()
  factors.forEach((factor, index) => order.set(factor.factorId, index))
  return [...factors]
    .sort((a, b) => {
      const diff = Math.abs(b.contributionUnits) - Math.abs(a.contributionUnits)
      if (diff !== 0) return diff
      return (order.get(a.factorId) ?? 0) - (order.get(b.factorId) ?? 0)
    })
    .slice(0, 3)
}

function buildStages(
  input: SalesPipelineInput,
  c: SalesPipelineComputation,
): SalesStageTrace[] {
  return [
    {
      stage: 'demand',
      formulaId: '08/09:2.1/considerationRate',
      inputs: {
        eligibleAudience: input.eligibleAudience ?? 0,
        awareness: input.awareness,
        categoryInterest: input.categoryInterest,
        baseConsideration: input.baseConsideration,
        competitionFactor: input.competitionFactor,
        considerationLiftRaw: c.considerationLift.raw,
        considerationLiftClamped: c.considerationLift.clamped,
        reviewLiftRaw: c.reviewLift.raw,
        reviewLiftClamped: c.reviewLift.clamped,
        considerationRateRaw: c.considerationRate.raw,
        considerationRateClamped: c.considerationRate.clamped,
      },
      output: c.consideringConsumers,
      outputs: {
        consideringConsumers: c.consideringConsumers,
        considerationRate: c.considerationRate.clamped,
      },
    },
    {
      stage: 'conversion',
      formulaId: '08/09:2.2/purchaseConversion',
      inputs: {
        qualityScore: input.qualityScore,
        reviewScoreEffective: c.reviewLift.effectiveReviewScore,
        priceRelative: c.priceRelative,
        priceDeltaEffect: c.priceDeltaEffect,
        qualityScoreBonus: c.qualityScoreBonus,
        marketingResponseLift: c.marketingResponseLift,
        marketingResponseMultiplier: c.marketingResponseMultiplier,
        purchaseConversionLiftRaw: c.purchaseConversionLift.raw,
        purchaseConversionLiftClamped: c.purchaseConversionLift.clamped,
        purchaseConversionRaw: c.purchaseConversion.raw,
        purchaseConversionClamped: c.purchaseConversion.clamped,
      },
      output: c.purchaseConversion.clamped,
      outputs: {
        purchaseConversion: c.purchaseConversion.clamped,
        marketingResponseMultiplier: c.marketingResponseMultiplier,
      },
    },
    {
      stage: 'units',
      formulaId: '08/09:2.3/grossUnits',
      inputs: {
        consideringConsumers: c.consideringConsumers,
        purchaseConversion: c.purchaseConversion.clamped,
        rawUnits: c.rawUnits,
      },
      output: c.grossUnits,
      outputs: { rawUnits: c.rawUnits },
    },
    {
      stage: 'revenue',
      formulaId: '08/09:2.4/grossRevenue',
      inputs: { grossUnits: c.grossUnits, priceCents: input.priceCents },
      output: c.grossRevenueCents,
      outputs: { unitPriceAtSaleCents: c.unitPriceAtSaleCents },
    },
    {
      stage: 'fee',
      formulaId: '08/09:2.5/platformFee',
      inputs: {
        grossRevenueCents: c.grossRevenueCents,
        platformFeeRate: input.platformFeeRate,
      },
      output: c.platformFeeCents,
      outputs: { netSalesRevenueCents: c.netSalesRevenueCents },
    },
    {
      stage: 'refund_forecast',
      formulaId: '08/09:2.6/refundForecast',
      inputs: {
        grossUnits: c.grossUnits,
        defectLevel: input.defectLevel,
        refundRate: c.refundRate,
      },
      output: c.estimatedRefundUnits,
      outputs: { refundRate: c.refundRate },
    },
    {
      stage: 'record',
      formulaId: '08/09:2.7/salesRecord',
      inputs: { grossUnits: c.grossUnits },
      output: c.netSalesRevenueCents,
      outputs: {
        grossUnits: c.grossUnits,
        unitPriceAtSaleCents: c.unitPriceAtSaleCents,
        grossRevenueCents: c.grossRevenueCents,
        platformFeeCents: c.platformFeeCents,
        netSalesRevenueCents: c.netSalesRevenueCents,
        estimatedRefundUnits: c.estimatedRefundUnits,
      },
    },
  ]
}

/**
 * 纯函数：(输入, TUNING 快照, 元信息, 随机源) → SalesExplanation。
 * 调用方在记录成功挂载后缓存结果；本函数不做 IO。
 */
export function explainSalesPipeline(
  input: SalesPipelineInput,
  tuning: SalesTuning,
  meta: SalesFormulaMeta,
  rng?: SalesRandom,
): SalesExplanation {
  const computation = computeSalesPipeline(input, tuning, rng)
  const demand = buildDemandFactors(input, computation, tuning)
  const stages = buildStages(input, computation)
  const result = {
    grossUnits: computation.grossUnits,
    unitPriceAtSaleCents: computation.unitPriceAtSaleCents,
    grossRevenueCents: computation.grossRevenueCents,
    platformFeeCents: computation.platformFeeCents,
    netSalesRevenueCents: computation.netSalesRevenueCents,
    estimatedRefundUnits: computation.estimatedRefundUnits,
    actualRefundUnits: 0,
  }

  return {
    productId: input.productId,
    dayIndex: input.dayIndex,
    marketId: input.marketId,
    platformId: input.platformId,
    segments: [
      {
        segmentId: input.segmentId,
        inputs: input,
        stages,
        grossUnits: computation.grossUnits,
      },
    ],
    inputs: input,
    stages,
    demandFactors: demand.factors,
    financialFactors: buildFinancialFactors(input, computation),
    attributionResidualUnits: demand.residual,
    topDrivers: buildTopDrivers(demand.factors),
    result,
    tuningVersion: meta.tuningVersion,
    tuningValuesHash: meta.tuningValuesHash,
    formulaConstantsVersion: meta.formulaConstantsVersion,
    algorithmVersion: meta.algorithmVersion,
    inputHash: buildInputHash(input, meta),
  }
}

// ===== 启动校验（E25 / T41）=====
const SALES_TUNING_REQUIRED_NUMERIC_KEYS = [
  'categoryInterest',
  'baseConsideration',
  'basePurchaseConversion',
  'priceElasticityUp',
  'priceElasticityDown',
  'marketingResponseMultiplierMax',
  'awarenessCap',
  'randomPerturbationStddev',
  'smallMarketFloorChance',
  'refundRate',
  'refundWindowDays',
  'platformFeeRateFallback',
  'qualityScoreFallback',
] as const

const SALES_TUNING_REQUIRED_RANGES = [
  'considerationLiftRange',
  'reviewLiftRange',
  'purchaseConversionLiftRange',
  'purchaseConversionRange',
  'randomPerturbationRange',
  'refundRateRange',
] as const

const MARKETING_SCALE_KEYS = ['launch', 'growth', 'mature', 'decline', 'long_tail'] as const
const CATEGORY_KEYS: PlatformCategory[] = ['arcade', 'console', 'pc', 'digital']

function assertFiniteNumber(value: unknown, key: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SalesError('SALES_TUNING_INVALID', `${key} must be a finite number`)
  }
}

function assertRange(value: unknown, key: string): void {
  if (typeof value !== 'object' || value === null) {
    throw new SalesError('SALES_TUNING_INVALID', `${key} must be a range object`)
  }
  const range = value as Record<string, unknown>
  assertFiniteNumber(range.min, `${key}.min`)
  assertFiniteNumber(range.max, `${key}.max`)
  if ((range.min as number) > (range.max as number)) {
    throw new SalesError('SALES_TUNING_INVALID', `${key}.min must be <= max`)
  }
}

/** TUNING.sales 启动断言（含版本与映射完整性）；失败抛 SALES_TUNING_INVALID */
export function validateSalesTuning(tuning: SalesTuning, tuningVersion: number): void {
  if (tuningVersion !== 3) {
    throw new SalesError('SALES_TUNING_INVALID', 'TUNING.version must be 3')
  }
  const rawTuning = tuning as unknown as Record<string, unknown>
  for (const key of SALES_TUNING_REQUIRED_NUMERIC_KEYS) {
    assertFiniteNumber(rawTuning[key], key)
  }
  for (const key of SALES_TUNING_REQUIRED_RANGES) {
    assertRange(rawTuning[key], key)
  }
  if (
    typeof tuning.marketingResponseScaleCents !== 'object' ||
    tuning.marketingResponseScaleCents === null
  ) {
    throw new SalesError('SALES_TUNING_INVALID', 'marketingResponseScaleCents must be an object')
  }
  for (const key of MARKETING_SCALE_KEYS) {
    assertFiniteNumber(tuning.marketingResponseScaleCents[key], `marketingResponseScaleCents.${key}`)
  }
  if (
    typeof tuning.platformFeeRateByCategory !== 'object' ||
    tuning.platformFeeRateByCategory === null
  ) {
    throw new SalesError('SALES_TUNING_INVALID', 'platformFeeRateByCategory must be an object')
  }
  if (Object.keys(tuning.platformFeeRateByCategory).length !== CATEGORY_KEYS.length) {
    throw new SalesError(
      'SALES_TUNING_INVALID',
      'platformFeeRateByCategory must contain exactly arcade/console/pc/digital',
    )
  }
  for (const key of CATEGORY_KEYS) {
    assertFiniteNumber(tuning.platformFeeRateByCategory[key], `platformFeeRateByCategory.${key}`)
  }
  const weights = tuning.qualityPrefWeightDefault
  if (typeof weights !== 'object' || weights === null) {
    throw new SalesError('SALES_TUNING_INVALID', 'qualityPrefWeightDefault must be an object')
  }
  for (const key of QUALITY_DIMENSIONS) {
    assertFiniteNumber(weights[key], `qualityPrefWeightDefault.${key}`)
  }
  const mapEntries = Object.entries(PLATFORM_CATEGORY_MAP)
  if (mapEntries.length !== 14) {
    throw new SalesError('SALES_TUNING_INVALID', 'PLATFORM_CATEGORY_MAP must contain 14 entries')
  }
  for (const [platformId, category] of mapEntries) {
    if (!CATEGORY_KEYS.includes(category)) {
      throw new SalesError(
        'SALES_TUNING_INVALID',
        `PLATFORM_CATEGORY_MAP.${platformId} has invalid category`,
      )
    }
  }
}
