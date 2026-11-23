import type { EmployeeRole, Discipline } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'
import { TUNING } from '@content/tuning'

/** 员工角色 → 专业领域映射；producer/manager 不属于任何领域 */
export function roleToDiscipline(role: EmployeeRole): Discipline | null {
  const map: Record<string, Discipline> = {
    programmer: 'programming',
    designer: 'design',
    artist: 'art',
    qa: 'qa',
  }
  return map[role] ?? null
}

/** 保留两位小数，保证确定性且不丢精度 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 技能等级 → **日常产能 / 招聘预览**系数（W5-C6 语义域 A）。
 * 与项目执行公式的 `fSkill`（语义域 B）刻意分域，二者禁止互相覆盖；技能 3 级两域均 = 1.0。
 */
export function skillFactor(skillLevel: number): number {
  return TUNING.employee.skillMultiplier[skillLevel] ?? 1.0
}

/** 士气 → 产能系数 */
export function moraleFactor(morale: number): number {
  for (const tier of TUNING.employee.moraleMultiplier) {
    if (morale >= tier.min) return tier.multiplier
  }
  return 1.0
}

/** 疲劳 → 产能系数 */
export function fatigueFactor(fatigue: number): number {
  for (const tier of TUNING.employee.fatigueMultiplier) {
    if (fatigue <= tier.max) return tier.multiplier
  }
  return 0.4
}

/**
 * 按「员工」视角计算每日产能（未按项目分配之前）。
 * 输出：每个 discipline 每天产出多少 work points。
 * 保留两位小数，避免低投入比例被取整抹掉。
 */
export function baseEffectiveWorkPerDay(
  employee: Employee,
  focusFactor = 1.0,
): Record<Discipline, number> {
  const base = TUNING.employee.baseDailyWorkPoints
  const sf = skillFactor(employee.skillLevel)
  const mf = moraleFactor(employee.morale)
  const ff = fatigueFactor(employee.fatigue)
  const roleDisc = roleToDiscipline(employee.role)
  const result: Record<Discipline, number> = {
    design: 0,
    programming: 0,
    art: 0,
    qa: 0,
  }
  if (!roleDisc) return result
  result[roleDisc] = round2(base * sf * mf * ff * focusFactor)
  return result
}
