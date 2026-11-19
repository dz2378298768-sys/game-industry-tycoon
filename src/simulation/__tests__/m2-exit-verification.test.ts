/**
 * M2 出口验证 v2（M2-H 修复后）。
 *
 * 与 v1 的差别：v1 断言的是“阻断事实”（生产 0 销量）；v2 必须断言“出口成立”，
 * 且用生产工厂 `createGameWorld`（真实内容 provider），不再手工补输入。
 *
 * 数字打到 stdout，供 `docs/M2-EXIT-VERIFICATION.md` v2 引用。
 */
import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { createGameWorld } from '@application/factories/create-game-world'
import { buildMarketInput, seedInitialAwareness } from '@content/market-inputs'
import { makeCompany, makeProject, makeWorld } from '../../__tests__/helpers'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const DAYS = 30
const PRICE = 2999
const PLATFORM = 'arcade_pre_1975'

function seedCompany(gw: GameWorld, cashCents = 10_000_000) {
  const company = makeCompany({ id: 'company-1', cashBalanceCents: cashCents, status: 'active' })
  gw.world = makeWorld({ companies: [company], projects: [], employees: [] })
  gw.finance.registerCompany(company.id)
  gw.finance.postTransaction({
    idempotencyKey: 'fixture-capital',
    companyId: company.id,
    day: 0,
    category: 'advance',
    amountCents: cashCents,
    description: '初始资本',
  })
  return company
}

function addProjectAndLaunch(gw: GameWorld, projectId: string, segmentId: string, stableId: string | null) {
  gw.world.projects.push(makeProject({
    id: projectId,
    companyId: 'company-1',
    phase: 'READY_TO_LAUNCH',
    plannedLaunchDay: gw.calendar.currentDayIndex,
    audienceSegmentIds: [segmentId],
    targetPlatformIds: [PLATFORM],
    workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
  }))
  const launched = gw.launchProject(projectId)
  expect(launched.success).toBe(true)
  const productId = launched.result!.id
  // 产品 id 随机；固定后 rng 才可复现（M2-H 已把 rng 键换成 stableProductKey，这里只保证引用稳定）
  const product = gw.world.products.find((p) => p.id === productId)!
  // stableId=null 时保留随机 id：用于证明“不靠固定 id 也复现”
  if (stableId !== null) product.id = stableId
  const id = stableId ?? productId
  expect(gw.setProductPrice({ productId: id, priceCents: PRICE }).success).toBe(true)
  return { productId: id, product }
}

function totals(gw: GameWorld, productId: string) {
  const sales = gw.world.products.find((p) => p.id === productId)?.salesByPeriod ?? []
  return {
    units: sales.reduce((a, r) => a + r.grossUnits, 0),
    gross: sales.reduce((a, r) => a + r.grossRevenueCents, 0),
    net: sales.reduce((a, r) => a + r.netSalesRevenueCents, 0),
    records: sales.length,
  }
}

