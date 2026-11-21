import React from 'react'
import { t } from '@ui/state/game-store'
import { TUNING } from '@content/tuning'
import type { Company } from '@domain/entities/company'
import {
  ALERT_KEY,
  BANKRUPT_RECOVERY_HINT_CENTS,
  selectCompanyBanner,
} from './company-alerts'
import { formatMoneyDisplay } from './money-format'

interface Props {
  company: Company | null
  /** 由 game-shell 注入（跳转财务页）；组件自身不持有路由状态 */
  onNavigate: () => void
}

const L1_STYLE: React.CSSProperties = {
  borderColor: '#e8912d',
  background: 'rgba(232,145,45,0.10)',
}
const L2_STYLE: React.CSSProperties = {
  borderColor: 'var(--danger, #b3423a)',
  background: 'rgba(179,66,58,0.08)',
}

/**
 * 槽位 A（公司级）横幅：DISSOLVED > BANKRUPT > 现金警告，同一时刻最多 1 条。
 * 不可关闭；L2 role="alert"/assertive，L1 role="status"/polite；无闪烁动画。
 */
export const CompanyAlertBanner: React.FC<Props> = ({ company, onNavigate }) => {
  const banner = selectCompanyBanner(company)
  if (banner.kind === 'none') return null

  const amount = formatMoneyDisplay(banner.amountCents)
  const threshold = formatMoneyDisplay(TUNING.finance.cashWarningThresholdCents)
  const recovery = formatMoneyDisplay(BANKRUPT_RECOVERY_HINT_CENTS)

  return (
    <div className="company-alerts" data-alert-kind={banner.kind}>
      <div
        className="panel alert-banner"
        style={banner.kind === 'cash_warning' ? L1_STYLE : L2_STYLE}
        role={banner.kind === 'cash_warning' ? 'status' : 'alert'}
        aria-live={banner.kind === 'cash_warning' ? 'polite' : 'assertive'}
      >
        {banner.kind === 'cash_warning' && (
          <>
            <p className="alert-title" style={{ color: '#c46f13' }}>
              ⚠ {t(ALERT_KEY.warningTitle).replace('{amount}', amount)}
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                {t(ALERT_KEY.warningThreshold).replace('{amount}', threshold)}
              </span>
            </p>
            <p className="muted alert-hint">{t(ALERT_KEY.warningHint)}</p>
          </>
        )}

        {banner.kind === 'bankrupt' && (
          <>
            <p className="negative alert-title alert-title-strong">
              ⛔ {t(ALERT_KEY.bankruptTitle).replace('{amount}', amount)}
            </p>
            <p className="muted alert-hint">{t(ALERT_KEY.bankruptHint)}</p>
            <p className="muted alert-hint">{t(ALERT_KEY.bankruptAllowed)}</p>
            <p className="muted alert-hint">{t(ALERT_KEY.bankruptRecovery).replace('{amount}', recovery)}</p>
          </>
        )}

        {banner.kind === 'dissolved' && (
          <p className="negative alert-title alert-title-strong">
            ⛔ {t(ALERT_KEY.dissolvedTitle)}
          </p>
        )}

        <div className="flex-gap alert-actions">
          <button className="btn btn-secondary btn-small" onClick={onNavigate}>
            {t(ALERT_KEY.viewDetails)}
          </button>
        </div>
      </div>
    </div>
  )
}
