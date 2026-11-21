/** 统一账本测试夹具（非测试文件）。 */
import type { TransactionCategory } from '@domain/enums'
import { UnifiedLedger, type PostLedgerTxInput } from '@domain/entities/finance'
import { DEFAULT_FINANCE_TUNING, withFinanceTuningOverrides } from '@domain/value-objects/finance-tuning'
import type { FinanceTuning } from '@domain/value-objects/finance-tuning'

export const DAY = {
  start: 0,
  sale: 10,
  refund: 40,
  after30: 40,
}

export function makeLedger(overrides: Parameters<typeof withFinanceTuningOverrides>[0] = {}): UnifiedLedger {
  return new UnifiedLedger(withFinanceTuningOverrides(overrides))
}

export function makeInput(partial: Partial<PostLedgerTxInput> & {
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: number
  description: string
}): PostLedgerTxInput {
  return { source: 'system_auto', ...partial }
}

/** 开局注资固定幂等键 advance（§5.1）。 */
export function postAdvance(
  ledger: UnifiedLedger,
  companyId: string,
  amountCents: number,
  day = 0,
  idempotencyKey = 'advance',
) {
  ledger.registerCompany(companyId, day)
  return ledger.postTransaction(makeInput({
    idempotencyKey,
    companyId,
    day,
    category: 'advance',
    amountCents,
    description: '开局注资',
    source: 'player_authorized',
  }))
}

export function tuning(): FinanceTuning {
  return DEFAULT_FINANCE_TUNING
}
