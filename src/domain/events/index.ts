/**
 * DomainEvent —— 领域层事件
 */
import type { RefundRejectReason, RefundWindowBasis } from '@domain/enums'

export interface DomainEvent {
  id: string
  type: string
  day: number
  payload: Record<string, unknown>
}

/** 系统自动取消项目的事件类型 */
export const PROJECT_CANCELLED_EVENT = 'ProjectCancelled'

/** pause_timeout 自动取消的事件载荷；actor 与 reasonCode 为固定值 */
export type ProjectCancelledPayload = {
  projectId: string
  reasonCode: 'pause_timeout'
  actor: 'system'
  description: string
}

/**
 * 构造暂停超时自动取消事件。
 * id 由调用方注入，避免领域事件层反向依赖 uuid 生成器。
 */
export function createPauseTimeoutCancelledEvent(
  id: string,
  projectId: string,
  day: number,
): DomainEvent {
  const payload: ProjectCancelledPayload = {
    projectId,
    reasonCode: 'pause_timeout',
    actor: 'system',
    description: '项目连续暂停满 60 个游戏日，系统自动取消',
  }
  return { id, type: PROJECT_CANCELLED_EVENT, day, payload }
}

/** 项目预算耗尽事件类型（DESIGN-G05 §6.2 / G05-R8） */
export const PROJECT_BUDGET_EXHAUSTED_EVENT = 'ProjectBudgetExhausted'

/** 预算耗尽事件载荷；remainingCapCents 为触发判定时点的剩余额度（≤0，可为负） */
export type ProjectBudgetExhaustedPayload = {
  projectId: string
  day: number
  remainingCapCents: number
}

/**
 * 构造预算耗尽事件。
 *
 * id 即幂等键 `event:budget_exhausted:{projectId}:{resumeSeq}`，随存档生命周期保留，
 * 保证同一恢复周期内至多一次；恢复使 resumeSeq+1 后可再次产生耗尽事件
 * （DESIGN-G05 §7.1 GDR R2 D-G05-R2-01 修订）。
 */
export function createBudgetExhaustedEvent(
  id: string,
  projectId: string,
  day: number,
  remainingCapCents: number,
): DomainEvent {
  const payload: ProjectBudgetExhaustedPayload = {
    projectId,
    day,
    remainingCapCents,
  }
  return { id, type: PROJECT_BUDGET_EXHAUSTED_EVENT, day, payload }
}

/**
 * 预算耗尽事件幂等键：每个恢复周期内唯一。
 * 事件 id 直接取该键，事件去重与审计共用同一标识。
 */
export function budgetExhaustedEventKey(projectId: string, resumeSeq: number): string {
  return `event:budget_exhausted:${projectId}:${resumeSeq}`
}

/** 公司破产事件类型（DESIGN-OI-21 §3.3） */
export const COMPANY_BANKRUPTED_EVENT = 'CompanyBankrupted'

/** 破产事件载荷；balanceAtBankruptcy 为破产时现金余额（负数值） */
export type CompanyBankruptedPayload = {
  companyId: string
  day: number
  balanceAtBankruptcy: number
}

/** 构造公司破产事件。 */
export function createCompanyBankruptedEvent(
  id: string,
  companyId: string,
  day: number,
  balanceAtBankruptcy: number,
): DomainEvent {
  const payload: CompanyBankruptedPayload = {
    companyId,
    day,
    balanceAtBankruptcy,
  }
  return { id, type: COMPANY_BANKRUPTED_EVENT, day, payload }
}

/** 公司自救恢复事件类型（DECISION-M3-P0-BANKRUPTCY-CLOSURE-001 §3.2） */
export const COMPANY_RECOVERED_EVENT = 'CompanyRecovered'

/** 自救恢复载荷；balanceAtRecovery 为恢复时现金余额 */
export type CompanyRecoveredPayload = {
  companyId: string
  day: number
  balanceAtRecovery: number
}

/** 构造公司自救恢复事件。 */
export function createCompanyRecoveredEvent(
  id: string,
  companyId: string,
  day: number,
  balanceAtRecovery: number,
): DomainEvent {
  const payload: CompanyRecoveredPayload = { companyId, day, balanceAtRecovery }
  return { id, type: COMPANY_RECOVERED_EVENT, day, payload }
}

