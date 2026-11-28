import React, { useEffect, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { TUNING } from '@content/tuning'
import { TapTapAccount } from './taptap-account'
import { content } from '@infrastructure/loading/content-loader'
import { OPENING_REGIONS } from '@content/opening-regions'
import { AI_COMPANIES } from '@content/ai-companies'
import { OPENING_RELEASES } from '@content/opening-market'
import { Building2, CalendarDays, Check, Gamepad2, Settings2, Sparkles, UsersRound, Wallet, X } from 'lucide-react'

/**
 * P-01 创建公司（S01，批次 07A）：
 *  - 固定条件摘要：起始资金、模拟起始日、地区和创始人身份。
 *  - 市场可在开局页内选择，难度沿用固定规则
 *  - 覆盖警告：已有存档时进入创建页需确认，不静默清档（M-03 模板）
 */
export const CreateCompany: React.FC = () => {
  const { createCompany, init, getHasSave, load, locale, setLocale } = useGameStore()
  const [name, setName] = useState('')
  const [marketId, setMarketId] = useState('north_america')
  const [error, setError] = useState('')
  const [overwriteConfirm, setOverwriteConfirm] = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const settingsDialog = React.useRef<HTMLDialogElement>(null)
  const marketDialog = React.useRef<HTMLDialogElement>(null)
  const availableMarkets = content.marketRegions.flatMap((market) => {
    const opening = OPENING_REGIONS[market.id]
    const city = content.cities.find((item) => item.id === opening?.cityId)
    return opening && city ? [{ market, city, opening }] : []
  })

  useEffect(() => {
    void getHasSave()
      .then(setOverwriteConfirm)
      .catch(() => setError(t('company.create.loadFailed')))
      .finally(() => setChecked(true))
  }, [getHasSave])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('error.requiredField')); return }
    if (!checked || overwriteConfirm || loading) return
    init(42, { aiCompetition: true })
    const cityId = OPENING_REGIONS[marketId]?.cityId ?? 'san_francisco'
    createCompany(name.trim(), cityId)
  }

  const handleLoad = async () => {
    setLoading(true)
    setError('')
    try {
      if (!await load()) setError(t('company.create.loadFailed'))
    } catch {
      setError(t('company.create.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="welcome-screen arcade-welcome">
      <div className="welcome-layout">
        <section className="welcome-story" aria-label={t('app.title')}>
          <div className="welcome-brand-mark"><Gamepad2 size={23} aria-hidden="true" /></div>
          <p className="welcome-kicker">{t('company.create.eyebrow')}</p>
          <h1>{t('app.title')}</h1>
          <p className="welcome-lede">{t('company.create.tagline')}</p>
          <div className="welcome-era-stamp"><span>1970</span><i />{t('company.create.era')}</div>
          <div className="welcome-story-art" aria-hidden="true">
            <div className="welcome-art-grid" />
            <div className="welcome-pixel-disc" />
            <div className="welcome-art-cabinet"><span /><b /><i /></div>
            <div className="welcome-art-floor" />
          </div>
          <p className="welcome-story-caption"><Sparkles size={14} aria-hidden="true" /> {t('company.create.storyCaption')}</p>
        </section>

        <section className="welcome-card" aria-label={t('company.create.summary.title')}>
          <div className="welcome-form-heading">
            <div>
              <p className="welcome-kicker">{t('company.create.summary.title')}</p>
              <h2>{t('company.create.formTitle')}</h2>
            </div>
            <button className="welcome-settings-button" type="button" aria-label={t('settings.title')}
              title={t('settings.title')} onClick={() => settingsDialog.current?.showModal?.()}>
              <Settings2 size={18} aria-hidden="true" />
            </button>
          </div>
          <dialog ref={settingsDialog} className="welcome-settings-dialog">
            <div className="welcome-settings-title">
              <h3>{t('settings.title')}</h3>
              <button type="button" className="welcome-settings-close" aria-label={t('common.cancel')}
                onClick={() => settingsDialog.current?.close?.()}><X size={18} aria-hidden="true" /></button>
            </div>
            <span className="welcome-language-label">{t('app.language')}</span>
            <div className="welcome-language-switch" role="group" aria-label={t('app.language')}>
              <button type="button" aria-pressed={locale === 'zh-CN'} onClick={() => setLocale('zh-CN')}>中文</button>
              <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
            </div>
          </dialog>
          <TapTapAccount />

        {/* 覆盖警告（M-03 禁态）：已有存档时必须显式确认，不静默清档 */}
        {overwriteConfirm && (
            <div className="panel" style={{ borderColor: '#e8912d', background: 'rgba(232,145,45,0.10)', marginBottom: 16 }} data-testid="overwrite-warning">
            <p className="alert-title" style={{ color: '#c46f13', fontSize: 13, margin: '0 0 6px' }}>
              ⚠ {t('company.create.overwrite.title')}
            </p>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>{t('company.create.overwrite.hint')}</p>
            <button className="btn btn-small" type="button" disabled={loading} onClick={() => { void handleLoad() }} data-testid="continue-saved-game">
              {t('company.create.continue')}
            </button>{' '}
            <button
              className="btn btn-secondary btn-small"
              type="button"
              disabled={loading}
              data-testid="overwrite-confirm"
              onClick={() => setOverwriteConfirm(false)}
            >
              {t('company.create.overwrite.confirm')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="studio-name">{t('company.field.name')}</label>
            <input id="studio-name" value={name} onChange={e => setName(e.target.value)} placeholder="My Game Studio" autoFocus />
          </div>
          {error && <p role="alert" className="negative mb-16">{error}</p>}

          <button
            className="btn"
            style={{ width: '100%' }}
            type="submit"
            disabled={!checked || overwriteConfirm || loading}
            aria-disabled={!checked || overwriteConfirm || loading}
            title={overwriteConfirm ? t('company.create.overwrite.confirm') : undefined}
          >
            {t('button.startGame')}
          </button>

          {/* 固定条件摘要（只读，无选择控件；日期经 formatDay 单源 §1.5） */}
          <div className="welcome-starting-line" data-testid="p01-fixed-summary">
            <span><Wallet size={16} aria-hidden="true" />{t('company.create.summary.cash')}<strong>{formatMoney(TUNING.company.startingCashCents)}</strong></span>
            <span><CalendarDays size={16} aria-hidden="true" />{t('company.create.summary.startDay')}<strong>{formatDay(0)}</strong></span>
            <span className="welcome-market-summary">
              <Building2 size={16} aria-hidden="true" />{t('company.create.summary.region')}
              <strong>{content.marketRegions.find((market) => market.id === marketId)?.[locale === 'zh-CN' ? 'displayNameZh' : 'displayName']}</strong>
              <button type="button" className="welcome-market-select" onClick={() => marketDialog.current?.showModal?.()}>
                {t('company.create.market.choose')}
              </button>
            </span>
            <span><UsersRound size={16} aria-hidden="true" />{t('company.create.summary.team')}<strong>{t('company.create.team.founder')}</strong></span>
          </div>
          <dialog ref={marketDialog} className="welcome-settings-dialog welcome-market-dialog" aria-labelledby="market-title">
            <div className="welcome-settings-title">
              <h3 id="market-title">{t('company.create.market.title')}</h3>
              <button type="button" className="welcome-settings-close" aria-label={t('common.cancel')}
                onClick={() => marketDialog.current?.close?.()}><X size={18} aria-hidden="true" /></button>
            </div>
            <p className="welcome-market-explanation">{t('company.create.market.explanation')}</p>
            <div className="welcome-market-options">
              {availableMarkets.map(({ market, city, opening }) => {
                const label = locale === 'zh-CN' ? market.displayNameZh : market.displayName
                const cityName = locale === 'zh-CN' ? city.displayNameZh : city.displayName
                const rival = AI_COMPANIES.find((company) => company.cityId === city.id && company.entryYear === 1970)
                const release = OPENING_RELEASES.find((product) => product.companyId === `ai-${rival?.id}`)
                return <button className="welcome-market-option" type="button" key={market.id} aria-pressed={marketId === market.id}
                  onClick={() => { setMarketId(market.id); marketDialog.current?.close?.() }}>
                  <span className="welcome-market-option-heading"><strong>{label}</strong>{marketId === market.id && <Check size={17} aria-hidden="true" />}</span>
                  <span className="welcome-market-city">{t('company.create.market.city').replace('{city}', cityName)}</span>
                  <span className="welcome-market-city">{t('market.regional.preference').replace('{genre}', t(`genre.${opening.featuredGenre}`))}</span>
                  {rival && release && <span className="welcome-market-city">{rival.name} · {release.name}</span>}
                  <span className="welcome-market-facts">
                    {t('company.create.market.salary').replace('{value}', city.avgSalaryMultiplier.toFixed(2))}
                    <i />
                    {t('company.create.market.rent').replace('{value}', city.officeRentMultiplier.toFixed(2))}
                  </span>
                </button>
              })}
            </div>
          </dialog>

        </form>
        </section>
      </div>
    </div>
  )
}
