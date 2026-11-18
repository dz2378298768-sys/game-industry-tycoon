import type { Project } from '@domain/entities/project'
import type { QualityProfile } from '@domain/value-objects'
import { averageQuality } from '@domain/value-objects/quality-profile'
import { TUNING } from '@content/tuning'
import { clamp, round2 } from '@simulation/systems/work-systems'
import {
  completionRatio,
  PRODUCTION_DISCIPLINES,
} from '@simulation/systems/project-progress'

/**
 * QA 质量机制（设计裁定 B7 / B8）——唯一定义处。
 *
 * B7 提前进入惩罚：
 *   平均剩余生产完成度 = 设计/程序/美术 三项 (1 - 完成度) 的平均值
 *   earlyEntryPenalty = 平均剩余生产完成度 × TUNING.qa.earlyEntryPenaltyFactor(50)
 *   initialDefectLevel = clamp(round(100 - productionQuality + earlyEntryPenalty), 0, 100)
 *   生产 100% 完成时惩罚为 0。
 *
 * B8 缺陷修复：
 *   defectLevel = clamp(round(initialDefectLevel × (1 - repairRatio(0.7) × QA完成度)), 0, 100)
 *   随 QA 完成度单调不增。
 *
 * 最终总质量：finalQualityScore = clamp(100 - defectLevel, 0, 100)。
 * 五维 qualityProfile 为「原始生产质量快照」，与最终总质量分开保存，不得混用。
 */

/** 三项生产学科的平均剩余完成度（0-1） */
export function averageRemainingProductionRatio(project: Project): number {
  const total = PRODUCTION_DISCIPLINES.reduce(
    (sum, d) => sum + (1 - completionRatio(project, d)),
    0,
  )
  return total / PRODUCTION_DISCIPLINES.length
}

/** 提前进入 QA 的额外缺陷惩罚（缺陷点） */
export function computeEarlyEntryPenalty(project: Project): number {
  return averageRemainingProductionRatio(project) * TUNING.qa.earlyEntryPenaltyFactor
}

export function computeInitialDefectLevel(project: Project): number {
  const productionQuality = averageQuality(project.qualityEstimate)
  return clamp(
    Math.round(100 - productionQuality + computeEarlyEntryPenalty(project)),
    0,
    100,
  )
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

/** 最终总质量 = 100 - 最终缺陷等级（设计裁定 B8） */
export function computeFinalQualityScore(defectLevel: number): number {
  return clamp(100 - defectLevel, 0, 100)
}

/** 原始五维质量快照（生产阶段累积的质量估算），与最终总质量分开保存 */
export function snapshotQualityProfile(project: Project): QualityProfile {
  return { ...project.qualityEstimate }
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
