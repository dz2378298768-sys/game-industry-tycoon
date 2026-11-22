/**
 * M2-B 销售管线测试夹具（Q1–Q3：夹具先行）。
 * 不进入生产包；仅被 `*.test.ts` 引用。
 */
import type { Product } from '@domain/entities/product'
import type { WorldState } from '@simulation/services/world-state'
import { FinanceService } from '@simulation/services/finance-service'
import { MarketSimulationService } from '@simulation/services/market-simulation-service'
import { RandomService } from '@simulation/services/random-service'
import { TUNING } from '@content/tuning'
import { makeCompany, makeEmployee, makeProject, makeWorld } from '../../__tests__/helpers'
import type {
  MarketInputBundle,
  MarketInputProvider,
  SalesPipelineInput,
  SalesRandom,
  SalesTuning,
} from '@simulation/services/sales-types'

/** 1970-01-31：arcade_pre_1975 与 arcade_enthusiasts 均已可用 */
export const SALES_DAY = 30

export const FIXTURE = {
  productId: 'PROD-1',
  companyId: 'company-1',
  projectId: 'project-1',
  marketId: 'japan',
  platformId: 'arcade_pre_1975',
  segmentId: 'arcade_enthusiasts',
  /** 工作示例 §10.3.9 单价（2999 美分） */
  priceCents: 2999,
} as const

/** 工作示例 §10.3.9 的输入端口夹具 */
export const FIXTURE_BUNDLE: MarketInputBundle = {
  eligibleAudience: 120_000,
  competitionFactor: 0.15,
  categoryInterest: 0.6,
  baseConsideration: 0.5,
  dailyMarketingSpendCents: 100_000,
}

export const SALES_TUNING: SalesTuning = TUNING.sales

export function makeSalesProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: FIXTURE.productId,
    sourceProjectId: FIXTURE.projectId,
    companyId: FIXTURE.companyId,
    name: 'Fixture Game',
    genreId: 'action',
    audienceSegmentIds: [FIXTURE.segmentId],
    supportedPlatformIds: [FIXTURE.platformId],
    launchDay: 0,
    launchPriceCents: FIXTURE.priceCents,
    qualityProfile: {
      gameplay: 80,
      technical: 70,
      content: 75,
      art: 85,
      innovation: 65,
    },
    defectLevel: 25,
    finalQualityScore: 75,
    reviewScore: 72,
    brandImpact: 0,
    lifecycleStage: 'growth',
    awarenessByMarket: { [FIXTURE.marketId]: 0.45 },
    salesByPeriod: [],
    status: 'active',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makeSalesWorld(
  products: Product[] = [makeSalesProduct()],
  overrides: Partial<WorldState> = {},
): WorldState {
  return makeWorld({
    companies: [makeCompany({ cashBalanceCents: 0 })],
    // parseSave 会校验 project.teamAssignments → employees 引用，故保留默认员工
    employees: [makeEmployee()],
    projects: [makeProject({ id: FIXTURE.projectId, companyId: FIXTURE.companyId })],
    products,
    currentDayIndex: SALES_DAY - 1,
    ...overrides,
  })
}

export function makeInputProvider(
  bundle: Partial<MarketInputBundle> | null = {},
): MarketInputProvider {
  const resolved =
    bundle === null ? null : { ...FIXTURE_BUNDLE, ...bundle }
  return {
    getMarketInput: () => resolved,
  }
}

export function makePerMarketProvider(
  bundles: Record<string, MarketInputBundle | null>,
): MarketInputProvider {
  return {
    getMarketInput: ({ marketId }) => bundles[marketId] ?? null,
  }
}

export function makeStubRng(gaussSample = 0, chanceHit = false): SalesRandom {
  return {
    gauss: () => gaussSample,
    chance: () => chanceHit,
  }
}

export interface SalesServiceHarness {
  finance: FinanceService
  service: MarketSimulationService
  rng: SalesRandom
}

export function makeSalesService(
  world: WorldState,
  options: {
    inputs?: MarketInputProvider
    rng?: SalesRandom
    registerCompany?: boolean
    demandMode?: boolean
  } = {},
): SalesServiceHarness {
  const finance = new FinanceService()
  if (options.registerCompany !== false) {
    for (const company of world.companies) finance.registerCompany(company.id)
    if (world.transactions.length > 0) {
      finance.replay(
        world.transactions,
        world.companies.map((company) => company.id),
      )
    }
    // R7：账本是现金唯一真值 —— 夹具公司对象按账本 hydrate 并登记基线，
    // 使调度器的"账实一致"断言不会把夹具判成第二写入者（与生产 restore 同形）。
    for (const company of world.companies) finance.syncCash(company)
  }
  const rng = options.rng ?? new RandomService(world.saveSeed)
  const service = new MarketSimulationService({
    finance,
    rng,
    inputs: options.inputs ?? makeInputProvider(),
    demandMode: options.demandMode === true,
  })
  return { finance, service, rng }
}

export function makePipelineInput(overrides: Partial<SalesPipelineInput> = {}): SalesPipelineInput {
  return {
    productId: FIXTURE.productId,
    companyId: FIXTURE.companyId,
    dayIndex: SALES_DAY,
    marketId: FIXTURE.marketId,
    platformId: FIXTURE.platformId,
    segmentId: FIXTURE.segmentId,
    eligibleAudience: FIXTURE_BUNDLE.eligibleAudience,
    awareness: 0.45,
    categoryInterest: 0.6,
    baseConsideration: 0.5,
    qualityProfile: {
      gameplay: 80,
      technical: 70,
      content: 75,
      art: 85,
      innovation: 65,
    },
    qualityWeights: { ...TUNING.sales.qualityPrefWeightDefault },
    qualityWeightSource: 'tuning',
    qualityScore: 75.25,
    reviewScore: 72,
    competitionFactor: 0.15,
    priceCents: FIXTURE.priceCents,
    basePriceCents: FIXTURE.priceCents,
    dailyMarketingSpendCents: 100_000,
    marketingResponseScaleCents: 100_000,
    defectLevel: 25,
    platformFeeRate: 0.3,
    platformFeeSource: 'platform',
    randomPerturbation: 1,
    ...overrides,
  }
}
