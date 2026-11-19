import { afterEach, describe, it, expect, vi } from 'vitest'
import platforms from '@content/platforms.json'
import type { PlatformContent } from '@content/queries'
import { parseSave } from '@infrastructure/storage/save-schema'
import { SalesError } from '@simulation/services/sales-formulas'
import type { Product } from '@domain/entities/product'
import {
  FIXTURE,
  SALES_DAY,
  makeInputProvider,
  makePerMarketProvider,
  makeSalesProduct,
  makeSalesService,
  makeSalesWorld,
  makeStubRng,
} from './sales-fixtures'
import type { WorldState } from '@simulation/services/world-state'

/**
 * P2-02 抽成三态夹具：仅在测试内改写 `platformFee`（null / 越界）或注入未知平台，
 * 其余一律委托真实内容数据；不改生产代码与 platforms.json。
 */
const platformOverrides = vi.hoisted(() => ({
  feeById: new Map<string, number | null>(),
  extraById: new Map<string, unknown>(),
}))

vi.mock('@content/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content/queries')>()
  return {
    ...actual,
    getPlatform: (platformId: string): PlatformContent | null => {
      const extra = platformOverrides.extraById.get(platformId)
      if (extra !== undefined) return extra as PlatformContent
      const platform = actual.getPlatform(platformId)
      if (platform !== null && platformOverrides.feeById.has(platformId)) {
        return { ...platform, platformFee: platformOverrides.feeById.get(platformId) as number }
      }
      return platform
    },
    isPlatformAvailable: (platformId: string, dayIndex: number): boolean => {
      if (platformOverrides.extraById.has(platformId)) return true
      return actual.isPlatformAvailable(platformId, dayIndex)
    },
  }
})

afterEach(() => {
  platformOverrides.feeById.clear()
  platformOverrides.extraById.clear()
})

type Harness = ReturnType<typeof makeSalesService>

function run(world: WorldState, dayIndex: number, override: Harness): {
  state: WorldState
  harness: Harness
} {
  const state = override.service.simulateDailySales(world, dayIndex)
  return { state, harness: override }
}

function allRecords(world: WorldState) {
  return world.products.flatMap((product) => product.salesByPeriod)
}

