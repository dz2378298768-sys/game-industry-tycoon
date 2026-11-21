import type { RefundBatch } from '@domain/entities/refund-batch'

/**
 * 退款窗口的**唯一**纯规则模块（DESIGN-M2-001-C §10.2/§10.3）。
 *
 * 纪律：
 * - 不读 TUNING、不读 `Date`、不读全局状态、不产生副作用、不修改入参；
 * - 窗口天数一律由调用方注入（`parseSave` 因此可以完全不感知 TUNING）。
 */

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

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer`)
  }
}

/** `lastRefundDay = saleDayIndex + refundWindowDays`；`refundWindowDays=0` 合法（当日到期） */
export function refundWindowExpiryDay(saleDayIndex: number, refundWindowDays: number): number {
  assertNonNegativeInteger(saleDayIndex, 'saleDayIndex')
  assertNonNegativeInteger(refundWindowDays, 'refundWindowDays')
  return saleDayIndex + refundWindowDays
}

/** 到期判据：`currentDayIndex >= saleDayIndex + refundWindowDays`（当天即视为已到期） */
export function isRefundWindowElapsed(
  saleDayIndex: number,
  refundWindowDays: number,
  currentDayIndex: number,
): boolean {
  assertNonNegativeInteger(currentDayIndex, 'currentDayIndex')
  return currentDayIndex >= refundWindowExpiryDay(saleDayIndex, refundWindowDays)
}

/** 批次是否需要被到期扫描处理：只认 `pending` 且 `refundDayIndex <= currentDayIndex` */
export function isRefundBatchDue(
  batch: Pick<RefundBatch, 'status' | 'refundDayIndex'>,
  currentDayIndex: number,
): boolean {
  assertNonNegativeInteger(currentDayIndex, 'currentDayIndex')
  if (batch.status !== 'pending') return false
  assertNonNegativeInteger(batch.refundDayIndex, 'refundDayIndex')
  return batch.refundDayIndex <= currentDayIndex
}

/**
 * Q10：解析某条销售记录上「新 player_request」的窗口终点。
 *
 * - 该记录存在 `auto_window` 批次（含 `rejected`）→ 取其 `refundDayIndex` 最大值作快照基准；
 * - 否则回退 `saleDayIndex + currentRefundWindowDays`，并标注 `basis='current_tuning'`。
 *
 * 取最大值：`auto_window` 唯一性只约束「非 rejected ≤ 1」，`rejected` 可多条；
 * 取最大与「窗口只随销售日单调」一致，也最宽松，不会因历史上一次异常拒绝而收紧玩家权利。
 */
export function resolveRefundWindow(
  salesRecordId: string,
  saleDayIndex: number,
  batches: readonly RefundBatch[],
  currentRefundWindowDays: number,
): { windowEnd: number; basis: 'snapshot' | 'current_tuning' } {
  assertNonEmpty(salesRecordId, 'salesRecordId')
  assertNonNegativeInteger(saleDayIndex, 'saleDayIndex')
  let snapshotEnd: number | undefined
  for (const b of batches) {
    if (b.salesRecordId !== salesRecordId) continue
    if (b.source !== 'auto_window') continue
    if (!Number.isInteger(b.refundDayIndex) || b.refundDayIndex < 0) {
      throw new RangeError('refundDayIndex must be a non-negative integer')
    }
    if (snapshotEnd === undefined || b.refundDayIndex > snapshotEnd) {
      snapshotEnd = b.refundDayIndex
    }
  }
  if (snapshotEnd !== undefined) return { windowEnd: snapshotEnd, basis: 'snapshot' }
  return {
    windowEnd: refundWindowExpiryDay(saleDayIndex, currentRefundWindowDays),
    basis: 'current_tuning',
  }
}

/** 唯一金额公式：`refundedUnits × unitPriceAtSaleCents`，整数乘法、不二次舍入 */
export function expectedRefundAmountCents(
  refundedUnits: number,
  unitPriceAtSaleCents: number,
): number {
  assertPositiveInteger(refundedUnits, 'refundedUnits')
  assertNonNegativeInteger(unitPriceAtSaleCents, 'unitPriceAtSaleCents')
  return refundedUnits * unitPriceAtSaleCents
}

function seqOf(refundBatchId: string): number {
  const last = refundBatchId.split('-').at(-1)
  const seq = Number(last)
  if (last === undefined || last.length === 0 || !Number.isInteger(seq) || seq < 1) {
    throw new RangeError(`illegal refundBatchId seq segment: ${refundBatchId}`)
  }
  return seq
}

/** 同一 `(productId, saleDayIndex, refundDayIndex)` 内分配下一个 `seq`（已有 1,2 → 3） */
export function nextRefundSeq(
  batches: readonly RefundBatch[],
  productId: string,
  saleDayIndex: number,
  refundDayIndex: number,
): number {
  assertNonEmpty(productId, 'productId')
  assertNonNegativeInteger(saleDayIndex, 'saleDayIndex')
  assertNonNegativeInteger(refundDayIndex, 'refundDayIndex')
  let max = 0
  for (const b of batches) {
    if (
      b.productId === productId &&
      b.saleDayIndex === saleDayIndex &&
      b.refundDayIndex === refundDayIndex
    ) {
      const seq = seqOf(b.id)
      if (seq > max) max = seq
    }
  }
  return max + 1
}

/** `non-rejected` = `pending + posted`；`posted` 仅 posted；`rejected` 恒不计入 */
export function sumRefundedUnits(
  batches: readonly RefundBatch[],
  salesRecordId: string,
  mode: 'non-rejected' | 'posted',
): number {
  assertNonEmpty(salesRecordId, 'salesRecordId')
  let sum = 0
  for (const b of batches) {
    if (b.salesRecordId !== salesRecordId) continue
    if (b.status === 'rejected') continue
    if (mode === 'posted' && b.status !== 'posted') continue
    sum += b.refundedUnits
  }
  return sum
}

/**
 * 入账 / 拒绝 / 事件追加的**唯一**顺序（§10.3）：
 * `refundDayIndex` 升序 → `auto_window` 先于 `player_request` → `productId` → `saleDayIndex`
 * → `marketId` → `platformId` → `seq` 升序。不得依赖数组原序。
 */
export function compareRefundBatchesForPosting(a: RefundBatch, b: RefundBatch): number {
  if (a.refundDayIndex !== b.refundDayIndex) return a.refundDayIndex - b.refundDayIndex
  if (a.source !== b.source) return a.source === 'auto_window' ? -1 : 1
  if (a.productId !== b.productId) return a.productId < b.productId ? -1 : 1
  if (a.saleDayIndex !== b.saleDayIndex) return a.saleDayIndex - b.saleDayIndex
  if (a.marketId !== b.marketId) return a.marketId < b.marketId ? -1 : 1
  if (a.platformId !== b.platformId) return a.platformId < b.platformId ? -1 : 1
  return seqOf(a.id) - seqOf(b.id)
}
