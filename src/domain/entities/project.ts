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
  riskFlags: string[]
  changeLog: ChangeLogEntry[]
  cancellationReason: CancellationReason | null
  consecutivePauseDays: number
  version: number
  createdAt: number
  updatedAt: number
}
