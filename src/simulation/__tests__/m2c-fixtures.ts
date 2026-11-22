import { FinanceService } from '@simulation/services/finance-service'
import { RefundService } from '@simulation/services/refund-service'
import type { PlayerRefundRequest } from '@simulation/services/refund-service'
import type { WorldState } from '@simulation/services/world-state'
import type { SalesRecord } from '@domain/entities/sales-record'
import type { RefundBatch } from '@domain/entities/refund-batch'
import type { Product } from '@domain/entities/product'
import type { Transaction } from '@domain/entities/transaction'
import { makeRefundBatchId, refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import { makeSalesRecordId } from '@domain/entities/sales-record'
import { makeWorld, makeCompany, makeProject } from '../../__tests__/helpers'

/** F1（DATA/BDD 场景 1）：Day 100、1,500 件、单价 2,000、收入 3,000,000、抽成 900,000、净 2,100,000 */
export const F1 = {
  productId: 'PROJ-001',
  projectId: 'prj-001',
  salesRecordId: 'SR-PROJ-001-100-JP-home_console_g2',
  companyId: 'company-1',
  saleDay: 100,
  windowDays: 14,
  refundDay: 114,
  grossUnits: 1500,
  unitPriceCents: 2000,
  grossRevenueCents: 3_000_000,
  platformFeeCents: 900_000,
  netRevenueCents: 2_100_000,
  estimatedUnits: 30,
} as const

export function makeSalesRecord(overrides: Partial<SalesRecord> = {}): SalesRecord {
  const base: SalesRecord = {
    id: makeSalesRecordId(F1.productId, F1.saleDay, 'JP', 'home_console_g2'),
    productId: F1.productId,
    dayIndex: F1.saleDay,
    marketId: 'JP',
    platformId: 'home_console_g2',
    grossUnits: F1.grossUnits,
    unitPriceAtSaleCents: F1.unitPriceCents,
    grossRevenueCents: F1.grossRevenueCents,
    platformFeeCents: F1.platformFeeCents,
    netSalesRevenueCents: F1.netRevenueCents,
    estimatedRefundUnits: F1.estimatedUnits,
    actualRefundUnits: 0,
  }
  return { ...base, ...overrides }
}

export function makeAutoBatch(overrides: Partial<RefundBatch> = {}): RefundBatch {
  const productId = overrides.productId ?? F1.productId
  const saleDayIndex = overrides.saleDayIndex ?? F1.saleDay
  const refundDayIndex = overrides.refundDayIndex ?? F1.refundDay
  const id = overrides.id ?? makeRefundBatchId(productId, saleDayIndex, refundDayIndex, 1)
  return {
    id,
    productId,
    salesRecordId: F1.salesRecordId,
    marketId: 'JP',
    platformId: 'home_console_g2',
    saleDayIndex,
    refundDayIndex,
    refundedUnits: F1.estimatedUnits,
    refundAmountCents: F1.estimatedUnits * F1.unitPriceCents,
    source: 'auto_window',
    status: 'pending',
    ...overrides,
    idempotencyKey: refundBatchIdempotencyKey(overrides.id ?? id),
  }
}

export function makeProduct(salesByPeriod: SalesRecord[], overrides: Partial<Product> = {}): Product {
  return {
    id: F1.productId,
    sourceProjectId: F1.projectId,
    companyId: F1.companyId,
    name: 'Test Game',
    genreId: 'action',
    audienceSegmentIds: ['arcade_enthusiasts'],
    supportedPlatformIds: ['home_console_g2'],
    launchDay: F1.saleDay,
    launchPriceCents: F1.unitPriceCents,
    qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    defectLevel: 20,
    finalQualityScore: 80,
    reviewScore: null,
    brandImpact: 8,
    lifecycleStage: 'launch',
    awarenessByMarket: {},
    salesByPeriod,
    status: 'active',
    version: 1,
    createdAt: F1.saleDay,
    updatedAt: F1.saleDay,
    ...overrides,
  }
}

export function makeTx(
  id: string,
  category: Transaction['category'],
  amountCents: number,
  day: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    idempotencyKey: `key:${id}`,
    companyId: F1.companyId,
    day,
    category,
    amountCents,
    balanceAfterCents: 0,
    description: id,
    status: 'posted',
    ...overrides,
  }
}

/** F1 的销售日流水：销售收入 + 平台抽成（净额 2,100,000） */
export const SALES_TXNS: Transaction[] = [
  makeTx('tx-sales', 'sales_revenue', F1.grossRevenueCents, F1.saleDay),
  makeTx('tx-platform', 'platform_fee', -F1.platformFeeCents, F1.saleDay),
]

export interface FixtureParts {
  sales?: SalesRecord[]
  batches?: RefundBatch[]
  transactions?: Transaction[]
  events?: WorldState['events']
  currentDayIndex?: number
  cashOverrideCents?: number
}

/** 以 F1 为底构造世界：现金 = 交易净额（不手改 Company.cashBalanceCents） */
export function makeFixtureWorld(parts: FixtureParts = {}): WorldState {
  const sales = parts.sales ?? [makeSalesRecord()]
  const batches = parts.batches ?? []
  const transactions = parts.transactions ?? SALES_TXNS
  const cash = transactions.reduce((acc, t) => acc + t.amountCents, 0)
  return makeWorld({
    companies: [
      makeCompany({
        id: F1.companyId,
        cashBalanceCents: parts.cashOverrideCents ?? cash,
      }),
    ],
    employees: [],
    projects: [makeProject({ id: F1.projectId, companyId: F1.companyId, teamAssignments: [] })],
    products: [makeProduct(sales)],
    refundBatches: batches,
    transactions,
    events: parts.events ?? [],
    currentDayIndex: parts.currentDayIndex ?? 0,
  })
}

export function makeFinance(world: WorldState, register = true): FinanceService {
  const finance = new FinanceService()
  if (register) {
    finance.replay(world.transactions, world.companies.map((c) => c.id))
    // R7：账本是现金唯一真值 —— 按账本 hydrate 公司对象并登记基线（与生产 restore 同形）。
    for (const c of world.companies) finance.syncCash(c)
  }
  return finance
}

export interface ServiceKit {
  finance: FinanceService
  service: RefundService
}

export function makeService(
  world: WorldState,
  options: { refundWindowDays?: number; register?: boolean; finance?: FinanceService } = {},
): ServiceKit {
  const finance = options.finance ?? makeFinance(world, options.register ?? true)
  const service = new RefundService({
    finance,
    refundWindowDays: options.refundWindowDays ?? F1.windowDays,
    isCompanyRegistered: (id) => world.companies.some((c) => c.id === id),
  })
  return { finance, service }
}

export function requestOf(overrides: Partial<PlayerRefundRequest> = {}): PlayerRefundRequest {
  return {
    requestId: 'req-1',
    productId: F1.productId,
    salesRecordId: F1.salesRecordId,
    requestedUnits: 10,
    dayIndex: F1.refundDay,
    ...overrides,
  }
}

export function refundTxOf(world: WorldState, batchId: string): Transaction | undefined {
  const key = refundBatchIdempotencyKey(batchId)
  return world.transactions.find((t) => t.idempotencyKey === key)
}
