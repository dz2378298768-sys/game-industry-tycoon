/**
 * §6.2 日产能 `Cap_d` / §6.4 成本预测 `Cost_est` / `ratio` / `verdict`。
 *
 * 显式边界（审核重点，C3 + N-01/P1）：
 *  - `Cap_d = 0` ⇒ `costPerUnit_d = +∞`（显式分支，避免 `0/ε = 0` 的假低成本）。
 *  - `∃d(W_d>0 ∧ Cap_d=0)` ⇒ `Cost_est = +∞`。
 *  - `W_d = 0` 的学科**不进入** `Σ_d[W_d × costPerUnit_d]` 求和（该项视为 0），
 *    即便其 `Cap_d=0`（`costPerUnit_d=+∞`）也不产生 `0 × +∞ = NaN`。
 *  - `Budget_cap = 0` ⇒ `ratio = +∞`；`verdict` 阈值原样消费 D-01 §6.2.1（不改阈值、不改 W_d）。
 */
import type { Discipline, HrbVerdict, TeamMember } from '@domain/entities/project-execution'
import type { BudgetCapacityCents, DisciplineWorkload } from './project-execution-cost-helpers'
import { DISCIPLINE_ORDER, type ProjectFormulaParams } from './project-execution-tuning'

/** `+∞` 判定。 */
export function isInfinite(x: number): boolean {
  return x === Number.POSITIVE_INFINITY
}

/** §6.2 `f_skill(ℓ)`；缺键 0（§10 B-9，不伪造产能）。 */
export function skillEfficiency(level: number, params: ProjectFormulaParams): number {
  return params.fSkill[level] ?? 0
}

/**
 * §6.2 `team_d = { e : available(e,day) ∧ skillLevel(e,d) > 0 }`；
 * `Cap_d(day) = k_output × Σ f_skill(skillLevel(e,d))`。
 */
export function computeCapacity(
  members: ReadonlyArray<TeamMember>,
  discipline: Discipline,
  day: number,
  params: ProjectFormulaParams,
): number {
  let sum = 0
  for (const m of members) {
    if (m.available !== undefined && !m.available(day)) continue
    const level = m.skillLevels[discipline] ?? 0
    if (level <= 0) continue
    sum += skillEfficiency(level, params)
  }
  return params.kOutput * sum
}

/** 全学科当日产能。 */
export function computeCapacityVector(
  members: ReadonlyArray<TeamMember>,
  day: number,
  params: ProjectFormulaParams,
): Record<Discipline, number> {
  const out = emptyDisciplineMap()
  for (const d of DISCIPLINE_ORDER) out[d] = computeCapacity(members, d, day, params)
  return out
}

/**
 * §6.4 `salaryDaily_d = (Σ_{e∈team_d} salary_e × w_e[d]) / workingDaysPerMonth`。
 * 只统计该学科可用（含 skillLevel>0）成员的薪资，与 Cap_d 同集合口径。
 */
export function computeSalaryDaily(
  members: ReadonlyArray<TeamMember>,
  discipline: Discipline,
  day: number,
  params: ProjectFormulaParams,
): number {
  let sum = 0
  for (const m of members) {
    if (m.available !== undefined && !m.available(day)) continue
    if ((m.skillLevels[discipline] ?? 0) <= 0) continue
    const weight = m.salaryWeight?.[discipline] ?? 1
    sum += m.salaryCentsPerMonth * weight
  }
  return sum / params.workingDaysPerMonth
}

/** §6.4 `costPerUnit_d = if Cap_d==0 then +∞ else salaryDaily_d / Cap_d`（C3 显式分支）。 */
export function computeCostPerUnit(
  salaryDailyCents: number,
  capacity: number,
  params: ProjectFormulaParams,
): number {
  if (capacity <= params.epsilon) return Number.POSITIVE_INFINITY
  return salaryDailyCents / capacity
}

