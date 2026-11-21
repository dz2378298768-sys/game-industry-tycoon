/**
 * FIN V0.2 §6.1–§6.4 / §8.4 / §3.9：公式、预测三带、补救预览测试。
 * 覆盖 TC-10、TC-17、TC-20、TC-21 与 FIN-T1/T2/T3 注入、HRB 只读消费（TC-11）。
 */
import { describe, it, expect } from 'vitest'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import {
  computeAvailableCash,
  computeCashForecast,
  computeRunwayMonths,
  resolveWarningThresholds,
  type ReceivableInput,
} from '@domain/value-objects/finance-formulas'
import {
  cashDirection,
  summarizeCashFlow,
} from '@domain/value-objects/finance-cashflow'
import { previewRemedy } from '@domain/value-objects/finance-remedy'
import { createCommitment, remainingPlannedCents } from '@domain/value-objects/finance-commitment'
import { withFinanceTuningOverrides, ALL_TRANSACTION_CATEGORIES, DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { checkHrbFeasibility } from '@domain/value-objects/product-blueprint-hrb'
import { DEFAULT_BLUEPRINT_TUNING } from '@domain/value-objects/product-blueprint-tuning'
import type { BudgetCommitment, PayableReceivable } from '@domain/entities/finance'

const T = withFinanceTuningOverrides()
const d = (m: number) => gregorianToDayIndex(2026, m, 1)

function commitment(amount: number, months: number): BudgetCommitment {
  return createCommitment({
    commitmentId: `c-${amount}`, companyId: 'c1', sourceType: 'employment_salary',
    sourceRef: 'emp', amountCents: amount, period: 'monthly', startAt: d(1), endAt: d(months),
  })
}

function payable(amount: number, dueDay: number, settled = 0): PayableReceivable {
  return {
    itemId: `ap-${dueDay}`, direction: 'payable', companyId: 'c1', counterpartyId: 'v',
    amountCents: amount, settledCents: settled, dueDate: dueDay, sourceRef: 'contract-1',
    state: settled >= amount ? 'settled' : 'open', settlementTxIds: [],
  }
}

describe('TC-10 / F-04：跑道公式（CumAvailable + 小数插值）', () => {
  it('AvailableCash 为 CumAvailable(0) 起点；crossing 做小数插值', () => {
    const r = computeRunwayMonths({
      availableCashCents: 1_200_000,
      commitments: [commitment(500_000, 6)],
      expectedInflowsByMonth: [],
      horizonMonths: 6,
      startMonth: '2026-01',
    })
    // Cum(0)=1_200_000, Cum(1)=700_000, Cum(2)=200_000, Cum(3)=-300_000 → 2 + 200/500
    expect(r).toBeCloseTo(2.4, 6)
  })

  it('预计流入折减 NetBurn；窗口内不 crossing → +∞', () => {
    const r = computeRunwayMonths({
      availableCashCents: 1_200_000,
      commitments: [commitment(500_000, 6)],
      expectedInflowsByMonth: [
        { month: '2026-03', amountCents: 600_000 }, // NetBurn_m=0
      ],
      horizonMonths: 6,
      startMonth: '2026-01',
    })
    expect(r).toBeCloseTo(3.4, 6)
    const infinite = computeRunwayMonths({
      availableCashCents: 1_000_000, commitments: [], expectedInflowsByMonth: [], horizonMonths: 6,
    })
    expect(infinite).toBe(Number.POSITIVE_INFINITY)
  })

  it('场景 A：5 人月薪承诺创建后 AvailableCash 与 runway 同时下降（承诺不改现金）', () => {
    const cash = 12_000_000 // $120,000
    const before = computeRunwayMonths({
      availableCashCents: cash, commitments: [], expectedInflowsByMonth: [], horizonMonths: 6,
      startMonth: '2026-01',
    })
    const c = commitment(1_000_000, 6) // 5 人合计 $10,000/月
    const available = computeAvailableCash({ cashBalanceCents: cash, commitments: [c], payables: [], receivables: [] }, T)
    const after = computeRunwayMonths({
      availableCashCents: available, commitments: [c], expectedInflowsByMonth: [], horizonMonths: 6,
      startMonth: '2026-01',
    })
    expect(available).toBeLessThan(cash)
    expect(Number.isFinite(after)).toBe(true)
    expect(after).toBeLessThan(before) // before=+∞（无承诺无燃烧）
    expect(remainingPlannedCents(c)).toBe(6_000_000)
  })
})

describe('§6.2 AvailableCash 与 §6.4 预警阈值（FIN-T2 注入）', () => {
  it('扣除未兑现承诺与未结算应付；高置信应收按 FIN-T2 开关与 confidence 折减', () => {
    const c = commitment(300_000, 1)
    const p = payable(100_000, d(1))
    const r: ReceivableInput = {
      itemId: 'ar-1', direction: 'receivable', companyId: 'c1', counterpartyId: 'x',
      amountCents: 200_000, settledCents: 0, dueDate: d(1), sourceRef: 'sale-1',
      state: 'open', settlementTxIds: [], confidence: 0.9,
    }
    const base = computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [c], payables: [p], receivables: [r],
    }, T)
    expect(base).toBe(600_000)
    const withAr = withFinanceTuningOverrides({ includeHighConfidenceReceivables: true })
    expect(computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [c], payables: [p], receivables: [r],
    }, withAr)).toBe(800_000)
  })

  it('recovery 严格高于 warning：滞后带宽度 = 200_000 cents = $2,000', () => {
    const th = resolveWarningThresholds(T)
    expect(th.warningCents).toBe(400_000) // $4,000
    expect(th.recoveryCents).toBe(600_000) // $6,000
    expect(th.bankruptCents).toBe(0) // $0
    expect(th.hysteresisWidthCents).toBe(200_000)
    expect(th.recoveryCents).toBeGreaterThan(th.warningCents)
  })
})

