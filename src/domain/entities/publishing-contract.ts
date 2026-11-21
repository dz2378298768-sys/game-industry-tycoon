import type { PublishingContractType } from '@domain/value-objects/marketing-response'

/** 发行合同（分成 / 里程碑，DESIGN-M2-001-F §3）。 */
export interface PublishingContract {
  /** `CT-${productId}-${type}-${seq}` */
  id: string
  productId: string
  type: PublishingContractType
  /** 仅分成合同 */
  ratePercent?: number
  /** 仅里程碑合同 */
  thresholdNetRevenueCents?: number
  payoutCents?: number
  signedDay: number
  durationDays: number | null
  status: 'active' | 'completed' | 'terminated'
  settledCents: number
  /** M3-B 三模板（全部可选，旧档按 type 推断） */
  template?: 'channel' | 'co_marketing' | 'advance'
  partnerId?: string
  marketScope?: string[]
  platformScope?: string[]
  prepaymentCents?: number
  recoupRatePercent?: number
  recoupedCents?: number
  marketingCommitmentCents?: number
  marketingInjectedCents?: number
  qualityThreshold?: number
  deliveryDay?: number
  controlLevel?: 'full' | 'shared' | 'none'
  terminationClause?: 'mutual' | 'quality_breach' | 'delivery_breach' | 'dissolved'
  /** M3-C1：旧合同 legacy，新合同 realistic；缺省 legacy */
  rateProfile?: 'legacy' | 'realistic'
  version: number
  createdAt: number
  updatedAt: number
}

export function makeContractId(productId: string, type: PublishingContractType, seq: number): string {
  return `CT-${productId}-${type}-${seq}`
}
