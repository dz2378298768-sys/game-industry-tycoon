export type { Company } from './company'
export { createNewCompany } from './company'
export type { Employee } from './employee'
export type { Project } from './project'
export type { Product } from './product'
export type { SalesRecord } from './sales-record'
export { deriveUnitPriceAtSaleCents, makeSalesRecordId } from './sales-record'
export type { RefundBatch } from './refund-batch'
export { makeRefundBatchId, refundBatchIdempotencyKey } from './refund-batch'
export type { Transaction } from './transaction'
export type { ProjectCostAllocation } from './project-cost-allocation'
export {
  computeSalaryAllocations,
  salaryAllocationIdempotencyKey,
} from './project-cost-allocation'
export type {
  SalaryAllocationInput,
  SalaryAllocationResult,
} from './project-cost-allocation'

// ===== P1 产品蓝图领域内核（D-01 / D-04），独立目录，不覆盖 product.ts / project.ts =====
export * from './product-blueprint'

// ===== P1 统一账本领域内核（FIN V0.2），独立目录，不覆盖 transaction.ts / company.ts =====
export * from './finance'

// ===== P1 Project / WorkPackage 执行内核（PROJ V0.1.1），独立目录，不覆盖 project.ts =====
export * from './project-execution'
