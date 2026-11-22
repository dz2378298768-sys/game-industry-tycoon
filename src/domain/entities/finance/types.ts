/**
 * 统一账本领域类型（FIN V0.2 §3）。
 *
 * 重要：本文件在 src/domain/entities/finance/ 独立定义**账本权威扩展类型**，
 * 不覆盖既有 src/domain/entities/transaction.ts（该文件为 KEEP，见实施报告"复用/替换说明"）。
 * 既有 12 类 TransactionCategory / TransactionStatus 枚举原样复用，字段通过
 * finance-compat 适配器双向映射，保证迁移兼容。
 *
 * 金额一律用整数美分（int cents，1 USD = 100 cents），业务值在注释中同时给出。
 */
import type { TransactionCategory, TransactionStatus } from '@domain/enums'

/** 金额（整数美分） */
export type Cents = number

// ===== §3.1 Transaction（账本事实，append-only） =====

/** §3.9 现金流三分 */
export type CashFlowType = 'operating' | 'investing' | 'financing'
/** §3.1 source：自动记账 / 玩家授权 */
export type TransactionSource = 'system_auto' | 'player_authorized'

/**
 * 账本交易（既有 Transaction 的权威扩展形态）。
 * - 除 status / reversedBy（审计标记，posted→reversed 单向）外全部 readonly：append-only。
 * - status 仅审计，**不参与 INV-1 余额求和**（F-01 方案 a）。
 * - amountCents 正=流入、负=流出，非零整数。
 */
export interface LedgerTransaction {
  readonly transactionId: string
  readonly idempotencyKey: string
  readonly companyId: string
  readonly day: number
  readonly category: TransactionCategory
  readonly cashFlowType: CashFlowType
  readonly amountCents: Cents
  readonly balanceAfterCents: Cents
  readonly referenceId: string | null
  readonly source: TransactionSource
  readonly description: string
  status: TransactionStatus
  reversedBy: string | null
  readonly reversalOf: string | null
  readonly postedAt: number
}

// ===== §3.2 LedgerAccount（账本现金账户，权威） =====

/**
 * 账本账户。cashBalanceCents 为**派生只读**（类型 readonly + 无写 API），
 * 唯一写路径是 UnifiedLedger 依据 Transaction 重算；业务/UI 不得直接赋值（F-10 / BR-1）。
 *
 * 全部字段 readonly（A-3）：`registerCompany` 内部维护 openedAt / sandbox 状态，
 * 本快照仅作投影，没有任何可变句柄留给调用方。
 */
export interface LedgerAccount {
  readonly ledgerAccountId: string
  readonly companyId: string
  readonly currency: 'USD'
  readonly cashBalanceCents: Cents
  readonly accountType: 'operating_cash'
  readonly openedAt: number
  readonly state: 'active' | 'frozen' | 'closed'
}

// ===== §3.3 BudgetCommitment（承诺支出，F-02） =====

export type CommitmentSourceType =
  | 'employment_salary'
  | 'office_rent'
  | 'project_budget'
  | 'contract_obligation'
export type CommitmentPeriod = 'monthly' | 'one_off'
export type CommitmentState = 'committed' | 'partially_realized' | 'realized' | 'cancelled'

/** §4.1 / ADJ-2026-11-22-05 §3.1：取消生效期（YYYY-MM）。 */
export type MonthKey = string

/**
 * 预算承诺。承诺本身永不改变现金（BR-3）；只有兑现事件提交 Transaction 才改现金。
 * totalPlannedCents = amountCents × periodCount 于创建时固化，是 realizedCents 的累计上限。
 *
 * 取消生效期（ADJ-2026-11-22-05 §3，CODE-04 / FIN-INT-01）：
 * - `cancelEffectiveMonth`：中途取消的生效月（YYYY-MM），null 表示未设置。
 * - `releasedPeriods` / `releasedCents`：被释放的周期数与金额（已入账部分不冲回）。
 * - `cancelledAtPeriods`：取消时**已被计入已兑现**的周期数，供一致性自检
 *   （`cancelledAtPeriods + releasedPeriods == periodCount`）；未取消为 null。
 */
export interface BudgetCommitment {
  readonly commitmentId: string
  readonly companyId: string
  readonly sourceType: CommitmentSourceType
  readonly sourceRef: string
  readonly amountCents: Cents
  readonly period: CommitmentPeriod
  readonly periodCount: number
  readonly totalPlannedCents: Cents
  readonly startAt: number
  readonly endAt: number
  realizedCents: Cents
  state: CommitmentState
  linkedTxIds: string[]
  cancelEffectiveMonth: MonthKey | null
  releasedPeriods: number
  releasedCents: Cents
  cancelledAtPeriods: number | null
}

/**
 * 取消结果（ADJ-2026-11-22-05 §3.2）。
 * 恒等式：`realizedCents + releasedCents == 原承诺 totalPlannedCents`；
 * `realizedPeriods + releasedPeriods == 原 periodCount`。
 */
export interface CancelCommitmentResult {
  /** 生效月之前的**已兑现**周期数（不冲回）。 */
  readonly realizedPeriods: number
  /** 生效月及之后**被释放**的周期数。 */
  readonly releasedPeriods: number
  /** 已兑现金额（由原承诺结构读取，不由调用方传入）。 */
  readonly realizedCents: Cents
  /** 释放金额。 */
  readonly releasedCents: Cents
  readonly effectiveMonth: MonthKey
  /** 更新后的承诺快照（state='cancelled'，含取消溯源字段）。 */
  readonly commitment: BudgetCommitment
}

