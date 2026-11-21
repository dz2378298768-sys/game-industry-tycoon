import { describe, it, expect } from 'vitest'
import { FinanceService } from '@simulation/services/finance-service'
import { setMarketingBudget, tickMarketing } from '@simulation/services/marketing-service'
import {
  signRevenueShareContract,
  signMilestoneContract,
  settleContracts,
} from '@simulation/services/contract-service'
import {
  awarenessDeltaCents,
  applyAwarenessDecay,
  contractBaseCents,
  shareAmountCents,
  splitBudgetAcrossMarkets,
  CHANNEL_FACTOR,
} from '@domain/value-objects'
import { TUNING } from '@content/tuning'
import { makeFixtureWorld } from './m2c-fixtures'
import type { WorldState } from '@simulation/services/world-state'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { parseSave } from '@infrastructure/storage/save-schema'
import { MarketingService } from '@simulation/services/marketing-service'
import { ContractService } from '@simulation/services/contract-service'
import { GameWorld } from '@application/mediators/game-world'

function worldWithProduct(overrides: Record<string, unknown> = {}, day = 100): WorldState {
  const world = makeFixtureWorld({ currentDayIndex: day })
  world.products[0] = {
    ...world.products[0]!,
    awarenessByMarket: { JP: 0.1, NA: 0.05 },
    launchPriceCents: 2000,
    lifecycleStage: 'launch',
    ...overrides,
  }
  return world
}

function financeOf(world: WorldState): FinanceService {
  const finance = new FinanceService()
  finance.replay(world.transactions, world.companies.map((c) => c.id))
  return finance
}

function tick(world: WorldState, day: number, finance: FinanceService) {
  return tickMarketing(world, day, { finance, tuning: TUNING.sales })
}

describe('营销纯函数 F01–F06', () => {
  it('F01 渠道系数：展会 > 社媒 > 广告', () => {
    expect(CHANNEL_FACTOR.expo).toBeGreaterThan(CHANNEL_FACTOR.social)
    expect(CHANNEL_FACTOR.social).toBeGreaterThan(CHANNEL_FACTOR.ads)
  })

  it('F02 预算均分：总额守恒，余数给字典序第一个市场', () => {
    const shares = splitBudgetAcrossMarkets(1001, ['NA', 'JP'])
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1001)
    expect(shares.get('JP')).toBe(501)
    expect(shares.get('NA')).toBe(500)
  })

  it('F03 认知度越高边际越小', () => {
    const low = awarenessDeltaCents({ budgetShareCents: 50_000, stageScaleCents: 50_000, channel: 'social', awareness: 0.1, cap: 0.6 })
    const high = awarenessDeltaCents({ budgetShareCents: 50_000, stageScaleCents: 50_000, channel: 'social', awareness: 0.4, cap: 0.6 })
    expect(low).toBeGreaterThan(high)
  })

  it('F04 达到 cap 后增量为 0', () => {
    expect(
      awarenessDeltaCents({ budgetShareCents: 50_000, stageScaleCents: 50_000, channel: 'expo', awareness: 0.6, cap: 0.6 }),
    ).toBe(0)
  })

  it('F05 衰减下限为 0', () => {
    expect(applyAwarenessDecay(0)).toBe(0)
    expect(applyAwarenessDecay(0.1)).toBeCloseTo(0.097, 6)
  })

  it('F06 合同基数不为负', () => {
    expect(contractBaseCents(100, 300)).toBe(0)
    expect(shareAmountCents(1000, 15)).toBe(150)
  })
})