/** 退款批次入账事件类型（DESIGN-M2-001-C §10.6.4 / 08/04 Phase 4.7） */
export const REFUND_BATCH_POSTED_EVENT = 'RefundBatchPosted'

/** 退款批次拒绝事件类型（DESIGN-M2-001-C §10.6.4） */
export const REFUND_BATCH_REJECTED_EVENT = 'RefundBatchRejected'

/** 入账事件载荷；amountCents 为绝对值（非负），与 RefundBatch.refundAmountCents 相同 */
export type RefundBatchPostedPayload = {
  refundBatchId: string
  productId: string
  salesRecordId: string
  day: number
  refundedUnits: number
  amountCents: number
}

/**
 * 拒绝事件载荷。
 * windowBasis 只在 window_not_elapsed 时有意义（Q10：使"同一记录两种窗口基准"的口径差异可审计）。
 */
export type RefundBatchRejectedPayload = {
  refundBatchId: string
  productId: string
  salesRecordId: string
  day: number
  refundedUnits: number
  amountCents: number
  reasonCode: RefundRejectReason
  windowBasis: RefundWindowBasis
}

/** 构造退款入账事件。id 由调用方注入（固定 `refund-posted:${batch.id}`）。 */
export function createRefundBatchPostedEvent(
  id: string,
  input: RefundBatchPostedPayload,
): DomainEvent {
  return {
    id,
    type: REFUND_BATCH_POSTED_EVENT,
    day: input.day,
    payload: { ...input },
  }
}

/** 构造退款拒绝事件。id 由调用方注入（固定 `refund-rejected:${batch.id}`）。 */
export function createRefundBatchRejectedEvent(
  id: string,
  input: RefundBatchRejectedPayload,
): DomainEvent {
  return {
    id,
    type: REFUND_BATCH_REJECTED_EVENT,
    day: input.day,
    payload: { ...input },
  }
}

// ===== 定价 / 折扣 / 生命周期（DESIGN-M2-001-D §9）=====

/** 首次定价事件类型；isFirstPricing 供 G 批做"已定价"提示（R2 N-1） */
export const PRODUCT_PRICED_EVENT = 'ProductPriced'
/** 改价事件类型 */
export const PRODUCT_PRICE_CHANGED_EVENT = 'ProductPriceChanged'
/** 折扣变更事件类型（含取消折扣：toRate=0） */
export const PRODUCT_DISCOUNT_APPLIED_EVENT = 'ProductDiscountApplied'
/** 生命周期阶段推进事件类型 */
export const PRODUCT_LIFECYCLE_CHANGED_EVENT = 'ProductLifecycleChanged'
/** 退市事件类型 */
export const PRODUCT_RETIRED_EVENT = 'ProductRetired'

export type ProductPricedPayload = {
  productId: string
  priceCents: number
  isFirstPricing: true
  day: number
}

export type ProductPriceChangedPayload = {
  productId: string
  fromCents: number
  toCents: number
  day: number
}

export type ProductDiscountAppliedPayload = {
  productId: string
  fromRate: number
  toRate: number
  effectivePriceCents: number
  day: number
}

export type ProductLifecycleChangedPayload = {
  productId: string
  from: string
  to: string
  day: number
  /** 可选原因（M2-H 旧档认知度回填 = 'awareness_backfill'） */
  reason?: string
}

export type ProductRetiredPayload = {
  productId: string
  day: number
  reason: 'manual' | 'auto_zero_sales'
}

/** 构造首次定价事件（id 固定 `product-priced:${productId}`）。 */
export function createProductPricedEvent(id: string, input: ProductPricedPayload): DomainEvent {
  return { id, type: PRODUCT_PRICED_EVENT, day: input.day, payload: { ...input } }
}

/** 构造改价事件（id 固定 `product-price-changed:${productId}:${day}`）。 */
export function createProductPriceChangedEvent(
  id: string,
  input: ProductPriceChangedPayload,
): DomainEvent {
  return { id, type: PRODUCT_PRICE_CHANGED_EVENT, day: input.day, payload: { ...input } }
}

