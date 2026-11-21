import type { Product } from '@domain/entities/product'
import type { RefundBatch } from '@domain/entities/refund-batch'
import { effectivePriceCents } from '@domain/value-objects'

/** 累计净收入 = Σ 销售净额 − Σ posted 退款（pending 不计，DESIGN-M2-001-G §4）。 */
export function netRevenueCents(product: Product, refunds: RefundBatch[]): number {
  const salesNet = product.salesByPeriod.reduce((acc, r) => acc + r.netSalesRevenueCents, 0)
  const posted = refunds
    .filter((b) => b.productId === product.id && b.status === 'posted')
    .reduce((acc, b) => acc + b.refundAmountCents, 0)
  return salesNet - posted
}

export function refundCount(productId: string, refunds: RefundBatch[]): number {
  return refunds.filter((b) => b.productId === productId).length
}

/** 认知度取各市场最大值（0–1）。 */
export function peakAwareness(product: Product): number {
  const values = Object.values(product.awarenessByMarket)
  return values.length === 0 ? 0 : Math.max(...values)
}

export function displayPriceCents(product: Product): number | null {
  return effectivePriceCents(product)
}
