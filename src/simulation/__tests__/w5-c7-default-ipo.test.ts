/**
 * W5-C7 默认配置走上市验证（ADJ-2026-11-24-19 §1 C7 / 场景 S4 / OI-19~24）。
 *
 * B-01c（ADJ-2026-11-24-30 §3.3）裁定后定稿：
 *   - 路径 B = 推荐范围自然完成研发：UI 默认容量 $136,000 × 默认 HRB 0.45 = 承诺帽 $61,200（最小可行帽）；
 *   - 路径 A（$20,000）/ 旧默认 B'（$9,000）= 低预算承诺不足 → 可解释失败对照（DP-2/DP-3）；
 *   - 容量守卫反证：承诺额 > 可用现金仍被 PROJ_BUDGET_CAPACITY_EXCEEDS_CASH 拒绝（纪律不放宽）。
 *
 * 默认口径（单位双写）：
 *   - 起始资金：$120,000 = 12,000,000 cents（ADJ-12 S1-1，单一源 TUNING.company.startingCashCents）
 *   - 默认招聘：4 人满配（P/D/A/Q，生产三学科 + QA 缺一不可）；基准薪资 $1,300 = 130,000 cents/月
 *     × 城市系数（旧金山 1.4 → $1,820 = 182,000 cents/月）——薪资锚点未动
 *   - 默认上市周期：200 天（ADJ-12 S4-2 defaultLaunchHorizonDays）
 *   - 冻结锚点全部未改；仅 UI 默认预算容量由 $20,000 调为 $136,000（ADJ-30 §3.2 定值，非锚点）
 *
 * 本测试锁定事实：推荐范围自然 READY、低预算失败对照、守卫反证，三者并存。
 * 上市前的现金稳定性由 REC-06 数值批次负责；REC-04 不通过修改锚点制造成功结果。
 */
import { describe, it, expect } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { TUNING } from '@content/tuning'
import { citySalaryMultiplier } from '@content/queries'

const DEFAULT_BUDGET_CENTS = TUNING.company.minProjectBudgetCents // 2,000,000 cents = $20,000
const UI_DEFAULT_CAPACITY_USD = TUNING.project.defaultBudgetCapacityUsd
const HRB_CONSERVATIVE = TUNING.project.hrbConservativeRatio // 0.45
const MIN_VIABLE_CAP_CENTS = 6_120_000 // $61,200：B-01b 确定性扫描 N=8 最小可行预算帽（非锚点，实测定值）
const DEFAULT_SALARY_CENTS = TUNING.employee.defaultStartingSalaryCents // 130,000 cents = $1,300
const HORIZON_DAYS = TUNING.project.defaultLaunchHorizonDays // 200

const ROLES = [
  { name: 'P', role: 'programmer' as const },
  { name: 'D', role: 'designer' as const },
  { name: 'A', role: 'artist' as const },
  { name: 'Q', role: 'qa' as const },
]
/** REC-03 execution projects include an audio WP; the canonical first-project path needs all five disciplines. */
const EXECUTION_ROLES = [
  ...ROLES,
  { name: 'AU', role: 'audio_designer' as const },
]

interface Checkpoint {
  day: number
  cashCents: number
  companyStatus: string
  projectPhase: string
  budgetExhausted: boolean
  isPaused: boolean
  pausedDays: number
}

interface RunResult {
  initialCashCents: number
  salaryCents: number
  budgetCapCents: number
  curve: Checkpoint[]
  exhaustedDay: number | null
  readyDay: number | null
  cancelledDay: number | null
  launched: { success: boolean; errorCode?: string | undefined }
  delivered: { success: boolean; completed: boolean; errorCode?: string | undefined }
  cashAfterLaunchCents: number
  minCashCents: number
}