describe('M2 出口验证 v2', () => {
  it('H08 生产工厂路径：30 天产生销量、退款与现金变化', () => {
    const gw = createGameWorld(42)
    seedCompany(gw)
    const { productId, product } = addProjectAndLaunch(gw, 'project-1', 'arcade_enthusiasts', 'PROD-1')
    console.log('[H08] 上市认知度:', JSON.stringify(product.awarenessByMarket))
    expect(Object.keys(product.awarenessByMarket).length).toBeGreaterThan(0)
    gw.advanceSimulation(DAYS)
    const t = totals(gw, productId)
    const refunds = gw.world.refundBatches.filter((b) => b.productId === productId)
    const cash = gw.finance.getCashBalance('company-1')
    console.log('[H08]', JSON.stringify(t), '退款批次:', refunds.length, '现金:', cash)
    expect(t.records).toBeGreaterThan(0)
    expect(t.units).toBeGreaterThan(0)
    expect(t.net).toBeGreaterThan(0)
    expect(refunds.length).toBeGreaterThan(0)
  })

  it('H01/H02 内容 provider：字段完整，未开放市场返回 null', () => {
    const at1970 = buildMarketInput('japan', PLATFORM, 'arcade_enthusiasts', 0)
    const at1970EastAsia = buildMarketInput('east_asia', PLATFORM, 'arcade_enthusiasts', 0)
    console.log('[H01] japan@1970:', JSON.stringify(at1970), 'east_asia@1970:', JSON.stringify(at1970EastAsia))
    expect(at1970).not.toBeNull()
    expect(at1970!.eligibleAudience).toBeGreaterThan(0)
    expect(at1970!.categoryInterest).toBeGreaterThan(0)
    expect(at1970!.dailyMarketingSpendCents).toBe(0)
    expect(at1970EastAsia).toBeNull()
  })

  it('H03 初始认知度按市场开放年份过滤', () => {
    const a1970 = seedInitialAwareness(7, 0)
    const a1985 = seedInitialAwareness(7, gregorianToDayIndex(1985, 1, 1))
    console.log('[H03] 1970 markets:', Object.keys(a1970).join(','), '1985 markets:', Object.keys(a1985).join(','))
    expect(Object.keys(a1970).sort()).toEqual(['japan', 'north_america', 'western_europe'])
    expect(a1985.east_asia).toBeDefined()
    expect(a1970.east_asia).toBeUndefined()
  })

  it('H07 两类定位同窗口 30 天销量差 ≥25%', () => {
    const gw = createGameWorld(42)
    seedCompany(gw, 5_000_000_000)
    gw.advanceSimulation(gregorianToDayIndex(1977, 1, 1))
    const arcade = addProjectAndLaunch(gw, 'project-arcade', 'arcade_enthusiasts', 'PROD-ARCADE')
    const home = addProjectAndLaunch(gw, 'project-home', 'home_players', 'PROD-HOME')
    // 测量协议：同认知度（消除品牌加成差异），同价、同市场、同平台、无营销
    const baseline = 0.072
    for (const p of [arcade.product, home.product]) {
      const seeded = { ...p.awarenessByMarket }
      for (const key of Object.keys(seeded)) seeded[key] = baseline
      p.awarenessByMarket = seeded
    }
    gw.advanceSimulation(DAYS)
    const a = totals(gw, arcade.productId)
    const b = totals(gw, home.productId)
    const delta = Math.abs(a.units - b.units) / Math.max(a.units, b.units, 1)
    console.log('[H07] arcade:', JSON.stringify(a), 'home:', JSON.stringify(b), '相对差:', (delta * 100).toFixed(2) + '%')
    expect(a.units).toBeGreaterThan(0)
    expect(b.units).toBeGreaterThan(0)
    expect(delta).toBeGreaterThanOrEqual(0.25)
  })

  it('H06 同 seed 两次跑逐字段相等（不固定随机 id，销量与现金）', () => {
    const run = () => {
      const gw = createGameWorld(42)
      seedCompany(gw)
      // stableId=null：产品 id 保持随机，复现性不能靠夹具固定
      const { productId } = addProjectAndLaunch(gw, 'project-1', 'arcade_enthusiasts', null)
      gw.advanceSimulation(DAYS)
      return { t: totals(gw, productId), cash: gw.finance.getCashBalance('company-1') }
    }
    const first = run()
    const second = run()
    console.log('[H06] first:', JSON.stringify(first), 'second:', JSON.stringify(second))
    expect(second).toEqual(first)
  })

  it('H04/H05 旧档空认知度回填：幂等、不覆盖已有、留事件', () => {
    const gw = createGameWorld(42)
    seedCompany(gw)
    addProjectAndLaunch(gw, 'project-1', 'arcade_enthusiasts', 'PROD-OLD')
    // 注意：setProductPrice 会替换 world，必须重新从 world 取活引用
    gw.world.products[0]!.awarenessByMarket = {}
    gw.advanceSimulation(1)
    const before = gw.world.products[0]!.salesByPeriod.length
    gw.restore(gw.world) // 模拟读档
    const backfilled = gw.world.products[0]!.awarenessByMarket
    const events = gw.world.events.filter((e) => (e.payload as { reason?: string }).reason === 'awareness_backfill')
    console.log('[H04] backfilled:', JSON.stringify(backfilled), 'events:', events.length, '读档前销量记录:', before)
    expect(Object.keys(backfilled).length).toBeGreaterThan(0)
    expect(events.length).toBe(1)
    // 幂等：再 restore 不重复回填、不重复事件
    gw.restore(gw.world)
    const eventsAgain = gw.world.events.filter((e) => (e.payload as { reason?: string }).reason === 'awareness_backfill')
    expect(eventsAgain.length).toBe(1)
    // 不覆盖已有
    gw.world.products[0]!.awarenessByMarket = { japan: 0.5 }
    gw.restore(gw.world)
    expect(gw.world.products[0]!.awarenessByMarket).toEqual({ japan: 0.5 })
  })

  it('H11 定位配置自检：两段“份额×兴趣”必须拉开 ≥25%（配置被改成相同则变红）', () => {
    const arcade = buildMarketInput('japan', PLATFORM, 'arcade_enthusiasts', gregorianToDayIndex(1977, 1, 1))!
    const home = buildMarketInput('japan', PLATFORM, 'home_players', gregorianToDayIndex(1977, 1, 1))!
    const demandArcade = (arcade.eligibleAudience ?? 0) * (arcade.categoryInterest ?? 0)
    const demandHome = (home.eligibleAudience ?? 0) * (home.categoryInterest ?? 0)
    const delta = Math.abs(demandArcade - demandHome) / Math.max(demandArcade, demandHome, 1)
    console.log('[H11] 需求侧差:', (delta * 100).toFixed(2) + '%')
    expect(delta).toBeGreaterThanOrEqual(0.25)
  })

  it('H09 账实相符：现金变动 = 流水之和', () => {
    const gw = createGameWorld(42)
    seedCompany(gw)
    const { productId } = addProjectAndLaunch(gw, 'project-1', 'arcade_enthusiasts', 'PROD-LEDGER')
    gw.setMarketingBudget({ productId, channel: 'social', dailyBudgetCents: 5_000 })
    gw.advanceSimulation(DAYS)
    const ledger = gw.finance.getTransactionsByCompany('company-1').reduce((a, t) => a + t.amountCents, 0)
    const cash = gw.finance.getCashBalance('company-1')
    console.log('[H09] 现金:', cash, '流水和:', ledger)
    expect(cash).toBe(ledger)
  })

  it('H10 合同结算比例 10%±2pp', () => {
    const gw = createGameWorld(42)
    seedCompany(gw)
    const { productId } = addProjectAndLaunch(gw, 'project-1', 'arcade_enthusiasts', 'PROD-CT')
    expect(gw.signRevenueShareContract({ productId, ratePercent: 10, durationDays: 30 }).success).toBe(true)
    gw.advanceSimulation(DAYS)
    const contract = gw.world.publishingContracts.find((c) => c.productId === productId)!
    const net = totals(gw, productId).net
    const ratio = net === 0 ? 0 : contract.settledCents / net
    console.log('[H10] 净额:', net, '已结:', contract.settledCents, '比例:', (ratio * 100).toFixed(2) + '%', contract.status)
    expect(net).toBeGreaterThan(0)
    expect(Math.abs(ratio - 0.1)).toBeLessThanOrEqual(0.02)
  })
})
