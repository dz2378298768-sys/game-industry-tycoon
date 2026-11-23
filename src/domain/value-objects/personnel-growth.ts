/**
 * D-03 技能成长（规格 §6.8，C8/D03-11 + ADJ-2026-11-22-12 S5-2 最小实现）。
 *
 * - §6.8 通用式：effort(e,d,day) ∈ [0,1]（上界依赖 share 分母按 (e,d) 跨项目求和，C16 反证锁）；
 *   exp += effort × k_expPerDay[level]；到 expCap 升级（冷却 + lastLevelUpDay 防连升）。
 * - S5-2 最小实现（ADJ-2026-11-22-12）：完成一个 WorkPackage 后对应学科 +0.1 档经验值
 *   内部累计（recordWpCompletion），跨档阈值 expCap（TUNING）。
 */
import type { D03Assignment, D03Discipline, SkillProfile } from '@domain/entities/personnel'
import type { PersonnelParams } from './personnel-tuning'
import { effortOf } from './personnel-availability'

export interface GrowthOutcome {
  skills: SkillProfile
  leveledUp: boolean
  newLevel?: number
}

function cloneSkills(s: SkillProfile): SkillProfile {
  return { personId: s.personId, level: { ...s.level }, exp: { ...s.exp }, lastLevelUpDay: { ...s.lastLevelUpDay } }
}

/**
 * 经验累积 + 升级判定（§6.8 原式）。
 * exp[e][d] ≥ expCap[level] ∧ day − lastLevelUpDay[d] ≥ growthCooldownDays ⇒ level+1（max 5）。
 */
export function accumulateExp(
  skills: SkillProfile,
  discipline: D03Discipline,
  amount: number,
  day: number,
  p: PersonnelParams,
): GrowthOutcome {
  const next = cloneSkills(skills)
  const level = next.level[discipline] ?? 0
  const exp = (next.exp[discipline] ?? 0) + amount
  next.exp[discipline] = exp
  const cap = p.expCap[Math.min(level, p.expCap.length - 1)] ?? p.expCap[p.expCap.length - 1] ?? Number.POSITIVE_INFINITY
  const last = next.lastLevelUpDay[discipline] ?? Number.NEGATIVE_INFINITY
  if (exp >= cap && level < 5 && day - last >= p.growthCooldownDays) {
    next.level[discipline] = level + 1
    next.exp[discipline] = 0
    next.lastLevelUpDay[discipline] = day
    return { skills: next, leveledUp: true, newLevel: level + 1 }
  }
  return { skills: next, leveledUp: false }
}

/**
 * S5-2 最小实现：完成一个 WP ⇒ 对应学科 +0.1 档经验值（内部累计），跨档阈值 TUNING。
 * 返回新 SkillProfile 与是否升级；无冷却豁免（与 §6.8 同一升级判定）。
 */
export function recordWpCompletion(
  skills: SkillProfile,
  discipline: D03Discipline,
  day: number,
  p: PersonnelParams,
): GrowthOutcome {
  return accumulateExp(skills, discipline, p.expPerWpCompletion, day, p)
}

/**
 * §6.8 每日路径：按产出日志（out_wp>0 的项目集）求 effort 再累积。
 * effort ∈ [0,1]（反证锁：若按 (e,d,p) 分组取分母 ⇒ share≡1 ⇒ effort>1 ⇒ FAIL，TC-21）。
 */
export function applyDailyGrowth(
  skills: SkillProfile,
  assignments: readonly D03Assignment[],
  employmentId: string,
  discipline: D03Discipline,
  day: number,
  projectsWithOutput: readonly string[],
  p: PersonnelParams,
): { outcome: GrowthOutcome; effort: number } {
  const effort = effortOf(assignments, employmentId, discipline, day, projectsWithOutput)
  const k = p.kExpPerDay[Math.min(skills.level[discipline] ?? 0, p.kExpPerDay.length - 1)] ?? 0
  return { outcome: accumulateExp(skills, discipline, effort * k, day, p), effort }
}
