/**
 * 统一账本领域内核导出（FIN V0.2）。
 * 独立目录，不覆盖既有 transaction.ts / company.ts。
 */
export type {
  Cents,
  CashFlowType,
  TransactionSource,
  LedgerTransaction,
  LedgerAccount,
  CommitmentSourceType,
  CommitmentPeriod,
  CommitmentState,
  BudgetCommitment,
  SettlementDirection,
  SettlementState,
  PayableReceivable,
  ForecastFlowItem,
  NetCashBand,
  CashForecast,
  CrisisLevel,
  CrisisReasonCode,
  Remedy,
  ControlChange,
  AssetChange,
  RestructuringConsequences,
  CrisisHistoryEntry,
  CrisisState,
  CrisisSignals,
} from './types'
export { createHealthyCrisisState, CRISIS_LEVELS } from './types'

export {
  FIN_ERROR,
  FinanceError,
  LedgerInconsistentError,
  CommitmentOverRealizedError,
  InvalidCrisisTransitionError,
  RestructuringConsequenceRequiredError,
  SandboxPlayerExpenseBlockedError,
  InsufficientCashError,
} from './errors'
export type { FinanceErrorCode } from './errors'

export { UnifiedLedger } from './ledger'
export type {
  PostLedgerTxInput,
  PostLedgerTxResult,
  LedgerSnapshot,
  ReversalPairResult,
} from './ledger'
