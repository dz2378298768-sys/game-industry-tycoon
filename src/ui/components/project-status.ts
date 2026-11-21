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

/**
 * 取消文案分类（TASK-M1.1-UI-001-FIX3 §10）：把领域取消原因（含归一后的 legacy/unknown）
 * 收窄为 6 个展示类别，供徽标短标签与详情横幅标题共用同一份映射。
 * 命名说明见交付说明：任务书写作 `CancelReasonKind` 的名称已被上面的 7 值归一类型占用
 * （弹窗依赖，改它需动 out-of-scope 文件），故新类型命名 `CancelReasonCategory`。
 */
export type CancelReasonCategory = 'timeout' | 'user' | 'scope' | 'team' | 'market' | 'legacy'

/** 取消文案分类判定：领域 6 值 + null/未知 → 6 类，任何消费点不得自行 switch */
export function resolveCancelReason(reason: string | null | undefined): CancelReasonCategory {
  switch (normalizeCancellationReason(reason)) {
    case 'pause_timeout':
      return 'timeout'
    case 'player_decision':
      return 'user'
    case 'scope_became_unviable':
      return 'scope'
    case 'team_dissolved':
      return 'team'
    case 'market_window_missed':
      return 'market'
    default:
      return 'legacy'
  }
}

/** 徽标短标签（≤5 汉字，避免列表列换行），文案唯一权威：TASK-M1.1-UI-001-FIX3 §10 */
export const CANCEL_BADGE_KEY: Record<CancelReasonCategory, string> = {
  timeout: 'project.status.cancelled.timeout',
  user: 'project.status.cancelled.user',
  scope: 'project.status.cancelled.scope',
  team: 'project.status.cancelled.team',
  market: 'project.status.cancelled.market',
  legacy: 'project.status.cancelled.legacy',
}

/** 详情取消横幅标题（仅标题，说明句由取消原因弹窗承担），文案唯一权威同上 */
export const CANCEL_BANNER_KEY: Record<CancelReasonCategory, string> = {
  timeout: 'project.banner.cancel.title.pause_timeout',
  user: 'project.banner.cancel.title.player_decision',
  scope: 'project.banner.cancel.title.scope_became_unviable',
  team: 'project.banner.cancel.title.team_dissolved',
  market: 'project.banner.cancel.title.market_window_missed',
  legacy: 'project.banner.cancel.title.unknown',
}

export const STATUS_ICON: Record<ProjectStatusKind, string> = {
  active: '▶',
  manual_pause: '⏸',
  budget_exhausted: '⚠',
  cancelled_timeout: '⛔',
  cancelled_user: '✕',
  cancelled_generic: '✕',
}

/** 取消三态的公共子集（取消态文案改由 CANCEL_BADGE_KEY 按原因细分） */
export type CancelledStatusKind = 'cancelled_timeout' | 'cancelled_user' | 'cancelled_generic'

/** 非取消态徽标文案（取消态见 CANCEL_BADGE_KEY） */
export const STATUS_LABEL_KEY: Record<'manual_pause' | 'budget_exhausted', string> = {
  manual_pause: 'project.status.manualPaused',
  budget_exhausted: 'project.status.exhausted',
}

/** 取消态判定（列表/详情入口共用）；类型谓词用于窄化非取消态文案分支 */
export function isCancelledStatus(kind: ProjectStatusKind): kind is CancelledStatusKind {
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
