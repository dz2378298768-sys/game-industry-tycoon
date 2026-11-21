/**
 * 销售管线类型契约（TASK-M2-001-B / DESIGN-M2-001-B-SALES-PIPELINE v1.2 §10.2、§10.4）。
 * 仅声明结构；全部可调数值来自 `content/tuning.ts`，结构常量来自 `sales-formulas.ts`。
 */
import type { TransactionCategory } from '@domain/enums'
import type { Product } from '@domain/entities/product'
import type { RngContext } from '@simulation/deterministic/prng'

/** 平台类别：决定平台抽成的默认档位（§10.2.1） */
export type PlatformCategory = 'arcade' | 'console' | 'pc' | 'digital'

/** 平台抽成来源三态 */
export type PlatformFeeSource = 'platform' | 'category' | 'tuning'

/** 质量权重来源四态 */
export type QualityWeightSource = 'segment' | 'genre' | 'tuning' | 'fallback'

/** 质量五维权重（与 QualityProfile 同构） */
export interface QualityWeights {
  gameplay: number
  technical: number
  content: number
  art: number
  innovation: number
}

/** 数值区间（来自 TUNING） */
export interface NumericRange {
  min: number
  max: number
}

/** 销售管线可调参数快照（§10.5.1）；公式层禁止直接读取 TUNING */
export interface SalesTuning {
  categoryInterest: number
  baseConsideration: number
  basePurchaseConversion: number
  priceElasticityUp: number
  priceElasticityDown: number
  considerationLiftRange: NumericRange
  reviewLiftRange: NumericRange
  purchaseConversionLiftRange: NumericRange
  purchaseConversionRange: NumericRange
  marketingResponseMultiplierMax: number
  marketingResponseScaleCents: {
    launch: number
    growth: number
    mature: number
    decline: number
    long_tail: number
  }
  awarenessCap: number
  randomPerturbationStddev: number
  randomPerturbationRange: NumericRange
  smallMarketFloorChance: number
  refundRate: number
  refundRateRange: NumericRange
  refundWindowDays: number
  platformFeeRateFallback: number
  platformFeeRateByCategory: Record<PlatformCategory, number>
  qualityPrefWeightDefault: QualityWeights
  qualityScoreFallback: number
}

/** 版本/哈希元信息 */
export interface SalesFormulaMeta {
  tuningVersion: string
  tuningValuesHash: string
  formulaConstantsVersion: string
  algorithmVersion: string
}

/** 单条 (产品 × 日 × 市场 × 平台 × 群体) 管线输入（§10.2） */
export interface SalesPipelineInput {
  productId: string
  companyId: string
  dayIndex: number
  marketId: string
  platformId: string
  /** M2-B 每条记录只允许一个 segment（D-04） */
  segmentId: string

  /** 所选 segment 的可及受众；null = 缺失输入，不进入管线（E16） */
  eligibleAudience: number | null
  /** 认知度 [0,1]，已按 awarenessCap clamp */
  awareness: number
  /** 类型兴趣 [0,1] */
  categoryInterest: number
  /** 自然考虑集基准 [0,1] */
  baseConsideration: number

  /** 质量五维原始分 */
  qualityProfile: QualityWeights
  /** 实际使用的质量权重 */
  qualityWeights: QualityWeights
  qualityWeightSource: QualityWeightSource
  /** 加权质量分 [0,100] */
  qualityScore: number

  /** 评价分 [0,100]；null 时用 qualityScore 代替 */
  reviewScore: number | null
  /** 竞品分流 [0,1] */
  competitionFactor: number

  /** 当前市场单价（美分，正整数） */
  priceCents: number
  /** 基准原价（美分）；M2 首发 = priceCents */
  basePriceCents: number
  /** 当日营销支出（美分）；M2 第一批固定 0 */
  dailyMarketingSpendCents: number
  /** 营销响应尺度（美分），按生命周期阶段取 TUNING */
  marketingResponseScaleCents: number
  /** 缺陷水平 [0,100] */
  defectLevel: number
  /** 平台抽成率 [0,1]（三态解析后的最终值） */
  platformFeeRate: number
  platformFeeSource: PlatformFeeSource
  /** 确定性扰动（由 RandomService 以 §10.9 ctx 派生） */
  randomPerturbation: number
}

/** 公式层随机源子集（RandomService 结构兼容） */
export interface SalesRandom {
  gauss(mean: number, stddev: number, ctx: RngContext): number
  chance(probability: number, ctx: RngContext): boolean
}

