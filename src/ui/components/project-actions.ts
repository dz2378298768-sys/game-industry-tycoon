import type { Company } from '@domain/entities/company'
import type { Project } from '@domain/entities/project'
import { isQaComplete } from '@simulation/systems/project-progress'
import { selectMaxLaunchDay } from './delay-preview'

/** 按钮可用性：原因键为数组（DESIGN-UI-LAYER §2.6），不再是单值 */
export interface ActionAvailability {
  visible: boolean
  enabled: boolean
  reasonKeys: string[]
}

export interface TierAvailability {
  value: number
  enabled: boolean
  reasonKey?: string | undefined
}

export type ProjectActionKey = 'pause' | 'advance' | 'launch' | 'cancel' | 'topUp' | 'descope' | 'delay'

export type ProjectActionState = Record<ProjectActionKey, ActionAvailability>

const ACTIVE_PROJECT_PHASES = new Set(['LAUNCHED', 'CANCELLED'])
const LATE_PHASE = new Set(['READY_TO_LAUNCH'])

export const DESCOPE_RATIOS = [0.1, 0.2, 0.3] as const
export const DESCOPE_CAP = 0.5

export function hasRemainingWork(project: Project): boolean {
  return (['design', 'programming', 'art', 'qa'] as const).some(
    (d) => project.workRemainingByDiscipline[d] > 0,
  )
}

/** 砍范围三档位：逐档判断累计上限 50%，超过则禁用并给出累计上限原因 */
export function selectDescopeTiers(project: Project): TierAvailability[] {
  const current = project.scopeCutRatio ?? 0
  return DESCOPE_RATIOS.map((ratio) => {
    const enabled = current + ratio <= DESCOPE_CAP + 1e-9
    return { value: ratio, enabled, reasonKey: enabled ? undefined : 'project.descope.maxReached' }
  })
}

/** 延期三档位：plannedLaunchDay + days ≤ original × 1.5 */
export function selectDelayTiers(project: Project): TierAvailability[] {
  const maxLaunchDay = selectMaxLaunchDay(project)
  return [30, 60, 90].map((days) => {
    const enabled = project.plannedLaunchDay + days <= maxLaunchDay
    return { value: days, enabled, reasonKey: enabled ? undefined : 'project.delay.maxReached' }
  })
}

/**
 * 破产三维启用矩阵（DESIGN-UI-LAYER §3.2）+ 常规动作阶段守卫。
 * 破产后仍可用：解雇 / 上市 / 取消 / 暂停恢复 / 阶段推进 / 砍范围 / 延期；禁用：招聘 / 立项 / 追加预算。
 */
export function selectProjectActionState(
  project: Project,
  company: Company | null | undefined,
  dayIndex: number,
): ProjectActionState {
  const isTerminal = ACTIVE_PROJECT_PHASES.has(project.phase)
  const latePhase = LATE_PHASE.has(project.phase)
  const isBankrupt = company?.status === 'bankrupt'

  const pause: ActionAvailability = {
    visible: !isTerminal,
    enabled: !isTerminal,
    reasonKeys: isTerminal ? ['project.action.terminal'] : [],
  }

  const advanceVisible = !isTerminal && project.phase !== 'READY_TO_LAUNCH'
  const advance: ActionAvailability = {
    visible: advanceVisible,
    enabled: advanceVisible && !project.isPaused,
    reasonKeys: advanceVisible && project.isPaused ? ['project.action.paused'] : [],
  }

  const launchVisible = project.phase === 'READY_TO_LAUNCH'
  const launch: ActionAvailability = {
    visible: launchVisible,
    enabled: launchVisible && isQaComplete(project) && dayIndex >= project.plannedLaunchDay && !project.isPaused,
    reasonKeys: launchVisible
      ? [isQaComplete(project) ? '' : 'project.action.qaIncomplete', dayIndex >= project.plannedLaunchDay ? '' : 'project.action.atPlannedDay', project.isPaused ? 'project.action.paused' : ''].filter(Boolean)
      : [],
  }

  const cancel: ActionAvailability = {
    visible: !isTerminal,
    enabled: !isTerminal,
    reasonKeys: isTerminal ? ['project.action.terminal'] : [],
  }

  const topUp: ActionAvailability = {
    visible: !isTerminal,
    enabled: !isTerminal && !isBankrupt,
    reasonKeys: isBankrupt ? ['finance.bankrupt.blocked.topUp'] : isTerminal ? ['project.action.terminal'] : [],
  }

  const descopeTiers = selectDescopeTiers(project)
  const descopeReasons: string[] = []
  if (latePhase) descopeReasons.push('project.descope.lateStage')
  if (!hasRemainingWork(project)) descopeReasons.push('project.descope.noWork')
  if (!descopeTiers.some((tier) => tier.enabled)) descopeReasons.push('project.descope.maxReached')
  const descope: ActionAvailability = {
    visible: !isTerminal,
    enabled: !isTerminal && descopeReasons.length === 0,
    reasonKeys: descopeReasons,
  }

  const delayTiers = selectDelayTiers(project)
  const delayReasons: string[] = []
  if (latePhase) delayReasons.push('project.delay.lateStage')
  if (!delayTiers.some((tier) => tier.enabled)) delayReasons.push('project.delay.maxReached')
  const delay: ActionAvailability = {
    visible: !isTerminal,
    enabled: !isTerminal && delayReasons.length === 0,
    reasonKeys: delayReasons,
  }

  return { pause, advance, launch, cancel, topUp, descope, delay }
}

export interface RiskBadge {
  flag: string
  key: string
  placeholder?: '{pct}' | '{days}'
  value?: number
}

export const RISK_ORDER = ['scope_descoped', 'launch_delayed', 'budget_exhausted', 'quality_risk'] as const

/** 风险徽标：数值化并统一排序；值为 0/旧存档缺失时用 risk.generic */
export function selectRiskBadges(project: Project): RiskBadge[] {
  const flags = new Set(project.riskFlags ?? [])
  const badges: RiskBadge[] = []

  const cut = project.scopeCutRatio ?? 0
  if (cut > 0) {
    badges.push({ flag: 'scope_descoped', key: 'project.risk.scope_descoped', placeholder: '{pct}', value: Math.round(cut * 100) })
  } else if (flags.has('scope_descoped')) {
    badges.push({ flag: 'scope_descoped', key: 'project.risk.generic' })
  }

  const delay = project.launchDelayDays ?? 0
  if (delay > 0) {
    badges.push({ flag: 'launch_delayed', key: 'project.risk.launch_delayed', placeholder: '{days}', value: delay })
  } else if (flags.has('launch_delayed')) {
    badges.push({ flag: 'launch_delayed', key: 'project.risk.generic' })
  }

  if (flags.has('budget_exhausted')) badges.push({ flag: 'budget_exhausted', key: 'project.risk.budget_exhausted' })
  if (flags.has('quality_risk')) badges.push({ flag: 'quality_risk', key: 'project.risk.quality_risk' })

  return badges.sort((a, b) => RISK_ORDER.indexOf(a.flag as never) - RISK_ORDER.indexOf(b.flag as never))
}
