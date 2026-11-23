/**
 * W5-C7 默认配置走上市验证（ADJ-2026-11-24-19 §1 C7 / 场景 S4 / OI-19~24）。
 *
 * 目标：在不改任何 ADJ 锚定数值的前提下，实测
 *   「默认 $120,000 起始 + 默认预算 + 默认招聘」→ 30/60/200 天现金曲线 → 能否走到上市。
 *
 * 默认口径（单位双写）：
 *   - 起始资金：$120,000 = 12,000,000 cents（ADJ-12 S1-1，单一源 TUNING.company.startingCashCents）
 *   - 默认预算：$20,000 = 2,000,000 cents（ADJ-12 S4-2 锚定 minProjectBudgetCents；
 *     亦为 UI 立项向导默认 budgetCapacity 20_000 USD）
 *   - 默认招聘：基准薪资 $1,300 = 130,000 cents/月 × 城市系数（旧金山 1.4 → $1,820 = 182,000 cents/月）
 *   - 默认上市周期：200 天（ADJ-12 S4-2 defaultLaunchHorizonDays）
 *
 * 历史对照（OI-20）：旧默认 $30,000 预算在 Day 130 耗尽、追加后 Day 180 上市累计 $48,000，
 * 初始 $50,000 时上市现金 −$7,600。当前默认已上调起始资金并下调基准薪资，须实测复核。
 *
 * 本测试只验证事实、不改数值；若发现耗尽/走不通，如实输出现金曲线供主 AI 登记 P1 OPEN。
 */
import { describe, it, expect } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { TUNING } from '@content/tuning'
import { citySalaryMultiplier } from '@content/queries'

const DEFAULT_BUDGET_CENTS = TUNING.company.minProjectBudgetCents // 2,000,000 cents = $20,000
const UI_DEFAULT_CAPACITY_USD = 20_000 // UI 向导默认（new-project.tsx:55），HRB 保守 0.45 → cap $9,000
const HRB_CONSERVATIVE = TUNING.project.hrbConservativeRatio // 0.45
const DEFAULT_SALARY_CENTS = TUNING.employee.defaultStartingSalaryCents // 130,000 cents = $1,300
const HORIZON_DAYS = TUNING.project.defaultLaunchHorizonDays // 200

const ROLES = [
  { name: 'P', role: 'programmer' as const },
  { name: 'D', role: 'designer' as const },
  { name: 'A', role: 'artist' as const },
  { name: 'Q', role: 'qa' as const },
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
}

/** 按天推进 200 天，记录关键节点；不改任何数值。 */
function runDefaultPlay(budgetCapCents: number): RunResult {
  const gw = createGameWorld(42)
  const company = gw.createCompany({ name: 'Default Studio', cityId: 'san_francisco' })
  const initialCashCents = gw.finance.getCashBalance(company.id)
  const salaryCents = Math.round(DEFAULT_SALARY_CENTS * citySalaryMultiplier(company.cityId))
  const hired = ROLES.map((r) =>
    gw.hireEmployee({ name: r.name, role: r.role, skillLevel: 3, salaryMonthlyCents: salaryCents }),
  )
  const created = gw.createProject({
    name: 'Default Pioneer',
    genreId: 'action',
    budgetTotalCapCents: budgetCapCents,
    plannedLaunchDay: HORIZON_DAYS,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  })
  expect(hired.every((h) => h.success)).toBe(true)
  expect(created.success).toBe(true)
  const projectId = created.result!.id

  // CONCEPT → PRE_PRODUCTION → PRODUCTION，全员 100% 分配（默认招聘满配）
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  for (const h of hired) {
    if (h.result) expect(gw.assignEmployeeToProject(h.result.id, projectId, 1, 'generalist').success).toBe(true)
  }

  const checkpoints = new Set([0, 30, 60, HORIZON_DAYS])
  const curve: Checkpoint[] = []
  let exhaustedDay: number | null = null
  let readyDay: number | null = null
  let cancelledDay: number | null = null
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
    if (s.budgetExhausted && exhaustedDay === null) exhaustedDay = day
    if (s.projectPhase === 'READY_TO_LAUNCH' && readyDay === null) readyDay = day
    if (s.projectPhase === 'CANCELLED' && cancelledDay === null) cancelledDay = day
    if (checkpoints.has(day)) curve.push(s)
  }
  const launched = gw.launchProject(projectId)
  return {
    initialCashCents,
    salaryCents,
    budgetCapCents,
    curve,
    exhaustedDay,
    readyDay,
    cancelledDay,
    launched: { success: launched.success, errorCode: launched.errorCode },
  }
}

