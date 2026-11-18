import React from 'react'
import { t } from '@ui/state/game-store'
import type { Project } from '@domain/entities/project'
import { resolveProjectStatus, STATUS_ICON, STATUS_LABEL_KEY } from './project-status'

interface Props {
  project: Project
  /** 列表行内展示「已暂停 N/60 天」；详情由横幅承担 */
  showPausedDays?: boolean
}

const EXHAUSTED_STYLE: React.CSSProperties = { borderColor: '#e8912d', color: '#c46f13' }
const CANCELLED_USER_STYLE: React.CSSProperties = { borderColor: '#8b93a1', color: '#8b93a1' }
const CANCELLED_TIMEOUT_STYLE: React.CSSProperties = { borderColor: '#b3423a', color: '#b3423a' }

/**
 * 状态徽标：图标 + 文案双通道（色盲可辨），供项目列表与详情共用。
 * 001-E 已定的三态横幅不受影响，此处仅补齐四态标签体系。
 */
export const ProjectStatusBadge: React.FC<Props> = ({ project, showPausedDays = false }) => {
  const kind = resolveProjectStatus(project)

  if (kind === 'active') {
    return <span className="badge active">{t(`phase.${project.phase}`)}</span>
  }

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

  return (
    <>
      <span className={badgeClass} style={style} data-project-status={kind}>
        <span aria-hidden="true">{STATUS_ICON[kind]}</span> {t(STATUS_LABEL_KEY[kind])}
      </span>
      {showPausedDays && paused && (
        <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
          {t('project.status.pausedDays').replace('{n}', String(project.pausedDays ?? 0))}
        </span>
      )}
    </>
  )
}
