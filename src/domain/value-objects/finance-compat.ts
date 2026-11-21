/**
 * 既有 Transaction（src/domain/entities/transaction.ts，KEEP）↔ 账本权威 LedgerTransaction 适配。
 * 规格：FIN V0.2 §3.1（复用并扩展）/ §11.3（迁移补 cashFlowType/source/reversalOf）。
 */
import type { Transaction as LegacyTransaction } from '@domain/entities/transaction'
import type {
  CashFlowType,
  LedgerTransaction,
  TransactionSource,
} from '@domain/entities/finance'

/** 旧交易 → 账本交易（迁移时补齐 NEW 字段，保留 idempotencyKey 与审计字段）。 */
export function fromLegacyTransaction(params: {
  legacy: LegacyTransaction
  cashFlowType: CashFlowType
  source: TransactionSource
  reversalOf?: string | null
  postedAt?: number
}): LedgerTransaction {
  const { legacy } = params
  return {
    transactionId: legacy.id,
    idempotencyKey: legacy.idempotencyKey,
    companyId: legacy.companyId,
    day: legacy.day,
    category: legacy.category,
    cashFlowType: params.cashFlowType,
    amountCents: legacy.amountCents,
    balanceAfterCents: legacy.balanceAfterCents,
    referenceId: legacy.referenceId ?? null,
    source: params.source,
    description: legacy.description,
    status: legacy.status,
    reversedBy: legacy.reversedBy ?? null,
    reversalOf: params.reversalOf ?? null,
    postedAt: params.postedAt ?? legacy.day,
  }
}

/** 账本交易 → 旧交易（兼容展示 / 存档 v3 形状，零行为变更）。 */
export function toLegacyTransaction(tx: LedgerTransaction): LegacyTransaction {
  const legacy: LegacyTransaction = {
    id: tx.transactionId,
    idempotencyKey: tx.idempotencyKey,
    companyId: tx.companyId,
    day: tx.day,
    category: tx.category,
    amountCents: tx.amountCents,
    balanceAfterCents: tx.balanceAfterCents,
    description: tx.description,
    status: tx.status,
  }
  if (tx.referenceId !== null) legacy.referenceId = tx.referenceId
  if (tx.reversedBy !== null) legacy.reversedBy = tx.reversedBy
  return legacy
}
