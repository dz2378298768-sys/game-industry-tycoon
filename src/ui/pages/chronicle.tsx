import { useState } from 'react'
import { STUDIO_RESEARCH } from '@content/studio-research'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { content } from '@infrastructure/loading/content-loader'
import { formatDay, t, useGameStore } from '@ui/state/game-store'

type Kind = 'company' | 'product' | 'people' | 'technology' | 'platform'

interface Entry {
  id: string
  day: number
  kind: Kind
  title: string
  detail: string
  productId?: string
}

const kinds: readonly Kind[] = ['company', 'product', 'people', 'technology', 'platform']
const companyEvents: Readonly<Record<string, string>> = {
  CompanyBankrupted: 'chronicle.bankruptcy',
  CompanyRecovered: 'chronicle.recovery',
  CompanyDissolved: 'chronicle.exit',
}

export function Chronicle({ onNavigate }: { onNavigate: (route: string, id?: string) => void }) {
  const { game, dayIndex, locale, company } = useGameStore()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(40)
  const entries: Entry[] = []
  const companies = new Map(game?.world.companies.map((item) => [item.id, item]))
  const products = new Map(game?.world.products.map((item) => [item.id, item]))
  for (const item of companies.values()) {
    entries.push({ id: item.id, day: item.foundingDay, kind: 'company', title: item.name, detail: t('chronicle.founded') })
    for (const research of STUDIO_RESEARCH) {
      const day = item.researchCompletionDays?.[research.id]
      if (day !== undefined) entries.push({ id: `${item.id}:${research.id}`, day, kind: 'technology',
        title: t(`research.${research.id}`), detail: `${item.name} · ${t('chronicle.researched')}` })
    }
  }
  for (const item of products.values()) {
    const owner = companies.get(item.companyId)
    entries.push({ id: item.id, day: item.launchDay, kind: 'product', title: item.name,
      detail: `${owner?.name ?? ''} · ${t('chronicle.released')}`,
      ...(item.companyId === company?.id && { productId: item.id }) })
  }
  for (const item of game?.world.employees ?? []) {
    entries.push({ id: item.id, day: item.hireDay, kind: 'people', title: item.name,
      detail: `${companies.get(item.companyId)?.name ?? ''} · ${t('chronicle.joined')}` })
  }
  for (const platform of content.platforms) {
    entries.push({ id: platform.id, day: gregorianToDayIndex(platform.earliestAvailabilityYear, 1, 1), kind: 'platform',
      title: locale === 'zh-CN' ? platform.displayNameZh : platform.displayName, detail: t('chronicle.platformOpened') })
  }
  for (const event of game?.world.events ?? []) {
    const companyId = event.payload.companyId
    const owner = typeof companyId === 'string' ? companies.get(companyId) : undefined
    const companyEvent = companyEvents[event.type]
    if (owner && companyEvent) entries.push({ id: event.id, day: event.day, kind: 'company', title: owner.name, detail: t(companyEvent) })
    const productId = event.payload.productId
    const title = typeof productId === 'string' ? products.get(productId) : undefined
    if (title && (event.type === 'ProductUpdated' || event.type === 'ProductRetired' || event.type === 'ProductMarketExpanded')) {
      const region = content.marketRegions.find((candidate) => candidate.id === event.payload.marketId)
      entries.push({ id: event.id, day: event.day, kind: 'product', title: title.name,
        detail: event.type === 'ProductMarketExpanded'
          ? t('chronicle.expansion').replace('{region}', (locale === 'zh-CN' ? region?.displayNameZh : region?.displayName) ?? '—')
          : t(event.type === 'ProductUpdated' ? 'chronicle.updated' : 'chronicle.retired'),
        ...(title.companyId === company?.id && { productId: title.id }) })
    }
  }
  const search = query.trim().toLocaleLowerCase(locale)
  const visible = entries.filter((entry) => entry.day <= dayIndex && (filter === 'all' || filter === entry.kind)
    && `${entry.title} ${entry.detail}`.toLocaleLowerCase(locale).includes(search))
    .sort((a, b) => b.day - a.day || a.id.localeCompare(b.id))

  return <section>
    <h2>{t('nav.chronicle')}</h2>
    <div className="flex-gap mb-16" style={{ flexWrap: 'wrap' }}>
      <label>{t('chronicle.filter')} <select value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(40) }}>
        <option value="all">{t('chronicle.all')}</option>
        {kinds.map((kind) => <option key={kind} value={kind}>{t(`chronicle.kind.${kind}`)}</option>)}
      </select></label>
      <label>{t('chronicle.search')} <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(40) }} /></label>
    </div>
    <ul className="panel" style={{ listStyle: 'none' }}>
      {visible.slice(0, limit).map((entry) => <li key={`${entry.kind}:${entry.id}`} className="mb-16">
        <small>{formatDay(entry.day)}</small>
        <div><strong>{entry.title}</strong> · {entry.detail}</div>
        {entry.productId && <button type="button" className="btn btn-link" onClick={() => onNavigate('productDetail', entry.productId)}>{t('chronicle.openProduct')}</button>}
      </li>)}
      {visible.length === 0 && <li>{t('chronicle.empty')}</li>}
    </ul>
    {limit < visible.length && <button type="button" className="btn btn-secondary" onClick={() => setLimit(limit + 40)}>{t('chronicle.more')}</button>}
  </section>
}
