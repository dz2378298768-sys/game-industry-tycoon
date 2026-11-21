import React from 'react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  accentColor?: string
}

/**
 * 模态外壳（复用 CancelReasonDialog 的焦点/滚动/Esc 模式，DESIGN-M1-PAUSE-TIMEOUT-UI-001 §3.4）。
 * 打开时焦点进入弹窗、Tab 循环、Esc 关闭，关闭后归还触发元素。
 */
export const ModalShell: React.FC<Props> = ({ title, onClose, children, footer, accentColor }) => {
  const cardRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose
  const titleId = React.useId()

  React.useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus()
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
      triggerRef.current?.focus()
    }
  }, [])

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
        tabIndex={-1}
        className="panel"
        style={{ maxWidth: 560, width: '100%', margin: 0, borderColor: accentColor, outline: 'none' }}
      >
        <h2 id={titleId} style={{ fontSize: 16, margin: '0 0 12px' }}>
          {title}
        </h2>
        {children}
        <div className="flex-gap" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {footer}
        </div>
      </div>
    </div>
  )
}
