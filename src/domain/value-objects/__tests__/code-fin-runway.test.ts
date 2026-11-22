/**
 * CODE-FIN-RUNWAY（ADJ-11）：跑道双重扣减修复 + inclusionMode 三态 + 危机阈值重标定。
 *
 * 语义权威：ADJ-11 §2 三概念分离（CashBalance / AvailableCash / RunwayMonths）、
 * §2.1 inclusionMode 三态、INV-RUNWAY、§3 R-1~R-6；任务卡 RV-1/2/3。
 *
 * 核心不变量（R-2）：runwayMonths 起点 = CashBalance（账本 ΣamountCents）；
 * 支出侧承诺按 inclusionMode 计恰好一次：
 *  - IN_FORECAST：经现金流预测表（netCashByMonth 同源）逐月计，调用方不得再从承诺表重加；
 *  - RESERVED_ONLY：经承诺表补加恰好一次（预测表不覆盖的已赚取/已到期未兑现额）；
 *  - EXCLUDED：不计。
 * AvailableCash 的扣除范围**不得放松**（HRB 依赖）。
 */
import { describe, it, expect } from 'vitest'
import {
  computeAvailableCash,
  computeCashForecast,
  computeRunwayMonths,
  annotateCommitmentsForRunway,
  classifyCommitmentInclusion,
  type AnnotatedCommitment,
} from '@domain/value-objects/finance-formulas'
import {
  createCommitment,
  cancelCommitment,
} from '@domain/value-objects/finance-commitment'
import {
  DEFAULT_FINANCE_TUNING,
  withFinanceTuningOverrides,
} from '@domain/value-objects/finance-tuning'
import { transitionCrisis } from '@domain/value-objects/finance-crisis'
import {
  createHealthyCrisisState,
  type CrisisSignals,
  type CrisisState,
  type BudgetCommitment,
} from '@domain/entities/finance'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const T = DEFAULT_FINANCE_TUNING
const d = (y: number, m: number, day = 1) => gregorianToDayIndex(y, m, day)

function monthly(
  commitmentId: string,
  amountCents: number,
  start: { y: number; m: number },
  end: { y: number; m: number },
): BudgetCommitment {
  return createCommitment({
    commitmentId, companyId: 'c1', sourceType: 'employment_salary', sourceRef: 'emp-1',
    amountCents, period: 'monthly',
    startAt: d(start.y, start.m), endAt: d(end.y, end.m),
  }, { sandboxActive: false, sandboxStateSource: 'caller_asserted' })
}

/** R-2 口径的直接跑道输入：起点 = CashBalance，承诺逐项显式标注。 */
function runway(
  cashBalanceCents: number,
  commitments: ReadonlyArray<AnnotatedCommitment>,
  horizonMonths: number,
  startMonth = '2026-01',
): number {
  return computeRunwayMonths({
    cashBalanceCents,
    commitments,
    expectedInflowsByMonth: [],
    horizonMonths,
    startMonth,
  })
}

function crisis(at = 0): CrisisState {
  return createHealthyCrisisState({
    crisisId: 'crisis-rv', companyId: 'c1', atDay: at,
    remediationWindowDays: T.remediationWindowDays,
    crisisRulesVersion: T.crisisRulesVersion,
    availableRemedies: ['restructure', 'cut_staff', 'sell_asset', 'advance'],
  })
}

function signals(partial: Partial<CrisisSignals>): CrisisSignals {
  return {
    cashBalanceCents: 1_000_000, availableCashCents: 1_000_000,
    runwayMonths: 12, hasOverduePayable: false, budgetOverrunRatio: 0,
    hasReworkSunk: false, today: 0, ...partial,
  }
}

// ===== RV-1：双重扣减反例（修复前 runway≈1 ≠ 真实 7） =====

