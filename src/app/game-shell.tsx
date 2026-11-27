import React from 'react'
import { useGameStore, t, formatDay, formatMoney } from '@ui/state/game-store'
import { Overview } from '@ui/pages/overview'
import { Employees } from '@ui/pages/employees'
import { Hire } from '@ui/pages/hire'
import { Projects } from '@ui/pages/projects'
import { ProjectDetail } from '@ui/pages/project-detail'
import { NewProject } from '@ui/pages/new-project'
import { Finance } from '@ui/pages/finance'
import { Products } from '@ui/pages/products'
import { ProductDetail } from '@ui/pages/product-detail'
import { Market } from '@ui/pages/market'
import { Deliver } from '@ui/pages/deliver'
import { Review } from '@ui/pages/review'
import { CompanyAlertBanner } from '@ui/components/company-alert-banner'
import type { CalendarSpeed } from '@domain/enums'

type Route = 'overview' | 'employees' | 'hire' | 'projects' | 'projectDetail' | 'newProject' | 'finance' | 'products' | 'productDetail' | 'market' | 'deliver' | 'review'

interface NavItem { key: Route; labelKey: string }

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', labelKey: 'nav.overview' },
  { key: 'market', labelKey: 'nav.market' },
  { key: 'employees', labelKey: 'nav.employees' },
  { key: 'hire', labelKey: 'nav.hire' },
  { key: 'projects', labelKey: 'nav.projects' },
  { key: 'newProject', labelKey: 'nav.newProject' },
  { key: 'finance', labelKey: 'nav.finance' },
  { key: 'products', labelKey: 'nav.products' },
  { key: 'review', labelKey: 'nav.review' },
]

const SPEEDS: readonly CalendarSpeed[] = ['paused', 'slow', 'normal', 'fast', 'ultra']

