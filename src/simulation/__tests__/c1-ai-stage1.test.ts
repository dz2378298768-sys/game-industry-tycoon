/**
 * C1-T6：runway、立项闸门、暂停处置与项目预算。
 * 对应 DECISION-M3-C1-001 v1.3 §4.1–§4.4、E05–E07。
 */
import { describe, expect, it } from 'vitest'
import {
  computeProjectBudgetCents,
  computeRunway,
  evaluateProjectGate,
  projectMonthlyBurnCents,
} from '@simulation/ai/ai-runway'
import { planAiMonth, type AiCompanyView } from '@simulation/ai/ai-planner'
import { TUNING } from '@content/tuning'
import { ProjectService } from '@simulation/services/project-service'

function view(overrides: Partial<AiCompanyView> = {}): AiCompanyView {
  return {
    id: 'ai-1',
    persona: 'indie',
    status: 'active',
    cashCents: 80_000_00,
    monthlyFixedExpenseCents: 5_000_00,
    monthlyPayrollCents: 5_200_00,
    staffCount: 4,
    activeProjectCount: 0,
    existingProjectMonthlyBurnCents: 0,
    accountsPayableCents: 0,
    brand: 10,
    project: null,
    products: [],
    ...overrides,
  }
}

describe('C1 Stage 1 — runway', () => {
  it('R01 active 项目按剩余开发预算摊剩余月数', () => {
    expect(
      projectMonthlyBurnCents(
        { isPaused: false, developmentRemainingCents: 3_000_000, plannedLaunchDay: 120 },
        30,
      ),
    ).toBe(1_000_000)
  })

  it('R02 暂停项目只计保留团队成本', () => {
    expect(
      projectMonthlyBurnCents(
        {
          isPaused: true,
          developmentRemainingCents: 3_000_000,
          plannedLaunchDay: 120,
          retainedTeamCostCents: 400_000,
        },
        30,
      ),
    ).toBe(400_000)
  })

  it('R03 runway 分母 = 固定支出 + 活跃项目 burn + 暂停保留成本', () => {
    const r = computeRunway({
      cashCents: 12_000_000,
      corporateFixedMonthlyCents: 1_000_000,
      projects: [
        { isPaused: false, developmentRemainingCents: 3_000_000, plannedLaunchDay: 120 },
        { isPaused: true, developmentRemainingCents: 9_000_000, plannedLaunchDay: 300, retainedTeamCostCents: 500_000 },
      ],
      day: 30,
    })
    expect(r.monthlyBurnCents).toBe(2_500_000)
    expect(r.runwayMonths).toBeCloseTo(4.8)
    expect(r.pausedBurnCents).toBe(500_000)
  })
})

describe('C1 Stage 1 — 立项闸门', () => {
  it('G01 6 个月闸门失败', () => {
    const gate = evaluateProjectGate({
      cashCents: 5_000_000,
      corporateFixedMonthlyCents: 1_000_000,
      existingProjectBurnsCents: [],
      accountsPayableCents: 0,
      newProjectDevelopmentBudgetCents: 3_000_000,
      plannedDays: 120,
      day: 30,
      activeProjectCount: 0,
    })
    expect(gate.pass).toBe(false)
    expect(gate.failed).toContain('PRE_RUNWAY')
  })

  it('G02 90 天现金覆盖失败：应付账款压穿', () => {
    const gate = evaluateProjectGate({
      cashCents: 7_000_000,
      corporateFixedMonthlyCents: 1_000_000,
      existingProjectBurnsCents: [],
      accountsPayableCents: 5_000_000,
      newProjectDevelopmentBudgetCents: 3_000_000,
      plannedDays: 120,
      day: 30,
      activeProjectCount: 0,
    })
    expect(gate.failed).toContain('CASH_HORIZON')
  })

  it('G03 立项后 runway 不足 3 个月', () => {
    const gate = evaluateProjectGate({
      cashCents: 6_500_000,
      corporateFixedMonthlyCents: 1_000_000,
      existingProjectBurnsCents: [],
      accountsPayableCents: 0,
      newProjectDevelopmentBudgetCents: 8_000_000,
      plannedDays: 120,
      day: 30,
      activeProjectCount: 0,
    })
    expect(gate.pass).toBe(false)
    expect(gate.failed).toContain('POST_RUNWAY')
  })

  it('G04 同公司最多 2 个在研项目', () => {
    const gate = evaluateProjectGate({
      cashCents: 80_000_000,
      corporateFixedMonthlyCents: 1_000_000,
      existingProjectBurnsCents: [1_000_000, 1_000_000],
      accountsPayableCents: 0,
      newProjectDevelopmentBudgetCents: 3_000_000,
      plannedDays: 120,
      day: 30,
      activeProjectCount: 2,
    })
    expect(gate.failed).toContain('PROJECT_LIMIT')
  })
})

