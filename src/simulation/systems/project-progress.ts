import type { Discipline, ProjectPhase } from '@domain/enums'
import type { Project } from '@domain/entities/project'

/**
 * 将每日各 discipline 的产能累减到项目剩余工作量上。
 * 纯函数，返回新 Project（workRemainingByDiscipline 可能变化）。
 */
export function advanceProjectWork(
  project: Project,
  dailyByDiscipline: Record<Discipline, number>,
): Project {
  const newRemaining: Record<Discipline, number> = {
    ...project.workRemainingByDiscipline,
  }
  let changed = false
  for (const d of ['design', 'programming', 'art', 'qa'] as Discipline[]) {
    const before = newRemaining[d]
    newRemaining[d] = Math.max(0, newRemaining[d] - dailyByDiscipline[d])
    if (newRemaining[d] !== before) changed = true
  }
  if (!changed) return project
  return { ...project, workRemainingByDiscipline: newRemaining }
}

export function completionRatio(project: Project, d: Discipline): number {
  const total = project.workTotalByDiscipline[d]
  if (total === 0) return 1.0
  const done = total - project.workRemainingByDiscipline[d]
  return done / total
}

/**
 * 生产阶段的三大核心领域（design/programming/art）全部达到 threshold 才算"大体完成"。
 * QA 不在其中。
 */
export function allProductionDisciplinesCompleteAtLeast(
  project: Project,
  threshold: number,
): boolean {
  return (
    completionRatio(project, 'design') >= threshold &&
    completionRatio(project, 'programming') >= threshold &&
    completionRatio(project, 'art') >= threshold
  )
}

/** 整个项目的总体完成度 */
export function totalCompletion(project: Project): number {
  let total = 0
  let done = 0
  for (const d of ['design', 'programming', 'art', 'qa'] as Discipline[]) {
    total += project.workTotalByDiscipline[d]
    done += project.workTotalByDiscipline[d] - project.workRemainingByDiscipline[d]
  }
  return total === 0 ? 0 : done / total
}

/** 防未使用 lint 警告 */
void ({} as ProjectPhase)