describe('RV-1：现金 700,000 / 月净烧 100,000 ⇒ 真实跑道 7.0 个月（ADJ-11 缺陷本体）', () => {
  // 承诺 2026-01..2026-12 每月 100,000；现金 700,000；horizon 12。
  // 修复前：AvailableCash=100,000 再逐月扣 100,000 ⇒ 实算 1.0（同一承诺扣两次）。
  const burn = () => monthly('cm-rv1', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 12 })

  it('computeRunwayMonths 直接调用：起点 CashBalance，承诺恰好计一次 ⇒ 7.0', () => {
    const annotated = annotateCommitmentsForRunway([burn()], '2026-01', '2026-12')
    expect(annotated[0]!.inclusionMode).toBe('in_forecast')
    expect(runway(700_000, annotated, 12)).toBeCloseTo(7.0, 6)
  })

  it('生产路径 computeCashForecast：runwayMonths = 7.0（同一承诺经预测表恰好计一次）', () => {
    const f = computeCashForecast({
      forecastId: 'f-rv1', companyId: 'c1', asOfDay: d(2026, 1), cashBalanceCents: 700_000,
      horizonMonths: 12, commitments: [burn()], payables: [], receivables: [],
      expectedInflowsByMonth: [],
    }, T)
    expect(f.runwayMonths).toBeCloseTo(7.0, 6)
    // netCashByMonth 的 expected 带逐月 −100,000：预测表是该承诺的唯一预测侧载体
    expect(f.netCashByMonth[0]!.expectedCents).toBe(600_000)
    expect(f.netCashByMonth[11]!.expectedCents).toBe(-500_000)
  })

  it('AvailableCash 扣除范围不放松（R-2 禁令）：horizon 6 内扣 6 期 ⇒ 100,000', () => {
    expect(computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [burn()], payables: [], receivables: [],
      horizonMonths: 6, startMonth: '2026-01',
    }, T)).toBe(100_000)
  })

  it('horizon 6 时真实 7 个月在窗口外 → +∞（不因窗口截断而虚报 crossing）', () => {
    const annotated = annotateCommitmentsForRunway([burn()], '2026-01', '2026-06')
    expect(runway(700_000, annotated, 6)).toBe(Number.POSITIVE_INFINITY)
  })
})

// ===== R-5 / INV-RUNWAY：同一承诺四状态，inclusionMode 唯一、支出侧恰好一次 =====

describe('INV-RUNWAY（R-5）：同一承诺 horizon 内 / 外 / 已取消 / 已释放 四状态', () => {
  const WINDOW = { start: '2026-01', end: '2026-06' } as const

  it('horizon 内：in_forecast，AvailableCash 扣窗口内 6 期，runway 侧不再重加', () => {
    const c = monthly('cm-in', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 12 })
    const mode = classifyCommitmentInclusion(c, WINDOW.start, WINDOW.end)
    expect(mode).toBe('in_forecast')
    const annotated = annotateCommitmentsForRunway([c], WINDOW.start, WINDOW.end)
    // 不变量：CashBalance − Σ(扣除) == AvailableCash（无应付/应收）
    const available = computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [c], payables: [], receivables: [],
      horizonMonths: 6, startMonth: WINDOW.start,
    }, T)
    expect(available).toBe(700_000 - 600_000)
    // 支出侧恰好一次：horizon 12 下 crossing = 7.0（双重计会得 1.0）
    expect(runway(700_000, annotated, 12)).toBeCloseTo(7.0, 6)
  })

  it('horizon 外：excluded 不计，AvailableCash 不扣、runway 不烧', () => {
    const c = monthly('cm-out', 100_000, { y: 2026, m: 7 }, { y: 2026, m: 12 })
    expect(classifyCommitmentInclusion(c, WINDOW.start, WINDOW.end)).toBe('excluded')
    expect(computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [c], payables: [], receivables: [],
      horizonMonths: 6, startMonth: WINDOW.start,
    }, T)).toBe(700_000)
    const annotated = annotateCommitmentsForRunway([c], WINDOW.start, WINDOW.end)
    expect(runway(700_000, annotated, 6)).toBe(Number.POSITIVE_INFINITY)
  })

  it('已取消（含已赚取未兑现差额）：reserved_only 经承诺表补加恰好一次', () => {
    // 6 期 × 100,000；取消生效 2026-03：Jan/Feb 已赚取但未 post（200,000），Mar..Jun 释放（400,000）。
    const base = monthly('cm-cancel', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 6 })
    const { commitment: cancelled } = cancelCommitment(base, '2026-03')
    expect(cancelled.releasedCents).toBe(400_000)
    expect(cancelled.realizedCents).toBe(0)

    expect(classifyCommitmentInclusion(cancelled, WINDOW.start, WINDOW.end)).toBe('reserved_only')
    // AvailableCash 扣除已赚取未兑现的 200,000（R3 口径，不得放松）
    const available = computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [cancelled], payables: [], receivables: [],
      horizonMonths: 6, startMonth: WINDOW.start,
    }, T)
    expect(available).toBe(500_000)
    // 不变量：CashBalance − Σ(扣除) == AvailableCash
    expect(700_000 - 200_000).toBe(available)
    // 支出侧恰好一次：起点 700,000 − 200,000（承诺表补加一次）= 500,000；
    // 并置一个 in_forecast 活跃承诺（100,000×6，经预测表逐月计）⇒ crossing 恰在 5.0；
    // 若 cancelled 又被逐月计入预测表（双重计），crossing 会早于 5.0。
    const active = monthly('cm-other', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 6 })
    const annotated = annotateCommitmentsForRunway([cancelled, active], WINDOW.start, WINDOW.end)
    expect(annotated[0]!.inclusionMode).toBe('reserved_only')
    expect(annotated[1]!.inclusionMode).toBe('in_forecast')
    expect(runway(700_000, annotated, 6)).toBeCloseTo(5.0, 6)
  })

  it('已释放（全部未来周期释放、无已赚取未兑现额）：reserved_only 但补加额为 0', () => {
    const base = monthly('cm-released', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 6 })
    const { commitment: released } = cancelCommitment(base, '2026-01')
    expect(released.releasedCents).toBe(600_000)
    expect(classifyCommitmentInclusion(released, WINDOW.start, WINDOW.end)).toBe('reserved_only')
    expect(computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [released], payables: [], receivables: [],
      horizonMonths: 6, startMonth: WINDOW.start,
    }, T)).toBe(700_000)
    const annotated = annotateCommitmentsForRunway([released], WINDOW.start, WINDOW.end)
    expect(runway(700_000, annotated, 6)).toBe(Number.POSITIVE_INFINITY)
  })

  it('已到期未兑现（窗口前结束、未 post）：reserved_only 补扣全额，与 AvailableCash 口径一致', () => {
    const c = monthly('cm-due', 100_000, { y: 2025, m: 11 }, { y: 2025, m: 12 })
    expect(classifyCommitmentInclusion(c, WINDOW.start, WINDOW.end)).toBe('reserved_only')
    // AvailableCash 全额补扣 200,000（P3-04 口径，不得放松）
    expect(computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [c], payables: [], receivables: [],
      horizonMonths: 6, startMonth: WINDOW.start,
    }, T)).toBe(500_000)
    const annotated = annotateCommitmentsForRunway([c], WINDOW.start, WINDOW.end)
    // 起点 700,000 − 200,000 = 500,000；窗口内无烧钱 ⇒ +∞，且承诺只计一次
    expect(runway(700_000, annotated, 6)).toBe(Number.POSITIVE_INFINITY)
  })
})

