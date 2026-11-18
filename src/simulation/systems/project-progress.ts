import type { Discipline, ProjectPhase } from '@domain/enums'
import type { Project } from '@domain/entities/project'

export const PRODUCTION_DISCIPLINES: Discipline[] = ['design', 'programming', 'art']
export const ALL_DISCIPLINES: Discipline[] = ['design', 'programming', 'art', 'qa']

/**
 * 各阶段允许累计的研发学科（设计裁定，唯一来源）。
 *
 *   CONCEPT          不允许
 *   PRE_PRODUCTION   不允许
 *   PRODUCTION       设计 / 程序 / 美术
 *   QA               仅 QA
 *   READY_TO_LAUNCH  不允许
 *   LAUNCHED         不允许
 *   CANCELLED        不允许
 */
export function allowedDisciplinesForPhase(phase: ProjectPhase): Discipline[] {
  if (phase === 'PRODUCTION') return ['design', 'programming', 'art']
  if (phase === 'QA') return ['qa']
  return []
}

export function canAccumulateWork(phase: ProjectPhase): boolean {
  return allowedDisciplinesForPhase(phase).length > 0
}

/**
 * 将每日各 discipline 的产能累减到项目剩余工作量上。
 * 只处理 allowed 中的学科；其余学科的产能直接丢弃。
 * 纯函数，返回新 Project。
 */
export function advanceProjectWork(
  project: Project,
  dailyByDiscipline: Record<Discipline, number>,
  allowed: Discipline[] = ALL_DISCIPLINES,
): Project {
  if (allowed.length === 0) return project
  const newRemaining: Record<Discipline, number> = {
    ...project.workRemainingByDiscipline,
  }
  let changed = false
  for (const d of allowed) {
    const before = newRemaining[d]
    const next = Math.max(0, before - Math.max(0, dailyByDiscipline[d]))
    newRemaining[d] = Math.round(next * 100) / 100
    if (newRemaining[d] !== before) changed = true
  }
  if (!changed) return project
  return { ...project, workRemainingByDiscipline: newRemaining }
}

/** 某学科完成度 0-1；总量为 0 视为已完成 */
export function completionRatio(project: Project, d: Discipline): number {
  const total = project.workTotalByDiscipline[d]
  if (total <= 0) return 1.0
  return Math.max(0, Math.min(1, (total - project.workRemainingByDiscipline[d]) / total))
}

/**
 * 生产阶段的三大核心领域（design/programming/art）全部达到 threshold 才算"大体完成"。
 */
export function allProductionDisciplinesCompleteAtLeast(
  project: Project,
  threshold: number,
): boolean {
  return PRODUCTION_DISCIPLINES.every((d) => completionRatio(project, d) >= threshold)
}

/** 三项生产学科中最小的完成度（用于提前进 QA 的惩罚强度） */
export function minProductionCompletionRatio(project: Project): number {
  return Math.min(...PRODUCTION_DISCIPLINES.map((d) => completionRatio(project, d)))
}

/** QA 完成度 */
export function qaCompletionRatio(project: Project): number {
  return completionRatio(project, 'qa')
}

/** QA 是否已完成 100% */
export function isQaComplete(project: Project): boolean {
  return project.workTotalByDiscipline.qa <= 0 || qaCompletionRatio(project) >= 1
}

/** 整个项目的总体完成度 */
export function totalCompletion(project: Project): number {
  let total = 0
  let done = 0
  for (const d of ALL_DISCIPLINES) {
    total += project.workTotalByDiscipline[d]
    done += project.workTotalByDiscipline[d] - project.workRemainingByDiscipline[d]
  }
  return total === 0 ? 0 : done / total
}

/**
 * 按当前每日产能估算完成指定学科剩余工作量所需天数。
 * 任一未完成学科没有有效产能时返回 null（无法估算）。
 * 纯函数，供 UI 展示「预计完成时间 / 延期风险」使用（设计裁定 A5）。
 */
export function estimateDaysToFinish(
  project: Project,
  dailyByDiscipline: Record<Discipline, number>,
  disciplines: Discipline[] = PRODUCTION_DISCIPLINES,
): number | null {
  let days = 0
  for (const d of disciplines) {
    const remaining = project.workRemainingByDiscipline[d]
    if (remaining <= 0) continue
    const rate = dailyByDiscipline[d]
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
    days = Math.max(days, Math.ceil(remaining / rate))
  }
  return days
}