/** 按天推进 200 天，记录关键节点；不改任何数值。 */
function runDefaultPlay(budgetCapCents: number, useExecutionWizard = false): RunResult {
  const gw = createGameWorld(42)
  const company = gw.createCompany({ name: 'Default Studio', cityId: 'san_francisco' })
  const initialCashCents = gw.finance.getCashBalance(company.id)
  const salaryCents = Math.round(DEFAULT_SALARY_CENTS * citySalaryMultiplier(company.cityId))
  let projectId: string
  if (useExecutionWizard) {
    const budgetCapacityCents = UI_DEFAULT_CAPACITY_USD * 100
    const wizardInput = {
      kind: 'draft' as const,
      requestId: 'w5-c7-default-path',
      workingTitle: 'Default Pioneer',
      genreId: 'action',
      primaryTypeId: 'action',
      targetSegmentClaims: ['SEG-YOUTH'],
      platformTargets: ['PLT-ARCADE'],
      modules: [
        { templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE' as const, instanceId: 'rec03-core', intensity: 1 as const, depthSelection: 'standard' as const, optionSelections: {}, contentPackId: null },
        { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT' as const, instanceId: 'rec03-content', intensity: 1 as const, depthSelection: 'standard' as const, optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
      ],
      deliveryForm: 'full' as const,
      scopePolicy: 'recommended' as const,
      hrb: HRB_CONSERVATIVE,
      budgetCapacityCents,
    }
    const preview = gw.previewExecutionProject(wizardInput)
    expect(preview.success).toBe(true)
    expect(preview.result?.budgetCapCents).toBe(MIN_VIABLE_CAP_CENTS)
    const created = gw.createExecutionProject(wizardInput)
    expect(created.success).toBe(true)
    const commitments = gw.finance.getLedger().getCommitments(company.id, { state: 'committed' })
      .filter((c) => c.sourceType === 'project_budget')
    expect(commitments).toHaveLength(1)
    expect(commitments[0]?.amountCents).toBe(MIN_VIABLE_CAP_CENTS)
    expect(commitments.reduce((sum, c) => sum + c.amountCents, 0)).toBe(6_120_000)
    projectId = gw.world.projects.find((p) => p.name === 'Default Pioneer')!.id
  } else {
    const created = gw.createProject({
      name: 'Default Pioneer',
      genreId: 'action',
      budgetTotalCapCents: budgetCapCents,
      plannedLaunchDay: HORIZON_DAYS,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(created.success).toBe(true)
    projectId = created.result!.id
  }
  const hired = (useExecutionWizard ? EXECUTION_ROLES : ROLES).map((r) =>
    gw.hireEmployee({ name: r.name, role: r.role, skillLevel: useExecutionWizard ? 5 : 3, salaryMonthlyCents: salaryCents }),
  )
  expect(hired.every((h) => h.success)).toBe(true)

  // CONCEPT → PRE_PRODUCTION → PRODUCTION，全员 100% 分配（默认招聘满配）
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  for (const h of hired) {
    if (h.result) expect(gw.assignEmployeeToProject(h.result.id, projectId, 1, 'generalist').success).toBe(true)
  }
  if (useExecutionWizard) {
    const execution = gw.getExecutionProject(projectId)!
    expect(execution.workPackages.length).toBeGreaterThan(0)
    expect(gw.getExecutionSummary(projectId)?.costEstInfinite).toBe(false)
  }

  const checkpoints = new Set([0, 30, 60, HORIZON_DAYS])
  const curve: Checkpoint[] = []
  let minCashCents = gw.finance.getCashBalance(company.id)
  let exhaustedDay: number | null = null
  let readyDay: number | null = null
  let cancelledDay: number | null = null
  let delivered = { success: false, completed: false, errorCode: undefined as string | undefined }
  const snap = (day: number): Checkpoint => {
    const c = gw.world.companies.find((x) => x.id === company.id)!
    const p = gw.world.projects.find((x) => x.id === projectId)!
    return {
      day,
      cashCents: gw.finance.getCashBalance(company.id),
      companyStatus: c.status,
      projectPhase: p.phase,
      budgetExhausted: p.budgetExhausted ?? false,
      isPaused: p.isPaused ?? false,
      pausedDays: p.pausedDays ?? 0,
    }
  }
  curve.push(snap(0))
  for (let day = 1; day <= HORIZON_DAYS; day++) {
    gw.advanceSimulation(1)
    const s = snap(day)
    minCashCents = Math.min(minCashCents, s.cashCents)
    if (s.budgetExhausted && exhaustedDay === null) exhaustedDay = day
    if (s.projectPhase === 'READY_TO_LAUNCH' && readyDay === null) readyDay = day
    if (s.projectPhase === 'CANCELLED' && cancelledDay === null) cancelledDay = day
    if (useExecutionWizard && !delivered.success) {
      const execution = gw.getExecutionProject(projectId)
      if (execution?.project.state === 'READY_TO_DELIVER') {
        const gate = gw.getDeliveryGateEvaluation(projectId, 'full', true)
        const submitted = gw.submitDeliveryForProject(projectId, gate.gate, 'full')
        delivered = {
          success: submitted.success,
          completed: submitted.result?.completed ?? false,
          errorCode: submitted.errorCode,
        }
      }
    }
    if (checkpoints.has(day)) curve.push(s)
  }
  const launched = gw.launchProject(projectId)
  const cashAfterLaunchCents = gw.finance.getCashBalance(company.id)
  return {
    initialCashCents,
    salaryCents,
    budgetCapCents,
    curve,
    exhaustedDay,
    readyDay,
    cancelledDay,
    launched: { success: launched.success, errorCode: launched.errorCode },
    delivered,
    cashAfterLaunchCents,
    minCashCents,
  }
}

describe('W5-C7 默认配置走上市验证（S4，不臆造数值、不改锚点）', () => {
  it('锚点复核：起始 $120,000 / minProjectBudget $20,000 / 基准薪资 $1,300 / 周期 200 天 / HRB 0.45·0.6 均未改', () => {
    expect(TUNING.company.startingCashCents).toBe(12_000_000)
    expect(DEFAULT_BUDGET_CENTS).toBe(2_000_000)
    expect(DEFAULT_SALARY_CENTS).toBe(130_000)
    expect(HORIZON_DAYS).toBe(200)
    expect(HRB_CONSERVATIVE).toBe(0.45)
    expect(TUNING.project.hrbStandardRatio).toBe(0.6)
    // B-01c 定值：UI 默认容量 $136,000 × HRB 0.45 = 承诺 $61,200；仅改 UI 默认值，非冻结锚点。
    expect(Math.round(UI_DEFAULT_CAPACITY_USD * 100 * HRB_CONSERVATIVE)).toBe(MIN_VIABLE_CAP_CENTS)
  })

  it('路径 B【推荐范围自然 READY】：UI 默认 $136,000 × HRB 0.45 = 承诺帽 $61,200 → 先完成研发，再暴露冻结经济路径的破产边界', () => {
    const cap = Math.round(UI_DEFAULT_CAPACITY_USD * 100 * HRB_CONSERVATIVE)
    expect(cap).toBe(MIN_VIABLE_CAP_CENTS) // 6,120,000 cents = $61,200
    const r = runDefaultPlay(cap, true)
    expect(r.initialCashCents).toBe(12_000_000)
    expect(r.curve.map((c) => c.day)).toEqual([0, 30, 60, 200])
    // 工程链路断言：执行项目先自然完成，legacy 生命周期随后进入上市准备。
    expect(r.readyDay).not.toBeNull()
    expect(r.readyDay!).toBeLessThanOrEqual(HORIZON_DAYS)
    expect(r.exhaustedDay === null || r.readyDay! < r.exhaustedDay).toBe(true)
    expect(r.delivered).toEqual({ success: true, completed: true, errorCode: undefined })
    // 数值边界断言：当前冻结工资、项目支出和 M3 破产规则下，200 天前可能破产取消；
    // 这属于 REC-06 数值/财务批次，不得由 REC-04 工程测试改写资金锚点来掩盖。
    expect(r.cancelledDay).not.toBeNull()
    expect(r.cancelledDay!).toBeGreaterThan(r.readyDay!)
    expect(r.launched.success).toBe(false)
    expect(r.launched.errorCode).toBe('PRJ_NOT_READY')
  })

  it('低预算对照 A：$20,000 预算帽（minProjectBudget 锚点）→ 耗尽超时取消，PRJ_NOT_READY（DP-2/DP-3）', () => {
    const r = runDefaultPlay(DEFAULT_BUDGET_CENTS)
    expect(r.initialCashCents).toBe(12_000_000)
    expect(r.curve.map((c) => c.day)).toEqual([0, 30, 60, 200])
    expect(r.curve.every((c) => c.cashCents > 0)).toBe(true)
    expect(r.readyDay).not.toBeNull() // 能力上能到 READY_TO_LAUNCH
    expect(r.exhaustedDay).not.toBeNull()
    expect(r.cancelledDay).not.toBeNull()
    expect(r.cancelledDay!).toBeLessThan(HORIZON_DAYS)
    expect(r.launched.success).toBe(false)
    expect(r.launched.errorCode).toBe('PRJ_NOT_READY')
  })

  it('低预算对照 B\'：旧默认 $9,000 预算帽（HRB 0.45 × 旧容量 $20,000）→ 更早耗尽取消，PRJ_NOT_READY（DP-2/DP-3）', () => {
    const oldCap = Math.round(20_000 * 100 * HRB_CONSERVATIVE)
    expect(oldCap).toBe(900_000) // $9,000 = 900,000 cents
    const r = runDefaultPlay(oldCap)
    expect(r.initialCashCents).toBe(12_000_000)
    expect(r.curve.map((c) => c.day)).toEqual([0, 30, 60, 200])
    expect(r.curve.every((c) => c.cashCents > 0)).toBe(true)
    expect(r.exhaustedDay).not.toBeNull()
    expect(r.cancelledDay).not.toBeNull()
    expect(r.cancelledDay!).toBeLessThan(HORIZON_DAYS)
    expect(r.launched.success).toBe(false)
    expect(r.launched.errorCode).toBe('PRJ_NOT_READY')
  })

  it('容量守卫反证：4 人满配后 availableCash $48,656，承诺 $61,200 > 可用现金 ⇒ 仍拒（ADJ-30 §3.1 纪律不放宽）', () => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Default Studio', cityId: 'san_francisco' })
    const salaryCents = Math.round(DEFAULT_SALARY_CENTS * citySalaryMultiplier('san_francisco'))
    for (const r of ROLES) {
      const h = gw.hireEmployee({ name: r.name, role: r.role, skillLevel: 3, salaryMonthlyCents: salaryCents })
      expect(h.success).toBe(true)
    }
    const availableCashCents = gw.getFinancialOverview()!.availableCashCents
    expect(availableCashCents).toBe(4_865_600) // $48,656：6 月薪资承诺预留（口径未改）
    const commitmentCents = Math.round(HRB_CONSERVATIVE * UI_DEFAULT_CAPACITY_USD * 100)
    expect(commitmentCents).toBe(MIN_VIABLE_CAP_CENTS) // $61,200
    expect(commitmentCents).toBeGreaterThan(availableCashCents)
    // 失败原因必须指向守卫本身（非环境/过滤问题）：错误码 + 消息双锁。
    const created = gw.createExecutionProject({
      name: 'Guard Refutation', genreId: 'action', hrb: HRB_CONSERVATIVE,
      budgetCapacityCents: UI_DEFAULT_CAPACITY_USD * 100,
    })
    expect(created.success).toBe(false)
    expect(created.errorCode).toBe('PROJ_BUDGET_CAPACITY_EXCEEDS_CASH')
    expect(created.message).toContain('预算承诺额')
  })
})