// ===== ADJ-10 O-2 交互：取消承诺后 runway 回升 =====

describe('取消承诺后 runway 回升（ADJ-10 O-2 交互）', () => {
  it('取消前 runway 7.0（finite）；取消生效 2026-07 后未来全释放 ⇒ +∞', () => {
    const base = monthly('cm-o2', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 12 })
    const before = annotateCommitmentsForRunway([base], '2026-01', '2026-12')
    expect(runway(700_000, before, 12)).toBeCloseTo(7.0, 6)

    const { commitment: cancelled } = cancelCommitment(base, '2026-07')
    // Jan..Jun 已赚取未 post（600,000），Jul..Dec 释放（600,000），无剩余差额
    expect(cancelled.releasedCents).toBe(600_000)
    const after = annotateCommitmentsForRunway([cancelled], '2026-01', '2026-12')
    expect(after[0]!.inclusionMode).toBe('reserved_only')
    // 释放的 6 期不再占用；已赚取 600,000 一次性补加：起点 100,000，
    // 预测表不烧（cancelled），crossing 于起点当月 → 0? 不：start>0 且窗口内无 burn ⇒ +∞
    // （已赚取部分已在 AvailableCash/补加中一次性计，不逐月重复）
    expect(runway(700_000, after, 12)).toBe(Number.POSITIVE_INFINITY)
    expect(runway(700_000, after, 12)).toBeGreaterThan(
      runway(700_000, before, 12),
    )
  })

  it('部分取消（后期释放）使 runway 由 7.0 回升至更长', () => {
    const base = monthly('cm-o2b', 100_000, { y: 2026, m: 1 }, { y: 2026, m: 12 })
    // 已兑现 Jan..Mar（300,000 已入账），取消生效 2026-10：Apr..Sep 已赚取未 post（600,000），
    // Oct..Dec 释放（300,000）。
    const partly = { ...base, realizedCents: 300_000 }
    const { commitment: cancelled } = cancelCommitment(partly, '2026-10')
    expect(cancelled.releasedCents).toBe(300_000)
    const annotated = annotateCommitmentsForRunway([cancelled], '2026-01', '2026-12')
    // 起点 700,000 − 600,000（已赚取未兑现，承诺表补加一次）= 100,000；窗口内不再烧 ⇒ +∞
    // 对照未取消且已兑现 3 期：已兑现周期已含在 CashBalance 中不再计，
    // 只烧 Apr..Dec 9 期 ⇒ crossing 恰在 10.0（旧双重口径会得 1.0）
    const notCancelled = annotateCommitmentsForRunway([partly], '2026-01', '2026-12')
    expect(runway(700_000, notCancelled, 12)).toBeCloseTo(10.0, 6)
    expect(runway(700_000, annotated, 12)).toBe(Number.POSITIVE_INFINITY)
  })
})

