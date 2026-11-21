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
  /** M3-A2/A3：AI 决策日志（最近 24 个月，随档持久化，供克隆对照与审计） */
  aiDecisionLog?: unknown[]
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
    schemaVersion: 3, // SAVE_SCHEMA_VERSION：新世界即 v3，v1/v2 档由迁移层升级
  }
}
