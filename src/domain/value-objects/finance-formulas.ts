/**
 * FIN V0.2 §6.1–§6.4：跑道 / 可用现金 / 预测三带 / 预警阈值公式。
 *
 * 纪律：公式层禁止直接读取 TUNING 全局值，所有参数来自调用方注入的 FinanceTuning 快照。
 * ADJ-11（formulaVersion v0.3）：RunwayMonths 起点恒为 CashBalance（账面现金），
 * 支出侧承诺经 inclusionMode（in_forecast / reserved_only / excluded）计入恰好一次；
 * AvailableCash 扣除范围不变（R-2 红线）。F-04 的 CumAvailable(0)=AvailableCash 口径已被本裁定取代。
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
    // 已取消承诺（R3）：只扣"已赚取但尚未 post"的差额，未兑现的未来周期不计。
    // `releasedCents` 只是**被释放的未来周期金额**（`releasedPeriods × amountCents`），
    // "已赚取但尚未 post"的一期不在其中，故差额恰为该期金额；补记后 `realizedCents` 上升、差额归零，
    // 不会重复扣。**不得**整体跳过——否则"钱还没付却已不算占用"，会高估可用现金（危险方向）。
    if (c.state === 'cancelled') {
      available -= Math.max(0, c.totalPlannedCents - c.realizedCents - c.releasedCents)
      continue
    }
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

/**
 * 支出侧承诺的 inclusionMode 三态（ADJ-11 §2.1，R-2/R-3）：
 * 每项未来支出在现金流预测构建处显式标注，同一笔承诺在 runway 支出侧计**恰好一次**。
 *  - `in_forecast`：经现金流预测表（netCashByMonth 同源）逐月计；
 *    调用方不得再从承诺表重加。
 *  - `reserved_only`：预测表不覆盖、但确将发生的支出（已取消承诺的已赚取未兑现差额、
 *    窗口前已到期未兑现额），经承诺表补加恰好一次。
 *  - `excluded`：整段在预测窗口之后，窗口内不计。
 */
export type CommitmentInclusionMode = 'in_forecast' | 'reserved_only' | 'excluded'

/** 带显式 inclusionMode 标注的承诺（runway 输入契约）。 */
export interface AnnotatedCommitment extends BudgetCommitment {
  inclusionMode: CommitmentInclusionMode
}

/**
 * 逐项判定 inclusionMode（ADJ-11 §2.1；与 computeAvailableCash 的窗口口径一致）。
 *  - 已取消 → reserved_only：committedBurnForMonth 跳过 cancelled，其已赚取未兑现差额
 *    （`total − realized − released`，与 AvailableCash R3 扣除口径一致）只经承诺表补加一次；
 *  - 窗口内尚有未兑现周期 → in_forecast（经预测表逐月计）；
 *  - 整段已结束于窗口起点之前且仍有未兑现额 → reserved_only（P3-04 补扣，口径同 AvailableCash）；
 *  - 其余（整段在窗口之后）→ excluded。
 */
export function classifyCommitmentInclusion(
  c: BudgetCommitment,
  windowStart: string,
  windowEnd: string,
): CommitmentInclusionMode {
  if (c.state === 'cancelled') return 'reserved_only'
  const startIdx = monthIndex(monthKeyOf(c.startAt))
  const endIdx = c.period === 'one_off' ? startIdx : monthIndex(monthKeyOf(c.endAt))
  const wStart = monthIndex(windowStart)
  const wEnd = monthIndex(windowEnd)
  if (endIdx >= wStart && startIdx <= wEnd) return 'in_forecast'
  if (endIdx < wStart && remainingPlannedCents(c) > 0) return 'reserved_only'
  return 'excluded'
}

/** 现金流预测构建处（computeCashForecast）：为每项承诺显式标注 inclusionMode。 */
export function annotateCommitmentsForRunway(
  commitments: ReadonlyArray<BudgetCommitment>,
  windowStart: string,
  windowEnd: string,
): AnnotatedCommitment[] {
  return commitments.map((c) => ({
    ...c,
    inclusionMode: classifyCommitmentInclusion(c, windowStart, windowEnd),
  }))
}

