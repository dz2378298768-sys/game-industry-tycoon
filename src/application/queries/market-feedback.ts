import type { Company } from '@domain/entities/company'
import type { Product } from '@domain/entities/product'

export interface GenreSalesChange {
  previous: number
  current: number
}

/** Observed gross sales in the last two complete seven-day windows. */
export function readGenreSalesChanges(products: readonly Product[], dayIndex: number): ReadonlyMap<string, GenreSalesChange> {
  const changes = new Map<string, GenreSalesChange>()
  if (dayIndex < 14) return changes

  const previousStart = dayIndex - 13
  const currentStart = dayIndex - 6
  for (const product of products) {
    for (const record of product.salesByPeriod) {
      if (record.dayIndex < previousStart || record.dayIndex > dayIndex) continue
      const totals = changes.get(product.genreId) ?? { previous: 0, current: 0 }
      if (record.dayIndex < currentStart) totals.previous += record.grossUnits
      else totals.current += record.grossUnits
      changes.set(product.genreId, totals)
    }
  }

  // With no settled sales in a window, the records alone cannot distinguish zero sales from missing coverage.
  for (const [genreId, totals] of changes) {
    if (totals.previous === 0 || totals.current === 0) changes.delete(genreId)
  }
  return changes
}

export function currentMarketCompetitors(companies: readonly Company[]): Company[] {
  return companies.filter((company) => !company.isPlayer && company.status !== 'dissolved')
}