/** 构造折扣事件（id 固定 `product-discount:${productId}:${day}`）。 */
export function createProductDiscountAppliedEvent(
  id: string,
  input: ProductDiscountAppliedPayload,
): DomainEvent {
  return {
    id,
    type: PRODUCT_DISCOUNT_APPLIED_EVENT,
    day: input.day,
    payload: { ...input },
  }
}

/** 构造阶段推进事件（id 固定 `product-lifecycle:${productId}:${day}`）。 */
export function createProductLifecycleChangedEvent(
  id: string,
  input: ProductLifecycleChangedPayload,
): DomainEvent {
  return {
    id,
    type: PRODUCT_LIFECYCLE_CHANGED_EVENT,
    day: input.day,
    payload: { ...input },
  }
}

/** 构造退市事件（id 固定 `product-retired:${productId}`）。 */
export function createProductRetiredEvent(id: string, input: ProductRetiredPayload): DomainEvent {
  return { id, type: PRODUCT_RETIRED_EVENT, day: input.day, payload: { ...input } }
}

// ===== M2-F：营销与发行合同（DESIGN-M2-001-F §7）=====
export const MARKETING_CAMPAIGN_SET_EVENT = 'MarketingCampaignSet'
export const MARKETING_CAMPAIGN_ENDED_EVENT = 'MarketingCampaignEnded'
export const MARKETING_SPEND_POSTED_EVENT = 'MarketingSpendPosted'
export const MARKETING_SPEND_FAILED_EVENT = 'MarketingSpendFailed'
export const PUBLISHING_CONTRACT_SIGNED_EVENT = 'PublishingContractSigned'
export const PUBLISHING_REVENUE_SETTLED_EVENT = 'PublishingRevenueSettled'
export const PUBLISHING_MILESTONE_PAID_EVENT = 'PublishingMilestonePaid'

export interface MarketingCampaignSetPayload {
  day: number
  campaignId: string
  productId: string
  channel: string
  dailyBudgetCents: number
}

export function createMarketingCampaignSetEvent(id: string, input: MarketingCampaignSetPayload): DomainEvent {
  return { id, type: MARKETING_CAMPAIGN_SET_EVENT, day: input.day, payload: { ...input } }
}

export interface MarketingCampaignEndedPayload {
  day: number
  campaignId: string
  productId: string
  channel: string
}

export function createMarketingCampaignEndedEvent(id: string, input: MarketingCampaignEndedPayload): DomainEvent {
  return { id, type: MARKETING_CAMPAIGN_ENDED_EVENT, day: input.day, payload: { ...input } }
}

export interface MarketingSpendPostedPayload {
  day: number
  campaignId: string
  productId: string
  channel: string
  amountCents: number
}

export function createMarketingSpendPostedEvent(id: string, input: MarketingSpendPostedPayload): DomainEvent {
  return { id, type: MARKETING_SPEND_POSTED_EVENT, day: input.day, payload: { ...input } }
}

export interface MarketingSpendFailedPayload {
  day: number
  campaignId: string
  productId: string
  channel: string
  reasonCode: string
}

export function createMarketingSpendFailedEvent(id: string, input: MarketingSpendFailedPayload): DomainEvent {
  return { id, type: MARKETING_SPEND_FAILED_EVENT, day: input.day, payload: { ...input } }
}

export interface PublishingContractSignedPayload {
  day: number
  contractId: string
  productId: string
  contractType: string
}

export function createPublishingContractSignedEvent(id: string, input: PublishingContractSignedPayload): DomainEvent {
  return { id, type: PUBLISHING_CONTRACT_SIGNED_EVENT, day: input.day, payload: { ...input } }
}

export interface PublishingRevenueSettledPayload {
  day: number
  contractId: string
  baseCents: number
  amountCents: number
  direction: 'pay' | 'clawback'
}

export function createPublishingRevenueSettledEvent(id: string, input: PublishingRevenueSettledPayload): DomainEvent {
  return { id, type: PUBLISHING_REVENUE_SETTLED_EVENT, day: input.day, payload: { ...input } }
}

export interface PublishingMilestonePaidPayload {
  day: number
  contractId: string
  amountCents: number
}

export function createPublishingMilestonePaidEvent(id: string, input: PublishingMilestonePaidPayload): DomainEvent {
  return { id, type: PUBLISHING_MILESTONE_PAID_EVENT, day: input.day, payload: { ...input } }
}
