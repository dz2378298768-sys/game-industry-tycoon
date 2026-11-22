export { Money } from './money'
export type {
  QualityProfile,
} from './quality-profile'
export {
  averageQuality,
  clampQuality,
} from './quality-profile'
export type { ProjectBudget } from './project-budget'
export { createBudget, recomputeRemaining, budgetUsageRatio } from './project-budget'
export type { RangeItem } from './range-item'
export type { TeamAssignment } from './team-assignment'
export type { ChangeLogEntry, TopUpChangeLogInput } from './change-log'
export {
  BUDGET_TOP_UP_EVENT,
  topUpIdempotencyKey,
  createTopUpChangeLogEntry,
} from './change-log'
export {
  DayIndex,
  dayIndexToGregorian,
  gregorianToDayIndex,
  daysInMonth,
  isLeapYear,
  dayOfYear,
} from './day-index'
export type { GregorianDate } from './day-index'
export {
  refundWindowExpiryDay,
  isRefundWindowElapsed,
  isRefundBatchDue,
  resolveRefundWindow,
  expectedRefundAmountCents,
  nextRefundSeq,
  sumRefundedUnits,
  compareRefundBatchesForPosting,
} from './refund-window'
export {
  LIFECYCLE_GROWTH_DAY,
  LIFECYCLE_MATURE_DAY,
  LIFECYCLE_DECLINE_DAY,
  LIFECYCLE_LONG_TAIL_DAY,
  PRICE_COOLDOWN_DAYS,
  DISCOUNT_COOLDOWN_DAYS,
  DISCOUNT_MIN_PERCENT,
  DISCOUNT_MAX_PERCENT,
  PRICE_MAX_MULTIPLIER,
  resolveLifecycleStage,
  lifecycleStageRank,
  effectivePriceCents,
  isPriceChangeAllowed,
  resolveDiscount,
} from './product-pricing'
export * from './marketing-response'

// ===== P1 产品蓝图领域内核（D-01 / D-04）纯函数 =====
export * from './product-blueprint-tuning'
export * from './product-blueprint-violation'
export * from './product-blueprint-resolve-refs'
export * from './product-blueprint-estimation'
export * from './product-blueprint-hrb'
export * from './product-blueprint-composition'
export * from './product-blueprint-revalidation'
export * from './product-blueprint-lifecycle'
export * from './product-blueprint-rework-cost'

// ===== P1 统一账本领域内核（FIN V0.2）纯函数 =====
export * from './finance-tuning'
export * from './finance-compat'
export * from './finance-cashflow'
export * from './finance-commitment'
export * from './finance-crisis'
export * from './finance-formulas'
export * from './finance-remedy'
// ===== P1 Project / WorkPackage 执行内核（PROJ V0.1.1）纯函数 =====
export * from './project-execution-tuning'
export * from './project-execution-state-machine'
export * from './project-execution-decomposition'
export * from './project-execution-capacity'
export * from './project-execution-daily'
export * from './project-execution-rework'
export * from './project-execution-rebaseline'
export * from './project-execution-engine'
