/**
 * M2 出口条件验证（阶段验收用，非功能回归）。
 *
 * 目的：回答三个问题——
 *   1) 生产装配（`new GameWorld(seed)`，即 `init()` 的路径）能不能真的卖出产品？
 *   2) 两类定位在 30 天内的销量差是多少（出口条件：≥25%）？
 *   3) 现金流、退款、营销、合同能不能被解释（账实相符）？
 *
 * 本文件把实测数字打到 stdout，验收报告 `docs/M2-EXIT-VERIFICATION.md` 引用。
 */
import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { makeCompany, makeProject, makeWorld } from '../../__tests__/helpers'
import type { MarketInputBundle, MarketInputProvider } from '@simulation/services/sales-types'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const DAYS = 30
const PRICE = 2999
const MARKET = 'japan'
const PLATFORM = 'arcade_pre_1975'

function seedWorld(gw: GameWorld, segmentId: string): { companyId: string; projectId: string } {
  const company = makeCompany({ id: 'company-1', cashBalanceCents: 10_000_000, status: 'active' })
  const project = makeProject({
    id: 'project-1',
    companyId: company.id,
    phase: 'READY_TO_LAUNCH',
    plannedLaunchDay: 0,
    audienceSegmentIds: [segmentId],
    targetPlatformIds: [PLATFORM],
    workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
  })
  gw.world = makeWorld({ companies: [company], projects: [project], employees: [] })
  // 生产路径由 createCompany 完成“注册 + 初始资本入账”，夹具必须等价补齐，否则销售无法入账
  gw.finance.registerCompany(company.id)
  gw.finance.postTransaction({
    idempotencyKey: 'fixture-capital',
    companyId: company.id,
    day: 0,
    category: 'advance',
    amountCents: company.cashBalanceCents,
    description: '初始资本',
  })
  return { companyId: company.id, projectId: project.id }
}

function launchAndPrice(gw: GameWorld, projectId: string, stableId?: string): string {
  const launched = gw.launchProject(projectId)
  expect(launched.success).toBe(true)
  const productId = launched.result!.id
  // 产品 id 由 crypto.randomUUID 生成，会带进销售扰动的 rng context：
  // 固定 id 才能让“同 seed 同结果”成立（不可复现性见 M2-EXIT-VERIFICATION-001 §4 P1-D）
  if (stableId !== undefined) {
    gw.world.products.find((p) => p.id === productId)!.id = stableId
    expect(gw.setProductPrice({ productId: stableId, priceCents: PRICE }).success).toBe(true)
    return stableId
  }
  const priced = gw.setProductPrice({ productId, priceCents: PRICE })
  expect(priced.success).toBe(true)
  return productId
}

/** 只在“补输入端口”这一处不同的 provider：按定位给不同受众与兴趣。 */
function makeSegmentProvider(map: Record<string, MarketInputBundle>): MarketInputProvider {
  return {
    getMarketInput: ({ segmentId }) => map[segmentId] ?? null,
  }
}

const BUNDLES: Record<string, MarketInputBundle> = {
  // 街机核心玩家：人少但兴趣高
  arcade_enthusiasts: { eligibleAudience: 120_000, competitionFactor: 0.15, categoryInterest: 0.75, baseConsideration: 0.55, dailyMarketingSpendCents: 0 },
  // 家用机玩家：人多但兴趣低
  home_players: { eligibleAudience: 400_000, competitionFactor: 0.2, categoryInterest: 0.35, baseConsideration: 0.45, dailyMarketingSpendCents: 0 },
}

function unitsOf(gw: GameWorld, productId: string): { units: number; gross: number; net: number; records: number } {
  const product = gw.world.products.find((p) => p.id === productId)
  const sales = product?.salesByPeriod ?? []
  return {
    units: sales.reduce((a, r) => a + r.grossUnits, 0),
    gross: sales.reduce((a, r) => a + r.grossRevenueCents, 0),
    net: sales.reduce((a, r) => a + r.netSalesRevenueCents, 0),
    records: sales.length,
  }
}