export interface CostEstimateInput {
  workload: DisciplineWorkload
  members: ReadonlyArray<TeamMember>
  day: number
  budgetCapacityCents: BudgetCapacityCents
  hrb: number
  /** 快照 RiskProfile（D-01 §6.4，只读）：R_tech / R_scope。 */
  rTech: number
  rScope: number
}

export interface CostEstimateResult {
  capacity: Record<Discipline, number>
  salaryDailyCents: Record<Discipline, number>
  costPerWorkUnit: Record<Discipline, number>
  budgetCapCents: number
  costEstCents: number
  ratio: number
  verdict: HrbVerdict
  reasoning: string[]
  /** 成本驱动前三（label, cents）；`+∞` 成本时为空。 */
  drivers: Array<{ discipline: Discipline; cents: number }>
}

function emptyDisciplineMap(): Record<Discipline, number> {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
}

/**
 * §6.4 全量成本估算。纯函数：无随机、无全局 TUNING 读取。
 * `Budget_cap = round(hrb × budgetCapacityCents)`（D-01 §6.2.1，整数美分）。
 */
export function estimateProjectCost(input: CostEstimateInput, params: ProjectFormulaParams): CostEstimateResult {
  const capacity = emptyDisciplineMap()
  const salaryDailyCents = emptyDisciplineMap()
  const costPerWorkUnit = emptyDisciplineMap()

  for (const d of DISCIPLINE_ORDER) {
    capacity[d] = computeCapacity(input.members, d, input.day, params)
    salaryDailyCents[d] = computeSalaryDaily(input.members, d, input.day, params)
    costPerWorkUnit[d] = computeCostPerUnit(salaryDailyCents[d], capacity[d], params)
  }

  const budgetCapCents = Math.round(input.hrb * input.budgetCapacityCents)

  // —— Cost_est：显式分支，杜绝 0×+∞ ——
  const loaded = DISCIPLINE_ORDER.filter((d) => input.workload[d] > 0)
  const starved = loaded.filter((d) => capacity[d] <= params.epsilon)
  let costEstCents: number
  const drivers: Array<{ discipline: Discipline; cents: number }> = []
  if (starved.length > 0) {
    // C3：有工作量但无团队 ⇒ +∞（§6.7 / §10 B-2 / TC-10）
    costEstCents = Number.POSITIVE_INFINITY
  } else {
    let base = 0
    for (const d of loaded) {
      // N-01/P1：只有 W_d>0 的学科参与求和；W_d=0 直接跳过（即便 costPerUnit=+∞）
      const item = input.workload[d] * costPerWorkUnit[d]
      base += item
      drivers.push({ discipline: d, cents: item })
    }
    const riskBuffer = 1 + params.kRiskCost * Math.max(input.rTech, input.rScope)
    costEstCents = Math.ceil(base * riskBuffer)
    drivers.sort((a, b) => b.cents - a.cents)
  }

  const ratio = budgetCapCents === 0 ? Number.POSITIVE_INFINITY : costEstCents / budgetCapCents
  const verdict: HrbVerdict =
    ratio <= params.hrbFeasibleRatioMax
      ? 'feasible'
      : ratio <= params.hrbStretchRatioMax
        ? 'need_more_budget_or_delay'
        : 'need_reduce_scope_or_lower_goal'

  const reasoning: string[] = []
  for (const s of starved) reasoning.push(`学科 ${s} 有工作量但无可用团队：Cost_est=+∞`)
  if (budgetCapCents === 0) reasoning.push('Budget_cap=0（hrb=0）：ratio=+∞')
  reasoning.push(
    verdict === 'feasible'
      ? '成本在预算承诺内（ratio ≤ 1.0）'
      : verdict === 'need_more_budget_or_delay'
        ? '成本略超预算承诺：追加预算或延期（玩家二选一，系统不自动缩放）'
        : '成本显著超预算承诺：缩减范围或降低质量目标（仅文本提示，不消费 qualityCeilingBand）',
  )

  return {
    capacity,
    salaryDailyCents,
    costPerWorkUnit,
    budgetCapCents,
    costEstCents,
    ratio,
    verdict,
    reasoning,
    drivers: drivers.slice(0, 3),
  }
}