// ===== §3.4 Payable / Receivable（应付 / 应收） =====

export type SettlementDirection = 'payable' | 'receivable'
export type SettlementState = 'open' | 'partially_settled' | 'settled' | 'written_off' | 'overdue'

/** 应收应付是跟踪/预测对象，不是现金（BR-4）；同一义务只允许一次成功结算。 */
export interface PayableReceivable {
  readonly itemId: string
  readonly direction: SettlementDirection
  readonly companyId: string
  readonly counterpartyId: string | null
  readonly amountCents: Cents
  readonly dueDate: number
  readonly sourceRef: string
  settledCents: Cents
  state: SettlementState
  settlementTxIds: string[]
}

// ===== §3.5 CashForecast（派生只读） =====

export interface ForecastFlowItem {
  readonly month: string // YYYY-MM
  readonly amountCents: Cents
  readonly source: string
  readonly confidence: number
}

export interface NetCashBand {
  readonly month: string // YYYY-MM
  readonly expectedCents: Cents
  readonly lowCents: Cents
  readonly highCents: Cents
}

export interface CashForecast {
  readonly forecastId: string
  readonly companyId: string
  readonly asOfDate: number
  readonly horizonMonths: number
  projectedInflows: ForecastFlowItem[]
  projectedOutflows: ForecastFlowItem[]
  netCashByMonth: NetCashBand[]
  runwayMonths: number
  lowCashDate: string | null
  readonly derivedFrom: {
    commitmentsVersion: string
    assumptionsVersion: string
    formulaVersion: string
  }
}

// ===== §3.6 / §3.7 / §3.8 CrisisState（危机状态，F-07 / F-09） =====

export type CrisisLevel =
  | 'healthy'
  | 'watch'
  | 'warning'
  | 'critical'
  | 'restructuring'
  | 'bankrupt'
  | 'sandbox_observe'

/** §3.7 全部危机等级（读档合法性校验用）。 */
export const CRISIS_LEVELS: readonly CrisisLevel[] = [
  'healthy', 'watch', 'warning', 'critical', 'restructuring', 'bankrupt', 'sandbox_observe',
]

export type CrisisReasonCode =
  | 'LOW_RUNWAY'
  | 'LOW_CASH'
  | 'COMMITTED_EXCEEDS_CASH'
  | 'PAYABLE_OVERDUE'
  | 'NEGATIVE_CASH'
  | 'BUDGET_OVERRUN'
  | 'REWORK_SUNK'

/** §8.4 补救动作 */
export type Remedy =
  | 'descope'
  | 'pause_project'
  | 'cut_staff'
  | 'sublet_office'
  | 'terminate_contract'
  | 'sell_asset'
  | 'advance'
  | 'restructure'

export type ControlChange = 'none' | 'reduced' | 'shared'

/** §8.5 重整后果结构（至少一项非零/非空，TC-14） */
export interface AssetChange {
  readonly assetRef: string
  readonly deltaCents: Cents
  readonly description: string
}

export interface RestructuringConsequences {
  debtCents: Cents
  assetChanges: AssetChange[]
  reputationDelta: number
  talentLoss: number
  controlChange: ControlChange
  summary: string
}

export interface CrisisHistoryEntry {
  readonly from: CrisisLevel
  readonly to: CrisisLevel
  readonly at: number
  readonly reason: string
}

/** 危机态以持久化为准（F-09），crisisRulesVersion 随存用于读档一致性回放。 */
export interface CrisisState {
  readonly crisisId: string
  readonly companyId: string
  state: CrisisLevel
  reasonCodes: CrisisReasonCode[]
  enteredAt: number
  remediationWindowDays: number
  remediationDeadline: number | null
  availableRemedies: Remedy[]
  restructuringConsequences: RestructuringConsequences | null
  phase: 'restructuring' | 'winddown' | null
  readonly crisisRulesVersion: string
  history: CrisisHistoryEntry[]
}

/** 危机判定输入信号（由账本派生视图 + 上游只读消费计算，非随机）。 */
export interface CrisisSignals {
  readonly cashBalanceCents: Cents
  readonly availableCashCents: Cents
  readonly runwayMonths: number
  readonly hasOverduePayable: boolean
  readonly budgetOverrunRatio: number
  readonly hasReworkSunk: boolean
  readonly today: number
}

/** 产生初始健康危机态；由调用方注入 id / version / 日期。 */
export function createHealthyCrisisState(params: {
  crisisId: string
  companyId: string
  atDay: number
  remediationWindowDays: number
  crisisRulesVersion: string
  availableRemedies: Remedy[]
}): CrisisState {
  return {
    crisisId: params.crisisId,
    companyId: params.companyId,
    state: 'healthy',
    reasonCodes: [],
    enteredAt: params.atDay,
    remediationWindowDays: params.remediationWindowDays,
    remediationDeadline: null,
    availableRemedies: [...params.availableRemedies],
    restructuringConsequences: null,
    phase: null,
    crisisRulesVersion: params.crisisRulesVersion,
    history: [],
  }
}
