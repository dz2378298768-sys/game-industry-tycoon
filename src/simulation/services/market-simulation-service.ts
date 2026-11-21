/**
 * MarketSimulationService —— M2-B 每日销售管线（DESIGN-M2-001-B v1.2 §10.3/§10.6）。
 *
 * 职责：
 *   1) 枚举可售 Product × Market × Platform、调用纯公式；
 *   2) 写入 Product.salesByPeriod（每组合至多 1 条/日）；
 *   3) 为 estimatedRefundUnits > 0 的记录生成恰好 1 条 pending auto_window RefundBatch；
 *   4) 经 FinanceService 入账 sales_revenue / platform_fee；
 *   5) 缓存 SalesExplanation 供 explainSales 查询。
 *
 * 不负责：定价、营销执行、退款兑现、生命周期推进、UI。
 */
import { TUNING } from '@content/tuning'
import genres from '@content/genres.json'
import {
  buildDemandScopesForDay,
  genreSegmentAffinity,
  referencePriceCents,
} from '@content/c1-content'
import {
  buildDailyDemand,
  computeAudienceUnits,
  computeLaunchAwarenessFloor,
} from './demand-pool'
import type { DemandProductInput, DemandScopeInput, DemandTuning } from './demand-pool'
import { awarenessByScopeOf, rollupAwarenessByMarket } from './product-awareness'
import {
  getConsumerSegment,
  getPlatform,
  isPlatformAvailable,
  isSegmentAvailable,
} from '@content/queries'
import type { Product } from '@domain/entities/product'
import { effectivePriceCents } from '@domain/value-objects'
import { stableProductKey } from './sales-formulas'
import type { SalesRecord } from '@domain/entities/sales-record'
import { makeSalesRecordId } from '@domain/entities/sales-record'
import type { RefundBatch } from '@domain/entities/refund-batch'
import { makeRefundBatchId, refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import type { FinanceService, PostTransactionCmd } from './finance-service'
import {
  ALGORITHM_VERSION,
  FORMULA_CONSTANTS_VERSION,
  SalesError,
  clampAwareness,
  computeSalesPipeline,
  computePlatformFee,
  computeRefundRate,
  computeWeightedQuality,
  explainSalesPipeline,
  marketingScaleKeyOf,
  perturbationContext,
  resolvePlatformFeeRate,
  resolveQualityWeights,
  resolveRandomPerturbation,
  salesTuningValuesHash,
  validateSalesTuning,
} from './sales-formulas'
import type {
  MarketInputProvider,
  QualityWeights,
  SalesExplanation,
  SalesExplainError,
  SalesFormulaMeta,
  SalesPipelineInput,
  SalesRandom,
  SalesTuning,
  SalesWarning,
} from './sales-types'
import { NULL_MARKET_INPUT_PROVIDER } from './sales-types'
import type { WorldState } from './world-state'

/** 重整清仓价：按 clearanceDiscountRatePercent 打折；正常产品原样。 */
function salePriceCents(product: Product): number | null {
  const base = effectivePriceCents(product)
  if (base === null) return null
  const rate = product.clearanceDiscountRatePercent ?? 0
  if (rate <= 0) return base
  return Math.max(1, Math.round(base * (1 - rate / 100)))
}


export interface MarketSimulationDeps {
  finance: FinanceService
  rng: SalesRandom
  /** 输入端口；缺省 = 一律缺失 → 全部组合按规则跳过 */
  inputs?: MarketInputProvider
  onWarning?: (warning: SalesWarning) => void
  /** C1-T4：启用统一需求池管线；缺省 false，保留 M2 旧管线 */
  demandMode?: boolean
  /** C1 需求池参数；缺省 TUNING.c1.demand */
  demandTuning?: DemandTuning
}

interface CreatedRecord {
  record: SalesRecord
  explanation: SalesExplanation
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readSegmentWeights(segmentId: string): unknown {
  const segment = getConsumerSegment(segmentId)
  if (segment === null) return null
  return (segment as unknown as Record<string, unknown>).qualityPrefWeight
}

function readGenreWeights(genreId: string): unknown {
  const genre = genres.find((item) => item.id === genreId)
  if (genre === undefined) return null
  return (genre as unknown as Record<string, unknown>).qualityPrefWeight
}

export class MarketSimulationService {
  private readonly deps: MarketSimulationDeps
  private readonly tuning: SalesTuning
  private readonly meta: SalesFormulaMeta
  private readonly explainCache = new Map<string, SalesExplanation>()
  private warnings: SalesWarning[] = []

  constructor(deps: MarketSimulationDeps) {
    const tuning: SalesTuning | undefined = TUNING.sales
    if (tuning === undefined) {
      throw new SalesError('SALES_TUNING_INVALID', 'TUNING.sales is missing')
    }
    validateSalesTuning(tuning, TUNING.version)
    this.deps = deps
    this.tuning = tuning
    this.meta = {
      tuningVersion: String(TUNING.version),
      tuningValuesHash: salesTuningValuesHash(tuning),
      formulaConstantsVersion: FORMULA_CONSTANTS_VERSION,
      algorithmVersion: ALGORITHM_VERSION,
    }
  }

  /** 最近一次 simulateDailySales 产生的告警（每次调用重置） */
  getWarnings(): readonly SalesWarning[] {
    return [...this.warnings]
  }

  /**
   * 执行某一天的销售阶段并返回新 WorldState。
   * 原子边界：先构造记录/批次（不挂载）→ bulkPostTransactions → 成功后一次性挂载。
   */
  simulateDailySales(world: WorldState, dayIndex: number): WorldState {
    this.warnings = []
    if (this.deps.demandMode === true) {
      return this.simulateDailySalesWithDemand(world, dayIndex)
    }

    const sortedProducts = [...world.products].sort((a, b) => {
      const byCompany = a.companyId.localeCompare(b.companyId)
      return byCompany !== 0 ? byCompany : a.id.localeCompare(b.id)
    })

    const recordsByProduct = new Map<string, SalesRecord[]>()
    const explanations: SalesExplanation[] = []

    for (const product of sortedProducts) {
      const created = this.computeProductDay(product, dayIndex)
      if (created.length === 0) continue
      recordsByProduct.set(
        product.id,
        created.map((item) => item.record),
      )
      explanations.push(...created.map((item) => item.explanation))
    }

    const batches = this.buildBatches(sortedProducts, recordsByProduct, dayIndex)
    const transactions = this.buildTransactions(sortedProducts, recordsByProduct)

    if (transactions.length > 0) {
      // 销售是必得收入：余额已为负时也必须入账，不得因余额检查中止整日结算（M2-I）
      const posted = this.deps.finance.bulkPostTransactions(transactions, {
        allowNegativeBalance: true,
      })
      if (!posted.success) {
        throw new SalesError(
          'SALES_POSTING_FAILED',
          posted.errorMessage ?? 'bulk posting failed',
        )
      }
    }

    const nextProducts = world.products.map((product) => {
      const records = recordsByProduct.get(product.id)
      if (records === undefined || records.length === 0) return product
      return {
        ...product,
        salesByPeriod: [...product.salesByPeriod, ...records],
        version: product.version + 1,
        updatedAt: dayIndex,
      }
    })

    const nextState: WorldState = {
      ...world,
      products: nextProducts,
      refundBatches: [...world.refundBatches, ...batches],
    }

    for (const explanation of explanations) {
      const cacheKey = this.cacheKey(
        explanation.productId,
        explanation.dayIndex,
        explanation.marketId,
        explanation.platformId,
      )
      this.explainCache.set(cacheKey, explanation)
    }

    return nextState
  }

  /** 查询当日解释；无会话内缓存 → SALES_EXPLAIN_UNAVAILABLE（Q9） */
  explainSales(
    productId: string,
    dayIndex: number,
    marketId?: string,
    platformId?: string,
  ): SalesExplanation[] | SalesExplainError {
    const matches = [...this.explainCache.values()].filter(
      (explanation) =>
        explanation.productId === productId &&
        explanation.dayIndex === dayIndex &&
        (marketId === undefined || explanation.marketId === marketId) &&
        (platformId === undefined || explanation.platformId === platformId),
    )
    if (matches.length === 0) {
      return {
        errorCode: 'SALES_EXPLAIN_UNAVAILABLE',
        message: `No in-session sales explanation for ${productId} on day ${dayIndex}`,
      }
    }
    return matches.sort((a, b) => {
      const byMarket = a.marketId.localeCompare(b.marketId)
      return byMarket !== 0 ? byMarket : a.platformId.localeCompare(b.platformId)
    })
  }

  clearExplainCache(): void {
    this.explainCache.clear()
  }

  private cacheKey(
    productId: string,
    dayIndex: number,
    marketId: string,
    platformId: string,
  ): string {
    return `${productId}:${dayIndex}:${marketId}:${platformId}`
  }

  private warn(warning: SalesWarning): void {
    this.warnings.push(warning)
    this.deps.onWarning?.(warning)
  }

  /**
   * C1-T4：统一需求池管线。
   * 一天只建一次全局 scope 池，所有公司产品在同一池里分份额；
   * 按 product × market × platform 聚合 segment，写入与旧管线同构的 SalesRecord。
   */
  private simulateDailySalesWithDemand(world: WorldState, dayIndex: number): WorldState {
    const launched = world.products.filter((product) => {
      if (product.status !== 'active' || product.lifecycleStage === 'retired') return false
      if (product.launchDay > dayIndex) return false
      return true
    })
    if (launched.length === 0) return world

    const platformIds = [...new Set(launched.flatMap((product) => product.supportedPlatformIds))]
    const scopes = buildDemandScopesForDay({ dayIndex, platformIds })
    if (scopes.length === 0) return world

    const brandById = new Map(world.companies.map((company) => [company.id, company.brand]))
    const productById = new Map(launched.map((product) => [product.id, product]))
    const demandProducts: DemandProductInput[] = []

    for (const product of launched) {
      const priceCents = salePriceCents(product)
      if (priceCents === null) {
        this.warn({
          code:
            product.pricePerUnitCents == null && product.launchPriceCents == null
              ? 'SALES_MISSING_INPUT'
              : 'SALES_INVALID_INPUT',
          message: 'effective price is missing; demand product skipped',
          productId: product.id,
        })
        continue
      }
      const segmentIds = product.audienceSegmentIds.filter((id) => isSegmentAvailable(id, dayIndex))
      if (segmentIds.length === 0) continue
      const availablePlatforms = product.supportedPlatformIds.filter((id) => isPlatformAvailable(id, dayIndex))
      if (availablePlatforms.length === 0) continue

      const affinity: Record<string, number> = {}
      let affinitySum = 0
      for (const segmentId of segmentIds) {
        const value = genreSegmentAffinity(product.genreId, segmentId)
        affinity[segmentId] = value
        affinitySum += value
      }
      const platformFit: Record<string, number> = {}
      for (const platformId of availablePlatforms) platformFit[platformId] = 1
      const reference = referencePriceCents(
        product.genreId,
        availablePlatforms[0]!,
        segmentIds[0]!,
      )
      const genreMatch = segmentIds.length > 0 ? affinitySum / segmentIds.length : 0

      demandProducts.push({
        productId: product.id,
        companyId: product.companyId,
        status: 'active',
        supportedPlatformIds: availablePlatforms,
        audienceSegmentIds: segmentIds,
        awarenessByScope: awarenessByScopeOf(product),
        quality01: Math.max(0, Math.min(1, product.finalQualityScore / 100)),
        brand01: Math.max(0, Math.min(1, (brandById.get(product.companyId) ?? 10) / 100)),
        referencePriceCents: reference,
        effectivePriceCents: priceCents,
        genreAffinityBySegment: affinity,
        platformFitByPlatform: platformFit,
        launchAwarenessFloor: computeLaunchAwarenessFloor({
          storeVisibility: 1,
          genreMatch,
          finalQualityScore: product.finalQualityScore,
        }),
        launchDay: product.launchDay,
        clearanceAvailability: product.clearanceDiscountRatePercent ? 0.7 : 1,
      })
    }

    if (demandProducts.length === 0) return world
    const demand = buildDailyDemand({
      dayIndex,
      scopes,
      products: demandProducts,
      ...(this.deps.demandTuning ? { tuning: this.deps.demandTuning } : {}),
    })

    interface AggregateRow {
      productId: string
      marketId: string
      platformId: string
      units: number
    }
    const aggregates = new Map<string, AggregateRow>()
    for (const scope of demand.scopes) {
      for (const row of scope.rows) {
        if (row.allocatedUnits <= 0) continue
        const key = `${row.productId}:${scope.marketId}:${scope.platformId}`
        const existing = aggregates.get(key)
        if (existing) existing.units += row.allocatedUnits
        else {
          aggregates.set(key, {
            productId: row.productId,
            marketId: scope.marketId,
            platformId: scope.platformId,
            units: row.allocatedUnits,
          })
        }
      }
    }

    const recordsByProduct = new Map<string, SalesRecord[]>()
    for (const aggregate of aggregates.values()) {
      const product = productById.get(aggregate.productId)
      if (!product) continue
      const platform = getPlatform(aggregate.platformId)
      if (!platform) continue
      const priceCents = salePriceCents(product)
      if (priceCents === null) continue
      const recordId = makeSalesRecordId(product.id, dayIndex, aggregate.marketId, aggregate.platformId)
      if (product.salesByPeriod.some((record) => record.id === recordId)) continue

      const grossRevenueCents = aggregate.units * priceCents
      const fee = resolvePlatformFeeRate(aggregate.platformId, platform.platformFee, this.tuning)
      const platformFeeCents = computePlatformFee(grossRevenueCents, fee.rate)
      const refundRate = computeRefundRate(product.defectLevel, this.tuning)
      const record: SalesRecord = {
        id: recordId,
        productId: product.id,
        dayIndex,
        marketId: aggregate.marketId,
        platformId: aggregate.platformId,
        grossUnits: aggregate.units,
        unitPriceAtSaleCents: priceCents,
        grossRevenueCents,
        platformFeeCents,
        netSalesRevenueCents: grossRevenueCents - platformFeeCents,
        estimatedRefundUnits: Math.floor(aggregate.units * refundRate),
        actualRefundUnits: 0,
      }
      const records = recordsByProduct.get(product.id) ?? []
      records.push(record)
      recordsByProduct.set(product.id, records)
    }

    const sortedProducts = [...launched].sort((a, b) => a.id.localeCompare(b.id))
    const batches = this.buildBatches(sortedProducts, recordsByProduct, dayIndex)
    const transactions = this.buildTransactions(sortedProducts, recordsByProduct)
    if (transactions.length > 0) {
      const posted = this.deps.finance.bulkPostTransactions(transactions, {
        allowNegativeBalance: true,
      })
      if (!posted.success) {
        throw new SalesError('SALES_POSTING_FAILED', posted.errorMessage ?? 'bulk posting failed')
      }
    }

    const nextProducts = world.products.map((product) => {
      const records = recordsByProduct.get(product.id)
      if (!records || records.length === 0) return product
      const productScopes = scopes.filter(
        (scope) =>
          product.supportedPlatformIds.includes(scope.platformId) &&
          product.audienceSegmentIds.includes(scope.segmentId),
      )
      const awarenessScope = awarenessByScopeOf(product)
      const awareness = rollupAwarenessByMarket({
        awarenessByScope: awarenessScope,
        scopes: productScopes.map((scope: DemandScopeInput) => ({
          marketId: scope.marketId,
          platformId: scope.platformId,
          segmentId: scope.segmentId,
          audienceUnits: computeAudienceUnits(scope),
        })),
        fallback: product.awarenessByMarket,
      })
      return {
        ...product,
        salesByPeriod: [...product.salesByPeriod, ...records],
        awarenessByScope: awarenessScope,
        awarenessByMarket: awareness,
        version: product.version + 1,
        updatedAt: dayIndex,
      }
    })

    return {
      ...world,
      products: nextProducts,
      refundBatches: [...world.refundBatches, ...batches],
    }
  }

  private computeProductDay(product: Product, dayIndex: number): CreatedRecord[] {
    if (product.status !== 'active' || product.lifecycleStage === 'retired') return []
    if (product.launchDay > dayIndex) return []

    // M2-D：唯一取价入口（挂牌价 × 折扣，含折扣取整）
    const basePrice = product.pricePerUnitCents ?? product.launchPriceCents
    const priceCents = salePriceCents(product)
    if (priceCents === null) {
      // 保留 B 批的两种告警语义：完全未定价 vs 定价非法（T17 依赖此区分）
      const missing = basePrice === null || basePrice === undefined
      this.warn({
        code: missing ? 'SALES_MISSING_INPUT' : 'SALES_INVALID_INPUT',
        message: missing
          ? 'launchPriceCents is missing; product skipped'
          : 'launchPriceCents must be a positive integer; product skipped',
        productId: product.id,
      })
      return []
    }

    const markets = Object.keys(product.awarenessByMarket).sort()
    if (markets.length === 0) return []

    const segments = product.audienceSegmentIds.filter((id) => isSegmentAvailable(id, dayIndex))
    if (segments.length === 0) {
      this.warn({
        code: 'SALES_MISSING_INPUT',
        message: 'no available audience segment; product skipped',
        productId: product.id,
      })
      return []
    }
    if (segments.length > 1) {
      this.warn({
        code: 'SALES_MULTI_SEGMENT_DEFERRED',
        message: `multiple available segments; using ${segments[0]} only`,
        productId: product.id,
      })
    }
    const segmentId = segments[0]
    if (segmentId === undefined) return []

    const platforms = [...new Set(product.supportedPlatformIds)]
      .filter((id) => isPlatformAvailable(id, dayIndex))
      .sort()
    if (platforms.length === 0) return []

    const quality = this.resolveQuality(product, segmentId)
    const marketingScaleCents =
      this.tuning.marketingResponseScaleCents[marketingScaleKeyOf(product.lifecycleStage)]

    const created: CreatedRecord[] = []

    for (const marketId of markets) {
      const awarenessRaw = product.awarenessByMarket[marketId]
      if (typeof awarenessRaw !== 'number' || !Number.isFinite(awarenessRaw)) {
        this.warn({
          code: 'SALES_MISSING_INPUT',
          message: 'awarenessByMarket entry is missing or invalid; market skipped',
          productId: product.id,
          marketId,
        })
        continue
      }
      const awareness = clampAwareness(awarenessRaw, this.tuning.awarenessCap)

      for (const platformId of platforms) {
        const platform = getPlatform(platformId)
        if (platform === null) continue

        const fee = resolvePlatformFeeRate(platformId, platform.platformFee, this.tuning)
        if (fee.unknownPlatform) {
          this.warn({
            code: 'SALES_UNKNOWN_PLATFORM',
            message: `platform ${platformId} has no category mapping; using TUNING fallback`,
            productId: product.id,
            marketId,
            platformId,
          })
        }

        const bundle = (this.deps.inputs ?? NULL_MARKET_INPUT_PROVIDER).getMarketInput({
          product,
          marketId,
          platformId,
          segmentId,
          dayIndex,
        })
        if (bundle === null) {
          this.warn({
            code: 'SALES_MISSING_INPUT',
            message: 'market input bundle is missing; combination skipped',
            productId: product.id,
            marketId,
            platformId,
          })
          continue
        }
        if (!isFiniteNonNegative(bundle.eligibleAudience)) {
          this.warn({
            code: 'SALES_MISSING_INPUT',
            message: 'eligibleAudience is missing or invalid; combination skipped',
            productId: product.id,
            marketId,
            platformId,
          })
          continue
        }
        if (
          bundle.competitionFactor === null ||
          bundle.competitionFactor === undefined ||
          !Number.isFinite(bundle.competitionFactor)
        ) {
          this.warn({
            code: 'SALES_MISSING_INPUT',
            message: 'competitionFactor is missing or invalid; combination skipped',
            productId: product.id,
            marketId,
            platformId,
          })
          continue
        }

        const categoryInterest = this.resolveOverride(
          bundle.categoryInterest,
          this.tuning.categoryInterest,
          product.id,
          marketId,
          platformId,
        )
        const baseConsideration = this.resolveOverride(
          bundle.baseConsideration,
          this.tuning.baseConsideration,
          product.id,
          marketId,
          platformId,
        )
        const dailyMarketingSpendCents = this.resolveOverride(
          bundle.dailyMarketingSpendCents,
          0,
          product.id,
          marketId,
          platformId,
        )
        if (
          categoryInterest === null ||
          baseConsideration === null ||
          dailyMarketingSpendCents === null
        ) {
          continue
        }

        const randomPerturbation = resolveRandomPerturbation(
          this.deps.rng,
          perturbationContext({
            productId: product.id,
            entityKey: stableProductKey(product),
            dayIndex,
            marketId,
            platformId,
            segmentId,
          }),
          this.tuning,
        )

        const input: SalesPipelineInput = {
          productId: product.id,
          companyId: product.companyId,
          dayIndex,
          marketId,
          platformId,
          segmentId,
          eligibleAudience: bundle.eligibleAudience,
          awareness,
          categoryInterest,
          baseConsideration,
          qualityProfile: product.qualityProfile,
          qualityWeights: quality.weights,
          qualityWeightSource: quality.weightSource,
          qualityScore: quality.score,
          reviewScore: product.reviewScore,
          competitionFactor: bundle.competitionFactor,
          priceCents,
          basePriceCents: priceCents,
          dailyMarketingSpendCents,
          marketingResponseScaleCents: marketingScaleCents,
          defectLevel: product.defectLevel,
          platformFeeRate: fee.rate,
          platformFeeSource: fee.source,
          randomPerturbation,
        }

        // 0 销量不产生记录，也不产生解释对象（归因对数分解在 0 处退化）
        const pre = computeSalesPipeline(input, this.tuning, this.deps.rng)
        if (pre.grossUnits === 0) continue

        const explanation = explainSalesPipeline(input, this.tuning, this.meta, this.deps.rng)
        const result = explanation.result

        const recordId = makeSalesRecordId(product.id, dayIndex, marketId, platformId)
        if (product.salesByPeriod.some((record) => record.id === recordId)) continue

        const record: SalesRecord = {
          id: recordId,
          productId: product.id,
          dayIndex,
          marketId,
          platformId,
          grossUnits: result.grossUnits,
          unitPriceAtSaleCents: result.unitPriceAtSaleCents,
          grossRevenueCents: result.grossRevenueCents,
          platformFeeCents: result.platformFeeCents,
          netSalesRevenueCents: result.netSalesRevenueCents,
          estimatedRefundUnits: result.estimatedRefundUnits,
          actualRefundUnits: 0,
        }

        created.push({ record, explanation })
      }
    }

    return created
  }

  private resolveOverride(
    value: number | undefined,
    fallback: number,
    productId: string,
    marketId: string,
    platformId: string,
  ): number | null {
    if (value === undefined) return fallback
    if (!isFiniteNonNegative(value)) {
      this.warn({
        code: 'SALES_INVALID_INPUT',
        message: 'market input override is invalid; combination skipped',
        productId,
        marketId,
        platformId,
      })
      return null
    }
    return value
  }

  private resolveQuality(
    product: Product,
    segmentId: string,
  ): { weights: QualityWeights; weightSource: 'segment' | 'genre' | 'tuning' | 'fallback'; score: number } {
    const resolved = resolveQualityWeights(
      readSegmentWeights(segmentId),
      readGenreWeights(product.genreId),
      this.tuning.qualityPrefWeightDefault,
    )
    const quality = computeWeightedQuality(
      product.qualityProfile,
      resolved.weights,
      this.tuning.qualityScoreFallback,
    )
    return {
      weights: resolved.weights,
      weightSource: quality.source === 'fallback' ? 'fallback' : resolved.source,
      score: quality.score,
    }
  }

  private buildBatches(
    sortedProducts: Product[],
    recordsByProduct: Map<string, SalesRecord[]>,
    dayIndex: number,
  ): RefundBatch[] {
    const batches: RefundBatch[] = []
    const refundDayIndex = dayIndex + this.tuning.refundWindowDays

    for (const product of sortedProducts) {
      const records = recordsByProduct.get(product.id)
      if (records === undefined) continue
      const withBatch = records
        .filter((record) => record.estimatedRefundUnits > 0)
        .sort((a, b) => {
          const byMarket = a.marketId.localeCompare(b.marketId)
          return byMarket !== 0 ? byMarket : a.platformId.localeCompare(b.platformId)
        })
      let seq = 0
      for (const record of withBatch) {
        seq += 1
        const id = makeRefundBatchId(product.id, dayIndex, refundDayIndex, seq)
        batches.push({
          id,
          productId: product.id,
          salesRecordId: record.id,
          marketId: record.marketId,
          platformId: record.platformId,
          saleDayIndex: dayIndex,
          refundDayIndex,
          refundedUnits: record.estimatedRefundUnits,
          refundAmountCents: record.estimatedRefundUnits * record.unitPriceAtSaleCents,
          source: 'auto_window',
          status: 'pending',
          idempotencyKey: refundBatchIdempotencyKey(id),
        })
      }
    }
    return batches
  }

  private buildTransactions(
    sortedProducts: Product[],
    recordsByProduct: Map<string, SalesRecord[]>,
  ): PostTransactionCmd[] {
    const commands: PostTransactionCmd[] = []
    for (const product of sortedProducts) {
      const records = recordsByProduct.get(product.id)
      if (records === undefined) continue
      for (const record of records) {
        if (record.grossRevenueCents > 0) {
          commands.push({
            idempotencyKey: `sales:${record.productId}:${record.marketId}:${record.platformId}:${record.dayIndex}`,
            companyId: product.companyId,
            day: record.dayIndex,
            category: 'sales_revenue',
            amountCents: record.grossRevenueCents,
            referenceId: record.productId,
            description: `Sales revenue ${record.id}`,
          })
        }
        if (record.platformFeeCents > 0) {
          commands.push({
            idempotencyKey: `platform-fee:${record.productId}:${record.marketId}:${record.platformId}:${record.dayIndex}`,
            companyId: product.companyId,
            day: record.dayIndex,
            category: 'platform_fee',
            amountCents: -record.platformFeeCents,
            referenceId: record.productId,
            description: `Platform fee ${record.id}`,
          })
        }
      }
    }
    return commands
  }
}
