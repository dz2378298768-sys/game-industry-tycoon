/**
 * 产品定价 / 折扣 / 生命周期 —— 纯函数层（DESIGN-M2-001-D §6、§7）。
 *
 * 约束：
 * - 不读 TUNING、不读 Date、不随机；全部输入由调用方显式传入（INV-5）。
 * - 整数守卫：金额一律整数美分；非法输入返回 null 或拒绝原因，绝不"就近修正"。
 */
import type { Product } from '@domain/entities/product'
import type { PricingRejectReason, ProductLifecycleStage } from '@domain/enums'

/** 生命周期阶段阈值（上市后天数，左闭右开）。 */
export const LIFECYCLE_GROWTH_DAY = 21
export const LIFECYCLE_MATURE_DAY = 90
export const LIFECYCLE_DECLINE_DAY = 180
export const LIFECYCLE_LONG_TAIL_DAY = 365

/** 改价冷却（天，基于 lastPriceChangeDay）。 */
export const PRICE_COOLDOWN_DAYS = 7
/** 折扣冷静期（天，基于 launchDay）。 */
export const DISCOUNT_COOLDOWN_DAYS = 14
/** 折扣率下限 / 上限（百分比整数）。 */
export const DISCOUNT_MIN_PERCENT = 5
export const DISCOUNT_MAX_PERCENT = 50
/** 挂牌价相对上市价的倍数上限。 */
export const PRICE_MAX_MULTIPLIER = 5

const STAGE_RANK: Record<ProductLifecycleStage, number> = {
  launch: 0,
  growth: 1,
  mature: 2,
  decline: 3,
  long_tail: 4,
  retired: 5,
}

/** 阶段序号（只升不降判定用）。 */
export function lifecycleStageRank(stage: ProductLifecycleStage): number {
  return STAGE_RANK[stage]
}

/**
 * 按上市后天数推导阶段：<21 launch；<90 growth；<180 mature；<365 decline；否则 long_tail。
 * 不会返回 'retired'（退市只由显式/自动退市写入）。
 */
export function resolveLifecycleStage(launchDay: number, dayIndex: number): ProductLifecycleStage {
  if (!Number.isInteger(launchDay) || !Number.isInteger(dayIndex)) {
    throw new TypeError('resolveLifecycleStage requires integer launchDay/dayIndex')
  }
  const elapsed = dayIndex - launchDay
  if (elapsed < LIFECYCLE_GROWTH_DAY) return 'launch'
  if (elapsed < LIFECYCLE_MATURE_DAY) return 'growth'
  if (elapsed < LIFECYCLE_DECLINE_DAY) return 'mature'
  if (elapsed < LIFECYCLE_LONG_TAIL_DAY) return 'decline'
  return 'long_tail'
}

type PricedProduct = Pick<
  Product,
  'launchPriceCents' | 'pricePerUnitCents' | 'discountRatePercent'
>

/**
 * 成交价（唯一取价入口）：挂牌价 × (1 - 折扣率/100)，四舍五入。
 * 未定价（launchPriceCents 为 null 且无挂牌价）返回 null。
 */
export function effectivePriceCents(product: PricedProduct): number | null {
  const base = product.pricePerUnitCents ?? product.launchPriceCents
  if (base === null || base === undefined) return null
  if (!Number.isInteger(base) || base <= 0) return null
  const rate = product.discountRatePercent ?? 0
  if (!Number.isInteger(rate) || rate < 0 || rate > DISCOUNT_MAX_PERCENT) return null
  const discounted = Math.round((base * (100 - rate)) / 100)
  return discounted > 0 ? discounted : null
}

/** 改价冷却：距上次变更不足 7 天则不允许（缺省视为从未变更）。 */
export function isPriceChangeAllowed(
  lastPriceChangeDay: number | undefined,
  dayIndex: number,
): boolean {
  if (!Number.isInteger(dayIndex)) throw new TypeError('dayIndex must be an integer')
  if (lastPriceChangeDay === undefined) return true
  if (!Number.isInteger(lastPriceChangeDay)) return false
  return dayIndex - lastPriceChangeDay >= PRICE_COOLDOWN_DAYS
}

export type DiscountDecision =
  | { ok: true; effectivePriceCents: number }
  | { ok: false; reasonCode: PricingRejectReason }

/**
 * 折扣判定：率域（0 或 5..50）→ 冷静期（上市 <14 天禁止打折）→ 半价下限。
 * 挂牌价本身不动，折扣独立存字段，故"取消折扣"可无损回到原价。
 */
export function resolveDiscount(input: {
  priceCents: number
  launchPriceCents: number
  ratePercent: number
  launchDay: number
  dayIndex: number
}): DiscountDecision {
  const { priceCents, launchPriceCents, ratePercent, launchDay, dayIndex } = input
  if (
    !Number.isInteger(priceCents) ||
    priceCents <= 0 ||
    !Number.isInteger(launchPriceCents) ||
    launchPriceCents <= 0 ||
    !Number.isInteger(dayIndex) ||
    !Number.isInteger(launchDay)
  ) {
    return { ok: false, reasonCode: 'PRICE_INVALID_AMOUNT' }
  }
  if (!Number.isInteger(ratePercent)) {
    return { ok: false, reasonCode: 'PRICE_DISCOUNT_RANGE' }
  }
  if (ratePercent !== 0 && (ratePercent < DISCOUNT_MIN_PERCENT || ratePercent > DISCOUNT_MAX_PERCENT)) {
    return { ok: false, reasonCode: 'PRICE_DISCOUNT_RANGE' }
  }
  if (ratePercent > 0 && dayIndex - launchDay < DISCOUNT_COOLDOWN_DAYS) {
    return { ok: false, reasonCode: 'PRICE_DISCOUNT_COOLDOWN' }
  }
  const effective = Math.round((priceCents * (100 - ratePercent)) / 100)
  if (effective <= 0) return { ok: false, reasonCode: 'PRICE_DISCOUNT_RANGE' }
  if (ratePercent > 0 && effective < Math.round(launchPriceCents / 2)) {
    return { ok: false, reasonCode: 'PRICE_DISCOUNT_RANGE' }
  }
  return { ok: true, effectivePriceCents: effective }
}