function logRun(label: string, r: RunResult) {
  console.log(`--- [W5-C7] ${label} ---`)
  console.log(`[W5-C7] ${label} 初始现金=${r.initialCashCents} cents ($${(r.initialCashCents / 100).toFixed(2)})`)
  console.log(`[W5-C7] ${label} 默认薪资(旧金山×1.4)=${r.salaryCents} cents/月; 预算帽=${r.budgetCapCents} cents ($${(r.budgetCapCents / 100).toFixed(2)})`)
  for (const c of r.curve) {
    console.log(
      `[W5-C7] ${label} Day ${c.day}: cash=${c.cashCents} cents ($${(c.cashCents / 100).toFixed(2)}), ` +
      `status=${c.companyStatus}, phase=${c.projectPhase}, exhausted=${c.budgetExhausted}, paused=${c.isPaused}, pausedDays=${c.pausedDays}`,
    )
  }
  console.log(`[W5-C7] ${label} 首次耗尽Day=${r.exhaustedDay}, 首次READY Day=${r.readyDay}, 取消Day=${r.cancelledDay}`)
  console.log(`[W5-C7] ${label} launch@Day200: ${JSON.stringify(r.launched)}`)
}

describe('W5-C7 默认配置走上市验证（S4，不臆造数值、不改锚点）', () => {
  it('锚点复核：起始 $120,000 / 默认预算 $20,000 / 基准薪资 $1,300 / 周期 200 天', () => {
    expect(TUNING.company.startingCashCents).toBe(12_000_000)
    expect(DEFAULT_BUDGET_CENTS).toBe(2_000_000)
    expect(DEFAULT_SALARY_CENTS).toBe(130_000)
    expect(HORIZON_DAYS).toBe(200)
    expect(HRB_CONSERVATIVE).toBe(0.45)
  })

  it('路径 A：$20,000 预算帽（minProjectBudget 锚点）30/60/200 天现金曲线 + 上市结论', () => {
    const r = runDefaultPlay(DEFAULT_BUDGET_CENTS)
    logRun('A:cap$20k', r)
    // 事实断言：初始现金必须为 $120,000；曲线逐点记录且 day 单调
    expect(r.initialCashCents).toBe(12_000_000)
    expect(r.curve.map((c) => c.day)).toEqual([0, 30, 60, 200])
    // 实测结论锁定（P1 OPEN-W5-C7-01 的可复现证据，非对现状的认可）：
    // 公司现金全程为正（未耗尽），但项目预算耗尽 → 暂停 60 天超时 → Day118 自动取消 → Day200 无法上市。
    expect(r.curve.every((c) => c.cashCents > 0)).toBe(true)
    expect(r.readyDay).not.toBeNull() // 能力上能到 READY_TO_LAUNCH
    expect(r.exhaustedDay).not.toBeNull()
    expect(r.cancelledDay).not.toBeNull()
    expect(r.cancelledDay!).toBeLessThan(HORIZON_DAYS) // 在计划上市日前即被取消
    expect(r.launched.success).toBe(false)
    expect(r.launched.errorCode).toBe('PRJ_NOT_READY')
  })

  it('路径 B：UI 向导默认 HRB 0.45 × $20,000 容量 = $9,000 预算帽（真实玩家默认路径）', () => {
    const cap = Math.round(UI_DEFAULT_CAPACITY_USD * 100 * HRB_CONSERVATIVE)
    expect(cap).toBe(900_000) // $9,000 = 900,000 cents
    const r = runDefaultPlay(cap)
    logRun('B:cap$9k', r)
    expect(r.initialCashCents).toBe(12_000_000)
    expect(r.curve.map((c) => c.day)).toEqual([0, 30, 60, 200])
    // 实测结论锁定（P1 OPEN-W5-C7-01）：UI 默认 HRB 0.45 下 $9,000 预算帽更早耗尽，
    // Day90 即暂停超时取消，Day200 上市失败；公司现金仍全程为正。
    expect(r.curve.every((c) => c.cashCents > 0)).toBe(true)
    expect(r.exhaustedDay).not.toBeNull()
    expect(r.cancelledDay).not.toBeNull()
    expect(r.cancelledDay!).toBeLessThan(HORIZON_DAYS)
    expect(r.launched.success).toBe(false)
    expect(r.launched.errorCode).toBe('PRJ_NOT_READY')
  })
})
