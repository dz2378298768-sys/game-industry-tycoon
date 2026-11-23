/**
 * D-03 薪资 → 账本（规格 §6.3 / §7.2 / §0.6 ADJ-2026-11-22-09；TASK-P1-CODE-06）。
 *
 * 统一规则（唯一边界口径）：某自然月内只要有 ≥1 天在职，该月即计 1 个完整周期、全额兑现。
 * 停付唯一入口：cancelCommitment(salaryCommitment, effectiveMonth = monthOf(endDay) + 1)
 * —— 自离职月次月起停，离职当月照常兑现。
 *
 * 红线 R-D03-3：D-03 从不调用 postTransaction；只创建/取消承诺；兑现由 FIN
 * realizeCommitment 完成（幂等键 <commitmentId>:<YYYY-MM>，月薪唯一产出点）。
 * 停付判据唯一（D03-43）：settleCommitment / realizeCommitment 只累积兑现金额，不判定停付。
 */
import type { BudgetCommitment, CommitmentSourceType, UnifiedLedger } from '@domain/entities/finance'
import { realizeCommitment } from './finance-commitment'
import { dayIndexToGregorian, daysInMonth, gregorianToDayIndex } from './day-index'
import { monthKeyOf } from './finance-commitment'
import { contractEndDayOf } from './personnel-status'
import type { Employment, Person } from '@domain/entities/personnel'
import type { PersonnelParams } from './personnel-tuning'

// ===== 承诺构建（§7.2 原式） =====

export interface CommitmentBuildInput {
  commitmentId: string
  companyId: string
  sourceType: CommitmentSourceType
  sourceRef: string
  amountCents: number
  period: 'monthly' | 'one_off'
  startAt: number
  endAt: number
}

/** 某月首日 dayIndex。 */
export function startOfMonthDay(dayIndex: number): number {
  const g = dayIndexToGregorian(dayIndex)
  return gregorianToDayIndex(g.year, g.month, 1)
}

/** 某月最后一日 dayIndex（settlementDay(m)，§6.9：月 m 最后一个自然日）。 */
export function settlementDayOf(dayIndex: number): number {
  const g = dayIndexToGregorian(dayIndex)
  return gregorianToDayIndex(g.year, g.month, daysInMonth(g.year, g.month))
}

/**
 * 薪资承诺参数（§7.2）：
 *   startAt = startOf(monthOf(startDay))；endAt = 合同期末（endMonth = startMonth + S_months − 1）
 *   ⇒ periodCount = initialTermMonths（可数，OPEN-D03-7 关闭）；totalPlannedCents = 月薪 × 月数。
 */
export function buildSalaryCommitment(employment: Employment): CommitmentBuildInput {
  const startAt = startOfMonthDay(employment.startDay)
  const endAt = contractEndDayOf(employment.startDay, employment.initialTermMonths)
  return {
    commitmentId: employment.salaryCommitmentId,
    companyId: employment.companyId,
    sourceType: 'employment_salary',
    sourceRef: employment.employmentId,
    amountCents: employment.salaryMonthlyCents,
    period: 'monthly',
    startAt,
    endAt,
  }
}

/** 续约 / 调薪的新承诺 id（§7.2：不得改变已固化承诺的 totalPlannedCents，只能新建）。 */
export function renewedSalaryCommitmentId(employmentId: string, renewalCount: number): string {
  return `d03-sal-${employmentId}-r${renewalCount}`
}

/**
 * 停付生效月（ADJ-09 唯一口径）：effectiveMonth = monthOf(endDay) + 1（离职月次月）。
 * 必填、不得默认（FIN-INT-01）；缺省会退化为按创建月取消，把已赚取周期一并释放。
 */
export function cancelEffectiveMonthFor(endDay: number): string {
  const g = dayIndexToGregorian(endDay)
  const nextOrdinal = g.year * 12 + (g.month - 1) + 1
  const nextYear = Math.floor(nextOrdinal / 12)
  const nextMonth = (nextOrdinal % 12) + 1
  return monthKeyOf(gregorianToDayIndex(nextYear, nextMonth, 1))
}

/**
 * 招聘一次性中介费承诺（§6.3 C9 / ADJ-2026-11-22-12 S5-3）：
 * one_off、sourceType=contract_obligation、arrivalDay 兑现一次、幂等键 <commitmentId>:one_off。
 * 金额 = round(negotiatedSalary × recruitFeeMonths)（S5-3 初值 ×1，TUNING）。
 */
