import type { TransactionCategory, TransactionStatus } from '@domain/enums'

export interface Transaction {
  id: string
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: number       // 负 = 支出, 正 = 收入
  balanceAfterCents: number
  referenceId?: string
  description: string
  status: TransactionStatus
  reversedBy?: string
}