export const GameShell: React.FC = () => {
  const store = useGameStore()
  const {
    dayIndex, speed, company, messages, financial,
    setSpeed, advanceDays, save, load, restartNewGame,
    locale, setLocale,
  } = store
  React.useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const [route, setRoute] = React.useState<Route>('overview')
  const [projectDetailId, setProjectDetailId] = React.useState<string | null>(null)
  const [projectFocus, setProjectFocus] = React.useState<'design' | 'qa' | undefined>(undefined)
  const [productDetailId, setProductDetailId] = React.useState<string | null>(null)
  /** P-09 交付页入口项目（仅 projectDetail 交付按钮跳转） */
  const [deliverProjectId, setDeliverProjectId] = React.useState<string | null>(null)
  /** P-02 → P-03 类别预填（规格 §2 P-02 跳转） */
  const [prefillGenreId, setPrefillGenreId] = React.useState<string | undefined>(undefined)

  const handleNavigate = (r: string, param?: string) => {
    if (r === 'newProject') {
      setPrefillGenreId(param)
      setRoute('newProject')
      return
    }
    if (r === 'productDetail' && param) {
      setProductDetailId(param)
      setRoute('productDetail')
      return
    }
    if (r === 'deliver' && param) {
      setDeliverProjectId(param)
      setRoute('deliver')
      return
    }
    if ((r === 'projectDetail' || r === 'projectRework' || r === 'projectQa') && param) {
      setProjectDetailId(param)
      setProjectFocus(r === 'projectRework' ? 'design' : r === 'projectQa' ? 'qa' : undefined)
      setRoute('projectDetail')
    } else {
      setProjectDetailId(null)
      setRoute(r as Route)
    }
  }

  // Simple game tick when speed is not paused - we just step days synchronously
  React.useEffect(() => {
    if (speed === 'paused') return
    const interval = setInterval(() => {
      advanceDays(1)
    }, speed === 'slow' ? 4000 : speed === 'normal' ? 1500 : speed === 'fast' ? 600 : 250)
    return () => clearInterval(interval)
  }, [speed, advanceDays])

  const renderContent = () => {
    switch (route) {
      case 'overview': return <Overview onNavigate={handleNavigate} />
      case 'market': return <Market onNavigate={handleNavigate} />
      case 'employees': return <Employees />
      case 'hire': return <Hire onNavigate={handleNavigate} />
      case 'projects': return <Projects onNavigate={handleNavigate} />
      case 'projectDetail': return projectDetailId ? <ProjectDetail projectId={projectDetailId} onNavigate={handleNavigate} focusSection={projectFocus} /> : <Projects onNavigate={handleNavigate} />
      case 'newProject': return <NewProject onNavigate={handleNavigate} initialGenreId={prefillGenreId} />
      case 'finance': return <Finance onNavigate={handleNavigate} />
      case 'products': return <Products onNavigate={handleNavigate} />
      case 'productDetail': return productDetailId ? <ProductDetail productId={productDetailId} onNavigate={handleNavigate} /> : <Products onNavigate={handleNavigate} />
      case 'deliver': return deliverProjectId ? <Deliver projectId={deliverProjectId} onNavigate={handleNavigate} /> : <Projects onNavigate={handleNavigate} />
      case 'review': return <Review onNavigate={handleNavigate} />
      default: return <Overview onNavigate={handleNavigate} />
    }
  }

  // CODE-07A 全局层：顶栏可用现金 + 公司级现金跑道（月），<2.0 红 <4.0 橙
  const runwayMonths = financial?.runwayMonths
  const runwayColor =
    runwayMonths === undefined ? '#9ab7d3'
      : runwayMonths < 2.0 ? '#b3423a'
        : runwayMonths < 4.0 ? '#e8912d'
          : '#9ab7d3'
  const runwayText =
    runwayMonths === undefined ? '—'
      : Number.isFinite(runwayMonths)
        ? t('topbar.runwayMonths').replace('{months}', runwayMonths.toFixed(1))
        : t('topbar.runwayInfinity')

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>{t('app.title')}</h1>
        <div className="day-label">{formatDay(dayIndex)}</div>
        <div className="day-label" style={{ color: '#c9a865' }}>💰 {formatMoney(company?.cashBalanceCents ?? 0)}</div>
        {/* CODE-07A：顶栏公司级可用现金（FIN §6.2 口径）与现金跑道（月） */}
        <div className="day-label" style={{ color: '#c9a865' }} data-testid="topbar-available-cash">
          {t('topbar.availableCash')} {financial ? formatMoney(financial.availableCashCents) : '—'}
        </div>
        <div className="day-label" style={{ color: runwayColor }} data-testid="topbar-runway">
          {t('topbar.runway')} {runwayText}
        </div>
        {/* FIX-5 / ADJ-16 R-3：Brand 玩法面 v1 隐藏；入口代码保留，恢复时按 ADJ-16 R-3 处理 */}
        <div className="controls">
          {SPEEDS.map(value => (
            <button
              key={value}
              className={`btn ${speed === value ? '' : 'btn-secondary'} btn-small`}
              style={speed === value ? { background: '#c9a865', color: '#0a192f' } : undefined}
              onClick={() => setSpeed(value)}
              aria-pressed={speed === value}
            >
              {t(`gameCalendar.speed.${value}`)}
            </button>
          ))}
          <button className="btn btn-secondary btn-small" onClick={() => advanceDays(30)}>{t('button.advance30d')}</button>
          <span style={{ width: 1, height: 20, background: 'rgba(201,168,101,0.3)' }} />
          <button className="btn btn-secondary btn-small" onClick={save}>{t('button.save')}</button>
          <button className="btn btn-secondary btn-small" onClick={load}>{t('button.load')}</button>
          <select
            value={locale}
            aria-label={t('app.language')}
            onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'zh-CN')}
            style={{ padding: '4px 8px', background: '#0a192f', border: '1px solid var(--border)', color: 'var(--off-white)', fontSize: 12 }}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {/* 槽位 A：公司级横幅（全局唯一，不随页面切换消失，DESIGN-UI-LAYER §2.1）；四分支 + GAME OVER 重开 */}
      <CompanyAlertBanner
        company={company}
        crisis={financial}
        onNavigate={(r) => handleNavigate(r ?? 'finance')}
        onRestart={() => { void restartNewGame() }}
      />

      <div className="main-layout">
        <nav className="sidebar">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              aria-current={route === item.key ? 'page' : undefined}
              className={route === item.key ? 'active' : ''}
              onClick={() => handleNavigate(item.key)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <main className="content-area">
          {renderContent()}
        </main>
      </div>

      <div className="message-overlay" role="status">
        {messages.map(m => (
          <div key={m.id} className={`message-toast ${m.type}`}>{m.text}</div>
        ))}
      </div>
    </div>
  )
}