/** reserved_only 的补加额（恰一次；口径与 computeAvailableCash 对应分支一致）。 */
function reservedExpenseForRunway(c: AnnotatedCommitment): number {
  if (c.state === 'cancelled') {
    return Math.max(0, c.totalPlannedCents - c.realizedCents - c.releasedCents)
  }
  return remainingPlannedCents(c)
}

/**
 * in_forecast 承诺在窗口月份 m 的预测表支出：在期内的每期计 amountCents，
 * 但**已 post 的周期不计**（其金额已含在账本 CashBalance 中；period 按 startAt 起的月序兑现）。
 * 与 committedBurnForMonth 同源同窗口，仅多扣已兑现周期，避免"已付 + 预测"重复。
 */
function inForecastBurnForMonth(c: BudgetCommitment, month: string): number {
  if (c.amountCents <= 0) return 0
  const startIdx = monthIndex(monthKeyOf(c.startAt))
  const endIdx = c.period === 'one_off' ? startIdx : monthIndex(monthKeyOf(c.endAt))
  const mIdx = monthIndex(month)
  if (mIdx < startIdx || mIdx > endIdx) return 0
  const realizedPeriods = Math.min(c.periodCount, Math.floor(c.realizedCents / c.amountCents))
  if (mIdx - startIdx < realizedPeriods) return 0
  return c.amountCents
}

export interface RunwayInput {
  /**
   * R-2：起点 = 账本 CashBalance（ΣamountCents），**不是** AvailableCash。
   * AvailableCash 已扣 horizon 内承诺，若再以其为起点并逐月扣 NetBurn，
   * 同一承诺会被计两次（OPEN-F3′ 缺陷本体，ADJ-11 修复）。
   */
  cashBalanceCents: number
  /** 每项承诺必须显式标注 inclusionMode（由 annotateCommitmentsForRunway 生成）。 */
  commitments: ReadonlyArray<AnnotatedCommitment>
  /** 每月流入（应收到期 + 预计销售，已按 confidence 折减）。 */
  expectedInflowsByMonth: ReadonlyArray<{ month: string; amountCents: number }>
  horizonMonths: number
  /** 预测首月（YYYY-MM）；缺省时取 expectedInflowsByMonth 首月或 1970-01。 */
  startMonth?: string | undefined
}

/**
 * §6.1 跑道月数（ADJ-11 修复后口径）：
 * 起点 = CashBalance − Σ(reserved_only 补加额)；逐月扣
 * NetBurn_m = max(0, Σ(in_forecast 预测表支出) − ExpectedIn_m)。
 * 同一笔承诺按 inclusionMode 计恰好一次：
 *  - in_forecast 经预测表逐月计（与 netCashByMonth 同源，不从承诺表重加）；
 *  - reserved_only 经承诺表补加一次（预测表不覆盖）；
 *  - excluded 不计。
 * 首次 crossing 做小数插值；窗口内不 crossing 返回 +∞。
 */
export function computeRunwayMonths(input: RunwayInput): number {
  let cum = input.cashBalanceCents
  for (const c of input.commitments) {
    if (c.inclusionMode === 'reserved_only') cum -= reservedExpenseForRunway(c)
  }
  if (cum <= 0) return 0
  const inflow = new Map(input.expectedInflowsByMonth.map((x) => [x.month, x.amountCents]))
  const anchor = input.startMonth ?? input.expectedInflowsByMonth[0]?.month
  for (let m = 1; m <= input.horizonMonths; m++) {
    const month = monthKeyFromOffset(anchor, m - 1)
    let committed = 0
    for (const c of input.commitments) {
      if (c.inclusionMode === 'in_forecast') committed += inForecastBurnForMonth(c, month)
    }
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

  return {
    forecastId: input.forecastId,
    companyId: input.companyId,
    asOfDate: input.asOfDay,
    horizonMonths,
    projectedInflows,
    projectedOutflows,
    netCashByMonth,
    runwayMonths: computeRunwayMonths({
      cashBalanceCents: input.cashBalanceCents,
      // R-2/R-3：在预测构建处为每项承诺显式标注 inclusionMode，
      // in_forecast 经预测表（netCashByMonth 同源）逐月计，不从承诺表重加；
      // reserved_only（已取消差额 / 窗口前到期未兑现）经承诺表补加恰好一次。
      commitments: annotateCommitmentsForRunway(
        input.commitments, months[0]!, months[months.length - 1]!,
      ),
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
