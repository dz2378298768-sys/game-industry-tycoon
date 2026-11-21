import React from 'react'
import { t } from '@ui/state/game-store'
import type { Project } from '@domain/entities/project'
import { normalizeCancellationReason, type CancelReasonKind } from './project-status'

interface Props {
  project: Project
  /** 取消发生日（第 X 天）；唯一来源 project.updatedAt */
  cancelledDay: number
  onClose: () => void
}

const REASON_TEXT_KEY: Record<CancelReasonKind, string> = {
  pause_timeout: 'project.cancel.reason.pause_timeout',
  player_decision: 'project.cancel.reason.player_decision',
  scope_became_unviable: 'project.cancel.reason.scope_became_unviable',
  team_dissolved: 'project.cancel.reason.team_dissolved',
  market_window_missed: 'project.cancel.reason.market_window_missed',
  legacy: 'project.cancel.reason.legacy',
  unknown: 'project.cancel.reason.unknown',
}

/**
 * DIALOG-CANCEL-REASON（DESIGN-M1-PAUSE-TIMEOUT-UI-001 §3.4）：
 * 只读模态，仅【关闭】；Esc 可关；焦点进入弹窗并在弹窗内循环，关闭后归还触发元素。
 * 「原因代码」显示领域原值（player_decision 等），不显示 UI 归一值。
 * 不使用 `budget_exhausted` 作为取消原因（GDR D-UI-02），历史存档值按未记录展示。
 */
export const CancelReasonDialog: React.FC<Props> = ({ project, cancelledDay, onClose }) => {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  // 每次渲染同步最新回调，使 effect 无需依赖 onClose（父组件每日 tick 重渲染不会重跑 effect，N-8）
  onCloseRef.current = onClose
  const titleId = React.useId()

  React.useEffect(() => {
    // 仅挂载执行一次：记录触发元素、移动焦点、锁滚动；依赖 [] 保证任意重渲染下焦点管理不被打断
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    // 打开期间锁背景滚动（F7）
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusables = cardRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      // 关闭后焦点归还触发按钮（F7）；触发元素在挂载时已固化，不受重渲染影响
      triggerRef.current?.focus()
    }
  }, [])

  const reasonKind = normalizeCancellationReason(project.cancellationReason)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel"
        style={{ maxWidth: 520, width: '100%', margin: 0, borderColor: '#b3423a' }}
      >
        <h2 id={titleId} style={{ fontSize: 16, margin: '0 0 12px' }}>
          {t('project.cancel.dialog.title')}
        </h2>
        <table className="data-table">
          <tbody>
            <tr>
              <td className="muted" style={{ width: 96 }}>{t('project.cancel.field.project')}</td>
              <td>{project.name}</td>
            </tr>
            <tr>
              <td className="muted">{t('project.cancel.field.day')}</td>
              <td>{t('project.cancel.field.dayValue').replace('{day}', String(cancelledDay))}</td>
            </tr>
            <tr>
              <td className="muted">{t('project.cancel.field.code')}</td>
              {/* 领域原值，可追溯（F3 / N-1）；历史无原因/预算耗尽旧值不外显 */}
              <td>
                <code>
                  {reasonKind === 'unknown' || reasonKind === 'legacy'
                    ? t('project.cancel.code.unknown')
                    : project.cancellationReason}
                </code>
              </td>
            </tr>
            <tr>
              <td className="muted">{t('project.cancel.field.description')}</td>
              <td>{t(REASON_TEXT_KEY[reasonKind])}</td>
            </tr>
            <tr>
              <td className="muted">{t('project.cancel.field.aftermath')}</td>
              <td>{t('project.cancel.aftermath')}</td>
            </tr>
          </tbody>
        </table>
        <div className="flex-gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button ref={closeRef} className="btn btn-secondary btn-small" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
