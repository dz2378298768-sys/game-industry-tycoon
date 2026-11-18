import type { Project } from '@domain/entities/project'
import type { QualityProfile } from '@domain/value-objects'
import { averageQuality } from '@domain/value-objects/quality-profile'
import { TUNING } from '@content/tuning'
import { clamp, round2 } from '@simulation/systems/work-systems'
import { completionRatio, minProductionCompletionRatio } from '@simulation/systems/project-progress'

/**
 * QA 质量机制（设计裁定 B7 / B8）——唯一定义处。
 *
 * initialDefectLevel = clamp(round(100 - 平均质量) + 提前进 QA 惩罚, 0, 100)
 *   提前进 QA 惩罚 = round((1 - 三项最小完成度) × earlyEntryPenaltyMax)
 *   生产 100% 完成时惩罚为 0。
 *
 * defectLevel(p) = clamp(round(initialDefectLevel × (1 - repairRatio × QA完成度)), 0, 100)
 *   随 QA 完成度单调不增。
 *
 * finalQuality = 各维度 × (1 - defectLevel / qualityPenaltyDivisor)，clamp 0-100。
 */

export function computeInitialDefectLevel(project: Project): number {
  const beforeQa = project.qualityEstimate
  const avg = averageQuality(beforeQa)
  const minRatio = minProductionCompletionRatio(project)
  const earlyPenalty = Math.round((1 - minRatio) * TUNING.qa.earlyEntryPenaltyMax)
  return clamp(Math.round(100 - avg) + earlyPenalty, 0, 100)
}

/** 读取项目中已记录的 initialDefectLevel；旧存档缺失时按当前状态重算 */
export function initialDefectLevelOf(project: Project): number {
  if (typeof project.initialDefectLevel === 'number') {
    return clamp(project.initialDefectLevel, 0, 100)
  }
  return computeInitialDefectLevel(project)
}

export function computeDefectLevel(project: Project): number {
  const initial = initialDefectLevelOf(project)
  const progress = completionRatio(project, 'qa')
  const repaired = initial * (1 - TUNING.qa.repairRatio * progress)
  return clamp(Math.round(repaired), 0, 100)
}

export function defectLevelOf(project: Project): number {
  if (typeof project.finalDefectLevel === 'number') {
    return clamp(project.finalDefectLevel, 0, 100)
  }
  return computeDefectLevel(project)
}

/** 缺陷导致的最终质量分布 */
export function computeFinalQuality(project: Project, defectLevel: number): QualityProfile {
  const factor = 1 - defectLevel / TUNING.qa.qualityPenaltyDivisor
  const scale = (v: number) => Math.round(clamp(v * factor, 0, 100) * 100) / 100
  const q = project.qualityEstimate
  return {
    gameplay: scale(q.gameplay),
    technical: scale(q.technical),
    content: scale(q.content),
    art: scale(q.art),
    innovation: scale(q.innovation),
  }
}

/** 质量估算的每日增长（制作阶段调用） */
export function growQualityEstimate(
  project: Project,
  daily: { design: number; programming: number; art: number },
): QualityProfile {
  const q = project.qualityEstimate
  const bump = (value: number, delta: number) => round2(clamp(value + delta, 0, 100))
  return {
    gameplay: bump(q.gameplay, daily.design * 0.1),
    technical: bump(q.technical, daily.programming * 0.1),
    content: bump(q.content, daily.design * 0.05 + daily.art * 0.05),
    art: bump(q.art, daily.art * 0.1),
    innovation: bump(q.innovation, 0.01),
  }
}