describe('销售管线服务（T10–T21 / T24–T26 / T28 / T32 / T34 / T36–T37）', () => {
  it('T10 多 segment：只取第一个可用族群，受众不相加', () => {
    const product = makeSalesProduct({
      audienceSegmentIds: ['arcade_enthusiasts', 'home_players'],
      supportedPlatformIds: ['arcade_classic'],
    })
    const world = makeSalesWorld([product], { currentDayIndex: 2999 })
    const harness = makeSalesService(world, {
      inputs: {
        getMarketInput: ({ segmentId }) => ({
          eligibleAudience: segmentId === 'arcade_enthusiasts' ? 120_000 : 90_000,
          competitionFactor: 0.15,
          categoryInterest: 0.6,
          baseConsideration: 0.5,
          dailyMarketingSpendCents: 100_000,
        }),
      },
    })
    const state = harness.service.simulateDailySales(world, 3000)
    const records = allRecords(state)
    expect(records).toHaveLength(1)
    expect(harness.service.getWarnings().map((w) => w.code)).toContain(
      'SALES_MULTI_SEGMENT_DEFERRED',
    )
    const explanation = harness.service.explainSales(FIXTURE.productId, 3000)
    expect(Array.isArray(explanation)).toBe(true)
    if (Array.isArray(explanation)) {
      expect(explanation[0]?.inputs.segmentId).toBe('arcade_enthusiasts')
      expect(explanation[0]?.inputs.eligibleAudience).toBe(120_000)
    }
  })

  it('T11 多市场：各自独立成记录，不共享受众', () => {
    const product = makeSalesProduct({
      awarenessByMarket: { japan: 0.45, north_america: 0.3 },
    })
    const world = makeSalesWorld([product])
    const harness = makeSalesService(world, {
      inputs: makePerMarketProvider({
        japan: {
          eligibleAudience: 120_000,
          competitionFactor: 0.15,
          categoryInterest: 0.6,
          baseConsideration: 0.5,
          dailyMarketingSpendCents: 100_000,
        },
        north_america: {
          eligibleAudience: 50_000,
          competitionFactor: 0.15,
          categoryInterest: 0.6,
          baseConsideration: 0.5,
          dailyMarketingSpendCents: 100_000,
        },
      }),
    })
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const records = allRecords(state)
    expect(records).toHaveLength(2)
    expect(records[0]?.marketId).toBe('japan')
    expect(records[1]?.marketId).toBe('north_america')
    expect(records[0]?.grossUnits).toBeGreaterThan(records[1]?.grossUnits ?? 0)
  })

  it('T14 工作示例端到端：1,593 件 / $47,774.07 / 抽成 / 净额 / 批次', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = harness.service.simulateDailySales(world, SALES_DAY)

    const record = allRecords(state)[0]
    expect(record).toBeDefined()
    expect(record?.id).toBe('SR-PROD-1-30-japan-arcade_pre_1975')
    expect(record?.grossUnits).toBe(1593)
    expect(record?.unitPriceAtSaleCents).toBe(2999)
    expect(record?.grossRevenueCents).toBe(4_777_407)
    expect(record?.platformFeeCents).toBe(1_433_222)
    expect(record?.netSalesRevenueCents).toBe(3_344_185)
    expect(record?.estimatedRefundUnits).toBe(31)
    expect(record?.actualRefundUnits).toBe(0)

    expect(state.refundBatches).toHaveLength(1)
    const batch = state.refundBatches[0]
    expect(batch?.saleDayIndex).toBe(SALES_DAY)
    expect(batch?.refundDayIndex).toBe(SALES_DAY + 14)
    expect(batch?.refundedUnits).toBe(31)
    expect(batch?.refundAmountCents).toBe(31 * 2999)
    expect(batch?.source).toBe('auto_window')
    expect(batch?.status).toBe('pending')

    expect(harness.finance.getCashBalance(FIXTURE.companyId)).toBe(3_344_185)
    const txs = harness.finance.getAllTransactions()
    expect(txs).toHaveLength(2)
    expect(txs.map((tx) => tx.category)).toEqual(['sales_revenue', 'platform_fee'])
    expect(txs.map((tx) => tx.amountCents)).toEqual([4_777_407, -1_433_222])
  })

  it('T15 记录 12 字段 + 批次契约 + parseSave 往返', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const record = allRecords(state)[0]!
    const batch = state.refundBatches[0]!
    const saved: WorldState = {
      ...state,
      companies: state.companies.map((company) => ({
        ...company,
        cashBalanceCents: harness.finance.getCashBalance(company.id),
      })),
      transactions: harness.finance.getAllTransactions(),
    }

    expect(Object.keys(record).sort()).toEqual(
      [
        'actualRefundUnits',
        'dayIndex',
        'estimatedRefundUnits',
        'grossRevenueCents',
        'grossUnits',
        'id',
        'marketId',
        'netSalesRevenueCents',
        'platformFeeCents',
        'platformId',
        'productId',
        'unitPriceAtSaleCents',
      ].sort(),
    )
    expect(batch.id).toBe('RB-PROD-1-30-44-1')
    expect(batch.idempotencyKey).toBe(`customer-refund:${batch.id}`)
    expect(batch.salesRecordId).toBe(record.id)

    const parsed = parseSave(saved)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.state.products[0]?.salesByPeriod).toHaveLength(1)
      expect(parsed.state.refundBatches).toHaveLength(1)
    }
  })

  it('T16 competitionFactor ≥ 1 → 考虑比例 0，无记录/交易，余额不变', () => {
    for (const competitionFactor of [1, 1.5]) {
      const world = makeSalesWorld()
      const harness = makeSalesService(world, { inputs: makeInputProvider({ competitionFactor }) })
      const state = harness.service.simulateDailySales(world, SALES_DAY)
      expect(allRecords(state)).toHaveLength(0)
      expect(state.refundBatches).toHaveLength(0)
      expect(harness.finance.getAllTransactions()).toHaveLength(0)
      expect(harness.finance.getCashBalance(FIXTURE.companyId)).toBe(0)
    }
  })

  it('T17 price null/0/负数/小数 → 跳过该产品；合法产品正常', () => {
    const invalidPrices = [null, 0, -100, 2999.5] as const
    const products: Product[] = invalidPrices.map((price, index) =>
      makeSalesProduct({
        id: `PROD-BAD-${index}`,
        launchPriceCents: price,
      }),
    )
    products.push(makeSalesProduct({ id: 'PROD-OK' }))
    const world = makeSalesWorld(products)
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = harness.service.simulateDailySales(world, SALES_DAY)

    const records = allRecords(state)
    expect(records).toHaveLength(1)
    expect(records[0]?.productId).toBe('PROD-OK')
    const codes = harness.service.getWarnings().map((w) => w.code)
    expect(codes).toContain('SALES_MISSING_INPUT')
    expect(codes).toContain('SALES_INVALID_INPUT')
  })

  it('T18 缺失输入：端口缺失跳过；受众 0 无记录；认知度缺失跳过该市场', () => {
    const missingWorld = makeSalesWorld()
    const missingPort = makeSalesService(missingWorld, { inputs: makeInputProvider(null) })
    const missingState = missingPort.service.simulateDailySales(missingWorld, SALES_DAY)
    expect(allRecords(missingState)).toHaveLength(0)
    expect(missingPort.service.getWarnings().map((w) => w.code)).toContain('SALES_MISSING_INPUT')

    const zeroAudienceWorld = makeSalesWorld()
    const zeroAudience = makeSalesService(zeroAudienceWorld, {
      inputs: makeInputProvider({ eligibleAudience: 0 }),
    })
    const zeroState = zeroAudience.service.simulateDailySales(zeroAudienceWorld, SALES_DAY)
    expect(allRecords(zeroState)).toHaveLength(0)
    expect(zeroAudience.finance.getAllTransactions()).toHaveLength(0)

    const badWorld = makeSalesWorld([
      makeSalesProduct({
        awarenessByMarket: {
          japan: 0.45,
          north_america: undefined as unknown as number,
        },
      }),
    ])
    const badAwareness = makeSalesService(badWorld)
    const badState = badAwareness.service.simulateDailySales(badWorld, SALES_DAY)
    const badRecords = allRecords(badState)
    expect(badRecords).toHaveLength(1)
    expect(badRecords[0]?.marketId).toBe('japan')
    expect(badAwareness.service.getWarnings().map((w) => w.code)).toContain('SALES_MISSING_INPUT')
  })

  it('T19 平台可用性：未上市/不存在平台跳过，仅可用平台出记录', () => {
    const world = makeSalesWorld([
      makeSalesProduct({
        supportedPlatformIds: ['arcade_pre_1975', 'pc_windows', 'does_not_exist'],
      }),
    ])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const records = allRecords(state)
    expect(records).toHaveLength(1)
    expect(records[0]?.platformId).toBe('arcade_pre_1975')
  })

  it('T20 pc 平台 0% 抽成：净额=毛收入，仅 1 笔收入交易', () => {
    const world = makeSalesWorld(
      [
        makeSalesProduct({
          supportedPlatformIds: ['pc_pre_ibm'],
          audienceSegmentIds: ['pc_gamers'],
        }),
      ],
      { currentDayIndex: 3749 },
    )
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, 3750)
    const record = allRecords(state)[0]
    expect(record?.platformId).toBe('pc_pre_ibm')
    expect(record?.platformFeeCents).toBe(0)
    expect(record?.netSalesRevenueCents).toBe(record?.grossRevenueCents)
    const txs = harness.finance.getAllTransactions()
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('sales_revenue')
  })

  it('T21 交易字段：类别/符号/公司/引用/日/幂等键逐项', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    harness.service.simulateDailySales(world, SALES_DAY)
    const [revenue, fee] = harness.finance.getAllTransactions()
    expect(revenue).toBeDefined()
    expect(fee).toBeDefined()

    expect(revenue?.companyId).toBe('company-1')
    expect(revenue?.day).toBe(SALES_DAY)
    expect(revenue?.category).toBe('sales_revenue')
    expect(revenue?.amountCents).toBe(4_777_407)
    expect(revenue?.referenceId).toBe('PROD-1')
    expect(revenue?.idempotencyKey).toBe('sales:PROD-1:japan:arcade_pre_1975:30')

    expect(fee?.companyId).toBe('company-1')
    expect(fee?.day).toBe(SALES_DAY)
    expect(fee?.category).toBe('platform_fee')
    expect(fee?.amountCents).toBe(-1_433_222)
    expect(fee?.referenceId).toBe('PROD-1')
    expect(fee?.idempotencyKey).toBe('platform-fee:PROD-1:japan:arcade_pre_1975:30')
  })

  it('T19 服务层抽成三态：记录值缺失/越界 → 类别默认（pinball / pc_online / mobile_g1）', () => {
    const cases = [
      // pinball 属 arcade（0.5），与平台记录值 0.30 不同，可区分优先级
      { platformId: 'pinball', dayIndex: 730, segmentId: 'arcade_enthusiasts', categoryRate: 0.5 },
      // pc_online 属 pc（0），按 id 映射而非 platformType='online'
      { platformId: 'pc_online', dayIndex: 11_323, segmentId: 'pc_gamers', categoryRate: 0 },
      // mobile_g1 属 digital（0.3）
      { platformId: 'mobile_g1', dayIndex: 13_879, segmentId: 'pc_gamers', categoryRate: 0.3 },
    ] as const

    for (const scenario of cases) {
      for (const fee of [null, 1.5] as const) {
        platformOverrides.feeById.set(scenario.platformId, fee)

        const product = makeSalesProduct({
          supportedPlatformIds: [scenario.platformId],
          audienceSegmentIds: [scenario.segmentId],
        })
        const world = makeSalesWorld([product], { currentDayIndex: scenario.dayIndex - 1 })
        const harness = makeSalesService(world)
        const state = harness.service.simulateDailySales(world, scenario.dayIndex)

        const record = allRecords(state)[0]
        expect(record?.platformId).toBe(scenario.platformId)
        expect(record?.platformFeeCents).toBe(
          Math.round((record?.grossRevenueCents ?? 0) * scenario.categoryRate),
        )

        const explanation = harness.service.explainSales(product.id, scenario.dayIndex)
        expect(Array.isArray(explanation)).toBe(true)
        if (!Array.isArray(explanation)) throw new Error('explanation missing')
        expect(explanation[0]?.inputs.platformFeeSource).toBe('category')
        expect(explanation[0]?.inputs.platformFeeRate).toBeCloseTo(scenario.categoryRate, 10)
      }
    }
  })

  it('T21 服务层抽成三态：未知平台 id → TUNING 0.30 + SALES_UNKNOWN_PLATFORM', () => {
    const platformId = 'future_platform'
    platformOverrides.extraById.set(platformId, {
      id: platformId,
      displayName: 'Future Platform',
      displayNameZh: '未来平台',
      platformType: 'pc',
      earliestAvailabilityYear: 1970,
      platformFee: null,
    })

    const product = makeSalesProduct({ supportedPlatformIds: [platformId] })
    const world = makeSalesWorld([product])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)

    const record = allRecords(state)[0]
    expect(record?.platformId).toBe(platformId)
    expect(record?.platformFeeCents).toBe(
      Math.round((record?.grossRevenueCents ?? 0) * 0.3),
    )
    expect(harness.service.getWarnings().map((warning) => warning.code)).toContain(
      'SALES_UNKNOWN_PLATFORM',
    )

    const explanation = harness.service.explainSales(product.id, SALES_DAY)
    expect(Array.isArray(explanation)).toBe(true)
    if (!Array.isArray(explanation)) throw new Error('explanation missing')
    expect(explanation[0]?.inputs.platformFeeSource).toBe('tuning')
    expect(explanation[0]?.inputs.platformFeeRate).toBeCloseTo(0.3, 10)
  })

  it('T22 未注册公司 → SALES_POSTING_FAILED，无挂载、无残留交易', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { registerCompany: false })
    expect(() => harness.service.simulateDailySales(world, SALES_DAY)).toThrow(SalesError)
    expect(() => harness.service.simulateDailySales(world, SALES_DAY)).toThrow(
      /SALES_POSTING_FAILED/,
    )
    expect(harness.finance.getAllTransactions()).toHaveLength(0)
    expect(world.products[0]?.salesByPeriod).toHaveLength(0)
    expect(world.refundBatches).toHaveLength(0)
  })

  it('T24 explainSales：缓存命中返回数组；未缓存返回结构化错误', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = harness.service.simulateDailySales(world, SALES_DAY)

    const hit = harness.service.explainSales('PROD-1', SALES_DAY)
    expect(Array.isArray(hit)).toBe(true)
    if (Array.isArray(hit)) {
      expect(hit).toHaveLength(1)
      expect(hit[0]?.marketId).toBe('japan')
      expect(hit[0]?.platformId).toBe('arcade_pre_1975')
      expect(hit[0]?.inputs.dayIndex).toBe(SALES_DAY)
    }

    const miss = harness.service.explainSales('PROD-1', SALES_DAY + 1)
    expect(miss).toEqual({
      errorCode: 'SALES_EXPLAIN_UNAVAILABLE',
      message: expect.stringContaining('PROD-1'),
    })

    // 次日执行后，当日缓存仍在
    harness.service.simulateDailySales(state, SALES_DAY + 1)
    expect(Array.isArray(harness.service.explainSales('PROD-1', SALES_DAY))).toBe(true)
  })

  it('T25 explanation.result 与记录逐字段一致，含 1 段', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const record = allRecords(state)[0]!
    const explanation = harness.service.explainSales('PROD-1', SALES_DAY)
    if (!Array.isArray(explanation)) throw new Error('explanation missing')

    const target = explanation[0]!
    expect(target.segments).toHaveLength(1)
    expect(target.segments[0]?.segmentId).toBe('arcade_enthusiasts')
    expect(target.result.grossUnits).toBe(record.grossUnits)
    expect(target.result.unitPriceAtSaleCents).toBe(record.unitPriceAtSaleCents)
    expect(target.result.grossRevenueCents).toBe(record.grossRevenueCents)
    expect(target.result.platformFeeCents).toBe(record.platformFeeCents)
    expect(target.result.netSalesRevenueCents).toBe(record.netSalesRevenueCents)
    expect(target.result.estimatedRefundUnits).toBe(record.estimatedRefundUnits)
    expect(target.result.actualRefundUnits).toBe(record.actualRefundUnits)
    expect(target.stages.length).toBeGreaterThanOrEqual(7)
  })

  it('T26 归因守恒：需求因子贡献和=毛销量，财务因子和=净额', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    harness.service.simulateDailySales(world, SALES_DAY)
    const explanation = harness.service.explainSales('PROD-1', SALES_DAY)
    if (!Array.isArray(explanation)) throw new Error('explanation missing')
    const target = explanation[0]!

    const demandSum = target.demandFactors.reduce((sum, f) => sum + f.contributionUnits, 0)
    expect(demandSum).toBeCloseTo(target.result.grossUnits, 6)
    expect(demandSum + target.attributionResidualUnits).toBeCloseTo(
      target.result.grossUnits,
      6,
    )
    expect(target.attributionResidualUnits).toBe(0)

    const financialSum = target.financialFactors.reduce((sum, f) => sum + f.contributionCents, 0)
    expect(financialSum).toBe(target.result.netSalesRevenueCents)
    const priceFactor = target.financialFactors.find((f) => f.factorId === 'price')
    const feeFactor = target.financialFactors.find((f) => f.factorId === 'platformFeeRate')
    expect(priceFactor?.shareOfNet).toBe(1)
    expect(feeFactor?.shareOfNet).toBeCloseTo(-target.result.platformFeeCents / target.result.netSalesRevenueCents, 10)
    expect(target.demandFactors).toHaveLength(11)
    expect(target.demandFactors.map((f) => f.factorId)).toContain('marketingResponseLift')
  })

  it('T27 同输入两次执行 explain 深度相等（含 inputHash）', () => {
    const runOnce = () => {
      const world = makeSalesWorld()
      const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
      harness.service.simulateDailySales(world, SALES_DAY)
      return harness.service.explainSales('PROD-1', SALES_DAY)
    }
    const a = runOnce()
    const b = runOnce()
    expect(Array.isArray(a)).toBe(true)
    expect(a).toEqual(b)
    if (Array.isArray(a)) {
      expect(a[0]?.inputHash).toBe(b && Array.isArray(b) ? b[0]?.inputHash : undefined)
      expect(a[0]?.tuningVersion).toBe('3')
      expect(a[0]?.formulaConstantsVersion).toBe('sales-formulas-v1')
    }
  })

  it('T28 跨日：2 记录 / 2 批次 / 4 交易，余额 2 倍', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const day1 = harness.service.simulateDailySales(world, SALES_DAY)
    const day2 = harness.service.simulateDailySales(day1, SALES_DAY + 1)

    expect(allRecords(day2)).toHaveLength(2)
    expect(day2.refundBatches).toHaveLength(2)
    expect(harness.finance.getAllTransactions()).toHaveLength(4)
    expect(harness.finance.getCashBalance(FIXTURE.companyId)).toBe(6_688_370)
    expect(new Set(day2.refundBatches.map((batch) => batch.id)).size).toBe(2)
  })

  it('T32 边界：每记录 ≤1 pending auto 批次，无退款交易，schemaVersion 保持 v2', () => {
    const world = makeSalesWorld([
      makeSalesProduct({ awarenessByMarket: { japan: 0.45, north_america: 0.3 } }),
    ])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    for (const record of allRecords(state)) {
      const related = state.refundBatches.filter(
        (batch) => batch.salesRecordId === record.id && batch.status !== 'rejected',
      )
      expect(related).toHaveLength(1)
      expect(related[0]?.source).toBe('auto_window')
      expect(related[0]?.status).toBe('pending')
    }
    expect(
      harness.finance.getAllTransactions().some((tx) => tx.category === 'customer_refund'),
    ).toBe(false)
    expect(state.schemaVersion).toBe(2)
  })

  it('T34 pending 唯一性：多市场 seq 唯一、ID 不冲突、重放不新增', () => {
    const world = makeSalesWorld([
      makeSalesProduct({ awarenessByMarket: { japan: 0.45, north_america: 0.3 } }),
    ])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const records = allRecords(state)
    expect(records).toHaveLength(2)
    expect(state.refundBatches).toHaveLength(2)
    const ids = state.refundBatches.map((batch) => batch.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids[0]?.endsWith('-1')).toBe(true)
    expect(ids[1]?.endsWith('-2')).toBe(true)
    expect(new Set(state.refundBatches.map((batch) => batch.idempotencyKey)).size).toBe(2)

    const txCount = harness.finance.getAllTransactions().length
    const rerun = harness.service.simulateDailySales(state, SALES_DAY)
    expect(allRecords(rerun)).toHaveLength(2)
    expect(rerun.refundBatches).toHaveLength(2)
    expect(harness.finance.getAllTransactions()).toHaveLength(txCount)
  })

  it('T35 platforms.json 数据：pc 系列 0，digital_download 0.30', () => {
    const byId = new Map(platforms.map((platform) => [platform.id, platform]))
    for (const id of ['pc_pre_ibm', 'pc_ibm_compatible', 'pc_windows', 'pc_online']) {
      expect(byId.get(id)?.platformFee).toBe(0)
    }
    expect(byId.get('digital_download')?.platformFee).toBe(0.3)
    expect(byId.get('pinball')?.platformFee).toBe(0.3)
    expect(byId.get('home_console_g2')?.platformFee).toBe(0.3)
  })

  it('T36 生命周期：long_tail 正常销售，retired 跳过', () => {
    const world = makeSalesWorld([
      makeSalesProduct({ id: 'PROD-LONG', lifecycleStage: 'long_tail' }),
      makeSalesProduct({ id: 'PROD-STOP', lifecycleStage: 'retired' }),
    ])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const records = allRecords(state)
    expect(records).toHaveLength(1)
    expect(records[0]?.productId).toBe('PROD-LONG')
  })

  it('T37 estimated=0：记录存在但 0 批次', () => {
    const world = makeSalesWorld([
      makeSalesProduct({ awarenessByMarket: { japan: 0.45 } }),
    ])
    const harness = makeSalesService(world, {
      inputs: makeInputProvider({ eligibleAudience: 1000 }),
      rng: makeStubRng(0.02),
    })
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const record = allRecords(state)[0]
    expect(record).toBeDefined()
    expect(record?.grossUnits).toBeGreaterThan(0)
    expect(record?.estimatedRefundUnits).toBe(0)
    expect(state.refundBatches).toHaveLength(0)
    expect(harness.finance.getAllTransactions()).toHaveLength(2)
  })
})

describe('服务边界（补充）', () => {
  it('非 active 产品跳过', () => {
    const world = makeSalesWorld([makeSalesProduct({ status: 'retired' })])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    expect(allRecords(state)).toHaveLength(0)
  })

  it('launchDay > dayIndex 时不销售', () => {
    const world = makeSalesWorld([makeSalesProduct({ launchDay: SALES_DAY + 1 })])
    const harness = makeSalesService(world)
    const state = harness.service.simulateDailySales(world, SALES_DAY)
    expect(allRecords(state)).toHaveLength(0)
  })

  it('run 辅助：返回同一 harness 便于连续调用', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world)
    const first = run(world, SALES_DAY, harness)
    expect(first.state.products[0]?.salesByPeriod).toHaveLength(1)
  })
})
