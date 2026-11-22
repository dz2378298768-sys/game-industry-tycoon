/**
 * §3.3 / §4.1 / §5.3 / §10.3：预算承诺与跨月兑现（F-02）。
 *
 * 硬约束 BR-3：承诺本身永不改变现金；只有兑现事件经 UnifiedLedger.postTransaction
 * 提交 Transaction 才改变现金。monthly 的 periodCount = startAt..endAt 覆盖的不同日历月个数，
 * totalPlannedCents = amountCents × periodCount 于创建时固化；realizedCents 上限为总额。
 */
import type { TransactionCategory } from '@domain/enums'
import type { CommandResult } from '@domain/types'
import { fail, ok } from '@domain/types'
import {
  CommitmentOverRealizedError,
  FinanceError,
  SandboxCommitmentBlockedError,
  FIN_ERROR,
  type BudgetCommitment,
  type CancelCommitmentResult,
  type CommitmentPeriod,
  type CommitmentSourceType,
  type CommitmentState,
  type LedgerTransaction,
  type MonthKey,
  type UnifiedLedger,
} from '@domain/entities/finance'
import { dayIndexToGregorian } from './day-index'

/** YYYY-MM（幂等键月份段；§10.3 每月一笔）。 */
export function monthKeyOf(dayIndex: number): string {
  const d = dayIndexToGregorian(dayIndex)
  return `${d.year}-${String(d.month).padStart(2, '0')}`
}

/** 覆盖的不同日历月个数（含首尾）。endAt < startAt 返回 0（非法）。 */
export function countDistinctMonths(startAt: number, endAt: number): number {
  if (endAt < startAt) return 0
  const s = dayIndexToGregorian(startAt)
  const e = dayIndexToGregorian(endAt)
  const startIndex = s.year * 12 + (s.month - 1)
  const endIndex = e.year * 12 + (e.month - 1)
  return endIndex - startIndex + 1
}

/** 承诺兑现幂等键：monthly 含 <commitmentId>:<YYYY-MM>；one_off 含 :one_off（§10.3）。 */
export function commitmentIdempotencyKey(commitmentId: string, periodKey: string): string {
  return `${commitmentId}:${periodKey}`
}

/** 承诺来源 → 交易类别（§7.1 薪酬/租金/项目/合同入口）。 */
export function commitmentCategory(sourceType: CommitmentSourceType): TransactionCategory {
  switch (sourceType) {
    case 'employment_salary': return 'salary'
    case 'office_rent': return 'office_rent'
    case 'project_budget': return 'project_expense'
    case 'contract_obligation': return 'contract_payment'
  }
}

export interface CreateCommitmentInput {
  commitmentId: string
  companyId: string
  sourceType: CommitmentSourceType
  sourceRef: string
  amountCents: number
  period: CommitmentPeriod
  startAt: number
  endAt: number
}

export interface CreateCommitmentOptions {
  /**
   * P3-07：沙盒守卫来源，**必填**（不再有"不传 options 默认放行"的路径）。
   * 二选一：
   *  - `ledger`：账本绑定模式，直接查询该公司的沙盒观察态（推荐，唯一真值源）；
   *  - `sandboxActive` + `sandboxStateSource`：无账本实例时由调用方显式给出状态并**声明来源**，
   *    迫使调用方说明"这个状态从哪儿来"，而不是忘了传。
   */
  ledger?: Pick<UnifiedLedger, 'isSandboxObserved'>
  sandboxActive?: boolean
  sandboxStateSource?: 'ledger_query' | 'caller_asserted'
}

function resolveSandboxActive(companyId: string, options: CreateCommitmentOptions | undefined): boolean {
  // P3-07：options 在类型层必填；此处仍防御运行期漏传（JS 调用方 / 反序列化路径），一律 fail-loud。
  if (options === undefined) {
    throw new FinanceError(
      FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID,
      `${FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID}: createCommitment requires an options argument ` +
        'with a sandbox guard source ({ ledger } or { sandboxActive, sandboxStateSource })',
    )
  }
  if (options.ledger !== undefined) {
    return options.ledger.isSandboxObserved(companyId) || options.sandboxActive === true
  }
  if (options.sandboxActive !== undefined && options.sandboxStateSource !== undefined) {
    return options.sandboxActive
  }
  throw new FinanceError(
    FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID,
    `${FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID}: createCommitment requires sandbox guard source: ` +
      'pass { ledger } or { sandboxActive, sandboxStateSource }',
  )
}