describe('M2 出口验证', () => {
  it('E1 生产装配（无输入端口）30 天不产生任何销量', () => {
    const gw = new GameWorld(42) // 与 store.init() 一致：默认 NULL provider
    const { projectId } = seedWorld(gw, 'arcade_enthusiasts')
    const productId = launchAndPrice(gw, projectId, 'PROD-E1')
    gw.advanceSimulation(DAYS)
    const r = unitsOf(gw, productId)
    const codeSet = new Set<string>()
    for (const e of gw.world.events) codeSet.add(String((e as { type?: string }).type ?? ''))
    const codes = [...codeSet].filter(Boolean)
    console.log('[E1] 生产装配 30 天:', JSON.stringify(r), '事件类型:', codes.slice(0, 6).join(','))
    // 事实断言：无输入端口 + 无认知度 → 不产生销量（阻断出口条件）
    expect(r.records).toBe(0)
    expect(r.units).toBe(0)
  })

  it('E2 补输入端口但认知度仍为空 → 依旧 0 销量（第二个独立阻断）', () => {
    const gw = new GameWorld(42, makeSegmentProvider(BUNDLES))
    const { projectId } = seedWorld(gw, 'arcade_enthusiasts')
    const productId = launchAndPrice(gw, projectId, 'PROD-E2')
    gw.advanceSimulation(DAYS)
    const r = unitsOf(gw, productId)
    console.log('[E2] 有输入端口、认知度为空 30 天:', JSON.stringify(r))
    expect(r.records).toBe(0)
  })

  it('E3 补输入端口 + 预置认知度 → 销量产生，且两类定位同窗口 30 天销量差实测', () => {
    // 1977 起 arcade_enthusiasts 与 home_players 同时可用；跳到该年再同窗口对比，避免“跨年代不可比”
    const START = gregorianToDayIndex(1977, 1, 1)
    const gw = new GameWorld(42, makeSegmentProvider(BUNDLES))
    // 空跑 7 年会有月度固定支出，资本金需足够（否则销售入账前就被扣成负余额）
    const company = makeCompany({ id: 'company-1', cashBalanceCents: 5_000_000_000, status: 'active' })
    gw.world = makeWorld({ companies: [company], projects: [], employees: [] })
    gw.finance.registerCompany(company.id)
    gw.finance.postTransaction({
      idempotencyKey: 'fixture-capital', companyId: company.id, day: 0,
      category: 'advance', amountCents: company.cashBalanceCents, description: '初始资本',
    })
    gw.advanceSimulation(START)

    const launch = (id: string, segmentId: string, stableId: string) => {
      gw.world.projects.push(makeProject({
        id, companyId: company.id, phase: 'READY_TO_LAUNCH', plannedLaunchDay: gw.calendar.currentDayIndex,
        audienceSegmentIds: [segmentId], targetPlatformIds: [PLATFORM],
        workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
      }))
      const launched = gw.launchProject(id)
      expect(launched.success).toBe(true)
      const productId = launched.result!.id
      gw.world.products.find((p) => p.id === productId)!.id = stableId
      expect(gw.setProductPrice({ productId: stableId, priceCents: PRICE }).success).toBe(true)
      gw.world.products.find((p) => p.id === stableId)!.awarenessByMarket = { [MARKET]: 0.25 }
      return stableId
    }
    const arcadeId = launch('project-arcade', 'arcade_enthusiasts', 'PROD-ARCADE')
    const homeId = launch('project-home', 'home_players', 'PROD-HOME')
    gw.advanceSimulation(DAYS)

    const arcade = unitsOf(gw, arcadeId)
    const home = unitsOf(gw, homeId)
    const delta = Math.abs(arcade.units - home.units) / Math.max(arcade.units, home.units, 1)
    console.log('[E3] arcade_enthusiasts:', JSON.stringify(arcade), 'home_players:', JSON.stringify(home), '相对差:', (delta * 100).toFixed(2) + '%')
    expect(arcade.units).toBeGreaterThan(0)
    expect(home.units).toBeGreaterThan(0)
    expect(arcade.units).not.toBe(home.units)
  })

  it('E4 账实相符：现金变动 = 全部交易流水之和（含销售/退款/营销）', () => {
    const gw = new GameWorld(42, makeSegmentProvider(BUNDLES))
    const { projectId, companyId } = seedWorld(gw, 'arcade_enthusiasts')
    const productId = launchAndPrice(gw, projectId, 'PROD-E4')
    const product = gw.world.products.find((p) => p.id === productId)!
    product.awarenessByMarket = { [MARKET]: 0.3 }
    gw.setMarketingBudget({ productId, channel: 'social', dailyBudgetCents: 5_000 })
    gw.advanceSimulation(DAYS)

    const initialCash = 0 // 夹具资本金本身也是一条流水，故从 0 起算
    const ledgerSum = gw.finance.getTransactionsByCompany(companyId).reduce((a, t) => a + t.amountCents, 0)
    const cashDelta = gw.finance.getCashBalance(companyId) - initialCash
    const refunds = gw.world.refundBatches.filter((b) => b.productId === productId)
    console.log('[E4] 现金差:', cashDelta, '流水和:', ledgerSum, '退款批次:', refunds.length,
      'posted:', refunds.filter((b) => b.status === 'posted').length,
      '营销支出:', gw.finance.getTransactionsByCompany(companyId).filter((t) => t.category === 'marketing').length,
      '销量记录:', unitsOf(gw, productId).records)
    expect(cashDelta).toBe(ledgerSum)
    expect(gw.finance.getTransactionsByCompany(companyId).some((t) => t.category === 'marketing')).toBe(true)
  })

  it('E5 合同结算：分成金额随销售净额产生且落在流水里', () => {
    const gw = new GameWorld(42, makeSegmentProvider(BUNDLES))
    const { projectId, companyId } = seedWorld(gw, 'arcade_enthusiasts')
    const productId = launchAndPrice(gw, projectId, 'PROD-E5')
    const product = gw.world.products.find((p) => p.id === productId)!
    product.awarenessByMarket = { [MARKET]: 0.3 }
    const signed = gw.signRevenueShareContract({ productId, ratePercent: 10, durationDays: 30 })
    expect(signed.success).toBe(true)
    gw.advanceSimulation(DAYS)
    const contract = gw.world.publishingContracts.find((c) => c.productId === productId)!
    const net = unitsOf(gw, productId).net
    console.log('[E5] 销售净额:', net, '合同已结:', contract.settledCents, '状态:', contract.status)
    expect(contract.settledCents).toBeGreaterThan(0)
    expect(gw.finance.getTransactionsByCompany(companyId).some((t) => t.category === 'contract_payment')).toBe(true)
  })
})
