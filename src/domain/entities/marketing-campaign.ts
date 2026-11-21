import type { MarketingChannel } from '@domain/value-objects/marketing-response'

/** 营销投放（每产品每渠道最多 1 条，DESIGN-M2-001-F §3）。 */
export interface MarketingCampaign {
  /** 产品投放：`MC-${productId}-${channel}`；上市前投放：`MP-${projectId}-${channel}` */
  id: string
  productId: string
  /** C1-T7：上市前项目投放；产品尚未生成时挂项目 */
  projectId?: string
  prelaunch?: boolean
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