describe('营销命令与投放 F07–F17', () => {
  it('F07 预算低于下限拒绝', () => {
    const r = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 999 }, 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('MARKETING_BUDGET_OUT_OF_RANGE')
  })

  it('F08 预算高于上限拒绝', () => {
    const r = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'ads', dailyBudgetCents: 500_001 }, 100)
    expect(r.ok).toBe(false)
  })

  it('F09 未上市产品拒绝投放', () => {
    const r = setMarketingBudget(worldWithProduct({ launchPriceCents: null }), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('MARKETING_PRODUCT_NOT_ACTIVE')
  })

  it('F10 设预算生成 campaign 并落事件', () => {
    const r = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    expect(r.ok).toBe(true)
    expect(r.world.marketingCampaigns).toHaveLength(1)
    expect(r.world.events.some((e) => e.type === 'MarketingCampaignSet')).toBe(true)
  })

  it('F11 预算 0 停止投放并置 ended', () => {
    const set = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    const off = setMarketingBudget(set.world, { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 0 }, 101)
    expect(off.ok).toBe(true)
    expect(off.world.marketingCampaigns[0]?.status).toBe('ended')
  })

  it('F12 日投放扣款一次、流水类别 marketing、认知度上升', () => {
    const set = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    const finance = financeOf(set.world)
    const before = set.world.products[0]!.awarenessByMarket.JP ?? 0
    const t = tick(set.world, 100, finance)
    expect(finance.getAllTransactions().filter((x) => x.category === 'marketing')).toHaveLength(1)
    expect(t.world.products[0]!.awarenessByMarket.JP!).toBeGreaterThan(before)
    expect(t.spentCents).toBe(10_000)
  })

  it('F13 同日重复 tick 不重复扣款、不重复提升', () => {
    const set = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    const finance = financeOf(set.world)
    const first = tick(set.world, 100, finance)
    const second = tick(first.world, 100, finance)
    expect(finance.getAllTransactions().filter((x) => x.category === 'marketing')).toHaveLength(1)
    expect(second.spentCents).toBe(0)
    expect(second.world.products[0]!.awarenessByMarket).toEqual(first.world.products[0]!.awarenessByMarket)
  })

  it('F14 现金不足：整笔跳过、发失败事件、认知度衰减', () => {
    const poor = worldWithProduct()
    poor.companies[0] = { ...poor.companies[0]!, cashBalanceCents: 1000 }
    poor.transactions = []
    const set = setMarketingBudget(poor, { productId: 'PROJ-001', channel: 'expo', dailyBudgetCents: 10_000 }, 100)
    const finance = financeOf(set.world)
    const before = set.world.products[0]!.awarenessByMarket.JP ?? 0
    const t = tick(set.world, 100, finance)
    expect(t.failedChannels).toBe(1)
    expect(t.world.events.some((e) => e.type === 'MarketingSpendFailed')).toBe(true)
    expect(t.world.products[0]!.awarenessByMarket.JP!).toBeLessThan(before)
  })

  it('F15 展会效率高于社媒（同预算同认知度）', () => {
    const base = { budgetShareCents: 25_000, stageScaleCents: 50_000, awareness: 0.1, cap: 0.6 }
    expect(awarenessDeltaCents({ ...base, channel: 'expo' })).toBeGreaterThan(
      awarenessDeltaCents({ ...base, channel: 'social' }),
    )
  })

  it('F16 广告效率低于社媒', () => {
    const base = { budgetShareCents: 25_000, stageScaleCents: 50_000, awareness: 0.1, cap: 0.6 }
    expect(awarenessDeltaCents({ ...base, channel: 'ads' })).toBeLessThan(
      awarenessDeltaCents({ ...base, channel: 'social' }),
    )
  })

  it('F17 多市场按均分获得增量，总和为正', () => {
    const set = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 20_000 }, 100)
    const finance = financeOf(set.world)
    const t = tick(set.world, 100, finance)
    const after = t.world.products[0]!.awarenessByMarket
    expect(after.JP!).toBeGreaterThan(0.1)
    expect(after.NA!).toBeGreaterThan(0.05)
  })
})

