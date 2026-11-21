import type { RefundSource, RefundStatus } from '@domain/enums'

/**
 * RefundBatch —— 一次实际退款操作的完整身份（08/09 §2.4 / DATA-001 §3.2）。
 * 金额单位：整数美分；refundAmountCents 恒为绝对值（非负）。
 */
export interface RefundBatch {
  /** `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}`，seq 从 1 开始 */
  id: string
  productId: string
  /** 唯一回指入口，必须命中某条 SalesRecord.id */
  salesRecordId: string
  marketId: string
  platformId: string
  /** 原销售发生日 */
  saleDayIndex: number
  /** 退款发生日：auto = saleDayIndex + refundWindowDays；player = 玩家请求日 */
  refundDayIndex: number
  /** 本次退款件数，正整数 */
  refundedUnits: number
  /** 退款金额绝对值（美分）；写 Transaction 时取负 */
  refundAmountCents: number
  source: RefundSource
  status: RefundStatus
  /** 玩家多次操作同一批次时的首请求 ID（去重） */
  firstRefundRequestId?: string
  /** 派生存储：`customer-refund:${id}` */
  idempotencyKey: string
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`)
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative integer`)
  }
}

/** 构造 RefundBatch 的规范化 ID（DESIGN-M2-001-A §10.5） */
export function makeRefundBatchId(
  productId: string,
  saleDayIndex: number,
  refundDayIndex: number,
  seq: number,
): string {
  assertNonEmpty(productId, 'productId')
  assertNonNegativeInteger(saleDayIndex, 'saleDayIndex')
  assertNonNegativeInteger(refundDayIndex, 'refundDayIndex')
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RangeError('seq must be a positive integer')
  }
  return `RB-${productId}-${saleDayIndex}-${refundDayIndex}-${seq}`
}

/** 退款入账幂等键：`customer-refund:${id}`（DESIGN-M2-UNBLOCK §1.1） */
export function refundBatchIdempotencyKey(refundBatchId: string): string {
  assertNonEmpty(refundBatchId, 'refundBatchId')
  return `customer-refund:${refundBatchId}`
}
