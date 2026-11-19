import type { Project } from '@domain/entities/project'

/** 四类暂停/取消状态 + 通用已取消（历史存档缺原因） */
export type ProjectStatusKind =
  | 'active'
  | 'manual_pause'
  | 'budget_exhausted'
  | 'cancelled_timeout'
  | 'cancelled_user'
  | 'cancelled_generic'

type StatusSource = Pick<
  Project,
  'phase' | 'isPaused' | 'pauseReason' | 'budgetExhausted' | 'cancellationReason'
>

/**
 * 状态归一（DESIGN-M1-PAUSE-TIMEOUT-UI-001 §1、GDR D-UI-04）：
 * 预算耗尽优先于手动暂停；CANCELLED 按 cancellationReason 区分自动/主动/未知。
 */
export function resolveProjectStatus(p: StatusSource): ProjectStatusKind {
  if (p.phase === 'CANCELLED') {
    if (p.cancellationReason === 'pause_timeout') return 'cancelled_timeout'
    const kind = normalizeCancellationReason(p.cancellationReason)
    return kind === 'unknown' || kind === 'legacy' ? 'cancelled_generic' : 'cancelled_user'
  }
  if (p.isPaused) {
    if (p.budgetExhausted === true || p.pauseReason === 'budget_exhausted') return 'budget_exhausted'
    return 'manual_pause'
  }
  return 'active'
}

/**
 * 取消原因归一（映射表唯一权威：TASK-M1.1-UI-001-FIX §10 / DESIGN §3.4 v1.3）。
 * `budget_exhausted` 不是取消原因（GDR D-UI-02），历史存档出现该值单独归为 `legacy`，
 * 不得归入玩家取消，也不得展示为 `budget_exhausted` 原文。
 */
export type CancelReasonKind =
  | 'pause_timeout'
  | 'player_decision'
  | 'scope_became_unviable'
  | 'team_dissolved'
  | 'market_window_missed'
  | 'legacy'
  | 'unknown'

export function normalizeCancellationReason(reason: string | null | undefined): CancelReasonKind {
  switch (reason) {
    case 'pause_timeout':
      return 'pause_timeout'
    case 'player_decision':
      return 'player_decision'
    case 'scope_became_unviable':
      return 'scope_became_unviable'
    case 'team_dissolved':
      return 'team_dissolved'
    case 'market_window_missed':
      return 'market_window_missed'
    case 'budget_exhausted':
      return 'legacy'
    default:
      return 'unknown'
  }
}

export const STATUS_ICON: Record<ProjectStatusKind, string> = {
  active: '▶',
  manual_pause: '⏸',
  budget_exhausted: '⚠',
  cancelled_timeout: '⛔',
  cancelled_user: '✕',
  cancelled_generic: '✕',
}

export const STATUS_LABEL_KEY: Record<Exclude<ProjectStatusKind, 'active'>, string> = {
  manual_pause: 'project.status.manualPaused',
  budget_exhausted: 'project.status.exhausted',
  cancelled_timeout: 'project.status.cancelledTimeout',
  cancelled_user: 'project.status.cancelledUser',
  cancelled_generic: 'project.status.cancelled',
}

/** 取消态判定（列表/详情入口共用） */
export function isCancelledStatus(kind: ProjectStatusKind): boolean {
  return kind === 'cancelled_timeout' || kind === 'cancelled_user' || kind === 'cancelled_generic'
}

/**
 * 取消发生日：唯一来源 `updatedAt`（TASK-M1.1-UI-001-FIX F4）。
 * 主动取消由 ProjectService.cancel 写入传入的游戏日；超时取消由每日调度写入 dayIndex。
 * 不再回退“当前日”，避免把未知日期伪造成精确值。
 */
export function projectCancelledDay(project: Project & { cancelledDay?: number | null }): number {
  if (typeof project.cancelledDay === 'number') return project.cancelledDay
  return project.updatedAt
}