describe('C1 Stage 1 — 项目补预算', () => {
  it('F01 FUND_PROJECT 增加开发与总预算，预算耗尽态自动恢复', () => {
    const svc = new ProjectService()
    const created = svc.create({
      name: '测试项目',
      companyId: 'c1',
      genreId: 'action',
      audienceSegmentIds: ['arcade_enthusiasts'],
      targetPlatformIds: ['arcade_pre_1975'],
      budgetTotalCapCents: 3_000_000,
      plannedStartDay: 0,
      plannedLaunchDay: 120,
    })
    expect(created.success).toBe(true)
    const p = created.result!
    svc.reset([
      {
        ...p,
        developmentBudgetCents: 2_000_000,
        launchMarketingReservedCents: 1_000_000,
        budgetExhausted: true,
        isPaused: true,
        pauseReason: 'budget_exhausted',
        riskFlags: ['budget_exhausted'],
      },
    ])
    const funded = svc.fund(p.id, 1_000_000, 30)
    expect(funded.success).toBe(true)
    expect(funded.result?.developmentBudgetCents).toBe(3_000_000)
    expect(funded.result?.budgetTotalCapCents).toBe(4_000_000)
    expect(funded.result?.isPaused).toBe(false)
    expect(funded.result?.budgetExhausted).toBe(false)
    expect(funded.result?.riskFlags).not.toContain('budget_exhausted')
  })
})

describe('C1 Stage 1 — 预算与暂停处置', () => {
  it('B01 开发预算含全工期人工、非人工与 10% 预备金；营销预留落在画像区间', () => {
    const b = computeProjectBudgetCents({
      monthlyPayrollCents: 1_000_000,
      plannedDays: 120,
      persona: 'indie',
      marketingJitter: 1,
    })
    expect(b.developmentBudgetCents).toBe(Math.round(1_000_000 * 4 * 1.15 * 1.1))
    const ratio = b.launchMarketingReservedCents / b.developmentBudgetCents
    expect(ratio).toBeGreaterThanOrEqual(0.15)
    expect(ratio).toBeLessThanOrEqual(0.3)
    expect(b.totalBudgetCents).toBeGreaterThanOrEqual(TUNING.company.minProjectBudgetCents)
  })

  it('P01 暂停 + 现金覆盖 6 个月固定支出 → FUND_PROJECT', () => {
    const plan = planAiMonth(
      view({
        cashCents: 80_000_000,
        monthlyFixedExpenseCents: 5_000_000,
        project: {
          id: 'p1',
          phase: 'PRODUCTION',
          isPaused: true,
          plannedLaunchDay: 120,
          budgetRemainingCents: 100_000,
        },
        existingProjectMonthlyBurnCents: 5_000_000,
      }),
      30,
    )
    expect(plan.chosen).toBe('FUND_PROJECT')
    if (plan.params.action === 'FUND_PROJECT') {
      expect(plan.params.amountCents).toBeGreaterThan(0)
    }
  })

  it('P02 暂停 + 现金不足 3 个月总 burn → CANCEL_PROJECT', () => {
    const plan = planAiMonth(
      view({
        cashCents: 2_000_000,
        monthlyFixedExpenseCents: 1_000_000,
        project: {
          id: 'p1',
          phase: 'PRODUCTION',
          isPaused: true,
          plannedLaunchDay: 120,
          budgetRemainingCents: 0,
        },
        existingProjectMonthlyBurnCents: 1_000_000,
      }),
      30,
    )
    expect(plan.chosen).toBe('CANCEL_PROJECT')
  })

  it('P03 无项目且 runway 不足 → 先 CUT_STAFF，不硬立项', () => {
    const plan = planAiMonth(
      view({ cashCents: 10_000_00, monthlyFixedExpenseCents: 5_000_00 }),
      30,
    )
    expect(plan.chosen).toBe('CUT_STAFF')
    if (plan.params.action === 'CUT_STAFF') {
      expect(plan.params.percent).toBeGreaterThan(0)
      expect(plan.params.percent).toBeLessThanOrEqual(50)
    }
  })
})
