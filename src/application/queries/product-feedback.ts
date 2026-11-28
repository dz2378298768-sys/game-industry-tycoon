import { TUNING } from '@content/tuning'
import type { Product } from '@domain/entities/product'
import { computeRefundRate, computeReviewLift } from '@simulation/services/sales-formulas'

export type ReputationBand = 'poor' | 'mixed' | 'positive'

export function latestCompanyRelease(products: readonly Product[], companyId: string | undefined): Product | undefined {
  return products.reduce<Product | undefined>((latest, product) => {
    if (product.companyId !== companyId || !Number.isFinite(product.launchDay)) return latest
    return latest === undefined || product.launchDay >= latest.launchDay ? product : latest
  }, undefined)
}

/** ADJ-26. Reuse the sales score choice and expose only the estimated media band. */
export function estimateMediaReception(product: Product): ReputationBand | null {
  if (!Number.isFinite(product.launchDay)) return null
  const { effectiveReviewScore } = computeReviewLift(product.reviewScore, product.finalQualityScore, TUNING.sales)
  if (!Number.isFinite(effectiveReviewScore) || effectiveReviewScore < 0 || effectiveReviewScore > 100) return null
  if (effectiveReviewScore < 50) return 'poor'
  if (effectiveReviewScore < 75) return 'mixed'
  return 'positive'
}

/** Forecast from the same inputs the settlement model reads. Actual rate from posted units only. */
export function productRefundRates(product: Product) {
  let grossUnits = 0
  let refundedUnits = 0
  for (const record of product.salesByPeriod) {
    grossUnits += record.grossUnits
    refundedUnits += record.actualRefundUnits
  }
  return {
    estimated: grossUnits > 0 && Number.isFinite(product.defectLevel) ? computeRefundRate(product.defectLevel, TUNING.sales) : null,
    actual: grossUnits > 0 ? refundedUnits / grossUnits : null,
  }
}
