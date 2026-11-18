import React from 'react'
import { t } from '@ui/state/game-store'
import type { Project } from '@domain/entities/project'
import { normalizeCancellationReason, type CancelReasonKind } from './project-status'

interface Props {
  project: Project
  /** 取消发生日（第 X 天）；调用方按 cancelledDay → updatedAt 顺序推导 */
  cancelledDay: number
  onClose: () => void
}

const REASON_TEXT_KEY: Record<CancelReasonKind, string> = {
  pause_timeout: 'project.cancel.reason.pause_timeout',
  user_requested: 'project.cancel.reason.user_requested',
  scope_became_unviable: 'project.cancel.reason.scope_became_unviable',
  unknown: 'project.cancel.reason.unknown',
}

const REASON_CODE_KEY: Record<CancelReasonKind, string> = {
  pause_timeout: 'project.cancel.code.pause_timeout',
  user_requested: 'project.cancel.code.user_requested',
  scope_became_unviable: 'project.cancel.code.scope_became_unviable',
  unknown: 'project.cancel.code.unknown',
}

/**
 * DIALOG-CANCEL-REASON（DESIGN-M1-PAUSE-TIMEOUT-UI-001 §3.4）：
 * 只读模态，仅【关闭】；Esc 可关；焦点进入弹窗并在弹窗内循环。
 * 不使用 `budget_exhausted` 作为取消原因（GDR D-UI-02），未知原因按历史存档宽容展示。
 */
export const CancelReasonDialog: React.FC<Props> = ({ project, cancelledDay, onClose }) => {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId()

  React.useEffect(() => {
    closeRef.current?.focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
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
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
              <td><code>{t(REASON_CODE_KEY[reasonKind])}</code></td>
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
