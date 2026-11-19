import React from 'react'
import { t } from '@ui/state/game-store'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import { selectDelayTiers } from './project-actions'
import { computeDelayPreview, selectMaxLaunchDay } from './delay-preview'
import { formatMoneyDisplay } from './money-format'
import { ModalShell } from './modal-shell'

interface Props {
  project: Project
  company: Company
  employees: Employee[]
  onClose: () => void
  onConfirm: (days: number) => void
  errorMessage?: string | null
  busy?: boolean
}

/**
 * DIALOG-DELAY（DESIGN-C-02 §3 / DESIGN-UI-LAYER §2.5）：
 * 三档位逐档禁用（≤ original×1.5）、品牌与现金实时预览、累计/上限提示、内联二次确认；
 * 现金为估算值（固定成本），品牌实际扣减固定 0.7 档。
 */
export const DelayLaunchDialog: React.FC<Props> = ({
  project,
  company,
  employees,
  onClose,
  onConfirm,
  errorMessage,
  busy,
}) => {
  const tiers = selectDelayTiers(project)
  const [selected, setSelected] = React.useState<number | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const maxLaunchDay = selectMaxLaunchDay(project)
  const preview = selected === null ? null : computeDelayPreview(project, company, employees, selected)
  const isNegative = preview !== null && preview.predictedCashCents < 0

  const pick = (days: number) => {
    setSelected(days)
    setConfirming(false)
  }

  return (
    <ModalShell
      title={t('project.delay.dialog.title')}
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
            {confirming ? t('project.delay.confirmAgain') : t('project.delay.confirm')}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        {t('project.delay.dialog.intro')}
      </p>

      <div role="group" aria-label={t('project.delay.dialog.tiers')} className="flex-gap">
        {tiers.map((tier) => (
          <button
            key={tier.value}
            type="button"
            className={`btn btn-small ${selected === tier.value ? '' : 'btn-secondary'}`}
            data-days={tier.value}
            disabled={!tier.enabled}
            aria-disabled={!tier.enabled}
            title={tier.enabled ? undefined : t(tier.reasonKey!)}
            onClick={() => tier.enabled && pick(tier.value)}
          >
            +{tier.value} {t('project.delay.unit')}
            {!tier.enabled && (
              <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                {t(tier.reasonKey!)}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="muted" style={{ margin: '8px 0 0' }}>
        {t('project.delay.cap').replace('{max}', String(maxLaunchDay))}
      </p>
      <p className="muted" style={{ margin: '4px 0 0' }}>
        {t('project.delay.cumulative').replace('{days}', String(project.launchDelayDays ?? 0))}
      </p>

      {preview && (
        <div className="panel" style={{ marginTop: 10, background: 'rgba(0,0,0,0.15)' }}>
          <p style={{ margin: '4px 0' }}>
            {t('project.delay.newDay')
              .replace('{from}', String(preview.originalLaunchDay))
              .replace('{to}', String(preview.newLaunchDay))}
          </p>
          <p className="muted" style={{ margin: '4px 0' }}>
            {t('finance.delay.brand.impact')
              .replace('{now}', String(company.brand))
              .replace('{after}', String(preview.newBrand))}
            {' · '}
            {t('finance.delay.brand.penalty').replace('{min}', '0.1').replace('{max}', '0.3')}
            {' '}
            {t('finance.delay.brand.apply').replace('{apply}', String(preview.applyPenalty))}
          </p>
          <p className="muted" style={{ margin: '4px 0' }}>
            {t('finance.delay.cash.months').replace('{months}', String(preview.extraMonths))}
            {' · '}
            {t('finance.delay.cash.line').replace('{b}', formatMoneyDisplay(preview.extraBurnCents))}
          </p>
          <p className={isNegative ? 'negative' : 'muted'} style={{ margin: '4px 0' }}>
            {t('finance.delay.cash.after').replace('{cash}', formatMoneyDisplay(preview.predictedCashCents))}
          </p>
        </div>
      )}

      {errorMessage && (
        <p className="negative" style={{ margin: '4px 0 0' }}>
          {errorMessage}
        </p>
      )}
    </ModalShell>
  )
}
