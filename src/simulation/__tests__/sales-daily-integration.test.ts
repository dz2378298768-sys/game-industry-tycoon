import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { MarketSimulationService } from '@simulation/services/market-simulation-service'
import { ProjectService } from '@simulation/services/project-service'
import { RandomService } from '@simulation/services/random-service'
import { parseSave } from '@infrastructure/storage/save-schema'
import type { WorldState } from '@simulation/services/world-state'
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
import {
  makeCompany,
  makeEmployee,
  makeProject,
  makeWorld,
} from '../../__tests__/helpers'

/**
 * 观测销售阶段调用时的项目阶段：锁住 D-11「销售先于研发」。
 * 若把销售阶段移到 applyProjectWork 之后，此处会看到 READY_TO_LAUNCH 而变红。
 */
class OrderProbeSales extends MarketSimulationService {
  public observedProjectPhases: string[] = []

  override simulateDailySales(world: WorldState, dayIndex: number): WorldState {
    this.observedProjectPhases.push(...world.projects.map((project) => project.phase))
    return super.simulateDailySales(world, dayIndex)
  }
}

function withCash(state: WorldState, balanceByCompany: Map<string, number>): WorldState {
  return {
    ...state,
    companies: state.companies.map((company) => ({
      ...company,
      cashBalanceCents: balanceByCompany.get(company.id) ?? 0,
    })),
  }
}

function allRecords(world: WorldState) {
  return world.products.flatMap((product) => product.salesByPeriod)
}