// ===== RV-2 / RV-3：真实跑道驱动的危机状态机（阈值 4.0 / 2.0 / 60） =====

describe('RV-2：真实跑道 2.5 个月 ⇒ watch + LOW_RUNWAY（非 warning、不进 critical）', () => {
  it('仅跑道触发、现金未跌破 cash warning 线：watch，不是 warning/critical', () => {
    const next = transitionCrisis(
      crisis(),
      signals({ cashBalanceCents: 1_000_000, availableCashCents: 1_000_000, runwayMonths: 2.5, today: 100 }),
      T,
    )
    expect(next.state).toBe('watch')
    expect(next.state).not.toBe('warning')
    expect(next.state).not.toBe('critical')
    expect(next.reasonCodes).toContain('LOW_RUNWAY')
    expect(next.reasonCodes).not.toContain('LOW_CASH')
    expect(next.remediationDeadline).toBeNull()
  })
})

describe('RV-3：真实跑道 0.8 个月 ⇒ critical，补救窗口 60 天自进入日起算', () => {
  it('runway 0.8 < runwayCriticalMonths(2.0) ⇒ critical，deadline = today + 60', () => {
    const next = transitionCrisis(
      crisis(),
      signals({ cashBalanceCents: 1_000_000, availableCashCents: 1_000_000, runwayMonths: 0.8, today: 100 }),
      T,
    )
    expect(next.state).toBe('critical')
    expect(next.enteredAt).toBe(100)
    expect(next.remediationDeadline).toBe(160)
    expect(next.reasonCodes).toContain('LOW_RUNWAY')
    expect(next.reasonCodes).not.toContain('NEGATIVE_CASH')
  })
})

// ===== R-3：阈值重标定 4.0 / 2.0 / 60 =====

describe('R-3：runway 危机阈值重标定（ADJ-11）', () => {
  it('runwayWarningMonths=4.0 / runwayCriticalMonths=2.0 / remediationWindowDays=60', () => {
    expect(DEFAULT_FINANCE_TUNING.runwayWarningMonths).toBe(4)
    expect(DEFAULT_FINANCE_TUNING.runwayCriticalMonths).toBe(2)
    expect(DEFAULT_FINANCE_TUNING.remediationWindowDays).toBe(60)
    expect(DEFAULT_FINANCE_TUNING.runwayCriticalMonths)
      .toBeLessThan(DEFAULT_FINANCE_TUNING.runwayWarningMonths)
  })

  it('边界：runway 恰为 4.0 不预警；恰为 2.0 不进 critical（严格小于）', () => {
    expect(signals({ runwayMonths: 4 }).runwayMonths < T.runwayWarningMonths).toBe(false)
    expect(signals({ runwayMonths: 2 }).runwayMonths < T.runwayCriticalMonths).toBe(false)
    const atWarningBoundary = transitionCrisis(
      crisis(), signals({ runwayMonths: 4, today: 0 }), T,
    )
    expect(atWarningBoundary.state).toBe('healthy')
    const atCriticalBoundary = transitionCrisis(
      crisis(), signals({ runwayMonths: 2, today: 0 }), T,
    )
    expect(atCriticalBoundary.state).toBe('watch')
  })

  it('注入覆盖仍生效（TUNING 不硬编码）', () => {
    const custom = withFinanceTuningOverrides({ runwayWarningMonths: 8, runwayCriticalMonths: 3 })
    const watch = transitionCrisis(crisis(), signals({ runwayMonths: 5, today: 0 }), custom)
    expect(watch.state).toBe('watch')
    const critical = transitionCrisis(crisis(), signals({ runwayMonths: 2.5, today: 0 }), custom)
    expect(critical.state).toBe('critical')
  })
})
