import type {
  ProjectPhase,
  ConceptSubPhase,
  Discipline,
  CancellationReason,
} from '@domain/enums'
import type { ProjectCostAllocation } from './project-cost-allocation'
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
  /** 归属本项目的成本分摊记录（DESIGN-G05 §7.3）；旧存档缺省 [] */
  costAllocations?: ProjectCostAllocation[]
  teamAssignments: TeamAssignment[]
  workRemainingByDiscipline: Record<Discipline, number>
  workTotalByDiscipline: Record<Discipline, number>
  qualityTargets: QualityProfile
  qualityEstimate: QualityProfile
  /** 进入 QA 时锁定的初始缺陷等级（0-100），QA 质量机制唯一输入 */
  initialDefectLevel?: number
  /** 上市时锁定的最终缺陷等级（0-100） */
  finalDefectLevel?: number
  /** 上市时锁定的最终总质量 = 100 - finalDefectLevel（0-100） */
  finalQualityScore?: number
  /** 上市时锁定的「原始五维质量快照」，不是最终总质量 */
  finalQuality?: QualityProfile
  riskFlags: string[]
  changeLog: ChangeLogEntry[]
  cancellationReason: CancellationReason | null
  /** 连续暂停计数（完整游戏日），存档保留；终态项目不再累计 */
  pausedDays: number
  /** 本次暂停的原因；null 表示未暂停或原因未知 */
  pauseReason?: 'manual' | 'budget_exhausted' | null
  /** 预算耗尽态标记（DESIGN-G05 §6.2）；旧存档缺省 false */
  budgetExhausted?: boolean
  /** 已成功恢复次数，耗尽事件幂等键的组成（DESIGN-G05 §7.1 GDR R2）；旧存档缺省 0 */
  resumeSeq?: number
  version: number
  createdAt: number
  updatedAt: number
}
