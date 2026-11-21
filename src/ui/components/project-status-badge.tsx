import React from 'react'
import { t } from '@ui/state/game-store'
import type { Project } from '@domain/entities/project'
import { CANCEL_BADGE_KEY, isCancelledStatus, resolveCancelReason, resolveProjectStatus, STATUS_ICON, STATUS_LABEL_KEY } from './project-status'

interface Props {
  project: Project
  /** 列表行内展示「已暂停 N/60 天」；详情由横幅承担 */
  showPausedDays?: boolean
  /** 当前游戏日，用于预算耗尽徽标的「触发日」提示；缺省退回 project.updatedAt */
  currentDay?: number
}

const EXHAUSTED_STYLE: React.CSSProperties = { borderColor: '#e8912d', color: '#c46f13' }
const CANCELLED_USER_STYLE: React.CSSProperties = { borderColor: '#8b93a1', color: '#8b93a1' }
const CANCELLED_TIMEOUT_STYLE: React.CSSProperties = { borderColor: '#b3423a', color: '#b3423a' }

/**
 * 状态徽标：图标 + 文案双通道（色盲可辨），供项目列表与详情共用。
 * 活动态不渲染徽标（阶段文案由调用方单独展示），避免与“阶段”语义重复。
 */
export const ProjectStatusBadge: React.FC<Props> = ({ project, showPausedDays = false, currentDay }) => {
  const kind = resolveProjectStatus(project)

  if (kind === 'active') return null

  const badgeClass = kind === 'manual_pause' ? 'badge paused' : 'badge'
  const style =
    kind === 'budget_exhausted'
      ? EXHAUSTED_STYLE
      : kind === 'cancelled_user'
        ? CANCELLED_USER_STYLE
        : kind === 'cancelled_timeout'
          ? CANCELLED_TIMEOUT_STYLE
          : undefined

  const paused = kind === 'manual_pause' || kind === 'budget_exhausted'
  const pausedDays = project.pausedDays ?? 0
  // 取消态文案按 cancellationReason 分流（N-1）：不得把团队解散/错过窗口等说成玩家主动取消
  // data-project-status 仍保留四态粗分类取值，选择器与筛选依赖不变
  const labelKey = isCancelledStatus(kind)
    ? CANCEL_BADGE_KEY[resolveCancelReason(project.cancellationReason)]
    : STATUS_LABEL_KEY[kind]
  // 预算耗尽徽标 hover：原因 + 触发日（F6，恢复 001-E 的 title 能力）
  const exhaustedTitle =
    kind === 'budget_exhausted'
      ? t('project.badge.exhaustedTitle').replace('{day}', String((currentDay ?? project.updatedAt) - pausedDays))
      : undefined

  return (
    <>
      <span className={badgeClass} style={style} data-project-status={kind} title={exhaustedTitle}>
        <span aria-hidden="true">{STATUS_ICON[kind]}</span> {t(labelKey)}
      </span>
      {showPausedDays && paused && (
        <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
          {t('project.status.pausedDays').replace('{n}', String(pausedDays))}
        </span>
      )}
    </>
  )
}
