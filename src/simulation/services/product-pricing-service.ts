/**
 * ProductPricingService —— 定价 / 折扣 / 生命周期 / 退市（DESIGN-M2-001-D）。
 *
 * 设计要点：
 * - 价格与折扣只改 Product 元数据，绝不触碰 SalesRecord.unitPriceAtSaleCents（INV-1）。
 * - 退市是终态；重复退市幂等成功（R1 P1-1），退市后改价/打折一律 LIFECYCLE_IMMUTABLE。
 * - 自动退市要求"已定价"（R2 N-2），否则未定价产品会被静默退市。
 * - 日循环阶段推进只改元数据，不影响同日退款判定（R2 N-3）。
 */
import type { Product } from '@domain/entities/product'
import type { PricingRejectReason } from '@domain/enums'
import {
  createProductDiscountAppliedEvent,
  createProductLifecycleChangedEvent,
  createProductPriceChangedEvent,
  createProductPricedEvent,
  createProductRetiredEvent,
} from '@domain/events'
import {
  effectivePriceCents,
  isPriceChangeAllowed,
  lifecycleStageRank,
  PRICE_MAX_MULTIPLIER,
  resolveDiscount,
  resolveLifecycleStage,
} from '@domain/value-objects'
import type { WorldState } from './world-state'

export interface SetPriceCmd {
  productId: string
  priceCents: number
}

export interface ApplyDiscountCmd {
  productId: string
  ratePercent: number
}

export interface RetireProductCmd {
  productId: string
}

export type PricingErrorCode = PricingRejectReason | 'PRD_NOT_FOUND'

export interface PricingResult {
  ok: boolean
  world: WorldState
  errorCode?: PricingErrorCode
  errorMessage?: string
  product?: Product
  /** 价格/折扣无实际变化（幂等成功） */
  changed?: boolean
  /** 重复退市（幂等成功） */
  alreadyRetired?: boolean
}

/** 自动退市窗口：最近 90 个日历日；且窗口起点须 ≥ launchDay + 7 */
const AUTO_RETIRE_WINDOW_DAYS = 90
const MIN_DAYS_BEFORE_RETIRE = 7

function fail(
  world: WorldState,
  errorCode: PricingErrorCode,
  message: string,
): PricingResult {
  return { ok: false, world, errorCode, errorMessage: message }
}

export class ProductPricingService {
  /** 首次定价或改价。未定价产品首次定价会同时写 launchPriceCents。 */
  setPrice(world: WorldState, cmd: SetPriceCmd, dayIndex: number): PricingResult {
    const index = world.products.findIndex((p) => p.id === cmd.productId)
    if (index === -1) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    const product = world.products[index]
    if (product === undefined) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    if (isRetired(product)) {
      return fail(world, 'LIFECYCLE_IMMUTABLE', `Product ${product.id} is retired`)
    }

    const isFirstPricing = product.launchPriceCents === null
    if (!Number.isInteger(cmd.priceCents) || cmd.priceCents <= 0) {
      return fail(world, 'PRICE_INVALID_AMOUNT', `priceCents must be a positive integer`)
    }
    const launchPrice = product.launchPriceCents
    if (
      !isFirstPricing &&
      launchPrice !== null &&
      cmd.priceCents > launchPrice * PRICE_MAX_MULTIPLIER
    ) {
      return fail(
        world,
        'PRICE_INVALID_AMOUNT',
        `priceCents exceeds ${PRICE_MAX_MULTIPLIER}x launch price`,
      )
    }

    const current = product.pricePerUnitCents ?? product.launchPriceCents
    if (!isFirstPricing && current === cmd.priceCents) {
      return { ok: true, world, product, changed: false }
    }
    if (!isFirstPricing && !isPriceChangeAllowed(product.lastPriceChangeDay, dayIndex)) {
      return fail(world, 'PRICE_COOLDOWN', `price changed within ${7} days`)
    }

    const updated: Product = {
      ...product,
      launchPriceCents: isFirstPricing ? cmd.priceCents : product.launchPriceCents,
      pricePerUnitCents: cmd.priceCents,
      lastPriceChangeDay: dayIndex,
      version: product.version + 1,
      updatedAt: dayIndex,
    }
    const eventId = isFirstPricing
      ? `product-priced:${product.id}`
      : `product-price-changed:${product.id}:${dayIndex}`
    const events = world.events.some((e) => e.id === eventId)
      ? world.events
      : [
          ...world.events,
          isFirstPricing
            ? createProductPricedEvent(eventId, {
                productId: product.id,
                priceCents: cmd.priceCents,
                isFirstPricing: true,
                day: dayIndex,
              })
            : createProductPriceChangedEvent(eventId, {
                productId: product.id,
                fromCents: current as number,
                toCents: cmd.priceCents,
                day: dayIndex,
              }),
        ]
    const products = world.products.map((p) => (p.id === updated.id ? updated : p))
    return { ok: true, world: { ...world, products, events }, product: updated, changed: true }
  }

