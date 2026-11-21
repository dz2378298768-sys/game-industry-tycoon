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
  /** 上市价；null 表示未定价（上市时一律为 null，M2-D 由玩家首次定价写入） */
  launchPriceCents: number | null
  /** M2-D：当前挂牌价（成交价 = 挂牌价 ×(1-折扣率/100)，四舍五入）；缺省取 launchPriceCents */
  pricePerUnitCents?: number
  /** M2-D：当前折扣百分比整数 0..50；0 = 显式取消折扣，缺省 ≡ 0 */
  discountRatePercent?: number
  /** M2-D：最近一次改价/折扣生效日（7 天冷却判据）；缺省视为从未变更 */
  lastPriceChangeDay?: number
  /** 原始五维质量快照（生产阶段累积），不是最终总质量 */
  qualityProfile: QualityProfile
  defectLevel: number      // 0-100
  /** 最终总质量 = 100 - defectLevel（0-100） */
  finalQualityScore: number
  reviewScore: number | null
  brandImpact: number
  lifecycleStage: ProductLifecycleStage
  awarenessByMarket: Record<string, number>
  /** M3-C1：按 scope（market:platform:segment）的认知度；新写入唯一来源，旧档由迁移层拆分 */
  awarenessByScope?: Record<string, number>
  /** M2：按日销售记录（唯一销售记录来源）；新上市产品初始化为 [] */
  salesByPeriod: SalesRecord[]
  status: ProductStatus
  version: number
  createdAt: number
  updatedAt: number
}
