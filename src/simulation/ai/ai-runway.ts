/**
 * C1 Stage 1（DECISION-M3-C1-001 v1.3 §4.1–§4.3）：
 * runway、项目月度烧钱、项目预算估算的纯函数。
 *
 * 口径：固定支出只含非项目人工与房租；项目人工按 FTE 进项目 burn。
 * 暂停项目按保留团队成本计，不按全项目烧钱。
 */
import { TUNING } from '@content/tuning'
import type { CompanyPersona } from '@domain/enums'

export const RESERVE_MONTHS = 6
export const MIN_POST_PROJECT_RUNWAY_MONTHS = 3
export const GATE_HORIZON_DAYS = 90

export interface RunwayProjectInput {
  isPaused: boolean
  developmentRemainingCents: number
  plannedLaunchDay: number
  retainedTeamCostCents?: number
}

export interface RunwayInput {
  cashCents: number
  corporateFixedMonthlyCents: number
  projects: readonly RunwayProjectInput[]
  day: number
}

export interface RunwayResult {
  monthlyBurnCents: number
  runwayMonths: number
  projectBurnCents: number
  pausedBurnCents: number
}

/** 单项目月度烧钱：活跃按剩余开发预算摊到剩余计划期，暂停按保留团队成本。 */
export function projectMonthlyBurnCents(project: RunwayProjectInput, day: number): number {
  if (project.isPaused) return Math.max(0, project.retainedTeamCostCents ?? 0)
  const remainingMonths = Math.max(1, (project.plannedLaunchDay - day) / 30)
  return Math.max(0, Math.round(project.developmentRemainingCents / remainingMonths))
}

export function computeRunway(input: RunwayInput): RunwayResult {
  let projectBurnCents = 0
  let pausedBurnCents = 0
  for (const project of input.projects) {
    const burn = projectMonthlyBurnCents(project, input.day)
    if (project.isPaused) pausedBurnCents += burn
    else projectBurnCents += burn
  }
  const monthlyBurnCents = Math.max(
    0,
    input.corporateFixedMonthlyCents + projectBurnCents + pausedBurnCents,
  )
  return {
    monthlyBurnCents,
    runwayMonths:
      monthlyBurnCents > 0 ? Math.max(0, input.cashCents / monthlyBurnCents) : Number.POSITIVE_INFINITY,
    projectBurnCents,
    pausedBurnCents,
  }
}

/** 新项目月烧钱：开发预算按计划工期摊。 */
export function newProjectMonthlyBurnCents(developmentBudgetCents: number, plannedDays: number): number {
  return Math.max(0, Math.round(developmentBudgetCents / Math.max(1, plannedDays / 30)))
}

/**
 * 项目预算：全工期人工 + QA/本地化/认证 + 10% 预备金，再加营销预留。
 * 营销比例取画像区间中值，按 seed 抖动 ±20%，再夹回区间。
 */
export function computeProjectBudgetCents(params: {
  monthlyPayrollCents: number
  plannedDays: number
  persona: CompanyPersona
  marketingJitter?: number
}): { developmentBudgetCents: number; launchMarketingReservedCents: number; totalBudgetCents: number } {
  const months = Math.max(1, params.plannedDays / 30)
  const labor = Math.max(0, params.monthlyPayrollCents) * months
  const nonLabor = labor * TUNING.company.projectNonLaborRatio
  const developmentBudgetCents = Math.round(
    (labor + nonLabor) * (1 + TUNING.company.projectContingencyRatio),
  )
  const range = TUNING.ai.persona[params.persona].projectMarketingRatio
  const midpoint = (range.min + range.max) / 2
  const jitter = Math.max(0.8, Math.min(1.2, params.marketingJitter ?? 1))
  const ratio = Math.max(range.min, Math.min(range.max, midpoint * jitter))
  const launchMarketingReservedCents = Math.round(developmentBudgetCents * ratio)
  const totalBudgetCents = Math.max(
    TUNING.company.minProjectBudgetCents,
    developmentBudgetCents + launchMarketingReservedCents,
  )
  return { developmentBudgetCents, launchMarketingReservedCents, totalBudgetCents }
}

/** §4.3 立项闸门（不含项目数量上限，由调用方先判）。 */
export function evaluateProjectGate(params: {
  cashCents: number
  corporateFixedMonthlyCents: number
  existingProjectBurnsCents: readonly number[]
  accountsPayableCents: number
  newProjectDevelopmentBudgetCents: number
  plannedDays: number
  day: number
  activeProjectCount: number
}): { pass: boolean; failed: string[]; preRunwayMonths: number; postRunwayMonths: number } {
  const failed: string[] = []
  const existingBurn = params.existingProjectBurnsCents.reduce((a, b) => a + b, 0)
  const baseBurn = params.corporateFixedMonthlyCents + existingBurn
  const preRunwayMonths =
    baseBurn > 0 ? params.cashCents / baseBurn : Number.POSITIVE_INFINITY
  const horizonFixed = baseBurn * (GATE_HORIZON_DAYS / 30)
  const newBurn = newProjectMonthlyBurnCents(params.newProjectDevelopmentBudgetCents, params.plannedDays)
  const postRunwayMonths =
    baseBurn + newBurn > 0 ? params.cashCents / (baseBurn + newBurn) : Number.POSITIVE_INFINITY

  if (params.activeProjectCount >= 2) failed.push('PROJECT_LIMIT')
  if (preRunwayMonths < RESERVE_MONTHS) failed.push('PRE_RUNWAY')
  if (params.cashCents - horizonFixed - params.accountsPayableCents <= 0) failed.push('CASH_HORIZON')
  if (postRunwayMonths < MIN_POST_PROJECT_RUNWAY_MONTHS) failed.push('POST_RUNWAY')
  if (params.newProjectDevelopmentBudgetCents < TUNING.company.minProjectBudgetCents) {
    failed.push('MIN_BUDGET')
  }
  return { pass: failed.length === 0, failed, preRunwayMonths, postRunwayMonths }
}
