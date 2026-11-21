/**
 * FIN V0.2 §6.1–§6.4：跑道 / 可用现金 / 预测三带 / 预警阈值公式。
 *
 * 纪律：公式层禁止直接读取 TUNING 全局值，所有参数来自调用方注入的 FinanceTuning 快照。
 * F-04：CumAvailable(0) = AvailableCash；小数插值消除歧义。
 * F-05：三带统一含应付，系数方向固定，low ≤ expected ≤ high。
 */
import type {
  BudgetCommitment,
  CashForecast,
  NetCashBand,
  ForecastFlowItem,
  PayableReceivable,
} from '@domain/entities/finance'
import { committedBurnForMonth, monthKeyOf, remainingPlannedCents } from './finance-commitment'
import type { FinanceTuning } from './finance-tuning'

/** 高置信应收输入（FIN-T2：confidence 可注入，不写死）。 */
export type ReceivableInput = PayableReceivable & { confidence?: number }

export interface AvailableCashInput {
  cashBalanceCents: number
  commitments: ReadonlyArray<BudgetCommitment>
  payables: ReadonlyArray<PayableReceivable>
  receivables: ReadonlyArray<ReceivableInput>
}

/**
 * §6.2 AvailableCash = 账面现金 − 未兑现承诺 − 未结算应付 (+ 高置信应收，FIN-T2 可选)。
 * 这是玩家"真正能动用的钱"；同时是 §6.1 CumAvailable(0) 的起点。
 */
export function computeAvailableCash(input: AvailableCashInput, tuning: FinanceTuning): number {
  let available = input.cashBalanceCents
  for (const c of input.commitments) {
    if (c.state !== 'cancelled') available -= remainingPlannedCents(c)
  }
  for (const p of input.payables) {
    if (p.state !== 'settled' && p.state !== 'written_off') {
      available -= Math.max(0, p.amountCents - p.settledCents)
    }
  }
  if (tuning.includeHighConfidenceReceivables) {
    for (const r of input.receivables) {
      if (r.state === 'written_off') continue
      if ((r.confidence ?? 0) >= tuning.highConfidenceMin) {
        available += Math.max(0, r.amountCents - r.settledCents)
      }
    }
  }
  return available
}

export interface RunwayInput {
  availableCashCents: number
  commitments: ReadonlyArray<BudgetCommitment>
  /** 每月流入（应收到期 + 预计销售，已按 confidence 折减）。 */
  expectedInflowsByMonth: ReadonlyArray<{ month: string; amountCents: number }>
  horizonMonths: number
  /** 预测首月（YYYY-MM）；缺省时取 expectedInflowsByMonth 首月或 1970-01。 */
  startMonth?: string | undefined
}

/**
 * §6.1 跑道月数：CumAvailable(m)=AvailableCash−ΣNetBurn_i，NetBurn=max(0,CommittedBurn−ExpectedIn)。
 * 首次 crossing 做小数插值；窗口内不 crossing 返回 +∞。
 */
export function computeRunwayMonths(input: RunwayInput): number {
  if (input.availableCashCents <= 0) return 0
  const inflow = new Map(input.expectedInflowsByMonth.map((x) => [x.month, x.amountCents]))
  const anchor = input.startMonth ?? input.expectedInflowsByMonth[0]?.month
  let cum = input.availableCashCents
  for (let m = 1; m <= input.horizonMonths; m++) {
    const month = monthKeyFromOffset(anchor, m - 1)
    const committed = committedBurnForMonthAny(input.commitments, month)
    const expected = inflow.get(month) ?? 0
    const netBurn = Math.max(0, committed - expected)
    const prev = cum
    cum = prev - netBurn
    if (cum <= 0) {
      // k = m-1；分母 = prev - cum > 0（netBurn>0）
      return (m - 1) + prev / (prev - cum)
    }
  }
  return Number.POSITIVE_INFINITY
}

