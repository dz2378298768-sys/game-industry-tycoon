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
  /**
   * 同公司复用键指向不同目标操作（P2-04）：拒绝假成功，不返回他笔交易。
   * CODE-04 P3-05 后仅用于**同公司**内部复用（跨公司同名键不再冲突——各自独立）。
   */
  IDEMPOTENCY_KEY_CONFLICT: 'FIN_IDEMPOTENCY_KEY_CONFLICT',
  REPLAY_LIMIT_EXCEEDED: 'FIN_REPLAY_LIMIT_EXCEEDED',
  /** A-3 一致性断言失败：Company.cashBalanceCents 与账本求和不一致（禁止静默对齐）。 */
  CASH_MISMATCH: 'FIN_CASH_MISMATCH',
  /** 承诺注册表：同 (companyId, commitmentId) 已存在且字段不一致（不复用 ID 覆盖）。 */
  COMMITMENT_ALREADY_REGISTERED: 'FIN_COMMITMENT_ALREADY_REGISTERED',
  /** 承诺注册表：公司未在账本注册（先 registerCompany）。 */
  COMMITMENT_COMPANY_NOT_REGISTERED: 'FIN_COMMITMENT_COMPANY_NOT_REGISTERED',
  /** 承诺注册表：待结算/释放的承诺不存在。 */
  COMMITMENT_NOT_FOUND: 'FIN_COMMITMENT_NOT_FOUND',
  /** 承诺注册表：结算金额与周期不符 / 已取消仍试图结算。 */
  COMMITMENT_SETTLEMENT_INVALID: 'FIN_COMMITMENT_SETTLEMENT_INVALID',
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

/**
 * A-3 单点一致性断言失败：`Company.cashBalanceCents`（兼容展示字段）与账本
 * `Σ amountCents` 不一致。**fail-loud，不得静默对齐**（任务卡 §A.2）。
 * 只有 `hydrateCashFromLedger` 可写该字段；出现本错说明存在第二写入者。
 */
export class CashMismatchError extends FinanceError {
  constructor(companyId: string, declared: number, actual: number) {
    super(
      FIN_ERROR.CASH_MISMATCH,
      `${FIN_ERROR.CASH_MISMATCH}: Company ${companyId}: cashBalanceCents ${declared} != Ledger Σ(amountCents) ${actual}`,
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
