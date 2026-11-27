import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { monthKeyOf } from '@domain/value-objects/finance-commitment'
import { estimateMediaReception, latestCompanyRelease } from '@application/queries/product-feedback'
import { currentMarketCompetitors } from '@application/queries/market-feedback'
import { netRevenueCents } from '@ui/components/product-metrics'

/**
 * P-12 经营复盘与第二款（S12，批次 07B）+ §3 S12-4 媒体评价聚合卡。
 *
 * 三质量终值和继承项等待 ProductArchive。归因仅展示最近上市产品的可核对事实。
 */

interface Props {
  onNavigate: (route: string, param?: string) => void
}

const ATTRIBUTION_DOMAINS = [
  { key: 'design', labelKey: 'p12.domain.design' },
  { key: 'execution', labelKey: 'p12.domain.execution' },
  { key: 'market', labelKey: 'p12.domain.market' },
  { key: 'finance', labelKey: 'p12.domain.finance' },
] as const

const INHERITANCE_ITEMS = [
  { key: 'cash', labelKey: 'p12.inherit.cash' },
  { key: 'team', labelKey: 'p12.inherit.team' },
  { key: 'lastProduct', labelKey: 'p12.inherit.lastProduct' },
  { key: 'experience', labelKey: 'p12.inherit.experience' },
  { key: 'market', labelKey: 'p12.inherit.market' },
] as const

