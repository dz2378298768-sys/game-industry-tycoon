import type { Discipline } from '@domain/enums'
import type { Project } from '@domain/entities/project'

export type QualityKey = 'gameplay' | 'technical' | 'content' | 'art' | 'innovation'

const DISCIPLINES: Discipline[] = ['design', 'programming', 'art']
const QUALITY_KEYS: QualityKey[] = ['gameplay', 'technical', 'content', 'art', 'innovation']

export interface DescopePreview {
  ratio: number
  newTotal: Record<Discipline, number>
  newRemaining: Record<Discipline, number>
  newQaTotal: number
  newQaRemaining: number
  newQuality: Record<QualityKey, number>
  /** 砍范围前五维质量上限（先乘后取整，恒 ≥ newQuality 每项） */
  qualityCeiling: Record<QualityKey, number>
  totalCut: number
  /** 无日产出（任一 d/p/a 为 0）或 QA 阶段时为 null（展示 `—`） */
  savedDays: number | null
  /** 无日产出或 QA 阶段为 null；允许为 0（$0） */
  savedBudgetCents: number | null
  /** 处于 QA 阶段时不回滚工作、但质量重掷 */
  qaReset: boolean
}

/**
 * 砍范围实时预览（DESIGN-C-01 §3.2 / DESIGN-UI-LAYER §2.4）。
 * 仅做展示计算，权威写入仍由 descopeProject 命令完成。
 */
export function computeDescopePreview(
  project: Project,
  daily: Record<Discipline, number>,
  ratio: number,
  dailyBurnCents: number,
): DescopePreview {
  const newTotal = {} as Record<Discipline, number>
  const newRemaining = {} as Record<Discipline, number>
  for (const d of DISCIPLINES) {
    newTotal[d] = Math.ceil(project.workTotalByDiscipline[d] * (1 - ratio))
    newRemaining[d] = Math.min(
      project.workRemainingByDiscipline[d],
      Math.max(0, newTotal[d] - (project.workTotalByDiscipline[d] - project.workRemainingByDiscipline[d])),
    )
  }
  const newQaTotal = Math.ceil((project.workTotalByDiscipline.qa ?? 0) * (1 - ratio))
  const newQaRemaining = Math.min(project.workRemainingByDiscipline.qa ?? 0, newQaTotal)

  const newQuality = {} as Record<QualityKey, number>
  const qualityCeiling = {} as Record<QualityKey, number>
  for (const k of QUALITY_KEYS) {
    const target = project.qualityTargets[k] ?? 0
    const estimate = project.qualityEstimate[k] ?? 0
    qualityCeiling[k] = Math.floor(target * (1 - ratio))
    newQuality[k] = Math.min(estimate, qualityCeiling[k])
  }

  const inQa = project.phase === 'QA' || project.phase === 'READY_TO_LAUNCH'
  let savedDays: number | null = null
  const hasDaily = DISCIPLINES.every((d) => daily[d] > 0)
  if (!inQa && hasDaily) {
    const daysOld = Math.max(...DISCIPLINES.map((d) => Math.ceil(project.workRemainingByDiscipline[d] / daily[d])))
    const daysNew = Math.max(...DISCIPLINES.map((d) => Math.ceil(newRemaining[d] / daily[d])))
    savedDays = Math.max(0, daysOld - daysNew)
  }
  const savedBudgetCents = savedDays === null ? null : Math.round(savedDays * dailyBurnCents)

  return {
    ratio,
    newTotal,
    newRemaining,
    newQaTotal,
    newQaRemaining,
    newQuality,
    qualityCeiling,
    totalCut: project.scopeCutRatio ?? 0,
    savedDays,
    savedBudgetCents,
    qaReset: inQa,
  }
}
