import { describe, it, expect } from 'vitest'
import { parseSave } from '@infrastructure/storage/save-schema'
import { refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import type { WorldState } from '@simulation/services/world-state'
import { F1, makeAutoBatch, makeFixtureWorld, makeSalesRecord, makeTx } from '@simulation/__tests__/m2c-fixtures'

/** F3（非整除）：2 件、收入 3,001、单价 1,501、抽成 900、净 2,101、estimated 2 */
function makeF3World(parts: {
  refundAmountCents: number
  withTx?: boolean
  txAmountCents?: number
  postedStatus?: 'posted' | 'pending'
}): WorldState {
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
    refundAmountCents: parts.refundAmountCents,
    status: parts.postedStatus ?? 'posted',
  })
  const transactions = [
    makeTx('tx-sales', 'sales_revenue', 3001, 100),
    makeTx('tx-platform', 'platform_fee', -900, 100),
  ]
  if (parts.withTx === true) {
    transactions.push(
      makeTx('tx-refund', 'customer_refund', parts.txAmountCents ?? -parts.refundAmountCents, 114, {
        idempotencyKey: refundBatchIdempotencyKey(batch.id),
      }),
    )
  }
  return makeFixtureWorld({
    sales: [{ ...record, actualRefundUnits: parts.postedStatus === 'pending' ? 0 : 2 }],
    batches: [batch],
    transactions,
    currentDayIndex: 114,
  })
}

describe('M2-C 读档退款校验（DESIGN-M2-001-C R29–R32）', () => {
  it('R29 非整除单价一致：posted 2 件/3002 + 同键交易 → 通过，且允许 3002 > 3001', () => {
    const world = makeF3World({ refundAmountCents: 3002, withTx: true })
    expect(3002).toBeGreaterThan(world.products[0]?.salesByPeriod[0]?.grossRevenueCents ?? 0)
    const r = parseSave(world)
    expect(r.ok).toBe(true)
  })

  it('R30 批次金额漂移且无凭据 → 仍拒绝（全局断言，Q6）', () => {
    const world = makeF3World({ refundAmountCents: 3001, withTx: false })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })

  it('R31 有凭据但交易金额漂移 → 拒绝', () => {
    const world = makeF3World({ refundAmountCents: 3002, withTx: true, txAmountCents: -3001 })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })

  it('R32 归属漂移与累加漂移', () => {
    // (a) marketId 与销售记录不一致
    const wrongMarket = makeFixtureWorld({
      batches: [makeAutoBatch({ marketId: 'US' })],
      currentDayIndex: 114,
    })
    const r1 = parseSave(wrongMarket)
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.errorCode).toBe('SAVE_BROKEN_REF')

    // (b) posted 30 但 actualRefundUnits=29
    const wrongActual = makeFixtureWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 29 })],
      batches: [makeAutoBatch()],
      currentDayIndex: 114,
    })
    const r2 = parseSave(wrongActual)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })
})

// F1 引用说明：R32 使用 F1 基准世界
void F1
