import type { Company } from '@domain/entities/company'
import type { Product } from '@domain/entities/product'
import { referencePriceCents } from './c1-content'
import { seedInitialAwareness } from './market-inputs'
import { awarenessByScopeOf } from '@simulation/services/product-awareness'
import { getCity } from './queries'
import { OPENING_REGIONS } from './opening-regions'

export const OPENING_RELEASES = [
  { companyId: 'ai-lunar_lark', id: 'opening-lunar-lark', name: '弹珠冲刺', genreId: 'arcade' },
  { companyId: 'ai-arcade_kings', id: 'opening-arcade-kings', name: '街头拳王', genreId: 'fighting' },
  { companyId: 'ai-north_star', id: 'opening-north-star', name: '星际巡航', genreId: 'shooter' },
] as const

const PLATFORM_ID = 'arcade_pre_1975'
const AUDIENCE_ID = 'arcade_enthusiasts'

export function isOpeningMarketRelease(product: Pick<Product, 'id' | 'companyId' | 'sourceProjectId' | 'launchDay'>): boolean {
  return product.launchDay === 0 && OPENING_RELEASES.some((release) =>
    release.id === product.id && release.companyId === product.companyId &&
    product.sourceProjectId === `opening-project-${release.id}`,
  )
}

export function seedRegionalLaunchAwareness(company: Company, dayIndex: number) {
  const awareness = seedInitialAwareness(company.brand, dayIndex)
  const regionId = getCity(company.cityId)?.regionId
  if (regionId && OPENING_REGIONS[regionId] && awareness[regionId] !== undefined) {
    awareness[regionId] *= 1.75
  }
  return awareness
}

/** Small, already-released catalog that gives a fresh 1970 save an active market. */
export function createOpeningMarketProducts(companies: readonly Company[], dayIndex: number): Product[] {
  return OPENING_RELEASES.flatMap((release) => {
    const company = companies.find((item) => item.id === release.companyId)
    if (company === undefined) return []

    const product: Product = {
      id: release.id,
      sourceProjectId: `opening-project-${release.id}`,
      companyId: company.id,
      name: release.name,
      genreId: release.genreId,
      audienceSegmentIds: [AUDIENCE_ID],
      supportedPlatformIds: [PLATFORM_ID],
      launchDay: dayIndex,
      launchPriceCents: referencePriceCents(release.genreId, PLATFORM_ID, AUDIENCE_ID),
      qualityProfile: { gameplay: 62, technical: 60, content: 58, art: 60, innovation: 55 },
      defectLevel: 35,
      finalQualityScore: 65,
      reviewScore: null,
      brandImpact: 0,
      lifecycleStage: 'launch',
      awarenessByMarket: seedRegionalLaunchAwareness(company, dayIndex),
      salesByPeriod: [],
      status: 'active',
      version: 1,
      createdAt: dayIndex,
      updatedAt: dayIndex,
    }
    product.awarenessByScope = awarenessByScopeOf(product)
    return [product]
  })
}