describe('发行合同 F18–F30', () => {
  it('F18 未上市产品不能签约', () => {
    const r = signRevenueShareContract(worldWithProduct({ launchPriceCents: null, launchDay: null }), { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('CONTRACT_PRODUCT_NOT_LAUNCHED')
  })

  it('F19 分成比例低于 5% 拒绝', () => {
    const r = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 4, durationDays: null }, 100)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('CONTRACT_RATE_OUT_OF_RANGE')
  })

  it('F20 分成比例高于 30% 拒绝', () => {
    const r = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 31, durationDays: null }, 100)
    expect(r.ok).toBe(false)
  })

  it('F21 签约成功写入合同与事件', () => {
    const r = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 15, durationDays: 180 }, 100)
    expect(r.ok).toBe(true)
    expect(r.world.publishingContracts).toHaveLength(1)
    expect(r.world.publishingContracts[0]?.ratePercent).toBe(15)
    expect(r.world.events.some((e) => e.type === 'PublishingContractSigned')).toBe(true)
  })

  it('F22 同产品同类型已有生效合同拒绝再签', () => {
    const first = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const second = signRevenueShareContract(first.world, { productId: 'PROJ-001', ratePercent: 12, durationDays: null }, 101)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.errorCode).toBe('CONTRACT_ALREADY_ACTIVE')
  })

  it('F23 分成按当日净销售结算并入账', () => {
    const signed = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 100, finance)
    const tx = finance.getAllTransactions().find((t) => t.idempotencyKey === `contract:${signed.contract!.id}:100`)
    expect(tx?.amountCents).toBe(210_000) // 2,100,000 net × 10%
    expect(r.paidCents).toBe(210_000)
    expect(r.world.publishingContracts[0]?.settledCents).toBe(210_000)
  })

  it('F24 当日退款从分成基数里扣减', () => {
    const world = worldWithProduct()
    world.refundBatches = [{
      id: 'RB-1', productId: 'PROJ-001', salesRecordId: world.products[0]!.salesByPeriod[0]!.id,
      marketId: 'JP', platformId: 'home_console_g2', saleDayIndex: 100, refundDayIndex: 100,
      refundedUnits: 10, refundAmountCents: 20_000, source: 'auto_window', status: 'posted',
      idempotencyKey: 'customer-refund:RB-1',
    }]
    const signed = signRevenueShareContract(world, { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 100, finance)
    expect(r.paidCents).toBe(208_000) // (2,100,000 − 20,000) × 10%
  })

  it('F25 跨日退款按同费率冲减（负流水）', () => {
    const world = worldWithProduct()
    world.refundBatches = [{
      id: 'RB-2', productId: 'PROJ-001', salesRecordId: world.products[0]!.salesByPeriod[0]!.id,
      marketId: 'JP', platformId: 'home_console_g2', saleDayIndex: 100, refundDayIndex: 120,
      refundedUnits: 10, refundAmountCents: 20_000, source: 'auto_window', status: 'posted',
      idempotencyKey: 'customer-refund:RB-2',
    }]
    const signed = signRevenueShareContract(world, { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 90)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 120, finance)
    const claw = finance.getAllTransactions().find((t) => t.idempotencyKey === `contract:${signed.contract!.id}:refund:RB-2`)
    expect(claw?.amountCents).toBe(-2_000)
    expect(r.clawedBackCents).toBe(2_000)
  })

  it('F26 当日无净销售不落账', () => {
    const signed = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 130, finance)
    expect(finance.getAllTransactions().some((t) => t.idempotencyKey === `contract:${signed.contract!.id}:130`)).toBe(false)
    expect(r.paidCents).toBe(0)
  })

  it('F27 同日重复结算幂等', () => {
    const signed = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    settleContracts(signed.world, 100, finance)
    const again = settleContracts(signed.world, 100, finance)
    expect(again.paidCents).toBe(0)
    expect(finance.getAllTransactions().filter((t) => t.category === 'contract_payment')).toHaveLength(1)
  })

  it('F28 里程碑达成一次性支付并 completed', () => {
    const signed = signMilestoneContract(worldWithProduct(), { productId: 'PROJ-001', thresholdNetRevenueCents: 2_000_000, payoutCents: 50_000, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 100, finance)
    expect(r.paidCents).toBe(50_000)
    expect(r.world.publishingContracts[0]?.status).toBe('completed')
    const again = settleContracts(r.world, 101, finance)
    expect(again.paidCents).toBe(0)
  })

  it('F29 未达里程碑不支付', () => {
    const signed = signMilestoneContract(worldWithProduct(), { productId: 'PROJ-001', thresholdNetRevenueCents: 5_000_000, payoutCents: 50_000, durationDays: null }, 100)
    const finance = financeOf(signed.world)
    const r = settleContracts(signed.world, 100, finance)
    expect(r.paidCents).toBe(0)
    expect(r.world.publishingContracts[0]?.status).toBe('active')
  })

  it('F30 到期：分成 completed、未达成里程碑 terminated', () => {
    const share = signRevenueShareContract(worldWithProduct(), { productId: 'PROJ-001', ratePercent: 10, durationDays: 30 }, 100)
    const ms = signMilestoneContract(worldWithProduct(), { productId: 'PROJ-001', thresholdNetRevenueCents: 5_000_000, payoutCents: 50_000, durationDays: 30 }, 100)
    const finance = financeOf(share.world)
    const r1 = settleContracts(share.world, 130, finance)
    expect(r1.world.publishingContracts[0]?.status).toBe('completed')
    const r2 = settleContracts(ms.world, 130, finance)
    expect(r2.world.publishingContracts[0]?.status).toBe('terminated')
  })
})

describe('集成 F31–F33', () => {
  it('F31 调度器内营销与合同都执行：支出单列、分成只按销售净额', () => {
    const world = worldWithProduct()
    const set = setMarketingBudget(world, { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    const signed = signRevenueShareContract(set.world, { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 90)
    const finance = financeOf(signed.world)
    const scheduler = new DailyScheduler({
      finance,
      marketing: new MarketingService({ finance, tuning: TUNING.sales }),
      contracts: new ContractService(finance),
    })
    const schedulerWorld = { ...signed.world, currentDayIndex: 99 }
    const next = scheduler.executeDay(schedulerWorld, 100)
    const marketingTx = finance.getAllTransactions().filter((t) => t.category === 'marketing')
    const contractTx = finance.getAllTransactions().filter((t) => t.category === 'contract_payment')
    expect(marketingTx).toHaveLength(1)
    expect(marketingTx[0]?.amountCents).toBe(-10_000)
    // 分成基数只取销售净额 2,100,000 × 10%，与营销支出无关
    expect(contractTx[0]?.amountCents).toBe(210_000)
    expect(next.publishingContracts[0]?.settledCents).toBe(210_000)
  })

  it('F32 存档往返经 parseSave 保留 campaign 与合同', () => {
    const set = setMarketingBudget(worldWithProduct(), { productId: 'PROJ-001', channel: 'social', dailyBudgetCents: 10_000 }, 100)
    const signed = signRevenueShareContract(set.world, { productId: 'PROJ-001', ratePercent: 10, durationDays: null }, 100)
    const parsed = parseSave(JSON.parse(JSON.stringify(signed.world)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.state.marketingCampaigns[0]?.dailyBudgetCents).toBe(10_000)
    expect(parsed.state.publishingContracts[0]?.ratePercent).toBe(10)
  })

  it('F33 GameWorld 命令入口可用', () => {
    const gw = new GameWorld(42)
    const r = gw.setMarketingBudget({ productId: 'none', channel: 'social', dailyBudgetCents: 10_000 })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('MARKETING_PRODUCT_NOT_FOUND')
  })
})
