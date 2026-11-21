/**
 * M2-D 定价/生命周期测试夹具（DESIGN-M2-001-D §12）。
 * 不进入生产包；仅被 `*.test.ts` 引用。
 */
import type { Product } from '@domain/entities/product'
import type { SalesRecord } from '@domain/entities/sales-record'
import type { WorldState } from '@simulation/services/world-state'
import { createEmptyWorld } from '@simulation/services/world-state'
import { makeCompany, makeProject } from '../../__tests__/helpers'

export const D_PRODUCT_ID = 'PROD-D'
export const D_COMPANY_ID = 'company-d'

/** 未定价产品（launchPriceCents = null），模拟真实上市初态 */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: D_PRODUCT_ID,
    sourceProjectId: 'prj-d',
    companyId: D_COMPANY_ID,
    name: 'Pricing Fixture',
    genreId: 'action',
    audienceSegmentIds: ['arcade_enthusiasts'],
    supportedPlatformIds: ['arcade_pre_1975'],
    launchDay: 0,
    launchPriceCents: null,
    qualityProfile: { gameplay: 70, technical: 70, content: 70, art: 70, innovation: 70 },
    defectLevel: 20,
    finalQualityScore: 80,
    reviewScore: null,
    brandImpact: 8,
    lifecycleStage: 'launch',
    awarenessByMarket: {},
    salesByPeriod: [],
    status: 'active',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makeWorld(products: Product[] = [makeProduct()], day = 0): WorldState {
  return {
    ...createEmptyWorld(42),
    companies: [makeCompany({ id: D_COMPANY_ID })],
    // 产品引用项目必须存在，否则 parseSave 报 SAVE_BROKEN_REF
    projects: [makeProject({ id: 'prj-d', companyId: D_COMPANY_ID, teamAssignments: [] })],
    products,
    currentDayIndex: day,
  }
}

export function makeRecord(dayIndex: number, units = 10, unitPrice = 2000): SalesRecord {
  return {
    id: `SR-${D_PRODUCT_ID}-${dayIndex}`,
    productId: D_PRODUCT_ID,
    dayIndex,
    marketId: 'japan',
    platformId: 'arcade_pre_1975',
    grossUnits: units,
    unitPriceAtSaleCents: unitPrice,
    grossRevenueCents: units * unitPrice,
    platformFeeCents: Math.round(units * unitPrice * 0.3),
    netSalesRevenueCents: units * unitPrice - Math.round(units * unitPrice * 0.3),
    estimatedRefundUnits: Math.floor(units * 0.03),
    actualRefundUnits: 0,
  }
}
