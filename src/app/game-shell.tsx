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
import { CompanyAlertBanner } from '@ui/components/company-alert-banner'
import type { CalendarSpeed } from '@domain/enums'

type Route = 'overview' | 'employees' | 'hire' | 'projects' | 'projectDetail' | 'newProject' | 'finance' | 'products' | 'productDetail'

interface NavItem { key: Route; label: string }

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: t('nav.overview') },
  { key: 'employees', label: t('nav.employees') },
  { key: 'hire', label: t('nav.hire') },
  { key: 'projects', label: t('nav.projects') },
  { key: 'newProject', label: t('nav.newProject') },
  { key: 'finance', label: t('nav.finance') },
  { key: 'products', label: t('nav.products') },
]

const SPEEDS: { value: CalendarSpeed; label: string }[] = [
  { value: 'paused', label: t('gameCalendar.speed.paused') },
  { value: 'slow', label: t('gameCalendar.speed.slow') },
  { value: 'normal', label: t('gameCalendar.speed.normal') },
  { value: 'fast', label: t('gameCalendar.speed.fast') },
  { value: 'ultra', label: t('gameCalendar.speed.ultra') },
]

export const GameShell: React.FC = () => {
  const store = useGameStore()
  const {
    dayIndex, speed, company, messages,
    setSpeed, advanceDays, save, load,
    locale, setLocale,
  } = store

  const [route, setRoute] = React.useState<Route>('overview')
  const [projectDetailId, setProjectDetailId] = React.useState<string | null>(null)
  const [productDetailId, setProductDetailId] = React.useState<string | null>(null)

  const handleNavigate = (r: string, param?: string) => {
    if (r === 'productDetail' && param) {
      setProductDetailId(param)
      setRoute('productDetail')
      return
    }
    if (r === 'projectDetail' && param) {
      setProjectDetailId(param)
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
      case 'employees': return <Employees />
      case 'hire': return <Hire onNavigate={handleNavigate} />
      case 'projects': return <Projects onNavigate={handleNavigate} />
      case 'projectDetail': return projectDetailId ? <ProjectDetail projectId={projectDetailId} onNavigate={handleNavigate} /> : <Projects onNavigate={handleNavigate} />
      case 'newProject': return <NewProject onNavigate={handleNavigate} />
      case 'finance': return <Finance />
      case 'products': return <Products onNavigate={handleNavigate} />
      case 'productDetail': return productDetailId ? <ProductDetail productId={productDetailId} onNavigate={handleNavigate} /> : <Products onNavigate={handleNavigate} />
      default: return <Overview onNavigate={handleNavigate} />
    }
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>{t('app.title')}</h1>
        <div className="day-label">{formatDay(dayIndex)}</div>
        <div className="day-label" style={{ color: '#c9a865' }}>💰 {formatMoney(company?.cashBalanceCents ?? 0)}</div>
        <div className="day-label" style={{ color: '#9ab7d3' }}>🏷️ {Math.round(company?.brand ?? 0)}</div>
        <div className="controls">
          {SPEEDS.map(s => (
            <button
              key={s.value}
              className={`btn ${speed === s.value ? '' : 'btn-secondary'} btn-small`}
              style={speed === s.value ? { background: '#c9a865', color: '#0a192f' } : undefined}
              onClick={() => setSpeed(s.value)}
            >
              {s.label}
            </button>
          ))}
          <button className="btn btn-secondary btn-small" onClick={() => advanceDays(30)}>+30d</button>
          <span style={{ width: 1, height: 20, background: 'rgba(201,168,101,0.3)' }} />
          <button className="btn btn-secondary btn-small" onClick={save}>{t('button.save')}</button>
          <button className="btn btn-secondary btn-small" onClick={load}>{t('button.load')}</button>
          <select
            value={locale}
            onChange={e => setLocale(e.target.value as any)}
            style={{ padding: '4px 8px', background: '#0a192f', border: '1px solid var(--border)', color: 'var(--off-white)', fontSize: 12 }}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {/* 槽位 A：公司级横幅（全局唯一，不随页面切换消失，DESIGN-UI-LAYER §2.1） */}
      <CompanyAlertBanner company={company} onNavigate={() => handleNavigate('finance')} />

      <div className="main-layout">
        <nav className="sidebar">
          {NAV_ITEMS.map(item => (
            <a
              key={item.key}
              className={route === item.key ? 'active' : ''}
              onClick={() => handleNavigate(item.key)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <main className="content-area">
          {renderContent()}
        </main>
      </div>

      <div className="message-overlay">
        {messages.map(m => (
          <div key={m.id} className={`message-toast ${m.type}`}>{m.text}</div>
        ))}
      </div>
    </div>
  )
}
