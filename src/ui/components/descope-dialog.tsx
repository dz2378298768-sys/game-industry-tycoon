import React from 'react'
import { t } from '@ui/state/game-store'
import type { Company } from '@domain/entities/company'
import type { Discipline } from '@domain/enums'
import type { Project } from '@domain/entities/project'
import { DESCOPE_CAP, selectDescopeTiers } from './project-actions'
import { computeDescopePreview } from './descope-preview'
import { formatMoneyDisplay } from './money-format'
import { ModalShell } from './modal-shell'

interface Props {
  project: Project
  company?: Company | null
  daily: Record<Discipline, number>
  dailyBurnCents: number
  onClose: () => void
  onConfirm: (ratio: number) => void
  errorMessage?: string | null
  busy?: boolean
}

/**
 * DIALOG-DESCOPE（DESIGN-C-01 §3.2 / DESIGN-UI-LAYER §2.4）：
 * 三档位逐档禁用（累计 ≤50%）、实时预览、不可逆警示、内联二次确认；
 * QA 阶段显式提示"Q&A 进度重置"。
 */
export const DescopeDialog: React.FC<Props> = ({
  project,
  company,
  daily,
  dailyBurnCents,
  onClose,
  onConfirm,
  errorMessage,
  busy,
}) => {
  const tiers = selectDescopeTiers(project)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const preview = selected === null ? null : computeDescopePreview(project, daily, selected, dailyBurnCents)
  const totalAfter = Math.round(((project.scopeCutRatio ?? 0) + (selected ?? 0)) * 100)
  const isBankrupt = company?.status === 'bankrupt'

  const pick = (ratio: number) => {
    setSelected(ratio)
    setConfirming(false)
  }

  return (
    <ModalShell
      title={t('project.descope.dialog.title')}
      onClose={onClose}
      accentColor="#c98a2b"
      footer={
        <>
          <button className="btn btn-secondary btn-small" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-small"
            disabled={selected === null || busy}
            onClick={() => {
              if (selected === null) return
              if (!confirming) {
                setConfirming(true)
                return
              }
              onConfirm(selected)
            }}
          >
            {confirming ? t('project.descope.confirmAgain') : t('project.descope.confirm')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        {t('project.descope.dialog.intro')}
      </p>

      <div role="group" aria-label={t('project.descope.dialog.tiers')} className="flex-gap">
        {tiers.map((tier) => {
          const pct = Math.round(tier.value * 100)
          return (
            <button
              key={tier.value}
              type="button"
              className={`btn btn-small ${selected === tier.value ? '' : 'btn-secondary'}`}
              data-tier={pct}
              disabled={!tier.enabled}
              aria-disabled={!tier.enabled}
              title={tier.enabled ? undefined : t(tier.reasonKey!)}
              onClick={() => tier.enabled && pick(tier.value)}
            >
              −{pct}%
              {!tier.enabled && (
                <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                  {t(tier.reasonKey!)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected !== null && preview && (
        <div className="panel" style={{ marginTop: 10, background: 'rgba(0,0,0,0.15)' }}>
          <p style={{ margin: '4px 0' }}>
            {t('project.descope.preview.cut')
              .replace('{pct}', String(Math.round(selected * 100)))
              .replace('{total}', String(totalAfter))}
          </p>
          <p className="muted" style={{ margin: '4px 0' }}>
            {t('project.descope.preview.savedDays').replace(
              '{days}',
              preview.savedDays === null ? '—' : String(preview.savedDays),
            )}
          </p>
          <p className="muted" style={{ margin: '4px 0' }}>
            {t('project.descope.preview.savedBudget').replace(
              '{amount}',
              preview.savedBudgetCents === null ? '—' : formatMoneyDisplay(preview.savedBudgetCents),
            )}
          </p>
          <p className="muted" style={{ margin: '4px 0' }}>
            {t('project.descope.preview.quality').replace('{level}', String(preview.qualityCeiling))}
          </p>
          {preview.qaReset && (
            <p className="muted" style={{ margin: '4px 0' }}>
              {t('project.descope.preview.qaReset')}
            </p>
          )}
        </div>
      )}

      <p className="muted" style={{ margin: '8px 0 0' }}>
        {t('project.descope.cap').replace('{cap}', String(Math.round(DESCOPE_CAP * 100)))}
      </p>
      <p className="negative" style={{ margin: '4px 0 0' }}>
        {t('project.descope.irreversible')}
      </p>
      {project.phase === 'QA' && (
        <p className="negative" style={{ margin: '4px 0 0' }}>
          {t('project.descope.qaResetWarning')}
        </p>
      )}
      {isBankrupt && (
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {t('project.descope.bankruptHint')}
        </p>
      )}
      {errorMessage && (
        <p className="negative" style={{ margin: '4px 0 0' }}>
          {errorMessage}
        </p>
      )}
    </ModalShell>
  )
}
