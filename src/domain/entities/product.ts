import type {
  ProductLifecycleStage,
  ProductStatus,
} from '@domain/enums'
import type { QualityProfile } from '@domain/value-objects'
import type { SalesRecord } from './sales-record'

export interface Product {
  id: string
  sourceProjectId: string
  companyId: string
  name: string
  genreId: string
  audienceSegmentIds: string[]
  supportedPlatformIds: string[]
  launchDay: number              // 真实上市日（actualLaunchDay）
  /** M1 不做真实定价；null 表示未定价 */
  launchPriceCents: number | null
  /** 原始五维质量快照（生产阶段累积），不是最终总质量 */
  qualityProfile: QualityProfile
  defectLevel: number      // 0-100
  /** 最终总质量 = 100 - defectLevel（0-100） */
  finalQualityScore: number
  reviewScore: number | null
  brandImpact: number
  lifecycleStage: ProductLifecycleStage
  awarenessByMarket: Record<string, number>
  /** M2：按日销售记录（唯一销售记录来源）；新上市产品初始化为 [] */
  salesByPeriod: SalesRecord[]
  status: ProductStatus
  version: number
  createdAt: number
  updatedAt: number
}
