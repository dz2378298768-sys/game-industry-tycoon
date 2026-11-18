import type { EmployeeRole, Discipline } from '@domain/enums'
import type { Employee } from '@domain/entities/employee'

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

/** 技能等级 → 产能系数 */
export function skillFactor(skillLevel: number): number {
  return ({ 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3 } as Record<number, number>)[skillLevel] ?? 1.0
}

/** 士气 → 产能系数 */
export function moraleFactor(morale: number): number {
  if (morale >= 70) return 1.1
  if (morale >= 40) return 1.0
  if (morale >= 20) return 0.85
  return 0.7
}

/** 疲劳 → 产能系数 */
export function fatigueFactor(fatigue: number): number {
  if (fatigue <= 30) return 1.0
  if (fatigue <= 50) return 0.9
  if (fatigue <= 70) return 0.8
  if (fatigue <= 90) return 0.6
  return 0.4
}

/**
 * 按"员工"视角计算每日产能（未按项目分配之前）。
 * 输出：每个 discipline 每天产出多少 work points。
 */
export function baseEffectiveWorkPerDay(
  employee: Employee,
  focusFactor = 1.0,
): Record<Discipline, number> {
  const base = 5
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
  result[roleDisc] = Math.round(base * sf * mf * ff * focusFactor)
  return result
}