export const Review: React.FC<Props> = ({ onNavigate }) => {
  const store = useGameStore()
  const { company, transactions, financial, dayIndex, refundBatches } = store
  const products = store.products.filter((product) => product.companyId === company?.id)
  const projects = store.projects.filter((project) => project.companyId === company?.id)

  // 账本派生：月度净额（现金曲线，简单分段列表，不引入图表库）
  const cashCurve = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      const key = monthKeyOf(tx.day)
      map.set(key, (map.get(key) ?? 0) + tx.amountCents)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [transactions])

  const latestProduct = latestCompanyRelease(products, company?.id)
  const sourceProject = projects.find((project) => project.id === latestProduct?.sourceProjectId)
  const deliveredQuality = sourceProject === undefined ? undefined
    : store.game?.getExecutionProject(sourceProject.id)?.builds.at(-1)?.deliveryDecision
  const latestProject = sourceProject ?? projects.sort((a, b) => b.createdAt - a.createdAt)[0]
  const reputation = latestProduct === undefined ? null : estimateMediaReception(latestProduct)
  const feedback = latestProduct === undefined ? undefined
    : latestProduct.latestMarketFeedback ?? store.game?.sales.getLatestDemandFeedback(latestProduct.id)
  const units = new Intl.NumberFormat(store.locale)
  const productAnchor = latestProduct === undefined ? undefined : { route: 'productDetail', id: latestProduct.id }
  const reasons = {
    design: sourceProject === undefined || latestProduct === undefined ? null : {
      fact: t(`genre.${latestProduct.genreId}`),
      anchor: { route: 'projectDetail', id: sourceProject.id },
    },
    execution: latestProduct === undefined || !Number.isFinite(latestProduct.defectLevel) ? null : {
      fact: `${t('p08.defect.level')} ${latestProduct.defectLevel}/100`,
      anchor: productAnchor,
    },
    market: feedback === undefined ? null : {
      fact: `${formatDay(feedback.dayIndex)} · ${t('sales.units')} ${units.format(feedback.soldUnits)}`,
      anchor: productAnchor,
    },
    finance: latestProduct === undefined || latestProduct.salesByPeriod.length === 0 ? null : {
      fact: `${t('products.col.netRevenue')} ${formatMoney(netRevenueCents(latestProduct, refundBatches))}`,
      anchor: productAnchor,
    },
  }
  const activeRoles = new Map<string, number>()
  for (const employee of store.employees) {
    if (employee.companyId !== company?.id || employee.status !== 'hired') continue
    activeRoles.set(employee.role, (activeRoles.get(employee.role) ?? 0) + 1)
  }
  const inheritedFacts = {
    cash: financial === null ? null : `${t('finance.availableCash')} ${formatMoney(financial.availableCashCents)}`,
    team: company === null ? null : activeRoles.size === 0
      ? `${t('overview.employees')} 0`
      : [...activeRoles].map(([role, count]) => `${t(`employee.role.${role}`)} × ${units.format(count)}`).join(' · '),
    lastProduct: latestProduct === undefined ? null : [
      latestProduct.name,
      t(`genre.${latestProduct.genreId}`),
      latestProduct.salesByPeriod.length === 0
        ? t('sales.empty')
        : `${t('products.col.netRevenue')} ${formatMoney(netRevenueCents(latestProduct, refundBatches))}`,
    ].join(' · '),
    experience: latestProduct === undefined ? null : (latestProduct.moduleTemplateIds?.length
      ? `模块组合 ${latestProduct.moduleTemplateIds.join('、')} · 可作为第二款产品的继承基线`
      : '数据不足 · 旧产品未保存模块快照'),
    market: store.game === null ? null : `${t('market.runtimeCompetitors')} ${units.format(currentMarketCompetitors(store.game.world.companies).length)}`,
  }

  // Product receipts after platform fees and posted refunds.
  const totalUnits = products.reduce((sum, p) => sum + p.salesByPeriod.reduce((s, r) => s + r.grossUnits, 0), 0)
  const productIds = new Set(products.map((product) => product.id))
  const totalRevenue = products.reduce((sum, product) => sum + netRevenueCents(product, refundBatches), 0)
  const totalRefunds = refundBatches
    .filter((batch) => batch.status === 'posted' && productIds.has(batch.productId))
    .reduce((sum, batch) => sum + batch.refundAmountCents, 0)

  const distressed = store.isFinanciallyDistressed() || (financial?.availableCashCents ?? 0) <= 0

  return (
    <div>
      <div className="panel">
        <button className="btn btn-secondary btn-small mb-16" onClick={() => onNavigate('overview')}>← {t('common.back')}</button>
        <h2 style={{ marginBottom: 4 }} data-testid="p12-title">{t('p12.title')}</h2>
        <p className="muted" style={{ fontSize: 12 }}>{formatDay(dayIndex)}</p>
      </div>

      {products.length === 0 && (
        <div className="panel" data-testid="p12-empty">
          <p className="muted">{t('p12.empty')}</p>
        </div>
      )}

      {/* 经营结果汇总 */}
      <div className="panel" data-testid="p12-summary">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.summary')}</h2>
        <table className="data-table">
          <tbody>
            <tr data-testid="p12-budget">
              <td>{t('p12.budget')}</td>
              <td>
                {t('p12.budget.planned')}: {formatMoney(latestProject?.budgetTotalCapCents ?? 0)} ·{' '}
                {t('p12.budget.actual')}: {formatMoney(latestProject?.budgetSpentCents ?? 0)}
              </td>
            </tr>
            <tr data-testid="p12-schedule">
              <td>{t('p12.schedule')}</td>
              <td>
                {t('p12.schedule.delay')}: {latestProject?.launchDelayDays ?? 0} ·{' '}
                {t('p12.schedule.rework')}: {latestProject ? store.getDeliveryStatus(latestProject.id).reworkCount : 0}
              </td>
            </tr>
            <tr>
              <td>{t('p12.salesTotal')}</td>
              <td>{t('sales.units')}: {totalUnits} · {t('finance.net')}: {formatMoney(totalRevenue)} · {t('finance.monthly.refund')}: {formatMoney(totalRefunds)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: 12 }} data-testid="p12-quality">
          <p style={{ fontSize: 13, fontWeight: 600 }}>{t('p12.quality.title')}</p>
          <table className="data-table">
            <thead><tr>
              <th>{t('p12.quality.design')}</th>
              <th>{t('p12.quality.implementation')}</th>
              <th>{t('p12.quality.completeness')}</th>
            </tr></thead>
            <tbody><tr>
              {([
                ['design', deliveredQuality?.dqVector],
                ['implementation', deliveredQuality?.iqVector],
                ['completeness', deliveredQuality?.completenessVector],
              ] as const).map(([column, vector]) => (
                <td key={column} data-testid={`p12-quality-${column}`}>
                  {vector === undefined ? '—' : (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {Object.entries(vector).map(([dimension, value]) => (
                        <li key={dimension}>{t(`p08.quality.${dimension}`)} {typeof value === 'number' ? `${Math.round(value * 100)}%` : '—'}</li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr></tbody>
          </table>
        </div>
      </div>

      {/* 现金曲线（账本派生，简单分段列表） */}
      <div className="panel" data-testid="p12-cash-curve">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.cashCurve')}</h2>
        {cashCurve.length === 0 ? (
          <p className="muted">{t('p12.cashCurve.empty')}</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>{t('finance.cashflow.month')}</th><th className="text-right">{t('finance.cashflow.expected')}</th></tr></thead>
            <tbody>
              {cashCurve.map(([month, net]) => (
                <tr key={month}><td>{month}</td><td className="text-right">{formatMoney(net)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel" data-testid="p12-attribution">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.attribution')}</h2>
        {latestProduct !== undefined && <p>{t('p12.attribution.product').replace('{product}', latestProduct.name)}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          {ATTRIBUTION_DOMAINS.map((domain) => {
            const reason = reasons[domain.key]
            const anchor = reason?.anchor
            return (
              <div key={domain.key} className="panel" data-testid={`p12-domain-${domain.key}`}>
                <strong style={{ fontSize: 13 }}>{t(domain.labelKey)}</strong>
                <p className="muted" style={{ fontSize: 12 }}>{reason?.fact ?? t('p12.dataInsufficient')}</p>
                {anchor !== undefined && (
                  <button className="btn btn-link" onClick={() => onNavigate(anchor.route, anchor.id)}>
                    {t('p12.attribution.link')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <p className="muted" style={{ fontSize: 11 }}>{t('p12.attribution.hint')}</p>
      </div>

      <div className="panel" data-testid="p12-media-card">
        <h2 style={{ marginTop: 0 }}>{t('p12.media.title')}</h2>
        <span className="badge badge-muted" data-testid="p12-media-band">
          {t(reputation === null ? 'p10.reputation.none' : `p10.reputation.${reputation}`)}
        </span>
        {reputation === null && <p className="muted">{t('p12.media.empty')}</p>}
        <p className="muted" style={{ fontSize: 11 }}>{t('p12.media.hint')}</p>
      </div>

      <div className="panel" data-testid="p12-inheritance">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.inheritance')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          {INHERITANCE_ITEMS.map((item) => (
            <div key={item.key} className="panel" data-testid={`p12-inherit-${item.key}`}>
              <strong style={{ fontSize: 13 }}>{t(item.labelKey)}</strong>
              <p className="muted" style={{ fontSize: 12 }}>{inheritedFacts[item.key] ?? t('p12.dataInsufficient')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 第二款入口：无禁用态，强制走完整 S2–S11（ADJ-12 S12-3） */}
      <div className="panel" data-testid="p12-next">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.next')}</h2>
        {distressed && (
          <p className="negative" style={{ fontSize: 12 }} data-testid="p12-next-unaffordable">
            {t('p12.next.unaffordable')}{' '}
            <button className="btn btn-link" onClick={() => onNavigate('finance')}>{t('p12.next.throttle')}</button>
          </p>
        )}
        <button className="btn" onClick={() => onNavigate('market')} data-testid="p12-next-start">
          {t('p12.next.start')}
        </button>
        <p className="muted" style={{ fontSize: 11 }}>{t('p12.next.hint')}</p>
      </div>
    </div>
  )
}
