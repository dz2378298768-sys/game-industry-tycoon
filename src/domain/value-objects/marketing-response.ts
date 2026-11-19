/**
 * 营销响应纯函数（DESIGN-M2-001-F §4）。
 * - 只做算术，不读 TUNING 对象、不读日历、不触碰存储。
 * - 认知度写入允许超过 cap，读取侧 clamp（沿用 B 批口径）。
 */
import type { ProductLifecycleStage } from '@domain/enums'

export type MarketingChannel = 'social' | 'expo' | 'ads'
export type PublishingContractType = 'revenue_share' | 'milestone'

export const MARKETING_BUDGET_MIN_CENTS = 1_000
export const MARKETING_BUDGET_MAX_CENTS = 500_000
export const MARKETING_DECAY_FACTOR = 0.97
export const CONTRACT_RATE_MIN = 5
export const CONTRACT_RATE_MAX = 30
export const CONTRACT_DURATION_MIN = 30
export const CONTRACT_DURATION_MAX = 365
export const CONTRACT_THRESHOLD_MIN_CENTS = 100_000
export const CONTRACT_PAYOUT_MIN_CENTS = 1_000
export const CONTRACT_PAYOUT_MAX_CENTS = 10_000_000

/** 渠道效率系数：展会 > 社媒 > 广告（广告最便宜也最钝）。 */
export const CHANNEL_FACTOR: Record<MarketingChannel, number> = {
  social: 1.0,
  expo: 1.25,
  ads: 0.75,
}

/** 阶段尺度来自既有 TUNING.marketingResponseScaleCents，不新建表。 */
export type StageScaleTable = Record<ProductLifecycleStage, number>

/** 把当日预算按市场均分，余数给 marketId 字典序第一个（P2-1：不依赖对象键序）。 */
export function splitBudgetAcrossMarkets(totalCents: number, marketIds: string[]): Map<string, number> {
  const shares = new Map<string, number>()
  if (marketIds.length === 0) return shares
  const ordered = [...marketIds].sort()
  const base = Math.floor(totalCents / ordered.length)
  const remainder = totalCents - base * ordered.length
  ordered.forEach((marketId, index) => {
    shares.set(marketId, base + (index === 0 ? remainder : 0))
  })
  return shares
}

/**
 * 单市场认知度增量：`share / scale × channelFactor × (1 − awareness / cap)`。
 * 认知度越高边际越小；达到 cap 后增量为 0（但仍可被衰减后再增长）。
 */
export function awarenessDeltaCents(input: {
  budgetShareCents: number
  stageScaleCents: number
  channel: MarketingChannel
  awareness: number
  cap: number
}): number {
  if (!Number.isFinite(input.budgetShareCents) || input.budgetShareCents <= 0) return 0
  if (!Number.isFinite(input.stageScaleCents) || input.stageScaleCents <= 0) return 0
  if (!Number.isFinite(input.awareness) || !Number.isFinite(input.cap) || input.cap <= 0) return 0
  const remaining = 1 - Math.min(Math.max(input.awareness, 0), input.cap) / input.cap
  if (remaining <= 0) return 0
  const raw =
    (input.budgetShareCents / input.stageScaleCents) * CHANNEL_FACTOR[input.channel] * remaining
  return Math.max(0, raw)
}

/** 自然衰减：无有效投放时每天 ×0.97，下限 0。 */
export function applyAwarenessDecay(awareness: number): number {
  if (!Number.isFinite(awareness) || awareness <= 0) return 0
  return Math.max(0, awareness * MARKETING_DECAY_FACTOR)
}

/** 合同累计口径：退款一律落在退款日冲减，不改历史销售日（§5.3）。 */
export function contractBaseCents(netSalesCents: number, refundedCents: number): number {
  return Math.max(0, netSalesCents - refundedCents)
}

/** 分成金额：向下取整到分。 */
export function shareAmountCents(baseCents: number, ratePercent: number): number {
  if (!Number.isFinite(baseCents) || baseCents <= 0) return 0
  if (!Number.isInteger(ratePercent) || ratePercent <= 0) return 0
  return Math.floor((baseCents * ratePercent) / 100)
}
