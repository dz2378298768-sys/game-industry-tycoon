import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RefundBatch } from '@domain/entities/refund-batch'
import type { MarketingCampaign } from '@domain/entities/marketing-campaign'
import type { PublishingContract } from '@domain/entities/publishing-contract'
import type { Transaction } from '@domain/entities/transaction'
import type { DomainEvent } from '@domain/events'

export interface WorldState {
  companies: Company[]
  employees: Employee[]
  projects: Project[]
  products: Product[]
  /** M2：顶层退款批次（U2 裁定：不挂在 Product 下） */
  refundBatches: RefundBatch[]
  /** M2-F：营销投放（每产品每渠道 1 条） */
  marketingCampaigns: MarketingCampaign[]
  /** M2-F：发行合同 */
  publishingContracts: PublishingContract[]
  transactions: Transaction[]
  events: DomainEvent[]
  saveSeed: number
  simulationAlgorithmVersion: string
  currentDayIndex: number
  schemaVersion: number
}

export function createEmptyWorld(saveSeed = 42): WorldState {
  return {
    companies: [],
    employees: [],
    projects: [],
    products: [],
    refundBatches: [],
    marketingCampaigns: [],
    publishingContracts: [],
    transactions: [],
    events: [],
    saveSeed,
    simulationAlgorithmVersion: 'mulberry32-v1',
    currentDayIndex: 0,
    schemaVersion: 2, // SAVE_SCHEMA_VERSION：新世界即 v2，v1 档由迁移层升级
  }
}
