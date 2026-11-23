import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RefundBatch } from '@domain/entities/refund-batch'
import type { MarketingCampaign } from '@domain/entities/marketing-campaign'
import type { PublishingContract } from '@domain/entities/publishing-contract'
import type { Transaction } from '@domain/entities/transaction'
import type { DomainEvent } from '@domain/events'
import type { BudgetCommitment } from '@domain/entities/finance'
import type {
  Candidate,
  Employment,
  Person,
  PersonEvent,
  PersonnelFormulaSnapshot,
} from '@domain/entities/personnel'
import type { ProjectExecutionState } from '@domain/value-objects/project-execution-engine'

/**
 * CODE-07B REVISION / U3（A-25）：ExecutionProject 存档切片条目。
 * `key` 为 mediator Map 的索引键（内核 projectId + legacy Project id 双索引），
 * `state` 为内核 ProjectExecutionState 原样持久化。旧档缺省 undefined，读档不升版本。
 */
export interface ExecutionProjectSaveEntry {
  key: string
  state: ProjectExecutionState
}

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
  /**
   * CODE-04 / FIN §3.3：账本承诺集合（唯一来源 = UnifiedLedger）；
   * 与 transactions 一同持久化，读档时随 replay 重建。旧档缺省 []（passthrough 不升版本）。
   */
  commitments?: BudgetCommitment[]
  /**
   * CODE-06 / D-03（TASK-P1-CODE-06）：人才与组织实体（§3）。
   * 旧档缺省 undefined（passthrough 不升版本）；restore 时按 §15.3 从 employees 迁移。
   */
  persons?: Person[]
  employments?: Employment[]
  candidates?: Candidate[]
  personEvents?: PersonEvent[]
  /** §11 S7：D-03 存档结构版本（编码时升 3）；旧档缺省 undefined。 */
  d03SchemaVersion?: number
  /** §11 S7 / §18.3 C13 必存项：personnelFormulaVersion + 参数快照三元组。 */
  personnelFormulaSnapshot?: PersonnelFormulaSnapshot
  /**
   * CODE-07B REVISION / U3（A-25）：ExecutionProject 内存态切片随档持久化。
   * 含交付失败审计 lastDeliveryFailure / reasonCodes；旧档缺省 undefined（不升版本）。
   */
  executionProjects?: ExecutionProjectSaveEntry[]
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
