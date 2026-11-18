import type {
  ProjectPhase,
  ConceptSubPhase,
  Discipline,
  CancellationReason,
} from '@domain/enums'
import type {
  RangeItem,
  TeamAssignment,
  ChangeLogEntry,
  QualityProfile,
} from '@domain/value-objects'

export interface Project {
  id: string
  companyId: string
  name: string
  genreId: string
  audienceSegmentIds: string[]
  targetPlatformIds: string[]
  phase: ProjectPhase
  subPhase: ConceptSubPhase | null
  isPaused: boolean
  plannedStartDay: number
  plannedLaunchDay: number
  actualStartDay?: number | null
  actualLaunchDay?: number | null
  scope: RangeItem[]
  budgetTotalCapCents: number
  budgetSpentCents: number
  budgetCommittedCents: number
  teamAssignments: TeamAssignment[]
  workRemainingByDiscipline: Record<Discipline, number>
  workTotalByDiscipline: Record<Discipline, number>
  qualityTargets: QualityProfile
  qualityEstimate: QualityProfile
  /** 进入 QA 时锁定的初始缺陷等级（0-100），QA 质量机制唯一输入 */
  initialDefectLevel?: number
  /** 上市时锁定的最终缺陷等级（0-100） */
  finalDefectLevel?: number
  /** 上市时锁定的最终质量分布 */
  finalQuality?: QualityProfile
  riskFlags: string[]
  changeLog: ChangeLogEntry[]
  cancellationReason: CancellationReason | null
  consecutivePauseDays: number
  version: number
  createdAt: number
  updatedAt: number
}
