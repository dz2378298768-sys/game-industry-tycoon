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
    return kind === 'unknown' ? 'cancelled_generic' : 'cancelled_user'
  }
  if (p.isPaused) {
    if (p.budgetExhausted === true || p.pauseReason === 'budget_exhausted') return 'budget_exhausted'
    return 'manual_pause'
  }
  return 'active'
}

export type CancelReasonKind = 'pause_timeout' | 'user_requested' | 'scope_became_unviable' | 'unknown'

/**
 * 取消原因归一。领域枚举中玩家主动取消落库值为 `player_decision`（与设计稿 `user_requested` 同义），
 * 本函数将两者归为同一可读原因；`budget_exhausted` 不是取消原因（GDR D-UI-02），一并归入 unknown，
 * 确保其不会出现在取消原因弹窗中。
 */
export function normalizeCancellationReason(reason: string | null | undefined): CancelReasonKind {
  switch (reason) {
    case 'pause_timeout':
      return 'pause_timeout'
    case 'user_requested':
    case 'player_decision':
      return 'user_requested'
    case 'scope_became_unviable':
      return 'scope_became_unviable'
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
 * 取消发生日：优先可选字段 cancelledDay（设计稿 §2，当前实体尚未声明），
 * 退回 updatedAt（D-01 自动取消会写入 dayIndex）；两者皆缺时用当前日。
 */
export function projectCancelledDay(
  project: Project & { cancelledDay?: number | null },
  fallbackDay: number,
): number {
  if (typeof project.cancelledDay === 'number') return project.cancelledDay
  if (typeof project.updatedAt === 'number') return project.updatedAt
  return fallbackDay
}
