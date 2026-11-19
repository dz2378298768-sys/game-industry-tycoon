import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RefundBatch } from '@domain/entities/refund-batch'
import type { Transaction } from '@domain/entities/transaction'
import type { DomainEvent } from '@domain/events'

export interface WorldState {
  companies: Company[]
  employees: Employee[]
  projects: Project[]
  products: Product[]
  /** M2：顶层退款批次（U2 裁定：不挂在 Product 下） */
  refundBatches: RefundBatch[]
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
    transactions: [],
    events: [],
    saveSeed,
    simulationAlgorithmVersion: 'mulberry32-v1',
    currentDayIndex: 0,
    schemaVersion: 1,
  }
}