describe('TC-20 / F-05：预测三带自洽（六系数、含应付）', () => {
  const inflows = [
    { month: '2026-01', amountCents: 300_000, source: 'sales', confidence: 1 },
  ]

  it('三带均含应付且 low ≤ expected ≤ high；best 带以 pPayLow<1 折减', () => {
    expect(T.pInLow).toBeLessThan(1)
    expect(T.pInHigh).toBeGreaterThan(1)
    expect(T.pOutLow).toBeLessThan(1)
    expect(T.pOutHigh).toBeGreaterThan(1)
    expect(T.pPayLow).toBeLessThan(1)
    expect(T.pPayHigh).toBeGreaterThan(1)

    const f = computeCashForecast({
      forecastId: 'f1', companyId: 'c1', asOfDay: d(1), cashBalanceCents: 1_000_000,
      horizonMonths: 1, commitments: [commitment(200_000, 1)],
      payables: [payable(100_000, d(1))], receivables: [],
      expectedInflowsByMonth: inflows,
    }, T)
    const m = f.netCashByMonth[0]!
    expect(m.month).toBe('2026-01')
    expect(m.lowCents).toBe(900_000)   // 1_000_000 +240k −220k −120k
    expect(m.expectedCents).toBe(1_000_000)
    expect(m.highCents).toBe(1_090_000) // 1_000_000 +360k −180k −90k
    expect(m.lowCents).toBeLessThanOrEqual(m.expectedCents)
    expect(m.expectedCents).toBeLessThanOrEqual(m.highCents)
    expect(f.lowCashDate).toBeNull()
    expect(f.derivedFrom.formulaVersion).toBe(T.formulaVersion)
  })

  it('六系数可注入：替换 pInLow / pPayLow 后三带按预期变化（TUNING 不硬编码）', () => {
    const custom = withFinanceTuningOverrides({ pInLow: 0.5, pPayLow: 0.5, pPayHigh: 1.5 })
    const f = computeCashForecast({
      forecastId: 'f2', companyId: 'c1', asOfDay: d(1), cashBalanceCents: 1_000_000,
      horizonMonths: 1, commitments: [commitment(200_000, 1)],
      payables: [payable(100_000, d(1))], receivables: [],
      expectedInflowsByMonth: inflows,
    }, custom)
    const m = f.netCashByMonth[0]!
    expect(m.lowCents).toBe(1_000_000 + 150_000 - 220_000 - 150_000)
    expect(m.highCents).toBe(1_000_000 + 360_000 - 180_000 - 50_000)
  })

  it('lowCashDate 取 low 带首次跌破警告线之月', () => {
    const f = computeCashForecast({
      forecastId: 'f3', companyId: 'c1', asOfDay: d(1), cashBalanceCents: 300_000,
      horizonMonths: 2, commitments: [], payables: [], receivables: [],
      expectedInflowsByMonth: [{ month: '2026-01', amountCents: 0 }],
    }, T)
    expect(f.lowCashDate).toBe('2026-01')
  })
})

