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
  /** 预测窗口月数；缺省取注入的 tuning.horizonMonths（§6.2 仅扣 horizon 内周期）。 */
  horizonMonths?: number
  /** horizon 起点（YYYY-MM）；缺省取最早承诺起始月。 */
  startMonth?: string | undefined
}

/**
 * §6.2 AvailableCash = 账面现金 − 未兑现承诺（horizon 内） − 未结算应付 (+ 高置信应收，FIN-T2)。
 * 这是玩家"真正能动用的钱"；同时是 §6.1 CumAvailable(0) 的起点。
 * horizon 截断（P2-01）：长周期承诺只扣窗口内剩余周期，不再把窗口外支出提前扣光。
 */
export function computeAvailableCash(input: AvailableCashInput, tuning: FinanceTuning): number {
  let available = input.cashBalanceCents
  const horizon = input.horizonMonths ?? tuning.horizonMonths
  const anchor = input.startMonth ?? earliestCommitmentMonth(input.commitments)
  const windowEnd = anchor === undefined ? undefined : monthKeyFromOffset(anchor, Math.max(0, horizon - 1))
  for (const c of input.commitments) {
    if (c.state === 'cancelled') continue
    available -=
      anchor === undefined || windowEnd === undefined
        ? remainingPlannedCents(c)
        : commitmentRemainingInWindow(c, anchor, windowEnd)
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

/** 最早承诺起始月（horizon 缺省锚点）；无承诺返回 undefined。 */
function earliestCommitmentMonth(commitments: ReadonlyArray<BudgetCommitment>): string | undefined {
  let earliest: string | undefined
  for (const c of commitments) {
    if (c.state === 'cancelled') continue
    const month = monthKeyOf(c.startAt)
    if (earliest === undefined || month < earliest) earliest = month
  }
  return earliest
}

/** YYYY-MM → 连续月序（用于区间重叠计数）。 */
function monthIndex(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return (year ?? 1970) * 12 + ((month ?? 1) - 1)
}

/**
 * 承诺落入 [windowStart, windowEnd] 的未兑现额（FIN §6.2 + 「窗口边界澄清」ADJ-2026-11-22-05 §1）。
 *
 * 口径变化核心：
 *  `endIdx < windowStart` 且仍未兑现 ⇒ **在窗口起点全额扣减**（`amountCents − realizedCents`，
 *  monthly 为 `totalPlannedCents − realizedCents`）。这类承诺已到期、只是还没付，
 *  排除它等于高估可用现金（会让 HRB 放行付不起的预算）——属危险方向，故按方案 a 保守扣。
 *
 * 互斥性（ADJ-05 §1.3 硬要求）：
 *  - "窗口前补扣"分支**直接 return**，绝不进入窗口求交，同一承诺不会被扣两次；
 *  - 有部分兑现的承诺先按真实已兑现周期数 `realizedPeriods` 跳过早期周期，
 *    再与窗口求交——因此"含窗口前的 straddle 承诺"只会扣窗口内尚未兑现的那几期。
 */
function commitmentRemainingInWindow(
  c: BudgetCommitment,
  windowStart: string,
  windowEnd: string,
): number {
  if (c.amountCents <= 0) return 0
  const startIdx = monthIndex(monthKeyOf(c.startAt))
  const endIdx = c.period === 'one_off' ? startIdx : monthIndex(monthKeyOf(c.endAt))
  const windowStartIdx = monthIndex(windowStart)
  // 窗口前已整段结束，但仍有未兑现额 → 全额补扣后返回（与窗口求交互斥）。
  if (endIdx < windowStartIdx) return remainingPlannedCents(c)
  const realizedPeriods = Math.min(c.periodCount, Math.floor(c.realizedCents / c.amountCents))
  const firstOpen = startIdx + realizedPeriods
  const from = Math.max(firstOpen, windowStartIdx)
  const to = Math.min(endIdx, monthIndex(windowEnd))
  const periods = Math.max(0, to - from + 1)
  return Math.min(periods * c.amountCents, remainingPlannedCents(c))
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
 *
 * ⚠ KNOWN-DEFECT `OPEN-F3′`（ADJ-2026-11-22-05 §2，**本函数按裁定不做修正**）：
 * 入参 `availableCashCents` 已扣除 horizon 内全部承诺，而下面又逐月扣 `NetBurn_i`
 * （其 `CommittedBurn_m` 含**同一批**承诺）⇒ 同一承诺被扣两次，跑道系统性偏短
 * （算例：现金 700,000 / 月净烧 100,000 / horizon 6 → 实算 1 个月，真实 7 个月）。
 *
 * 为什么不在这里修：跑道同时驱动危机状态机（warning/bankrupt 阈值）与 UI，
 * 改公式必须与 P2 数值校准一并做，否则会引入阈值错配。
 * 修正方向（已裁定，P2 执行时照此）：让调用方以**未扣承诺的原始现金**作为本函数入参，
 * **不得**放松 `AvailableCash` 的扣除范围（否则 HRB 会放行超额承诺）。
 * 症状已由 `finance-formulas.test.ts` 中 `KNOWN-DEFECT OPEN-F3` 用例锁死，修公式时必须一并改该用例。
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
  /** 预测窗口月数；缺省取 tuning.horizonMonths（P3-02 消除死参数）。 */
  horizonMonths?: number
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
  const horizonMonths = input.horizonMonths ?? tuning.horizonMonths
  const months: string[] = []
  const anchor = input.expectedInflowsByMonth[0]?.month ?? monthKeyOf(input.asOfDay)
  for (let i = 0; i < horizonMonths; i++) months.push(monthKeyFromOffset(anchor, i))

  const inflowByMonth = new Map(input.expectedInflowsByMonth.map((x) => [x.month, x.amountCents]))
  const extraPayable = new Map((input.expectedPayablesByMonth ?? []).map((x) => [x.month, x.amountCents]))

  const projectedInflows: ForecastFlowItem[] = input.expectedInflowsByMonth.map((x) => ({
    month: x.month, amountCents: x.amountCents, source: x.source ?? 'expected_sales',
    confidence: x.confidence ?? 1,
  }))
  const projectedOutflows: ForecastFlowItem[] = months.map((month) => ({
    month,
    // §3.5「含承诺支出、应付到期」：与 netCashByMonth 的 ExpectedPayable 同口径（P2-02）。
    amountCents:
      committedBurnForMonth(input.commitments, month) +
      payableDueForMonth(input.payables, month) +
      (extraPayable.get(month) ?? 0),
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

  const availableCash = computeAvailableCash({
    cashBalanceCents: input.cashBalanceCents,
    commitments: input.commitments,
    payables: input.payables,
    receivables: input.receivables,
    horizonMonths,
    startMonth: months[0],
  }, tuning)
  return {
    forecastId: input.forecastId,
    companyId: input.companyId,
    asOfDate: input.asOfDay,
    horizonMonths,
    projectedInflows,
    projectedOutflows,
    netCashByMonth,
    runwayMonths: computeRunwayMonths({
      availableCashCents: availableCash,
      commitments: input.commitments,
      expectedInflowsByMonth: input.expectedInflowsByMonth,
      horizonMonths,
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
