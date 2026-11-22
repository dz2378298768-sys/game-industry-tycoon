/**
 * 统一账本错误码（复用 DomainError 体系；FIN_* 码表）。
 * 规格：FIN V0.2 §5.1/§5.9/§10/§11、任务卡 §4。
 */
import { DomainError, InsufficientCashError } from '@domain/errors'

export const FIN_ERROR = {
  AMOUNT_ZERO: 'FIN_AMOUNT_ZERO',
  AMOUNT_NOT_INTEGER: 'FIN_AMOUNT_NOT_INTEGER',
  COMPANY_NOT_REGISTERED: 'FIN_COMPANY_NOT_REGISTERED',
  TX_NOT_FOUND: 'FIN_TX_NOT_FOUND',
  TX_ALREADY_REVERSED: 'FIN_TX_ALREADY_REVERSED',
  DUPLICATE_SETTLEMENT: 'FIN_DUPLICATE_SETTLEMENT',
  LEDGER_INCONSISTENT: 'FIN_LEDGER_INCONSISTENT',
  COMMITMENT_OVER_REALIZED: 'FIN_COMMITMENT_OVER_REALIZED',
  COMMITMENT_INVALID_PERIOD: 'FIN_COMMITMENT_INVALID_PERIOD',
  COMMITMENT_MISMATCH: 'FIN_COMMITMENT_MISMATCH',
  PAYABLE_OVER_SETTLED: 'FIN_PAYABLE_OVER_SETTLED',
  INVALID_CRISIS_TRANSITION: 'FIN_INVALID_CRISIS_TRANSITION',
  CONSEQUENCE_REQUIRED: 'FIN_RESTRUCTURING_CONSEQUENCE_REQUIRED',
  CRISIS_RULES_VERSION_REQUIRED: 'FIN_CRISIS_RULES_VERSION_REQUIRED',
  SANDBOX_PLAYER_EXPENSE_BLOCKED: 'FIN_SANDBOX_PLAYER_EXPENSE_BLOCKED',
  SANDBOX_COMMITMENT_BLOCKED: 'FIN_SANDBOX_COMMITMENT_BLOCKED',
  REMEDY_PRECONDITION_FAILED: 'FIN_REMEDY_PRECONDITION_FAILED',
  REFUND_FEE_TX_NOT_FOUND: 'FIN_REFUND_FEE_TX_NOT_FOUND',
  IDENTITY_MISMATCH: 'FIN_IDEMPOTENCY_KEY_MISMATCH',
  /** 同公司复用冲销/退款键指向不同目标操作（P2-04）：拒绝假成功，不返回他笔交易。 */
  IDEMPOTENCY_KEY_CONFLICT: 'FIN_IDEMPOTENCY_KEY_CONFLICT',
  REPLAY_LIMIT_EXCEEDED: 'FIN_REPLAY_LIMIT_EXCEEDED',
} as const

export type FinanceErrorCode = (typeof FIN_ERROR)[keyof typeof FIN_ERROR]

/** 账本基类错误；与 Simulation 层 CommandResult 的错误码字符串一致。 */
export class FinanceError extends DomainError {
  constructor(code: FinanceErrorCode | string, message: string) {
    super(code, message)
    this.name = 'FinanceError'
  }
}

/** INV-1 校验失败：读档拒绝（§10.5）。 */
export class LedgerInconsistentError extends FinanceError {
  constructor(companyId: string, expected: number, actual: number) {
    super(
      FIN_ERROR.LEDGER_INCONSISTENT,
      `Company ${companyId}: cashBalanceCents ${expected} != Σ(amountCents) ${actual}`,
    )
  }
}

/** 承诺累计兑现越界（F-02：realizedCents 上限 totalPlannedCents）。 */
export class CommitmentOverRealizedError extends FinanceError {
  constructor(commitmentId: string, realized: number, requested: number, cap: number) {
    super(
      FIN_ERROR.COMMITMENT_OVER_REALIZED,
      `Commitment ${commitmentId}: realized ${realized} + ${requested} exceeds totalPlanned ${cap}`,
    )
  }
}

/** 非法危机迁移（§4.2 / S-FIN-2）。 */
export class InvalidCrisisTransitionError extends FinanceError {
  constructor(from: string, to: string, reason: string) {
    super(FIN_ERROR.INVALID_CRISIS_TRANSITION, `Crisis ${from} -> ${to} invalid: ${reason}`)
  }
}

/** 重整/破产必须留下结构化后果（§8.5 / TC-14：非免费复活）。 */
export class RestructuringConsequenceRequiredError extends FinanceError {
  constructor() {
    super(FIN_ERROR.CONSEQUENCE_REQUIRED, 'Restructuring/bankrupt requires non-empty restructuringConsequences')
  }
}

/** 沙盒观察态禁止新增玩家义务（§10.4）。 */
export class SandboxPlayerExpenseBlockedError extends FinanceError {
  constructor() {
    super(FIN_ERROR.SANDBOX_PLAYER_EXPENSE_BLOCKED, 'sandbox_observe blocks new player_authorized expenses')
  }
}

/** 沙盒观察态禁止新建 BudgetCommitment（§10.4「停止新增义务」）。 */
export class SandboxCommitmentBlockedError extends FinanceError {
  constructor(companyId: string) {
    super(
      FIN_ERROR.SANDBOX_COMMITMENT_BLOCKED,
      `sandbox_observe blocks new BudgetCommitment for company ${companyId}`,
    )
  }
}

export { InsufficientCashError }
