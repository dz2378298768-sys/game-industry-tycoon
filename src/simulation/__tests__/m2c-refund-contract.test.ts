import { describe, it, expect } from 'vitest'
import { RefundService } from '@simulation/services/refund-service'
import type { WorldState } from '@simulation/services/world-state'
import {
  F1,
  makeAutoBatch,
  makeFixtureWorld,
  makeSalesRecord,
  makeService,
  makeTx,
  requestOf,
} from '@simulation/__tests__/m2c-fixtures'

function refundTxs(world: WorldState) {
  return world.transactions.filter((t) => t.category === 'customer_refund')
}

function expectThrowKind(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error)) throw error
    expect((error as { code: unknown }).code).toBe(code)
    return
  }
  throw new Error(`expected throw ${code}`)
}

describe('M2-C 接口契约：错误码与无部分写入（DESIGN-M2-001-C R33–R38）', () => {
  it('R33 dayIndex 不匹配 → REFUND_DAY_MISMATCH，不生成批次', () => {
    const world = makeFixtureWorld({ currentDayIndex: 114 })
    const { service, finance } = makeService(world)
    const r = service.requestPlayerRefund(world, requestOf({ dayIndex: 113 }))
    expect(r.outcome).toBe('error')
    expect(r.errorCode).toBe('REFUND_DAY_MISMATCH')
    expect(r.world.refundBatches).toHaveLength(world.refundBatches.length)
    expect(finance.getAllTransactions()).toHaveLength(world.transactions.length)
  })

  it('R34 参数守卫：空 requestId / 0 件 / 产品记录不匹配 / requestId 复用但记录不同', () => {
    const world = makeFixtureWorld({ currentDayIndex: 114 })
    const { service } = makeService(world)

    const emptyId = service.requestPlayerRefund(world, requestOf({ requestId: '' }))
    expect(emptyId.errorCode).toBe('REFUND_INVALID_REQUEST')

    const zeroUnits = service.requestPlayerRefund(world, requestOf({ requestedUnits: 0 }))
    expect(zeroUnits.errorCode).toBe('REFUND_INVALID_REQUEST')

    const mismatch = service.requestPlayerRefund(
      world,
      requestOf({ productId: 'PROJ-999' }),
    )
    expect(mismatch.errorCode).toBe('REFUND_RECORD_NOT_FOUND')

    // 产品-记录不匹配：记录存在但属于另一产品
    const otherRecord = makeSalesRecord({
      id: 'SR-PROJ-002-100-JP-home_console_g2',
      productId: 'PROJ-002',
    })
    const world2 = makeFixtureWorld({
      sales: [makeSalesRecord(), otherRecord],
      currentDayIndex: 114,
    })
    const svc2 = makeService(world2).service
    const productRecordMismatch = svc2.requestPlayerRefund(
      world2,
      requestOf({ productId: 'PROJ-001', salesRecordId: otherRecord.id }),
    )
    expect(productRecordMismatch.errorCode).toBe('REFUND_INVALID_REQUEST')

    // requestId 复用但 salesRecordId 不同
    const first = svc2.requestPlayerRefund(world2, requestOf({ requestId: 'req-dup', requestedUnits: 1 }))
    expect(first.outcome).toBe('posted')
    const replayOther = svc2.requestPlayerRefund(
      first.world,
      requestOf({ requestId: 'req-dup', salesRecordId: 'SR-PROJ-002-100-JP-home_console_g2' }),
    )
    expect(replayOther.errorCode).toBe('REFUND_INVALID_REQUEST')

    expect(emptyId.world.refundBatches).toHaveLength(world.refundBatches.length)
  })

  it('R35 产品/记录不存在 → REFUND_RECORD_NOT_FOUND，0 新批次', () => {
    const world = makeFixtureWorld({ currentDayIndex: 114 })
    const { service } = makeService(world)
    const missingProduct = service.requestPlayerRefund(world, requestOf({ productId: 'NOPE' }))
    expect(missingProduct.errorCode).toBe('REFUND_RECORD_NOT_FOUND')
    expect(missingProduct.world.refundBatches).toHaveLength(0)

    const missingRecord = service.requestPlayerRefund(
      world,
      requestOf({ salesRecordId: 'SR-NOT-EXIST' }),
    )
    expect(missingRecord.errorCode).toBe('REFUND_RECORD_NOT_FOUND')
    expect(missingRecord.world.refundBatches).toHaveLength(0)
  })

  it('R36 运行期 units 漂移 → REFUND_UNITS_MISMATCH，零副作用', () => {
    const world = makeFixtureWorld({
      batches: [makeAutoBatch({ refundedUnits: 29, refundAmountCents: 58_000 })],
      currentDayIndex: 114,
    })
    const snapshot = structuredClone(world)
    const { service, finance } = makeService(world)
    expectThrowKind(() => service.processDueRefunds(world, 114), 'REFUND_UNITS_MISMATCH')
    expect(world).toEqual(snapshot)
    expect(refundTxs(world)).toHaveLength(0)
    expect(finance.getAllTransactions()).toHaveLength(snapshot.transactions.length)
    expect(world.events).toHaveLength(0)
  })

  it('R37 运行期金额漂移 → REFUND_AMOUNT_MISMATCH，零副作用', () => {
    const world = makeFixtureWorld({
      batches: [makeAutoBatch({ refundAmountCents: 59_999 })],
      currentDayIndex: 114,
    })
    const snapshot = structuredClone(world)
    const { service } = makeService(world)
    expectThrowKind(() => service.processDueRefunds(world, 114), 'REFUND_AMOUNT_MISMATCH')
    expect(world).toEqual(snapshot)
    expect(refundTxs(world)).toHaveLength(0)
    expect(world.events).toHaveLength(0)
  })

  it('R38 未注册公司 → REFUND_BROKEN_REF，不留永久 pending', () => {
    const world = makeFixtureWorld({ batches: [makeAutoBatch()], currentDayIndex: 114 })
    const snapshot = structuredClone(world)
    const finance = makeService(world, { register: false }).finance
    const service = new RefundService({
      finance,
      refundWindowDays: F1.windowDays,
      isCompanyRegistered: () => true,
    })
    expectThrowKind(() => service.processDueRefunds(world, 114), 'REFUND_BROKEN_REF')
    expect(world).toEqual(snapshot)
    expect(world.refundBatches[0]?.status).toBe('pending')
    expect(refundTxs(world)).toHaveLength(0)
    expect(world.events).toHaveLength(0)
    expect(finance.hasTransaction('customer-refund:RB-PROJ-001-100-114-1')).toBe(false)
  })
})

// 引用 makeTx 保持夹具口径一致
void makeTx
