/**
 * SalesRecord —— 单条「销售日 × 市场 × 平台」聚合销售记录。
 * 金额单位：整数美分；符号：全部非负。
 * 退款金额不在本记录内，由 RefundBatch + Transaction 独立承载。
 */
export interface SalesRecord {
  /** `SR-${productId}-${dayIndex}-${marketId}-${platformId}` */
  id: string
  productId: string
  /** 销售发生日（不是退款日） */
  dayIndex: number
  marketId: string
  platformId: string
  /** 当日毛销量（件），正整数；0 不生成记录 */
  grossUnits: number
  /** 派生只读：round(grossRevenueCents / grossUnits)，整数美分/件 */
  unitPriceAtSaleCents: number
  /** grossUnits × 销售当日有效单价（含折扣/地区价），非负整数美分 */
  grossRevenueCents: number
  /** round(grossRevenueCents × platformFeeRate)，非负整数美分 */
  platformFeeCents: number
  /** grossRevenueCents − platformFeeCents，非负整数美分；不含退款 */
  netSalesRevenueCents: number
  /** floor(grossUnits × refundRate)，销售日写入，UI 展示用，不扣现金 */
  estimatedRefundUnits: number
  /** RefundBatch posted 时累加，不覆盖 estimated；≤ grossUnits */
  actualRefundUnits: number
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

/** 构造 SalesRecord 的规范化 ID（DESIGN-M2-001-A §10.5） */
export function makeSalesRecordId(
  productId: string,
  dayIndex: number,
  marketId: string,
  platformId: string,
): string {
  assertNonEmpty(productId, 'productId')
  assertNonNegativeInteger(dayIndex, 'dayIndex')
  assertNonEmpty(marketId, 'marketId')
  assertNonEmpty(platformId, 'platformId')
  return `SR-${productId}-${dayIndex}-${marketId}-${platformId}`
}

/**
 * 销售日单价派生（DESIGN-M2-001-A §10.4 R1）：
 * `Math.round(grossRevenueCents / grossUnits)`。
 */
export function deriveUnitPriceAtSaleCents(
  grossRevenueCents: number,
  grossUnits: number,
): number {
  assertNonNegativeInteger(grossRevenueCents, 'grossRevenueCents')
  if (!Number.isInteger(grossUnits) || grossUnits <= 0) {
    throw new RangeError('grossUnits must be a positive integer')
  }
  return Math.round(grossRevenueCents / grossUnits)
}
