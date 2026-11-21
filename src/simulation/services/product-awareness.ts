/** Product 认知度 scope 读写辅助：新写入只走 awarenessByScope，awarenessByMarket 只读汇总。 */
import type { Product } from '@domain/entities/product'

type ProductAwarenessView = Pick<
  Product,
  'id' | 'awarenessByMarket' | 'awarenessByScope' | 'supportedPlatformIds' | 'audienceSegmentIds'
>

/** 旧档/夹具只有 awarenessByMarket 时，按 market × platform × segment 等分到 scope。 */
export function awarenessByScopeOf(product: ProductAwarenessView): Record<string, number> {
  if (product.awarenessByScope && Object.keys(product.awarenessByScope).length > 0) {
    return { ...product.awarenessByScope }
  }
  const result: Record<string, number> = {}
  const markets = Object.keys(product.awarenessByMarket)
  if (markets.length === 0) return result
  for (const marketId of markets) {
    const scopes: string[] = []
    for (const platformId of product.supportedPlatformIds) {
      for (const segmentId of product.audienceSegmentIds) {
        scopes.push(`${marketId}:${platformId}:${segmentId}`)
      }
    }
    if (scopes.length === 0) continue
    const value = product.awarenessByMarket[marketId] ?? 0
    for (const key of scopes) result[key] = value / scopes.length
  }
  return result
}

/** 按 audience 加权重算 awarenessByMarket；无权重的市场保留旧值。 */
export function rollupAwarenessByMarket(params: {
  awarenessByScope: Record<string, number>
  scopes: Array<{ marketId: string; platformId: string; segmentId: string; audienceUnits: number }>
  fallback?: Record<string, number>
}): Record<string, number> {
  const weighted = new Map<string, number>()
  const weights = new Map<string, number>()
  for (const scope of params.scopes) {
    const key = `${scope.marketId}:${scope.platformId}:${scope.segmentId}`
    const awareness = params.awarenessByScope[key]
    if (typeof awareness !== 'number' || !Number.isFinite(awareness)) continue
    const weight = scope.audienceUnits
    if (!Number.isFinite(weight) || weight <= 0) continue
    weighted.set(scope.marketId, (weighted.get(scope.marketId) ?? 0) + awareness * weight)
    weights.set(scope.marketId, (weights.get(scope.marketId) ?? 0) + weight)
  }
  const result: Record<string, number> = { ...(params.fallback ?? {}) }
  for (const [marketId, total] of weighted) {
    const weight = weights.get(marketId) ?? 0
    if (weight > 0) result[marketId] = total / weight
  }
  return result
}