describe('TC-17 / FIN-T1：现金流三分映射与汇总', () => {
  it('12 类全部映射：advance=financing、asset_sale=investing，其余 operating', () => {
    const tx = ALL_TRANSACTION_CATEGORIES.map((category) => ({
      category, amountCents: category === 'advance' ? 100 : 10,
    }))
    const sum = summarizeCashFlow(tx, T)
    expect(sum.financing).toBe(100)
    expect(sum.investing).toBe(10)
    expect(sum.operating).toBe(100)
    expect(cashDirection(1)).toBe('inflow')
    expect(cashDirection(-1)).toBe('outflow')
  })

  it('映射表可注入（FIN-T1 不硬编码）', () => {
    const custom = withFinanceTuningOverrides({ cashFlowTypeByCategory: { advance: 'operating' } })
    const sum = summarizeCashFlow([{ category: 'advance', amountCents: 100 }], custom)
    expect(sum.operating).toBe(100)
    expect(sum.financing).toBe(0)
    expect(DEFAULT_FINANCE_TUNING.cashFlowTypeByCategory.advance).toBe('financing')
  })
})

describe('TC-21 / F-07：补救代价预览（可计算、前置置灰）', () => {
  it('裁员 / 出售 / 转租 / 终止合同 / 预付款按 §8.4 公式给出预览', () => {
    expect(previewRemedy('cut_staff', { employees: 3 }, T, 2_000_000).immediateCashImpactCents).toBe(-1_500_000)
    expect(previewRemedy('sell_asset', { assetBookValueCents: 1_000_000, discountRate: 0.2 }, T, 0).immediateCashImpactCents).toBe(800_000)
    expect(previewRemedy('sublet_office', { monthlyRentCents: 100_000, subletRatio: 0.5, remainingMonths: 3 }, T, 0).immediateCashImpactCents).toBe(150_000)
    expect(previewRemedy('terminate_contract', { remainingObligationCents: 200_000, penaltyRate: 0.1 }, T, 0).immediateCashImpactCents).toBe(-20_000)
    const advance = previewRemedy('advance', { advanceAmountCents: 500_000 }, T, 0)
    expect(advance.immediateCashImpactCents).toBe(500_000)
    expect(advance.consequences!.debtCents).toBe(500_000) // 无利息、无到期日的抵扣义务
  })

  it('前置不足置灰；后果写入与预览一致（非免费复活）', () => {
    const poor = previewRemedy('cut_staff', { employees: 10 }, T, 100)
    expect(poor.preconditionMet).toBe(false)
    expect(poor.immediateCashImpactCents).toBe(-5_000_000)
    const sale = previewRemedy('sell_asset', { assetBookValueCents: 1_000_000, discountRate: 0.2 }, T, 0)
    expect(sale.consequences!.assetChanges[0]!.deltaCents).toBe(-1_000_000)
    expect(previewRemedy('descope', { remainingCommitmentCents: 500_000 }, T, 0).immediateCashImpactCents).toBe(0)
  })

  it('遣散费参数可注入（TUNING 不硬编码）', () => {
    const custom = withFinanceTuningOverrides({ severancePerEmployeeCents: 100_000 })
    expect(previewRemedy('cut_staff', { employees: 3 }, custom, 1_000_000).immediateCashImpactCents).toBe(-300_000)
  })
})

describe('TC-11：HRB 只读消费（不改四通道、不消费 qualityCeilingBand）', () => {
  it('ratio 驱动 BUDGET_OVERRUN 原因；HRB 结论无缩放字段，不回写估算', () => {
    const hrbResult = checkHrbFeasibility(0.45, 1_000, 500, DEFAULT_BLUEPRINT_TUNING)
    expect(hrbResult.ratio).toBeCloseTo(500 / 450)
    expect(Object.keys(hrbResult).join(',')).not.toContain('qualityCeilingBand')
    expect(Object.keys(hrbResult).join(',')).not.toContain('scaled')
    // 预算承诺只读消费 ratio：ratio>1 触发 BUDGET_OVERRUN，不回写四通道
    const overrun = hrbResult.ratio > DEFAULT_FINANCE_TUNING.budgetOverrunWarnAt
    expect(overrun).toBe(true)
    expect(hrbResult.costEst).toBe(500)
  })
})