/**
 * 创建承诺：固化 periodCount / totalPlannedCents；**不提交交易，不改现金**（BR-3）。
 * 沙盒观察态下拒绝新建义务并抛 FIN_SANDBOX_COMMITMENT_BLOCKED（§10.4）。
 *
 * P3-07：`options` 必填且必须携带守卫来源；无守卫调用在类型层面不可能（参数非可选），
 * 运行期缺来源亦 fail-loud（抛 FIN_COMMITMENT_SETTLEMENT_INVALID），不存在"默认放行"。
 */
export function createCommitment(
  input: CreateCommitmentInput,
  options: CreateCommitmentOptions,
): BudgetCommitment {
  const sandboxActive = resolveSandboxActive(input.companyId, options)
  if (sandboxActive) throw new SandboxCommitmentBlockedError(input.companyId)
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new CommitmentOverRealizedError(input.commitmentId, 0, input.amountCents, 0)
  }
  const periodCount = input.period === 'one_off' ? 1 : countDistinctMonths(input.startAt, input.endAt)
  if (periodCount < 1) {
    throw new CommitmentOverRealizedError(input.commitmentId, 0, 0, 0)
  }
  return {
    commitmentId: input.commitmentId,
    companyId: input.companyId,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    amountCents: input.amountCents,
    period: input.period,
    periodCount,
    totalPlannedCents: input.amountCents * periodCount,
    startAt: input.startAt,
    endAt: input.endAt,
    realizedCents: 0,
    state: 'committed',
    linkedTxIds: [],
    cancelEffectiveMonth: null,
    releasedPeriods: 0,
    releasedCents: 0,
    cancelledAtPeriods: null,
  }
}

/** 分周期状态判定（§4.1 F-02）：monthly 仅全部周期兑现才为 realized。 */
export function deriveCommitmentState(c: BudgetCommitment): CommitmentState {
  if (c.state === 'cancelled') return 'cancelled'
  const cap = c.period === 'monthly' ? c.totalPlannedCents : c.amountCents
  if (c.realizedCents <= 0) return 'committed'
  if (c.realizedCents >= cap) return 'realized'
  return 'partially_realized'
}

/** 承诺剩余未兑现额（§6.2 AvailableCash 扣除项）。 */
export function remainingPlannedCents(c: BudgetCommitment): number {
  return Math.max(0, c.totalPlannedCents - c.realizedCents)
}

/** 某日历月的承诺支出合计（§6.1 CommittedBurn_m）。 */
export function committedBurnForMonth(
  commitments: ReadonlyArray<BudgetCommitment>,
  monthKey: string,
): number {
  let sum = 0
  for (const c of commitments) {
    if (c.state === 'cancelled') continue
    if (c.period === 'monthly' && monthKey >= monthKeyOf(c.startAt) && monthKey <= monthKeyOf(c.endAt)) {
      sum += c.amountCents
    } else if (c.period === 'one_off' && monthKey === monthKeyOf(c.startAt)) {
      sum += c.amountCents
    }
  }
  return sum
}

/** YYYY-MM → 连续月序（与 finance-formulas 同口径，避免跨文件重复实现漂移）。 */
function monthOrdinal(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return (year ?? 1970) * 12 + ((month ?? 1) - 1)
}

/**
 * 取消承诺（FIN §4.1 / §10.3 + ADJ-2026-11-22-05 §3 / FIN-INT-01）。
 *
 * 语义：**只停止未来周期兑现，已入账不冲回**；不产生 Transaction、不改现金。
 * `effectiveMonth`（YYYY-MM）**必填、无默认值**——缺省会退化成立即全额释放，
 * 把已付周期一并"释放"，是最危险的误用，故交由类型系统强制。
 *
 * - `effectiveMonth` 早于承诺起始月 ⇒ 全额释放（realizedPeriods=0）。
 * - `effectiveMonth` 晚于承诺结束月 ⇒ 全额已兑现（releasedPeriods=0）。
 * - 其余 ⇒ 生效月之前的周期为"已兑现"（其中已有交易的部分计入 realizedCents），
 *   生效月及之后的周期一律释放。
 * - 恒等式：`realizedCents + releasedCents == totalPlannedCents`，
 *   `realizedPeriods + releasedPeriods == periodCount`。
 */
