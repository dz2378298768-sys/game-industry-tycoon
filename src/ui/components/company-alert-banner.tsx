import React from 'react'
import { t } from '@ui/state/game-store'
import { TUNING } from '@content/tuning'
import type { Company } from '@domain/entities/company'
import type { CrisisReasonCode } from '@domain/entities/finance'
import {
  ALERT_KEY,
  BANKRUPT_RECOVERY_HINT_CENTS,
  selectCompanyBanner,
  type CrisisProjection,
} from './company-alerts'
import { formatMoneyDisplay } from './money-format'

interface Props {
  company: Company | null
  /** CODE-07A：公司级危机投影（game-world.getFinancialOverview），缺省时旧口径兜底 */
  crisis?: CrisisProjection | null
  /** GAME OVER 横幅的"重开新档"入口 */
  onRestart?: () => void
  /** 由 game-shell 注入（跳转财务页 / 补救页）；参数为目标路由 */
  onNavigate: (route?: string) => void
}

const L1_STYLE: React.CSSProperties = {
  borderColor: '#e8912d',
  background: 'rgba(232,145,45,0.10)',
}
const L2_STYLE: React.CSSProperties = {
  borderColor: 'var(--danger, #b3423a)',
  background: 'rgba(179,66,58,0.08)',
}
const WATCH_STYLE: React.CSSProperties = {
  borderColor: '#8b93a1',
  background: 'rgba(139,147,161,0.10)',
}

const CRITICAL_REMEDIES: Array<{ label: string; route: string }> = [
  { label: 'project.actions.descope', route: 'projects' },
  { label: 'banner.critical.remedy.pauseProject', route: 'projects' },
  { label: 'banner.critical.remedy.cutStaff', route: 'hire' },
]

/** 跑道展示：+∞ → ∞；非有限数 → '—'；否则保留 1 位小数 */
function formatRunway(months: number | undefined): string {
  if (months === undefined || !Number.isFinite(months)) return months === undefined ? '—' : '∞'
  return months.toFixed(1)
}

/** 原因码 → i18n 键（§3.8 原因码逐条展示） */
function reasonKey(code: CrisisReasonCode): string {
  return `error.crisis.${code.toLowerCase()}`
}

/**
 * 槽位 A（公司级）横幅：DISSOLVED > BANKRupt(GAME OVER) > critical > cash_warning > watch，
 * 同一时刻最多 1 条。不可关闭；L2 role="alert"/assertive，L1/watch role="status"/polite；无闪烁动画。
 * 补救窗口剩余天数：CrisisState 持久化未接线 → fail-closed '—'（OPEN-FIN-CRISIS-WIRING）。
 */
export const CompanyAlertBanner: React.FC<Props> = ({ company, crisis, onRestart, onNavigate }) => {
  const banner = selectCompanyBanner(company, crisis)
  if (banner.kind === 'none') return null

  const amount = formatMoneyDisplay(banner.amountCents)
  const threshold = formatMoneyDisplay(TUNING.finance.cashWarningThresholdCents)
  const recovery = formatMoneyDisplay(BANKRUPT_RECOVERY_HINT_CENTS)
  const runway = formatRunway(banner.runwayMonths)
  const committed = banner.committedCents === undefined ? '—' : formatMoneyDisplay(banner.committedCents)

  return (
    <div className="company-alerts" data-alert-kind={banner.kind}>
      <div
        className="panel alert-banner"
        style={banner.kind === 'cash_warning' ? L1_STYLE : banner.kind === 'watch' ? WATCH_STYLE : L2_STYLE}
        role={banner.kind === 'cash_warning' || banner.kind === 'watch' ? 'status' : 'alert'}
        aria-live={banner.kind === 'cash_warning' || banner.kind === 'watch' ? 'polite' : 'assertive'}
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

        {banner.kind === 'watch' && (
          <>
            <p className="alert-title" style={{ color: '#8b93a1' }}>
              🔎 {t('banner.watch.title')}
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                {t('banner.watch.runway').replace('{months}', runway)}
              </span>
            </p>
            <p className="muted alert-hint">{t('banner.watch.hint')}</p>
          </>
        )}

        {banner.kind === 'critical' && (
          <>
            <p className="negative alert-title alert-title-strong">
              ⛔ {t('banner.critical.title')}
            </p>
            {(banner.reasonCodes ?? []).length > 0 && (
              <ul className="muted alert-hint" style={{ margin: '6px 0', paddingLeft: 18 }}>
                {banner.reasonCodes!.map((code) => (
                  <li key={code}>{t(reasonKey(code))}</li>
                ))}
              </ul>
            )}
            <p className="muted alert-hint">
              {t('banner.critical.gapRunway').replace('{months}', runway)}
              {' · '}
              {t('banner.critical.gapCash').replace('{amount}', committed)}
            </p>
            <p
              className="muted alert-hint"
              title={t('banner.critical.deadlineTitle')}
            >
              {t('banner.critical.deadline')}: —
            </p>
            <div className="flex-gap alert-actions">
              {CRITICAL_REMEDIES.map((r) => (
                <button
                  key={r.route}
                  className="btn btn-secondary btn-small"
                  onClick={() => onNavigate(r.route)}
                >
                  {t(r.label)}
                </button>
              ))}
            </div>
          </>
        )}

        {banner.kind === 'bankrupt' && (
          <>
            <p className="negative alert-title alert-title-strong">
              ⛔ {t('banner.gameover.title')}
            </p>
            <p className="muted alert-hint">{t('banner.gameover.hint')}</p>
            <div className="flex-gap alert-actions">
              <button className="btn btn-secondary btn-small" onClick={() => onNavigate('finance')}>
                {t(ALERT_KEY.viewDetails)}
              </button>
              <button className="btn btn-small" data-testid="banner-restart" onClick={onRestart}>
                {t('banner.gameover.restart')}
              </button>
            </div>
          </>
        )}

        {banner.kind === 'dissolved' && (
          <p className="negative alert-title alert-title-strong">
            ⛔ {t(ALERT_KEY.dissolvedTitle)}
          </p>
        )}

        {banner.kind !== 'bankrupt' && banner.kind !== 'critical' && (
          <div className="flex-gap alert-actions">
            <button className="btn btn-secondary btn-small" onClick={() => onNavigate('finance')}>
              {t(ALERT_KEY.viewDetails)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
