import { describe, it, expect, vi } from 'vitest'
import { RefundService } from '@simulation/services/refund-service'
import type { Transaction } from '@domain/entities/transaction'
import type { WorldState } from '@simulation/services/world-state'
import {
  F1,
  SALES_TXNS,
  makeAutoBatch,
  makeFixtureWorld,
  makeSalesRecord,
  makeService,
  makeTx,
  requestOf,
  refundTxOf,
} from './m2c-fixtures'
import { refundBatchIdempotencyKey } from '@domain/entities/refund-batch'

function refundTxCount(world: WorldState): number {
  return world.transactions.filter((t) => t.category === 'customer_refund').length
}

function findBatch(world: WorldState, id: string) {
  const b = world.refundBatches.find((x) => x.id === id)
  if (b === undefined) throw new Error(`batch ${id} missing`)
  return b
}

function actualOf(world: WorldState, salesRecordId: string): number {
  for (const p of world.products) {
    for (const r of p.salesByPeriod) if (r.id === salesRecordId) return r.actualRefundUnits
  }
  throw new Error('record missing')
}

function eventsOf(world: WorldState, type: string) {
  return world.events.filter((e) => e.type === type)
}

describe('M2-C 退款服务：到期兑现与请求（DESIGN-M2-001-C R07–R23/R39/R40）', () => {
  it('R07 未到期不兑现（Day 113）', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 113 })
    const { service, finance } = makeService(world)
    const r = service.processDueRefunds(world, 113)
    expect(r.postedBatchIds).toEqual([])
    expect(findBatch(r.world, 'RB-PROJ-001-100-114-1').status).toBe('pending')
    expect(refundTxCount(r.world)).toBe(0)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(0)
    expect(eventsOf(r.world, 'RefundBatchPosted')).toEqual([])
    expect(finance.getCashBalance(F1.companyId)).toBe(2_100_000)
  })

  it('R08 到期兑现全字段（Day 114）', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const { service, finance } = makeService(world)
    const r = service.processDueRefunds(world, 114)
    const batch = findBatch(r.world, 'RB-PROJ-001-100-114-1')
    expect(batch.status).toBe('posted')
    const tx = refundTxOf(r.world, batch.id)
    expect(tx).toBeDefined()
    expect(tx?.category).toBe('customer_refund')
    expect(tx?.amountCents).toBe(-60_000)
    expect(tx?.idempotencyKey).toBe('customer-refund:RB-PROJ-001-100-114-1')
    expect(tx?.referenceId).toBe('PROJ-001')
    expect(tx?.day).toBe(114)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(30)
    const record = r.world.products[0]?.salesByPeriod[0]
    expect(record?.estimatedRefundUnits).toBe(30)
    expect(record?.platformFeeCents).toBe(900_000)
    expect(r.world.transactions.filter((t) => t.category === 'platform_fee')).toHaveLength(1)
    expect(finance.getCashBalance(F1.companyId)).toBe(2_040_000)
    expect(eventsOf(r.world, 'RefundBatchPosted')).toHaveLength(1)
  })

  it('R09 补兑现：114 的批次在 117 才执行，交易日期为执行日', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 117 })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 117)
    const batch = findBatch(r.world, 'RB-PROJ-001-100-114-1')
    expect(batch.status).toBe('posted')
    expect(batch.refundDayIndex).toBe(114)
    expect(refundTxOf(r.world, batch.id)?.day).toBe(117)
    expect(refundTxCount(r.world)).toBe(1)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(30)
  })

  it('R10 额度恰好等于上限：auto 30 + pending 1470 同日入账', () => {
    const auto = makeAutoBatch()
    const player = makeAutoBatch({
      id: 'RB-PROJ-001-100-114-2',
      source: 'player_request',
      refundedUnits: 1470,
      refundAmountCents: 2_940_000,
      firstRefundRequestId: 'req-big',
    })
    const world = makeFixtureWorld({ batches: [auto, player], currentDayIndex: 120 })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 120)
    expect(findBatch(r.world, auto.id).status).toBe('posted')
    expect(findBatch(r.world, player.id).status).toBe('posted')
    expect(actualOf(r.world, F1.salesRecordId)).toBe(1500)
    expect(refundTxCount(r.world)).toBe(2)
    expect(r.rejectedBatchIds).toEqual([])
  })

  it('R11 超上限双防线：建单拒绝 + 入账拒绝', () => {
    // (a) 建单：auto 30 已占 pending，请求 1480 超过剩余 1470
    const autoPending = makeAutoBatch()
    const w1 = makeFixtureWorld({ batches: [autoPending], currentDayIndex: 120 })
    const kit1 = makeService(w1)
    const req = kit1.service.requestPlayerRefund(w1, requestOf({ requestedUnits: 1480, dayIndex: 120 }))
    expect(req.outcome).toBe('rejected')
    expect(req.reasonCode).toBe('over_limit')

    // (b) 入账：绕过建单防线，直接构造 pending 1480
    const pendingBig = makeAutoBatch({
      id: 'RB-PROJ-001-100-120-1',
      refundDayIndex: 120,
      source: 'player_request',
      refundedUnits: 1480,
      refundAmountCents: 2_960_000,
      firstRefundRequestId: 'req-dirty',
    })
    const w2 = makeFixtureWorld({ batches: [makeAutoBatch(), pendingBig], currentDayIndex: 120 })
    const kit2 = makeService(w2)
    const r = kit2.service.processDueRefunds(w2, 120)
    expect(findBatch(r.world, 'RB-PROJ-001-100-114-1').status).toBe('posted')
    expect(findBatch(r.world, pendingBig.id).status).toBe('rejected')
    expect(actualOf(r.world, F1.salesRecordId)).toBe(30)
    expect(refundTxCount(r.world)).toBe(1)
    const rejectedEvent = eventsOf(r.world, 'RefundBatchRejected').find(
      (e) => (e.payload as { refundBatchId: string }).refundBatchId === pendingBig.id,
    )
    expect((rejectedEvent?.payload as { reasonCode: string }).reasonCode).toBe('over_limit')
  })

  it('R12 窗口内请求拒绝（Day 107）', () => {
    const world = makeFixtureWorld({ currentDayIndex: 107 })
    const { service } = makeService(world)
    const r = service.requestPlayerRefund(world, requestOf({ requestedUnits: 30, dayIndex: 107 }))
    expect(r.outcome).toBe('rejected')
    expect(r.reasonCode).toBe('window_not_elapsed')
    const batch = r.batch
    expect(batch).toBeDefined()
    expect(batch?.status).toBe('rejected')
    expect(batch?.refundDayIndex).toBe(107)
    expect(batch?.refundAmountCents).toBe(60_000)
    expect(batch?.firstRefundRequestId).toBe('req-1')
    expect(refundTxCount(r.world)).toBe(0)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(0)
    const ev = eventsOf(r.world, 'RefundBatchRejected')[0]
    expect((ev?.payload as { reasonCode: string }).reasonCode).toBe('window_not_elapsed')
  })

  it('R13 拒绝原因优先级：窗口先于上限', () => {
    const world = makeFixtureWorld({ currentDayIndex: 107 })
    const { service } = makeService(world)
    const r = service.requestPlayerRefund(world, requestOf({ requestedUnits: 1480, dayIndex: 107 }))
    expect(r.reasonCode).toBe('window_not_elapsed')
  })

  it('R14 到期日当天允许：请求先入账，随后 auto 兑现', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const { service } = makeService(world)
    const req = service.requestPlayerRefund(world, requestOf({ requestedUnits: 10, dayIndex: 114 }))
    expect(req.outcome).toBe('posted')
    expect(refundTxOf(req.world, req.batch?.id ?? '')?.amountCents).toBe(-20_000)
    expect(actualOf(req.world, F1.salesRecordId)).toBe(10)
    expect(eventsOf(req.world, 'RefundBatchPosted')).toHaveLength(1)

    const due = service.processDueRefunds(req.world, 114)
    expect(actualOf(due.world, F1.salesRecordId)).toBe(40)
    expect(eventsOf(due.world, 'RefundBatchPosted')).toHaveLength(2)
  })

  it('R15 requestId 去重', () => {
    const world = makeFixtureWorld({ currentDayIndex: 114 })
    const { service } = makeService(world)
    const first = service.requestPlayerRefund(world, requestOf({ requestedUnits: 10 }))
    const second = service.requestPlayerRefund(first.world, requestOf({ requestedUnits: 10 }))
    expect(second.outcome).toBe('deduplicated')
    expect(second.world.refundBatches).toHaveLength(first.world.refundBatches.length)
    expect(refundTxCount(second.world)).toBe(1)
    expect(eventsOf(second.world, 'RefundBatchPosted')).toHaveLength(1)
  })

  it('R16 重复执行幂等', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const { service } = makeService(world)
    const first = service.processDueRefunds(world, 114)
    const second = service.processDueRefunds(first.world, 114)
    expect(second.postedBatchIds).toEqual([])
    expect(refundTxCount(second.world)).toBe(1)
    expect(actualOf(second.world, F1.salesRecordId)).toBe(30)
    expect(eventsOf(second.world, 'RefundBatchPosted')).toHaveLength(1)
  })

  it('R17 交易已存在、批次仍 pending → 补状态且不重复入账', () => {
    const batch = makeAutoBatch()
    const existing = makeTx('tx-refund-114', 'customer_refund', -60_000, 114, {
      idempotencyKey: refundBatchIdempotencyKey(batch.id),
      referenceId: 'PROJ-001',
    })
    const world = makeFixtureWorld({
      batches: [batch],
      transactions: [...SALES_TXNS, existing],
      currentDayIndex: 114,
    })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 114)
    expect(findBatch(r.world, batch.id).status).toBe('posted')
    expect(r.world.transactions.filter((t) => t.idempotencyKey === existing.idempotencyKey)).toHaveLength(1)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(30)
  })

  it('R18 幂等索引已裁剪但流水仍存在 → 不重复提交', () => {
    const batch = makeAutoBatch()
    const existing = makeTx('tx-refund-114', 'customer_refund', -60_000, 114, {
      idempotencyKey: refundBatchIdempotencyKey(batch.id),
    })
    const world = makeFixtureWorld({
      batches: [batch],
      transactions: [...SALES_TXNS, existing],
      currentDayIndex: 114,
    })
    const postTransaction = vi.fn(() => {
      throw new Error('postTransaction must not be called')
    })
    const finance = {
      postTransaction,
      hasTransaction: () => false,
      getAllTransactions: (): Transaction[] => [...SALES_TXNS, existing],
    }
    const service = new RefundService({ finance, refundWindowDays: F1.windowDays })
    const r = service.processDueRefunds(world, 114)
    expect(postTransaction).not.toHaveBeenCalled()
    expect(findBatch(r.world, batch.id).status).toBe('posted')
    expect(r.world.transactions.filter((t) => t.idempotencyKey === existing.idempotencyKey)).toHaveLength(1)
  })

  it('R19 units=0 防御 → rejected(zero_units)', () => {
    const batch = makeAutoBatch({
      id: 'RB-PROJ-001-100-114-1',
      source: 'player_request',
      refundedUnits: 0,
      refundAmountCents: 0,
      firstRefundRequestId: 'req-zero',
    })
    const world = makeFixtureWorld({ batches: [batch], currentDayIndex: 114 })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 114)
    expect(findBatch(r.world, batch.id).status).toBe('rejected')
    expect(refundTxCount(r.world)).toBe(0)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(0)
    const ev = eventsOf(r.world, 'RefundBatchRejected')[0]
    expect((ev?.payload as { reasonCode: string }).reasonCode).toBe('zero_units')
  })

  it('R20 单价 0 / 金额 0 → rejected(zero_amount)', () => {
    const record = makeSalesRecord({
      grossUnits: 10,
      unitPriceAtSaleCents: 0,
      grossRevenueCents: 0,
      platformFeeCents: 0,
      netSalesRevenueCents: 0,
      estimatedRefundUnits: 0,
    })
    const batch = makeAutoBatch({
      id: 'RB-PROJ-001-100-114-1',
      source: 'player_request',
      refundedUnits: 2,
      refundAmountCents: 0,
      firstRefundRequestId: 'req-zero-amount',
    })
    const world = makeFixtureWorld({ sales: [record], batches: [batch], currentDayIndex: 114 })
    const { service } = makeService(world)
    const r = service.processDueRefunds(world, 114)
    expect(findBatch(r.world, batch.id).status).toBe('rejected')
    expect(refundTxCount(r.world)).toBe(0)
    const ev = eventsOf(r.world, 'RefundBatchRejected')[0]
    expect((ev?.payload as { reasonCode: string }).reasonCode).toBe('zero_amount')
  })

  it('R21 非整除单价兑现：2 件 × 1501 = 3002', () => {
    const record = makeSalesRecord({
      grossUnits: 2,
      unitPriceAtSaleCents: 1501,
      grossRevenueCents: 3001,
      platformFeeCents: 900,
      netSalesRevenueCents: 2101,
      estimatedRefundUnits: 2,
    })
    const batch = makeAutoBatch({
      id: 'RB-PROJ-001-100-114-1',
      refundedUnits: 2,
      refundAmountCents: 3002,
    })
    const world = makeFixtureWorld({
      sales: [record],
      batches: [batch],
      transactions: [
        makeTx('tx-sales', 'sales_revenue', 3001, 100),
        makeTx('tx-platform', 'platform_fee', -900, 100),
      ],
      currentDayIndex: 114,
    })
    const { service, finance } = makeService(world)
    const before = finance.getCashBalance(F1.companyId)
    const r = service.processDueRefunds(world, 114)
    expect(findBatch(r.world, batch.id).status).toBe('posted')
    expect(refundTxOf(r.world, batch.id)?.amountCents).toBe(-3002)
    expect(before - finance.getCashBalance(F1.companyId)).toBe(3002)
  })

  it('R22 rejected 不占额度', () => {
    const world0 = makeFixtureWorld({
      sales: [makeSalesRecord({ grossUnits: 100 })],
      currentDayIndex: 107,
    })
    const { service } = makeService(world0)
    const req1 = service.requestPlayerRefund(world0, requestOf({ requestedUnits: 100, dayIndex: 107 }))
    expect(req1.reasonCode).toBe('window_not_elapsed')
    expect(findBatch(req1.world, req1.batch?.id ?? '').status).toBe('rejected')

    const auto = makeAutoBatch({ id: 'RB-PROJ-001-100-114-1', refundedUnits: 30, refundAmountCents: 60_000 })
    const w1 = { ...req1.world, refundBatches: [...req1.world.refundBatches, auto], currentDayIndex: 114 }
    const posted = service.processDueRefunds(w1, 114)
    expect(actualOf(posted.world, F1.salesRecordId)).toBe(30)

    const req2 = service.requestPlayerRefund(posted.world, requestOf({ requestId: 'req-2', requestedUnits: 70 }))
    expect(req2.outcome).toBe('posted')
    expect(actualOf(req2.world, F1.salesRecordId)).toBe(100)

    const req3 = service.requestPlayerRefund(req2.world, requestOf({ requestId: 'req-3', requestedUnits: 1 }))
    expect(req3.reasonCode).toBe('over_limit')
  })

  it('R23 未注册公司 fail-fast，不置态', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const finance = makeService(world, { register: false }).finance
    const service = new RefundService({
      finance,
      refundWindowDays: F1.windowDays,
      isCompanyRegistered: () => true,
    })
    expect(() => service.processDueRefunds(world, 114)).toThrowError(/未注册|not registered/)
    expect(world.refundBatches[0]?.status).toBe('pending')
    expect(refundTxCount(world)).toBe(0)
    expect(eventsOf(world, 'RefundBatchPosted')).toEqual([])
    expect(actualOf(world, F1.salesRecordId)).toBe(0)
  })

  it('R39 窗口基准：快照优先，无快照回退当前 TUNING', () => {
    // ① 老记录（saleDay 100）+ auto 批次 refundDay 114，TUNING=30 → Day 116 仍可退
    const auto = makeAutoBatch()
    const w1 = makeFixtureWorld({ batches: [auto], currentDayIndex: 116 })
    const kit1 = makeService(w1, { refundWindowDays: 30 })
    const r1 = kit1.service.requestPlayerRefund(
      w1,
      requestOf({ requestId: 'req-old', requestedUnits: 10, dayIndex: 116 }),
    )
    expect(r1.outcome).toBe('posted')
    expect(r1.windowBasis).toBe('snapshot')

    // ② estimated=0 且无 auto 批次 → 回退当前 TUNING=30，Day 116 未到期
    const record = makeSalesRecord({ estimatedRefundUnits: 0 })
    const w2 = makeFixtureWorld({ sales: [record], currentDayIndex: 116 })
    const kit2 = makeService(w2, { refundWindowDays: 30 })
    const r2 = kit2.service.requestPlayerRefund(
      w2,
      requestOf({ requestId: 'req-new', requestedUnits: 1, dayIndex: 116 }),
    )
    expect(r2.outcome).toBe('rejected')
    expect(r2.reasonCode).toBe('window_not_elapsed')
    expect(r2.windowBasis).toBe('current_tuning')
  })

  it('R40 破产负现金仍兑现', () => {
    const world = makeFixtureWorld({
      batches: [makeAutoBatch()],
      transactions: [...SALES_TXNS, makeTx('tx-drain', 'tax', -3_100_000, 100)],
      currentDayIndex: 114,
    })
    const { service, finance } = makeService(world)
    expect(finance.getCashBalance(F1.companyId)).toBe(-1_000_000)
    const r = service.processDueRefunds(world, 114)
    expect(findBatch(r.world, 'RB-PROJ-001-100-114-1').status).toBe('posted')
    expect(finance.getCashBalance(F1.companyId)).toBe(-1_060_000)
    expect(actualOf(r.world, F1.salesRecordId)).toBe(30)
    expect(eventsOf(r.world, 'RefundBatchPosted')).toHaveLength(1)
    expect(r.failed).toEqual([])
  })
})