describe('销售日集成（T23 / T27 / T29–T31 / T38）', () => {
  it('T23 存档恢复后重执行同日：无新增，幂等键集合逐项相等', () => {
    const world = makeSalesWorld()
    const direct = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = direct.service.simulateDailySales(world, SALES_DAY)
    const baselineKeys = direct.finance
      .getAllTransactions()
      .map((tx) => tx.idempotencyKey)
    const baselineBalance = direct.finance.getCashBalance(FIXTURE.companyId)

    const saved = withCash(
      { ...state, transactions: direct.finance.getAllTransactions() },
      new Map([[FIXTURE.companyId, direct.finance.getCashBalance(FIXTURE.companyId)]]),
    )
    const parsed = parseSave(saved)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const restored = makeSalesService(parsed.state, { rng: makeStubRng(0.02) })
    const replayState = restored.service.simulateDailySales(
      { ...parsed.state, currentDayIndex: SALES_DAY - 1 },
      SALES_DAY,
    )

    expect(allRecords(replayState)).toHaveLength(1)
    expect(replayState.refundBatches).toHaveLength(1)
    expect(restored.finance.getAllTransactions().map((tx) => tx.idempotencyKey)).toEqual(
      baselineKeys,
    )
    expect(restored.finance.getCashBalance(FIXTURE.companyId)).toBe(baselineBalance)
  })

  it('T27 同 seed 两次执行结果深度相等', () => {
    const build = () => {
      const world = structuredClone(makeSalesWorld())
      const harness = makeSalesService(world)
      const state = harness.service.simulateDailySales(world, SALES_DAY)
      return {
        state,
        txs: harness.finance.getAllTransactions().map((tx) => tx.idempotencyKey),
        balance: harness.finance.getCashBalance(FIXTURE.companyId),
      }
    }
    const a = build()
    const b = build()
    expect(a.state).toEqual(b.state)
    expect(a.txs).toEqual(b.txs)
    expect(a.balance).toBe(b.balance)
  })

  it('T29 恢复后 explainSales 缓存不可用，但后续销售正常', () => {
    const world = makeSalesWorld()
    const direct = makeSalesService(world, { rng: makeStubRng(0.02) })
    const state = direct.service.simulateDailySales(world, SALES_DAY)
    expect(Array.isArray(direct.service.explainSales('PROD-1', SALES_DAY))).toBe(true)

    const saved = withCash(
      { ...state, transactions: direct.finance.getAllTransactions() },
      new Map([[FIXTURE.companyId, direct.finance.getCashBalance(FIXTURE.companyId)]]),
    )
    const parsed = parseSave(saved)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const restored = makeSalesService(parsed.state, { rng: makeStubRng(0.02) })
    expect(restored.service.explainSales('PROD-1', SALES_DAY)).toEqual({
      errorCode: 'SALES_EXPLAIN_UNAVAILABLE',
      message: expect.stringContaining('PROD-1'),
    })

    const next = restored.service.simulateDailySales(parsed.state, SALES_DAY + 1)
    expect(allRecords(next)).toHaveLength(2)
  })

  it('T30 月度结算日：销售交易先于工资/租金入账', () => {
    const world = makeSalesWorld(
      [makeSalesProduct({ awarenessByMarket: { japan: 0.45 } })],
      { employees: [makeEmployee()] },
    )
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const scheduler = new DailyScheduler({ finance: harness.finance, sales: harness.service })
    scheduler.executeDay(world, SALES_DAY)

    const keys = harness.finance.getAllTransactions().map((tx) => tx.idempotencyKey)
    const salesIndex = keys.findIndex((key) => key.startsWith('sales:'))
    const feeIndex = keys.findIndex((key) => key.startsWith('platform-fee:'))
    const salaryIndex = keys.findIndex((key) => key.startsWith('salary:'))
    const rentIndex = keys.findIndex((key) => key.startsWith('rent:'))

    expect(salesIndex).toBeGreaterThanOrEqual(0)
    expect(feeIndex).toBeGreaterThan(salesIndex)
    expect(salaryIndex).toBeGreaterThan(feeIndex)
    expect(rentIndex).toBeGreaterThan(salaryIndex)
  })

  it('T31 多公司多产品入账顺序：company → product → market → platform', () => {
    const world = makeSalesWorld(
      [
        makeSalesProduct({ id: 'PROD-B', companyId: 'company-2', awarenessByMarket: { japan: 0.45, north_america: 0.3 } }),
        makeSalesProduct({ id: 'PROD-A', companyId: 'company-1' }),
      ],
      {
        companies: [
          makeCompany({ id: 'company-1', cashBalanceCents: 0 }),
          makeCompany({ id: 'company-2', cashBalanceCents: 0 }),
        ],
      },
    )
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
    harness.service.simulateDailySales(world, SALES_DAY)
    const keys = harness.finance.getAllTransactions().map((tx) => tx.idempotencyKey)
    expect(keys).toEqual([
      'sales:PROD-A:japan:arcade_pre_1975:30',
      'platform-fee:PROD-A:japan:arcade_pre_1975:30',
      'sales:PROD-B:japan:arcade_pre_1975:30',
      'platform-fee:PROD-B:japan:arcade_pre_1975:30',
      'sales:PROD-B:north_america:arcade_pre_1975:30',
      'platform-fee:PROD-B:north_america:arcade_pre_1975:30',
    ])
  })

  it('T38 真实上市路径：Day D 研发完成→launch，D 不销售、D+1 恰好 1 条', () => {
    const launchDay = 40
    const world = makeWorld({
      companies: [makeCompany({ cashBalanceCents: 0 })],
      employees: [makeEmployee()],
      projects: [
        makeProject({
          phase: 'QA',
          plannedLaunchDay: launchDay,
          targetPlatformIds: ['arcade_pre_1975'],
          workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
          // QA 已完成 → 当日研发阶段推进到 READY_TO_LAUNCH（真实研发完成）
          workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
        }),
      ],
      products: [],
      currentDayIndex: launchDay - 1,
    })

    const finance = new FinanceService()
    finance.registerCompany('company-1')
    const sales = new OrderProbeSales({
      finance,
      rng: makeStubRng(0.02),
      inputs: makeInputProvider(),
    })
    const scheduler = new DailyScheduler({ finance, sales })

    const dayD = scheduler.executeDay(world, launchDay)
    // 销售阶段必须看到研发前的 QA（若移到研发后则为 READY_TO_LAUNCH → 反证变红）
    expect(sales.observedProjectPhases).toEqual(['QA'])
    expect(dayD.projects[0]?.phase).toBe('READY_TO_LAUNCH')
    expect(allRecords(dayD)).toHaveLength(0)

    const projects = new ProjectService()
    projects.reset(dayD.projects)
    const launched = projects.launch('project-1', launchDay)
    expect(launched.success).toBe(true)
    if (!launched.success || !launched.result) throw new Error('launch failed')
    expect(launched.result.product.launchDay).toBe(launchDay)

    const product = {
      ...launched.result.product,
      // launch() 产出无定价/认知度（M1 现状）；补 M2-D/F 接通前的夹具数据
      launchPriceCents: FIXTURE.priceCents,
      awarenessByMarket: { [FIXTURE.marketId]: 0.45 },
      supportedPlatformIds: ['arcade_pre_1975'],
    }
    const withProduct: WorldState = {
      ...dayD,
      projects: projects.listAll(),
      products: [product],
    }
    const dayNext = scheduler.executeDay(withProduct, launchDay + 1)

    const records = allRecords(dayNext)
    expect(records).toHaveLength(1)
    expect(records[0]?.dayIndex).toBe(launchDay + 1)
    expect(records.every((record) => record.dayIndex !== launchDay)).toBe(true)
  })

  it('调度器未注入销售服务时保持 M1 行为（无记录）', () => {
    const world = makeSalesWorld()
    const harness = makeSalesService(world, { rng: makeStubRng(0.02) })
    const scheduler = new DailyScheduler({ finance: harness.finance })
    const state = scheduler.executeDay(world, SALES_DAY)
    expect(allRecords(state)).toHaveLength(0)
    expect(
      harness.finance.getAllTransactions().filter((tx) => tx.category === 'sales_revenue'),
    ).toHaveLength(0)
  })

  it('真实随机源可复现（同 seed → 同记录）', () => {
    const run = (seed: number) => {
      const world = makeSalesWorld()
      const rng = new RandomService(seed)
      const harness = makeSalesService(world, { rng, inputs: makeInputProvider() })
      return allRecords(harness.service.simulateDailySales(world, SALES_DAY))
    }
    expect(run(7)).toEqual(run(7))
  })
})