  /** 应用折扣（ratePercent=0 表示取消折扣，价格回到挂牌价）。 */
  applyDiscount(world: WorldState, cmd: ApplyDiscountCmd, dayIndex: number): PricingResult {
    const index = world.products.findIndex((p) => p.id === cmd.productId)
    if (index === -1) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    const product = world.products[index]
    if (product === undefined) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    if (isRetired(product)) {
      return fail(world, 'LIFECYCLE_IMMUTABLE', `Product ${product.id} is retired`)
    }

    const basePrice = product.pricePerUnitCents ?? product.launchPriceCents
    if (basePrice === null || product.launchPriceCents === null) {
      return fail(world, 'PRICE_INVALID_AMOUNT', 'product is not priced yet')
    }
    const currentRate = product.discountRatePercent ?? 0
    if (currentRate === cmd.ratePercent) {
      return { ok: true, world, product, changed: false }
    }

    const decision = resolveDiscount({
      priceCents: basePrice,
      launchPriceCents: product.launchPriceCents,
      ratePercent: cmd.ratePercent,
      launchDay: product.launchDay,
      dayIndex,
    })
    if (!decision.ok) {
      return fail(world, decision.reasonCode, `discount rejected: ${decision.reasonCode}`)
    }
    if (!isPriceChangeAllowed(product.lastPriceChangeDay, dayIndex)) {
      return fail(world, 'PRICE_COOLDOWN', `price changed within ${7} days`)
    }

    const updated: Product = {
      ...product,
      discountRatePercent: cmd.ratePercent,
      lastPriceChangeDay: dayIndex,
      version: product.version + 1,
      updatedAt: dayIndex,
    }
    const eventId = `product-discount:${product.id}:${dayIndex}`
    const events = world.events.some((e) => e.id === eventId)
      ? world.events
      : [
          ...world.events,
          createProductDiscountAppliedEvent(eventId, {
            productId: product.id,
            fromRate: currentRate,
            toRate: cmd.ratePercent,
            effectivePriceCents: decision.effectivePriceCents,
            day: dayIndex,
          }),
        ]
    const products = world.products.map((p) => (p.id === updated.id ? updated : p))
    return { ok: true, world: { ...world, products, events }, product: updated, changed: true }
  }

  /** 手动退市；重复调用幂等成功。 */
  retire(world: WorldState, cmd: RetireProductCmd, dayIndex: number): PricingResult {
    const index = world.products.findIndex((p) => p.id === cmd.productId)
    if (index === -1) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    const product = world.products[index]
    if (product === undefined) {
      return fail(world, 'PRD_NOT_FOUND', `Product ${cmd.productId} not found`)
    }
    if (isRetired(product)) {
      return { ok: true, world, product, alreadyRetired: true, changed: false }
    }
    if (dayIndex - product.launchDay < MIN_DAYS_BEFORE_RETIRE) {
      return fail(world, 'LIFECYCLE_NOT_ELAPSED', `retire requires ${MIN_DAYS_BEFORE_RETIRE} days on sale`)
    }
    return this.retireProduct(world, product, dayIndex, 'manual')
  }

  /**
   * 日循环：阶段推进 + 自动退市。同一天重复调用幂等（事件按 id 去重）。
   */
  advanceLifecycles(world: WorldState, dayIndex: number): WorldState {
    let result = world
    for (const product of world.products) {
      if (isRetired(product)) continue
      const nextStage = resolveLifecycleStage(product.launchDay, dayIndex)
      if (lifecycleStageRank(nextStage) > lifecycleStageRank(product.lifecycleStage)) {
        const updated: Product = {
          ...product,
          lifecycleStage: nextStage,
          version: product.version + 1,
          updatedAt: dayIndex,
        }
        const eventId = `product-lifecycle:${product.id}:${dayIndex}`
        const events = result.events.some((e) => e.id === eventId)
          ? result.events
          : [
              ...result.events,
              createProductLifecycleChangedEvent(eventId, {
                productId: product.id,
                from: product.lifecycleStage,
                to: nextStage,
                day: dayIndex,
              }),
            ]
        const products = result.products.map((p) => (p.id === updated.id ? updated : p))
        result = { ...result, products, events }
      }
      if (this.shouldAutoRetire(result.products.find((p) => p.id === product.id) as Product, dayIndex)) {
        result = this.retireProduct(result, product, dayIndex, 'auto_zero_sales').world
      }
    }
    return result
  }

  /** 自动退市判据：已定价 + 上市满 7 天 + 最近 90 个日历日窗口内无任何销售记录（N-2）。 */
  private shouldAutoRetire(product: Product, dayIndex: number): boolean {
    if (product.launchPriceCents === null) return false
    const elapsed = dayIndex - product.launchDay
    if (elapsed < MIN_DAYS_BEFORE_RETIRE) return false
    const windowStart = dayIndex - (AUTO_RETIRE_WINDOW_DAYS - 1)
    if (windowStart < product.launchDay + MIN_DAYS_BEFORE_RETIRE) return false
    return !product.salesByPeriod.some(
      (r) => r.dayIndex >= windowStart && r.dayIndex <= dayIndex,
    )
  }

  private retireProduct(
    world: WorldState,
    product: Product,
    dayIndex: number,
    reason: 'manual' | 'auto_zero_sales',
  ): PricingResult {
    const updated: Product = {
      ...product,
      status: 'retired',
      lifecycleStage: 'retired',
      version: product.version + 1,
      updatedAt: dayIndex,
    }
    const eventId = `product-retired:${product.id}`
    const events = world.events.some((e) => e.id === eventId)
      ? world.events
      : [
          ...world.events,
          createProductRetiredEvent(eventId, { productId: product.id, day: dayIndex, reason }),
        ]
    const products = world.products.map((p) => (p.id === updated.id ? updated : p))
    return { ok: true, world: { ...world, products, events }, product: updated, changed: true }
  }
}

function isRetired(product: Product): boolean {
  return product.status === 'retired' || product.lifecycleStage === 'retired'
}

/** 只读展示辅助：当前成交价（未定价返回 null）。 */
export function displayPriceCents(product: Product): number | null {
  return effectivePriceCents(product)
}
