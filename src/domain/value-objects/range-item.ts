import type { Discipline, RiskLevel } from '@domain/enums'

/**
 * RangeItem —— 项目可工作单元（需求条目 / 任务）
 */
export interface RangeItem {
  id: string
  name: string
  description?: string
  discipline: Discipline
  workPoints: number
  completionRatio: number   // 0-1
  marketAppeal: number      // 0-10
  riskLevel: RiskLevel
  dependencyIds?: string[]
  addedAtDay: number        // dayIndex
}
