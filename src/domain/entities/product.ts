import type {
  ProductLifecycleStage,
  ProductStatus,
} from '@domain/enums'
import type { QualityProfile } from '@domain/value-objects'

export interface Product {
  id: string
  sourceProjectId: string
  companyId: string
  name: string
  genreId: string
  audienceSegmentIds: string[]
  supportedPlatformIds: string[]
  launchDay: number
  launchPriceCents: number
  qualityProfile: QualityProfile
  defectLevel: number      // 0-100
  reviewScore: number | null
  brandImpact: number
  lifecycleStage: ProductLifecycleStage
  awarenessByMarket: Record<string, number>
  status: ProductStatus
  version: number
  createdAt: number
  updatedAt: number
}
