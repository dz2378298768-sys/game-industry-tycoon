import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { GameWorld } from '@application/mediators/game-world'
import { parseSave } from '@infrastructure/storage/save-schema'
import { refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import type { WorldState } from '@simulation/services/world-state'
import {
  F1,
  SALES_TXNS,
  makeAutoBatch,
  makeFixtureWorld,
  makeFinance,
  makeSalesRecord,
  makeService,
  makeTx,
} from './m2c-fixtures'

/** F2（B 示例）：Day 30、1,593 件、单价 2,999、收入 4,777,407、抽成 1,433,222、净 3,344,185 */
const F2 = {
  saleDay: 30,
  refundDay: 44,
  grossUnits: 1593,
  unitPriceCents: 2999,
  grossRevenueCents: 4_777_407,
  platformFeeCents: 1_433_222,
  netRevenueCents: 3_344_185,
  estimatedUnits: 31,
  refundAmountCents: 92_969,
} as const

function makeF2World(): WorldState {
  const record = makeSalesRecord({
    id: 'SR-PROJ-001-30-JP-home_console_g2',
    dayIndex: F2.saleDay,
    grossUnits: F2.grossUnits,
    unitPriceAtSaleCents: F2.unitPriceCents,
    grossRevenueCents: F2.grossRevenueCents,
    platformFeeCents: F2.platformFeeCents,
    netSalesRevenueCents: F2.netRevenueCents,
    estimatedRefundUnits: F2.estimatedUnits,
    actualRefundUnits: 0,
  })
  const batch = makeAutoBatch({
    id: 'RB-PROJ-001-30-44-1',
    saleDayIndex: F2.saleDay,
    refundDayIndex: F2.refundDay,
    refundedUnits: F2.estimatedUnits,
    refundAmountCents: F2.refundAmountCents,
  })
  const fixedBatch: typeof batch = {
    ...batch,
    salesRecordId: record.id,
  }
  return makeFixtureWorld({
    sales: [record],
    batches: [fixedBatch],
    transactions: [
      makeTx('tx-sales', 'sales_revenue', F2.grossRevenueCents, F2.saleDay),
      makeTx('tx-platform', 'platform_fee', -F2.platformFeeCents, F2.saleDay),
    ],
    currentDayIndex: F2.saleDay,
  })
}

function actualOf(world: WorldState): number {
  return world.products[0]?.salesByPeriod[0]?.actualRefundUnits ?? -1
}

describe('M2-C 调度/存档集成（DESIGN-M2-001-C R24–R28/R41/R42）', () => {
  it('R24 调度顺序：销售在前、退款在后，余额 3,344,185 → 3,251,216', () => {
    const world = makeF2World()
    const finance = makeFinance(world)
    const { service } = makeService(world, { finance })
    const scheduler = new DailyScheduler({ finance, refunds: service })

    const day43 = scheduler.executeDay(world, 43)
    expect(day43.refundBatches.filter((b) => b.status === 'posted')).toHaveLength(0)
    expect(day43.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(0)
    expect(finance.getCashBalance(F1.companyId)).toBe(F2.netRevenueCents)

    const day44 = scheduler.executeDay(day43, 44)
    const refundTxs = day44.transactions.filter((t) => t.category === 'customer_refund')
    expect(refundTxs).toHaveLength(1)
    expect(refundTxs[0]?.amountCents).toBe(-F2.refundAmountCents)
    const lastSalesIndex = Math.max(
      ...day44.transactions
        .map((t, i) => (t.category === 'sales_revenue' || t.category === 'platform_fee' ? i : -1))
        .filter((i) => i >= 0),
    )
    const refundIndex = day44.transactions.findIndex((t) => t.category === 'customer_refund')
    expect(refundIndex).toBeGreaterThan(lastSalesIndex)
    expect(finance.getCashBalance(F1.companyId)).toBe(3_251_216)
  })

  it('R25 B/C 边界：B 建 pending auto，C 不新增批次、不写玩家请求 ID', () => {
    const world = makeF2World()
    const batch = world.refundBatches[0]
    expect(world.refundBatches).toHaveLength(1)
    expect(batch?.status).toBe('pending')
    expect(batch?.firstRefundRequestId).toBeUndefined()
    expect(world.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(0)

    const finance = makeFinance(world)
    const { service } = makeService(world, { finance })
    const scheduler = new DailyScheduler({ finance, refunds: service })
    const day44 = scheduler.executeDay(world, 44)
    expect(day44.refundBatches).toHaveLength(1)
    expect(day44.refundBatches[0]?.status).toBe('posted')
    expect(day44.refundBatches[0]?.firstRefundRequestId).toBeUndefined()
  })

  it('R26 存档往返 + 同日重放不重复入账', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const { service } = makeService(world)
    const posted = service.processDueRefunds(world, 114)

    const gw = new GameWorld()
    gw.restore(posted.world)
    const parsed = parseSave(gw.serialize())
    if (!parsed.ok) throw new Error(`${parsed.errorCode}: ${parsed.errorMessage}`)
    expect(parsed.ok).toBe(true)

    const gw2 = new GameWorld()
    gw2.restore(parsed.state)
    const before = gw2.world.transactions.length
    const replay = gw2.refunds.processDueRefunds(gw2.world, 114)
    expect(replay.postedBatchIds).toEqual([])
    expect(replay.world.transactions.length).toBe(before)
    expect(replay.world.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(1)
    expect(actualOf(replay.world)).toBe(30)
    expect(replay.world.events.filter((e) => e.type === 'RefundBatchPosted')).toHaveLength(1)
  })

  it('R27 历史窗口不复算：refundDay=107 在 TUNING=30 下仍按时兑现', () => {
    const batch = makeAutoBatch({ id: 'RB-PROJ-001-100-107-1', refundDayIndex: 107 })
    const world = makeFixtureWorld({ batches: [batch], currentDayIndex: 120 })
    const { service } = makeService(world, { refundWindowDays: 30 })
    const r = service.processDueRefunds(world, 120)
    expect(r.world.refundBatches[0]?.status).toBe('posted')
    expect(r.world.refundBatches[0]?.refundDayIndex).toBe(107)
    expect(r.world.events.filter((e) => e.type === 'RefundBatchRejected')).toEqual([])
  })

  it('R28 旧档/空批次：无 refundBatches 视为 []，处理 no-op', () => {
    const world = makeFixtureWorld({ currentDayIndex: 114 })
    const legacy = { ...world, refundBatches: undefined } as unknown as WorldState
    const parsed = parseSave(legacy)
    if (!parsed.ok) throw new Error(`${parsed.errorCode}: ${parsed.errorMessage}`)
    expect(parsed.ok).toBe(true)
    expect(parsed.state.refundBatches).toEqual([])

    const { service } = makeService(world)
    const r = service.processDueRefunds(parsed.state, 114)
    expect(r.postedBatchIds).toEqual([])
    expect(r.world.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(0)
  })

  it('R41 restore 内不兑现，手动调用才入账', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const gw = new GameWorld()
    gw.restore(world)
    expect(gw.world.refundBatches[0]?.status).toBe('pending')
    expect(gw.world.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(0)
    expect(actualOf(gw.world)).toBe(0)

    const r = gw.refunds.processDueRefunds(gw.world, 114)
    expect(r.world.refundBatches[0]?.status).toBe('posted')
    expect(r.world.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(1)
    expect(actualOf(r.world)).toBe(30)
  })

  it('R42 排序：refundDay 升序，同源同日按 seq 升序', () => {
    const early1 = makeAutoBatch({
      id: 'RB-PROJ-001-100-113-1',
      refundDayIndex: 113,
      source: 'player_request',
      refundedUnits: 5,
      refundAmountCents: 10_000,
      firstRefundRequestId: 'req-a',
    })
    const early2 = makeAutoBatch({
      id: 'RB-PROJ-001-100-113-2',
      refundDayIndex: 113,
      source: 'player_request',
      refundedUnits: 5,
      refundAmountCents: 10_000,
      firstRefundRequestId: 'req-b',
    })
    // 数组顺序故意打乱：113-2 在前、114 最前
    const world = makeFixtureWorld({
      batches: [makeAutoBatch(), early2, early1],
      currentDayIndex: 114,
    })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 114)
    const keys = [
      refundBatchIdempotencyKey('RB-PROJ-001-100-113-1'),
      refundBatchIdempotencyKey('RB-PROJ-001-100-113-2'),
      refundBatchIdempotencyKey('RB-PROJ-001-100-114-1'),
    ]
    const order = r.world.transactions
      .filter((t) => keys.includes(t.idempotencyKey))
      .map((t) => keys.indexOf(t.idempotencyKey))
    expect(order).toEqual([0, 1, 2])
    expect(r.postedBatchIds).toEqual([
      'RB-PROJ-001-100-113-1',
      'RB-PROJ-001-100-113-2',
      'RB-PROJ-001-100-114-1',
    ])
  })
})

// 引用 SALES_TXNS 以保持夹具一致性（R42 未直接使用但同一世界基准）
void SALES_TXNS