export function buildRecruitFeeCommitment(
  employmentId: string,
  companyId: string,
  negotiatedSalaryCents: number,
  arrivalDay: number,
  p: PersonnelParams,
): CommitmentBuildInput {
  return {
    commitmentId: `d03-rec-${employmentId}`,
    companyId,
    sourceType: 'contract_obligation',
    sourceRef: employmentId,
    amountCents: Math.round(negotiatedSalaryCents * p.recruitFeeMonths),
    period: 'one_off',
    startAt: arrivalDay,
    endAt: arrivalDay,
  }
}

/**
 * 遣散承诺（§6.4）：terminated/contract_ended 当日创建并兑现一次；
 * 金额 = 月薪 × severanceMonths ×（probation ? kProbationSeveranceFactor : 1）。
 */
export function buildSeveranceCommitment(
  employment: Employment,
  endDay: number,
  p: PersonnelParams,
): CommitmentBuildInput {
  const factor = employment.status === 'probation' ? p.kProbationSeveranceFactor : 1
  return {
    commitmentId: `d03-sev-${employment.employmentId}`,
    companyId: employment.companyId,
    sourceType: 'contract_obligation',
    sourceRef: employment.employmentId,
    amountCents: Math.round(employment.salaryMonthlyCents * p.severanceMonths * factor),
    period: 'one_off',
    startAt: endDay,
    endAt: endDay,
  }
}

/**
 * §6.5 previewRunwayImpact（只读预览，量纲 = cents，C15）：承诺创建时点新增在途承诺总额。
 * = salary totalPlannedCents + recruitCostCents；不回答"多少笔"（笔数 = periodCount）。
 */
export function previewRunwayImpactCents(salaryTotalPlannedCents: number, recruitCostCents: number): number {
  return salaryTotalPlannedCents + recruitCostCents
}

// ===== 承诺兑现（②流水线，D-03 §6.3 覆盖表：月薪唯一产出点） =====

export interface RealizeOutcome {
  commitment: BudgetCommitment
  txId: string
  idempotent: boolean
  amountCents: number
  periodKey: string
}

/**
 * 兑现一个承诺周期（唯一现金入口 = FIN realizeCommitment；本函数不判停付——D03-43）。
 * `categoryOverride`：D-03 §7.2 指定招聘费 = project_expense、遣散 = severance
 * （FIN 通用映射 contract_obligation → contract_payment 不适用于这两类）。
 */
export function realizeCommitmentFor(
  commitment: BudgetCommitment,
  ledger: UnifiedLedger,
  day: number,
  options: { categoryOverride?: import('@domain/enums').TransactionCategory; description?: string } = {},
): RealizeOutcome | { errorCode: string; errorMessage: string } {
  const r = realizeCommitment({
    commitment,
    ledger,
    day,
    allowNegativeBalance: true,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.categoryOverride !== undefined ? { categoryOverride: options.categoryOverride } : {}),
  })
  if (!r.success || !r.result) {
    return {
      errorCode: r.errorCode ?? 'FIN_COMMITMENT_MISMATCH',
      errorMessage: r.errorMessage ?? 'realize failed',
    }
  }
  // 账面跟踪回写（FIN §4.1）：realizeCommitment 是纯函数（只 post 交易），承诺的
  // realizedCents / linkedTxIds / state 推进由 ledger.settleCommitment 完成（幂等：
  // txId 已在 linkedTxIds ⇒ 不重复累加）。缺这一步，运行期承诺状态与账本永久分叉。
  if (!r.result.idempotent) {
    const settled = ledger.settleCommitment(
      commitment.companyId,
      commitment.commitmentId,
      r.result.amountCents as import('@domain/entities/finance').Cents,
      r.result.transaction.transactionId,
    )
    if (!settled.success || !settled.result) {
      return {
        errorCode: settled.errorCode ?? 'FIN_COMMITMENT_MISMATCH',
        errorMessage: settled.errorMessage ?? 'commitment settlement failed',
      }
    }
  }
  return {
    commitment: r.result.commitment,
    txId: r.result.transaction.transactionId,
    idempotent: r.result.idempotent,
    amountCents: r.result.amountCents,
    periodKey: r.result.periodKey,
  }
}

/** 退休判定（§4.1 每日 tick）：age ≥ retireAge 且无 resigning ⇒ triggerResign(reason='retire')。 */
export function isRetirementDue(person: Person, day: number, retireAge: number): boolean {
  return day - person.birthDay >= retireAge * 365
}