export type SalesDemandFactorId =
  | 'eligibleAudience'
  | 'awareness'
  | 'categoryInterest'
  | 'baseConsideration'
  | 'considerationLift'
  | 'reviewLift'
  | 'competitionFactor'
  | 'basePurchaseConversion'
  | 'purchaseConversionLift'
  | 'marketingResponseLift'
  | 'randomPerturbation'

export type SalesFinancialFactorId = 'price' | 'platformFeeRate'

export interface SalesDemandFactorTrace {
  factorId: SalesDemandFactorId
  /** 原始取值；competitionFactor 的乘性值为 1−value */
  value: number
  multiplier: number
  /** 对毛销量的贡献（件；可为负） */
  contributionUnits: number
  /** contributionUnits / grossUnits */
  contributionShare: number
}

export interface SalesFinancialFactorTrace {
  factorId: SalesFinancialFactorId
  value: number
  /** price = grossRevenueCents，platformFeeRate = −platformFeeCents */
  contributionCents: number
  shareOfNet: number
}

export interface SalesStageTrace {
  stage:
    | 'demand'
    | 'conversion'
    | 'units'
    | 'record'
    | 'revenue'
    | 'fee'
    | 'refund_forecast'
    | 'posting'
  formulaId: string
  inputs: Record<string, number>
  output: number
  outputs?: Record<string, number>
}

export interface SalesExplanationSegment {
  segmentId: string
  inputs: SalesPipelineInput
  stages: SalesStageTrace[]
  grossUnits: number
}

/** explainSales 查询 DTO（非持久化，§10.10） */
export interface SalesExplanation {
  productId: string
  dayIndex: number
  marketId: string
  platformId: string
  /** M2-B 恒为 1 个元素 */
  segments: SalesExplanationSegment[]
  /** 记录级输入（单 segment，不相加） */
  inputs: SalesPipelineInput
  stages: SalesStageTrace[]
  demandFactors: SalesDemandFactorTrace[]
  financialFactors: SalesFinancialFactorTrace[]
  /** 对数分解退化时的余项（件）；正常为 0 */
  attributionResidualUnits: number
  /** 仅从 demandFactors 取 |贡献| 前三 */
  topDrivers: SalesDemandFactorTrace[]
  result: {
    grossUnits: number
    unitPriceAtSaleCents: number
    grossRevenueCents: number
    platformFeeCents: number
    netSalesRevenueCents: number
    estimatedRefundUnits: number
    actualRefundUnits: number
  }
  tuningVersion: string
  tuningValuesHash: string
  formulaConstantsVersion: string
  algorithmVersion: string
  inputHash: string
}

/** explainSales 无缓存时的结构化错误 */
export interface SalesExplainError {
  errorCode: 'SALES_EXPLAIN_UNAVAILABLE'
  message: string
}

/** 输入端口：单组合市场输入（Q3） */
export interface MarketInputBundle {
  /** 目标群体规模；null → 跳过该组合（E16） */
  eligibleAudience: number | null
  /** 竞品分流 [0,1]；null → 跳过该组合（Q3，不得用 0 冒充） */
  competitionFactor: number | null
  /** 可选覆盖；默认取 TUNING.sales.categoryInterest */
  categoryInterest?: number
  /** 可选覆盖；默认取 TUNING.sales.baseConsideration */
  baseConsideration?: number
  /** 可选覆盖；M2 第一批固定 0 */
  dailyMarketingSpendCents?: number
}

export interface MarketInputQuery {
  product: Product
  marketId: string
  platformId: string
  segmentId: string
  dayIndex: number
}

export interface MarketInputProvider {
  getMarketInput(query: MarketInputQuery): MarketInputBundle | null
}

/** 默认端口：一律缺失 → 跳过并记录，不造默认认知度/受众 */
export const NULL_MARKET_INPUT_PROVIDER: MarketInputProvider = {
  getMarketInput: () => null,
}

export type SalesWarningCode =
  | 'SALES_MULTI_SEGMENT_DEFERRED'
  | 'SALES_MISSING_INPUT'
  | 'SALES_UNKNOWN_PLATFORM'
  | 'SALES_INVALID_INPUT'

export interface SalesWarning {
  code: SalesWarningCode
  message: string
  productId?: string
  marketId?: string
  platformId?: string
}

/** 入账命令（复用 FinanceService.PostTransactionCmd 语义） */
export interface SalesTransactionDraft {
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: number
  referenceId: string
  description: string
}