export function cancelCommitment(
  c: BudgetCommitment,
  effectiveMonth: MonthKey,
): CancelCommitmentResult {
  const startIdx = monthOrdinal(monthKeyOf(c.startAt))
  const effIdx = monthOrdinal(effectiveMonth)

  const realizedPeriods = Math.min(c.periodCount, Math.max(0, effIdx - startIdx))
  const releasedPeriods = c.periodCount - realizedPeriods
  const realizedCents = Math.min(c.totalPlannedCents, realizedPeriods * c.amountCents)
  const releasedCents = c.totalPlannedCents - realizedCents

  const commitment: BudgetCommitment = {
    ...c,
    state: 'cancelled',
    // 生效期之前的周期视为已兑现：realizedCents 不得低于该口径（已记账部分本就在其中）。
    realizedCents: Math.max(c.realizedCents, realizedCents),
    cancelEffectiveMonth: effectiveMonth,
    releasedPeriods,
    releasedCents,
    cancelledAtPeriods: realizedPeriods,
  }
  return {
    realizedPeriods,
    releasedPeriods,
    realizedCents,
    releasedCents,
    effectiveMonth,
    commitment,
  }
}

export interface RealizeCommitmentInput {
  commitment: BudgetCommitment
  ledger: UnifiedLedger
  day: number
  allowNegativeBalance?: boolean
  source?: 'system_auto' | 'player_authorized'
  description?: string
}

export interface RealizeCommitmentResult {
  commitment: BudgetCommitment
  transaction: LedgerTransaction
  idempotent: boolean
  amountCents: number
  periodKey: string
}

/**
 * 兑现一个周期：经唯一现金入口提交一笔交易，追加 linkedTxIds 并累加 realizedCents。
 * 重复兑现（同 id 同月）命中幂等键 → 返回原交易，承诺不更新（不双算）。
 */
export function realizeCommitment(input: RealizeCommitmentInput): CommandResult<RealizeCommitmentResult> {
  const c = input.commitment
  if (c.state === 'cancelled') {
    return fail(FIN_ERROR.COMMITMENT_MISMATCH, `Commitment ${c.commitmentId} is cancelled`)
  }
  if (c.period === 'monthly') {
    if (input.day < c.startAt || input.day > c.endAt) {
      return fail(FIN_ERROR.COMMITMENT_MISMATCH, `Day ${input.day} outside commitment window`)
    }
  }
  const periodKey = c.period === 'monthly' ? monthKeyOf(input.day) : 'one_off'
  const key = commitmentIdempotencyKey(c.commitmentId, periodKey)

  const existing = input.ledger.getTransactionByKeyInCompany(c.companyId, key)
  if (existing) {
    return ok({
      commitment: c, transaction: existing, idempotent: true,
      amountCents: Math.abs(existing.amountCents), periodKey,
    })
  }

  if (c.realizedCents + c.amountCents > c.totalPlannedCents) {
    throw new CommitmentOverRealizedError(c.commitmentId, c.realizedCents, c.amountCents, c.totalPlannedCents)
  }

  const posted = input.ledger.postTransaction({
    idempotencyKey: key,
    companyId: c.companyId,
    day: input.day,
    category: commitmentCategory(c.sourceType),
    amountCents: -c.amountCents, // 承诺支出为流出
    description: input.description ?? `兑现承诺 ${c.commitmentId} ${periodKey}`,
    referenceId: c.commitmentId,
    source: input.source ?? 'system_auto',
  }, { allowNegativeBalance: input.allowNegativeBalance ?? true })
  if (!posted.success || !posted.result) {
    return fail(posted.errorCode ?? FIN_ERROR.COMMITMENT_MISMATCH, posted.errorMessage ?? 'realize failed')
  }

  const realizedCents = c.realizedCents + c.amountCents
  const updated: BudgetCommitment = {
    ...c,
    realizedCents,
    linkedTxIds: [...c.linkedTxIds, posted.result.transaction.transactionId],
    state: deriveCommitmentState({ ...c, realizedCents }),
  }
  return ok({
    commitment: updated, transaction: posted.result.transaction,
    idempotent: false, amountCents: c.amountCents, periodKey,
  })
}
