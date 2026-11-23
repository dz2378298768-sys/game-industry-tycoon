/**
 * D-03 提供给 Project 的两项输入（规格 §6.1 Z1/Z2/Z3；R-D03-2：不重定义 team_d/Cap_d）。
 *
 * - Z1：teamRefs 原样展开，不做任何额外过滤（悬空引用记 D03_DANGLING_TEAMREF 不入集）；
 * - Z2：available ≡ occupiesPerson ∧ status∈{probation,active,resigning} ∧ day ≤ (endDay ?? +∞)；
 *   **不引入任何 discipline 过滤**（C1 / D03-01 反证锁：按 Assignment.discipline 收窄 ⇒ Cap_code 22 ≠ 32）；
 * - Z3：skillLevel(e,d) ≡ Person.skills.level[d] ?? 0（缺键=0，Project B-9；audio P1 恒 0）。
 */
import type { D03Assignment, D03Discipline, Employment, SkillProfile } from '@domain/entities/personnel'
import { toD03Discipline } from '@domain/entities/personnel'

/** Z3：技能等级，缺键 = 0。 */
export function skillLevelOf(skills: SkillProfile, d: D03Discipline): number {
  return skills.level[d] ?? 0
}

/** Z2：Employment 可用性（仅状态/占人/离职截止日，不含 Assignment 窗口）。 */
export function isEmploymentAvailable(e: Employment, day: number): boolean {
  if (!e.occupiesPerson) return false
  if (e.status !== 'probation' && e.status !== 'active' && e.status !== 'resigning') return false
  if (e.endDay !== null && day > e.endDay) return false
  return true
}

/**
 * Assignment 学科合法性（E14）：discipline ∉ 五元素 ⇒ D03_UNKNOWN_SKILL，
 * 该分配不参与 share（0 权重），不影响 team_d。
 */
export function assignmentDisciplineOrNull(a: D03Assignment): D03Discipline | null {
  return toD03Discipline(a.discipline)
}

/**
 * §6.2 share(e, p, d)：分母 = allocs(e,d) 全体分配（该 (e,d) **跨全部项目**求和，C16 反证锁）；
 * allocs(e,d)=∅ ⇒ share=0（显式空集分支）。
 * 非法学科分配不参与分母与分子（D03_UNKNOWN_SKILL）。
 */
export function shareOf(
  assignments: readonly D03Assignment[],
  employmentId: string,
  projectId: string,
  discipline: D03Discipline,
  day: number,
): number {
  const allocs = assignments.filter((a) => {
    if (a.employmentId !== employmentId) return false
    if (assignmentDisciplineOrNull(a) !== discipline) return false
    if (a.effectiveFrom !== null && a.effectiveFrom !== undefined && a.effectiveFrom > day) return false
    if (a.effectiveTo !== null && a.effectiveTo !== undefined && day > a.effectiveTo) return false
    return true
  })
  if (allocs.length === 0) return 0
  const forProject = allocs.filter((a) => a.projectId === projectId)
  if (forProject.length === 0) return 0
  const denominator = allocs.reduce((sum, a) => sum + a.allocationRatio, 0)
  if (denominator <= 0) return 0
  const numerator = forProject.reduce((sum, a) => sum + a.allocationRatio, 0)
  return numerator / denominator
}

/** eff_share = share × fatigue_or_leave_factor（P1 恒 1，OPEN-D03-3 冻结）。 */
export function effShareOf(
  assignments: readonly D03Assignment[],
  employmentId: string,
  projectId: string,
  discipline: D03Discipline,
  day: number,
): number {
  return shareOf(assignments, employmentId, projectId, discipline, day) * 1
}

/** §6.8 effort(e, d, day)：按（当日有 out_wp>0 的项目）求和 eff_share；定义域 [0,1]。 */
export function effortOf(
  assignments: readonly D03Assignment[],
  employmentId: string,
  discipline: D03Discipline,
  day: number,
  projectsWithOutput: readonly string[],
): number {
  let total = 0
  for (const p of projectsWithOutput) {
    total += effShareOf(assignments, employmentId, p, discipline, day)
  }
  return total
}

/**
 * §6.2 allocationLoad_d（D-03 自有量，无量纲，仅 UI/成本视角）：
 * T_d = 该项目该学科有活跃分配的 Employment；T_d=∅ ⇒ 0；max(1,|T_d|) 防除零。
 * **不参与 Cap_d、不参与瓶颈排序**（禁止顶替 Project burden_d）。
 */
export function allocationLoadOf(
  assignments: readonly D03Assignment[],
  projectId: string,
  discipline: D03Discipline,
  day: number,
): number {
  const employmentIds = new Set<string>()
  let effSum = 0
  for (const a of assignments) {
    if (a.projectId !== projectId) continue
    if (assignmentDisciplineOrNull(a) !== discipline) continue
    if (a.effectiveFrom !== null && a.effectiveFrom !== undefined && a.effectiveFrom > day) continue
    if (a.effectiveTo !== null && a.effectiveTo !== undefined && day > a.effectiveTo) continue
    employmentIds.add(a.employmentId)
    effSum += effShareOf(assignments, a.employmentId, projectId, discipline, day)
  }
  return effSum / Math.max(1, employmentIds.size)
}
