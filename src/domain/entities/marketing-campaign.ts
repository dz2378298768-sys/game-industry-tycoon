import type { MarketingChannel } from '@domain/value-objects/marketing-response'

/** 营销投放（每产品每渠道最多 1 条，DESIGN-M2-001-F §3）。 */
export interface MarketingCampaign {
  /** `MC-${productId}-${channel}` */
  id: string
  productId: string
  channel: MarketingChannel
  dailyBudgetCents: number
  startDay: number
  status: 'active' | 'ended'
  version: number
  createdAt: number
  updatedAt: number
}

export function makeCampaignId(productId: string, channel: MarketingChannel): string {
  return `MC-${productId}-${channel}`
}