/** 无锚点月份时按 1970-01 起算（仅用于纯函数确定性；调用方通常传 expectedInflows 首月）。 */
function monthKeyFromOffset(anchor: string | undefined, offset: number): string {
  const [y, m] = anchor ? anchor.split('-').map(Number) : [1970, 1]
  const base = (y ?? 1970) * 12 + ((m ?? 1) - 1) + offset
  const year = Math.floor(base / 12)
  const month = (base % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function committedBurnForMonthAny(
  commitments: ReadonlyArray<BudgetCommitment>,
  month: string,
): number {
  return committedBurnForMonth(commitments, month)
}

/** §6.4 阈值与滞后带（参数来自注入快照）。 */
export function resolveWarningThresholds(tuning: FinanceTuning): {
  warningCents: number
  recoveryCents: number
  bankruptCents: number
  hysteresisWidthCents: number
} {
  return {
    warningCents: tuning.cashWarningThresholdCents,
    recoveryCents: tuning.cashRecoveryThresholdCents,
    bankruptCents: tuning.cashBankruptThresholdCents,
    hysteresisWidthCents: tuning.cashRecoveryThresholdCents - tuning.cashWarningThresholdCents,
  }
}

export interface ForecastInput {
  forecastId: string
  companyId: string
  asOfDay: number
  cashBalanceCents: number
  horizonMonths: number
  commitments: ReadonlyArray<BudgetCommitment>
  payables: ReadonlyArray<PayableReceivable>
  receivables: ReadonlyArray<ReceivableInput>
  /** 每月预计流入（含应收到期与预计销售），键为 YYYY-MM。 */
  expectedInflowsByMonth: ReadonlyArray<{ month: string; amountCents: number; source?: string; confidence?: number }>
  /** 每月额外应付（如 advance抵扣），键为 YYYY-MM；实际应付另计入 payables.dueDate。 */
  expectedPayablesByMonth?: ReadonlyArray<{ month: string; amountCents: number }>
}

/**
 * §6.3 预测三带：Cash_m(low/expected/high) 均含 CommittedOut 与 ExpectedPayable；
 * 系数方向保证 low ≤ expected ≤ high。lowCashDate 取 low 带首次跌破警告线之月。
 */
export function computeCashForecast(input: ForecastInput, tuning: FinanceTuning): CashForecast {
  const months: string[] = []
  const anchor = input.expectedInflowsByMonth[0]?.month ?? monthKeyOf(input.asOfDay)
  for (let i = 0; i < input.horizonMonths; i++) months.push(monthKeyFromOffset(anchor, i))

  const inflowByMonth = new Map(input.expectedInflowsByMonth.map((x) => [x.month, x.amountCents]))
  const extraPayable = new Map((input.expectedPayablesByMonth ?? []).map((x) => [x.month, x.amountCents]))

  const projectedInflows: ForecastFlowItem[] = input.expectedInflowsByMonth.map((x) => ({
    month: x.month, amountCents: x.amountCents, source: x.source ?? 'expected_sales',
    confidence: x.confidence ?? 1,
  }))
  const projectedOutflows: ForecastFlowItem[] = months.map((month) => ({
    month,
    amountCents: committedBurnForMonth(input.commitments, month) + (extraPayable.get(month) ?? 0),
    source: 'committed_and_payable', confidence: 1,
  }))

  let low = input.cashBalanceCents
  let expected = input.cashBalanceCents
  let high = input.cashBalanceCents
  let lowCashDate: string | null = null
  const netCashByMonth: NetCashBand[] = []

  for (const month of months) {
    const inAmt = inflowByMonth.get(month) ?? 0
    const outAmt = committedBurnForMonth(input.commitments, month)
    const payAmt = payableDueForMonth(input.payables, month) + (extraPayable.get(month) ?? 0)
    low += inAmt * tuning.pInLow - outAmt * tuning.pOutHigh - payAmt * tuning.pPayHigh
    expected += inAmt - outAmt - payAmt
    high += inAmt * tuning.pInHigh - outAmt * tuning.pOutLow - payAmt * tuning.pPayLow
    netCashByMonth.push({
      month,
      lowCents: Math.round(low),
      expectedCents: Math.round(expected),
      highCents: Math.round(high),
    })
    if (lowCashDate === null && low < tuning.cashWarningThresholdCents) lowCashDate = month
  }

  const availableCash = computeAvailableCash(input, tuning)
  return {
    forecastId: input.forecastId,
    companyId: input.companyId,
    asOfDate: input.asOfDay,
    horizonMonths: input.horizonMonths,
    projectedInflows,
    projectedOutflows,
    netCashByMonth,
    runwayMonths: computeRunwayMonths({
      availableCashCents: availableCash,
      commitments: input.commitments,
      expectedInflowsByMonth: input.expectedInflowsByMonth,
      horizonMonths: input.horizonMonths,
      startMonth: months[0],
    }),
    lowCashDate,
    derivedFrom: {
      commitmentsVersion: 'commitments-as-of-day',
      assumptionsVersion: tuning.assumptionsVersion,
      formulaVersion: tuning.formulaVersion,
    },
  }
}

function payableDueForMonth(payables: ReadonlyArray<PayableReceivable>, month: string): number {
  let sum = 0
  for (const p of payables) {
    if (p.direction !== 'payable') continue
    if (p.state === 'settled' || p.state === 'written_off') continue
    if (monthKeyOf(p.dueDate) === month) sum += Math.max(0, p.amountCents - p.settledCents)
  }
  return sum
}
