import type { Project } from '@domain/entities/project'
import type { ProjectPhase } from '@domain/enums'
import { TUNING } from '@content/tuning'
import { computeInitialDefectLevel } from '@simulation/systems/qa-quality'

/** 连续暂停满该天数后由每日调度触发系统自动取消（D-01） */
export const PAUSE_TIMEOUT_DAYS = 60

/** 终态项目（LAUNCHED/CANCELLED）不累计暂停、不判超时、不推进研发 */
export function isTerminalProjectPhase(phase: ProjectPhase): boolean {
  return phase === 'LAUNCHED' || phase === 'CANCELLED'
}

/**
 * 项目阶段转换表 —— 唯一定义处。
 * PAUSED 不是主状态，暂停使用 project.isPaused。
 */
export const VALID_PROJECT_TRANSITIONS: Record<ProjectPhase, ProjectPhase[]> = {
  CONCEPT: ['PRE_PRODUCTION'],
  PRE_PRODUCTION: ['PRODUCTION'],
  PRODUCTION: ['QA'],
  QA: ['READY_TO_LAUNCH'],
  READY_TO_LAUNCH: ['LAUNCHED'],
  LAUNCHED: [],
  CANCELLED: [],
}

export function canTransitionProject(from: ProjectPhase, to: ProjectPhase): boolean {
  return VALID_PROJECT_TRANSITIONS[from].includes(to)
}

/**
 * 执行阶段转换，并施加该阶段的领域副作用（唯一实现）：
 *   - 进入 QA：注入 QA 工作量 + 记录 initialDefectLevel
 *   - 其余阶段：仅切换状态
 * 不处理 LAUNCHED 的 actualLaunchDay（由 launch 命令按真实日期写入）。
 */
export function transitionProject(
  project: Project,
  to: ProjectPhase,
  dayIndex: number,
): Project | null {
  if (!canTransitionProject(project.phase, to)) return null

  let next: Project = {
    ...project,
    phase: to,
    subPhase: null,
    version: project.version + 1,
    updatedAt: dayIndex,
  }

  if (to === 'QA') {
    next = injectQaWork(next)
    next = { ...next, initialDefectLevel: computeInitialDefectLevel(next) }
  }

  return next
}

/** 注入 QA 工作量：总量 = 制作三学科总量 × qaWorkRatio，并保留最小保底 */
export function injectQaWork(project: Project): Project {
  if (project.workTotalByDiscipline.qa > 0) return project
  const productionTotal =
    project.workTotalByDiscipline.design +
    project.workTotalByDiscipline.programming +
    project.workTotalByDiscipline.art
  const qaTotal = Math.max(
    TUNING.project.minQaWorkPoints,
    Math.round(productionTotal * TUNING.project.qaWorkRatio),
  )
  return {
    ...project,
    workTotalByDiscipline: { ...project.workTotalByDiscipline, qa: qaTotal },
    workRemainingByDiscipline: { ...project.workRemainingByDiscipline, qa: qaTotal },
  }
}
