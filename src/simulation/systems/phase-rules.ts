import type { Project } from '@domain/entities/project'
import type { ProjectPhase, CancellationReason } from '@domain/enums'
import { TUNING } from '@content/tuning'
import { computeInitialDefectLevel } from '@simulation/systems/qa-quality'

/**
 * 项目阶段转换表 —— 唯一定义处。
 * PAUSED 不是主状态，暂停使用 project.isPaused。
 *
 * 规格 08_补齐/01 第 4 节：任何非终态阶段均可转入 CANCELLED（玩家主动 / 连续暂停超限）。
 * LAUNCHED 不能用取消，只能用产品退市。
 */
export const VALID_PROJECT_TRANSITIONS: Record<ProjectPhase, ProjectPhase[]> = {
  CONCEPT: ['PRE_PRODUCTION', 'CANCELLED'],
  PRE_PRODUCTION: ['PRODUCTION', 'CANCELLED'],
  PRODUCTION: ['QA', 'CANCELLED'],
  QA: ['READY_TO_LAUNCH', 'CANCELLED'],
  READY_TO_LAUNCH: ['LAUNCHED', 'CANCELLED'],
  LAUNCHED: [],
  CANCELLED: [],
}

export function canTransitionProject(from: ProjectPhase, to: ProjectPhase): boolean {
  return VALID_PROJECT_TRANSITIONS[from].includes(to)
}

export interface TransitionOptions {
  /** 仅在 to === 'CANCELLED' 时使用；CANCELLED 时必填（规格 08_补齐/01 第 3 节） */
  cancellationReason?: CancellationReason
}

/**
 * 执行阶段转换，并施加该阶段的领域副作用（唯一实现）：
 *   - 进入 QA：注入 QA 工作量 + 记录 initialDefectLevel
 *   - 进入 CANCELLED：isPaused 必须为 false，并写入 cancellationReason
 *   - 进入 LAUNCHED：isPaused 必须为 false
 *   - 其余阶段：仅切换状态
 * 不处理 LAUNCHED 的 actualLaunchDay（由 launch 命令按真实日期写入）。
 */
export function transitionProject(
  project: Project,
  to: ProjectPhase,
  dayIndex: number,
  options: TransitionOptions = {},
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

  if (to === 'CANCELLED') {
    next = {
      ...next,
      isPaused: false,
      cancellationReason: options.cancellationReason ?? project.cancellationReason ?? null,
    }
  }

  if (to === 'LAUNCHED') {
    next = { ...next, isPaused: false }
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
