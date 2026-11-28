import { moduleLabel } from '@ui/components/module-label'
import { ConceptCard } from '@ui/components/concept-editor'
import { prototypeForGenre } from '@content/studio-concepts'
import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { displayPriceCents, netRevenueCents } from '@ui/components/product-metrics'
import type { MarketingChannel } from '@domain/value-objects/marketing-response'
import { PUBLISHERS } from '@content/publishers'
import { templateRateRange, type SignTemplateCmd } from '@simulation/services/contract-service'
import { SEED_SEGMENT_TAGS } from '@content/d04-vocabulary'
import { estimateMediaReception, productRefundRates } from '@application/queries/product-feedback'
import { content } from '@infrastructure/loading/content-loader'
import { formatUnitPrice } from '@ui/components/money-format'
import { CATALOG_UPDATE_COST_CENTS, CATALOG_UPDATE_COOLDOWN_DAYS, REGIONAL_CAMPAIGN_COST_CENTS } from '@content/catalog-maintenance'
import { buildDemandScopesForDay } from '@content/c1-content'

interface Props { productId: string; onNavigate: (route: string, param?: string) => void }

const CHANNELS: MarketingChannel[] = ['social', 'expo', 'ads']

export const ProductDetail: React.FC<Props> = ({ productId, onNavigate }) => {
  const store = useGameStore()
  const {
    products, refundBatches, marketingCampaigns, publishingContracts,
    setProductPrice, applyProductDiscount, retireProduct, setMarketingBudget,
    signRevenueShare, signMilestone, signContractTemplate, estimateContract, toast, dayIndex,
  } = store
  const product = products.find((p) => p.id === productId)
  const [expansionRegion, setExpansionRegion] = React.useState('')

  const [priceYuan, setPriceYuan] = React.useState('')
  const [discountRate, setDiscountRate] = React.useState('')
  const [budgets, setBudgets] = React.useState<Record<MarketingChannel, string>>({ social: '', expo: '', ads: '' })
  const [ratePercent, setRatePercent] = React.useState('10')
  const [durationDays, setDurationDays] = React.useState('0')
  const [thresholdYuan, setThresholdYuan] = React.useState('')
  const [payoutYuan, setPayoutYuan] = React.useState('')
  const [tpl, setTpl] = React.useState<SignTemplateCmd['template']>('channel')
  const [templateRate, setTemplateRate] = React.useState(String(templateRateRange('channel').min))
  const [templateDuration, setTemplateDuration] = React.useState('')
  const [partnerId, setPartnerId] = React.useState('')
  const [prepayYuan, setPrepayYuan] = React.useState('')
  const [commitmentYuan, setCommitmentYuan] = React.useState('')
  const [quality, setQuality] = React.useState('60')
  const [deliveryDay, setDeliveryDay] = React.useState('')
  const [marketScope, setMarketScope] = React.useState('')
  const [platformScope, setPlatformScope] = React.useState('')
  const [estimate, setEstimate] = React.useState<import('@simulation/services/contract-estimate').ContractEstimate | null>(null)
  const eligiblePublishers = PUBLISHERS.filter((publisher) => publisher.specialties.includes(tpl))
  const selectedPartner = eligiblePublishers.find((publisher) => publisher.id === partnerId) ?? eligiblePublishers[0]

  /**
   * ADJ-12 S10-3 / A-29：模拟按日推进、UI 按周聚合。
   * Hook 必须在任何 early return 之前调用（rules-of-hooks），产品缺失时返回空表。
   */
  const salesByWeek = React.useMemo(() => {
    const map = new Map<number, { units: number; gross: number; net: number }>()
    for (const record of product?.salesByPeriod ?? []) {
      const week = Math.floor(record.dayIndex / 7)
      const acc = map.get(week) ?? { units: 0, gross: 0, net: 0 }
      acc.units += record.grossUnits
      acc.gross += record.grossRevenueCents
      acc.net += record.netSalesRevenueCents
      map.set(week, acc)
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([week, agg]) => ({ week, startDay: week * 7, endDay: week * 7 + 6, ...agg }))
  }, [product])

  const salesByMarket = React.useMemo(() => {
    const totals = new Map<string, { marketId: string; platformId: string; units: number; net: number }>()
    for (const record of product?.salesByPeriod ?? []) {
      const key = `${record.marketId}:${record.platformId}`
      const row = totals.get(key) ?? { marketId: record.marketId, platformId: record.platformId, units: 0, net: 0 }
      row.units += record.grossUnits
      row.net += record.netSalesRevenueCents
      totals.set(key, row)
    }
    return [...totals.values()].sort((a, b) => b.units - a.units)
  }, [product])

  /** 退款按周聚合（仅金额；退款"原因"明细 G1 不落，S-02 显式化）。 */
  const refundsByWeek = React.useMemo(() => {
    const map = new Map<number, number>()
    for (const batch of refundBatches.filter((b) => b.productId === productId && b.status === 'posted')) {
      const week = Math.floor(batch.refundDayIndex / 7)
      map.set(week, (map.get(week) ?? 0) + batch.refundAmountCents)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
      .map(([week, amountCents]) => ({ week, startDay: week * 7, endDay: week * 7 + 6, amountCents }))
  }, [refundBatches, productId])

  if (!product) {
    return <div className="panel">{t('product.missingRecord')}</div>
  }

  const retired = product.status === 'retired'
  const prototypeKind = prototypeForGenre(product.genreId)
  const expansionMarkets = new Set(buildDemandScopesForDay({ dayIndex,
    platformIds: product.supportedPlatformIds, segmentIds: product.audienceSegmentIds,
  }).map((scope) => scope.marketId))
  const isBankrupt = store.company?.status === 'bankrupt'
  const price = displayPriceCents(product)
  const audience = product.audienceSegmentIds ?? []
  const reputation = estimateMediaReception(product)
  const feedback = store.game?.sales.getLatestDemandFeedback(product.id) ?? product.latestMarketFeedback
  const priorDayMarketingSpendCents = feedback?.priorDayMarketingSpendCents ?? 0
  const refundRates = productRefundRates(product)
  const percent = new Intl.NumberFormat(store.locale, { style: 'percent', maximumFractionDigits: 2 })
  const units = new Intl.NumberFormat(store.locale)
  const attribution = feedback === undefined ? [] : [
    { key: 'audience', change: feedback.addressableUnits },
    { key: 'positioning', change: -feedback.purchaseIntentReductionUnits },
    { key: 'competition', change: -feedback.allocationReductionUnits },
  ]
  const postedRefunds = refundBatches.filter((b) => b.productId === product.id && b.status === 'posted')
  const pendingRefunds = refundBatches.filter((b) => b.productId === product.id && b.status === 'pending')

  const parseYuan = (value: string): number | null => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 100)
  }

  const submitPrice = () => {
    const cents = parseYuan(priceYuan)
    if (cents === null) return toast(t('error.priceRange'), 'error')
    const r = setProductPrice(product.id, cents)
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const submitDiscount = () => {
    const rate = Number(discountRate === '' ? 0 : discountRate)
    if (!Number.isInteger(rate)) return toast(t('error.priceDiscountRange'), 'error')
    const r = applyProductDiscount(product.id, rate)
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const submitBudget = (channel: MarketingChannel) => {
    const raw = budgets[channel]
    const yuan = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(yuan) || yuan < 0) return toast(t('error.marketingBudgetOutOfRange'), 'error')
    const r = setMarketingBudget(product.id, channel, Math.round(yuan * 100))
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const submitRevenue = () => {
    const days = Number(durationDays || '0')
    const r = signRevenueShare(product.id, Number(ratePercent), days === 0 ? null : days)
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const submitMilestone = () => {
    const threshold = parseYuan(thresholdYuan)
    const payout = parseYuan(payoutYuan)
    if (threshold === null || payout === null) return toast(t('error.contractThresholdOutOfRange'), 'error')
    const days = Number(durationDays || '0')
    const r = signMilestone(product.id, threshold, payout, days === 0 ? null : days)
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const templateCmd = () => {
    const days = Number(templateDuration || '0')
    return {
      productId: product.id,
      template: tpl,
      ratePercent: Number(templateRate),
      durationDays: days === 0 ? null : days,
      partnerId: selectedPartner?.id ?? '',
      ...(selectedPartner && {
        marketScope: selectedPartner.markets.includes(marketScope) ? [marketScope] : [...selectedPartner.markets],
      }),
      ...(platformScope.trim() === '' ? {} : { platformScope: platformScope.split(',').map((x) => x.trim()).filter(Boolean) }),
      ...(tpl === 'advance' ? { prepaymentCents: parseYuan(prepayYuan) ?? 0 } : {}),
      ...(tpl === 'co_marketing' ? { marketingCommitmentCents: parseYuan(commitmentYuan) ?? 0 } : {}),
      ...(tpl === 'advance' ? { qualityThreshold: quality.trim() === '' ? 60 : Number(quality) } : {}),
      ...(tpl === 'advance' && deliveryDay !== '' ? { deliveryDay: Number(deliveryDay) } : {}),
    }
  }

  const runEstimate = () => {
    const outcome = estimateContract(templateCmd())
    setEstimate(outcome.result ?? null)
    if (!outcome.success) return toast(outcome.message ?? t('error.unknown'), 'error')
    toast(t('contract.estimateDone'), 'info')
  }

  const submitTemplate = () => {
    const r = signContractTemplate({
      ...templateCmd(),
    })
    setEstimate(null)
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  const requestQuote = () => {
    const response = store.game?.requestPublisherQuote(templateCmd())
    if (!response?.success || !response.result) {
      toast(response?.message ?? t('error.unknown'), 'error')
      return
    }
    setTemplateRate(String(response.result.rate))
    setEstimate(response.result.estimate)
    toast(t('contract.quoteReceived').replace('{rate}', String(response.result.rate)), 'info')
  }

  return (
    <div className="release-archive">
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary btn-small" onClick={() => onNavigate('products')}>{t('product.back')}</button>
        <button className="btn btn-secondary btn-small" onClick={() => onNavigate('review')}>{t('nav.review')}</button>
      </div>
      <h2>{product.name}</h2>
      {prototypeKind && product.studioConcept && <ConceptCard kind={prototypeKind} concept={product.studioConcept} />}
      {product.predecessorProductId && products.find((item) => item.id === product.predecessorProductId) && (
        <p>{t('catalog.sequelOf').replace('{name}', products.find((item) => item.id === product.predecessorProductId)!.name)}</p>
      )}
      <div className="panel">
        <h3>{t('catalog.title')}</h3>
        <p>{t('catalog.update.hint').replace('{cost}', formatMoney(CATALOG_UPDATE_COST_CENTS)).replace('{days}', String(CATALOG_UPDATE_COOLDOWN_DAYS))}</p>
        {product.lastMaintenanceDay !== undefined && <p>{t('catalog.update.last').replace('{date}', formatDay(product.lastMaintenanceDay))}</p>}
        <div className="flex-gap">
          <button type="button" className="btn btn-secondary btn-small" disabled={isBankrupt} onClick={() => onNavigate('newSequel', product.id)}>{t('catalog.newSequel')}</button>
          <button type="button" className="btn btn-secondary btn-small" disabled={isBankrupt} onClick={() => {
            const result = store.game?.updateCatalogProduct(product.id)
            if (result?.success) store.refresh()
            toast(t(result?.success ? 'catalog.update.done' : result?.errorCode ?? 'catalog.update.unavailable'), result?.success ? 'success' : 'error')
          }}>{t(retired ? 'catalog.update.reactivate' : 'catalog.update.action')}</button>
        </div>
        <div className="flex-gap" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <label>{t('catalog.expand.label')} <select value={expansionRegion} onChange={(event) => setExpansionRegion(event.target.value)}>
            <option value="">—</option>
            {content.marketRegions.filter((region) => expansionMarkets.has(region.id)).map((region) =>
              <option key={region.id} value={region.id}>{store.locale === 'zh-CN' ? region.displayNameZh : region.displayName}</option>)}
          </select></label>
          <button type="button" className="btn btn-secondary btn-small" disabled={!expansionMarkets.has(expansionRegion) || retired || isBankrupt} onClick={() => {
            const result = store.game?.expandProductReach(product.id, expansionRegion)
            if (result?.success) store.refresh()
            toast(t(result?.success ? 'catalog.expand.done' : result?.errorCode ?? 'catalog.expand.unavailable'), result?.success ? 'success' : 'error')
          }}>{t('catalog.expand.action').replace('{cost}', formatMoney(REGIONAL_CAMPAIGN_COST_CENTS))}</button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>{t('studio.productFeedback')}</h3>
        <p className="muted">{t('newProject.form.modules')} · {product.moduleTemplateIds?.length ? new Intl.ListFormat(store.locale).format(product.moduleTemplateIds.map(moduleLabel)) : t('studio.noModules')}</p>
        {Object.keys(product.moduleAffinityBySegment ?? {}).length > 0 && (
          <p className="muted">{t('market.col.affinityBand')} · {Object.entries(product.moduleAffinityBySegment ?? {}).map(([segment, value]) => {
            const entry = content.consumerSegments.find((item) => item.id === segment)
            const name = store.locale === 'zh-CN' ? entry?.displayNameZh : entry?.displayName
            return `${name ?? t('market.missing')} ${percent.format(value)}`
          }).join(' · ')}</p>
        )}
      </div>
      <div className="panel">
        <h3>{t('product.overview')}</h3>
        <div>{t('product.stage')}: {t(`stage.${product.lifecycleStage}`)} · {t('product.launchDay')}: {product.launchDay === null ? '—' : product.launchDay}</div>
        <div>{t('product.launchPrice')}: {product.launchPriceCents === null ? t('product.noPrice') : formatUnitPrice(product.launchPriceCents)} · {t('product.currentPrice')}: {price === null ? t('product.noPrice') : formatUnitPrice(price)} · {t('product.discount')}: {product.discountRatePercent ?? 0}%</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder={t('product.setPrice')} value={priceYuan} onChange={(e) => setPriceYuan(e.target.value)} disabled={retired} />
          <button className="btn btn-small" onClick={submitPrice} disabled={retired}>{t('product.setPrice')}</button>
          <input placeholder="%" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} disabled={retired || isBankrupt} />
          <button
            className="btn btn-small"
            onClick={submitDiscount}
            disabled={retired || isBankrupt}
            aria-disabled={retired || isBankrupt}
            title={isBankrupt ? t('finance.bankrupt.blocked.salesActions') : undefined}
          >{t('product.applyDiscount')}</button>
          <button className="btn btn-secondary btn-small" onClick={() => { const r = retireProduct(product.id); toast(r.message ?? '', r.success ? 'success' : 'error') }} disabled={retired}>{t('product.retire')}</button>
        </div>
      </div>

      {/* A-29：周聚合销量表（周序号 + 起止日；逐日明细不入 P1 UI） */}
      <div className="panel" data-testid="p10-sales-weekly">
        <h3>{t('sales.title')} · {t('p10.weekly')}</h3>
        {salesByWeek.length === 0 ? <div>{t('sales.empty')}</div> : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('p10.week')}</th>
                <th>{t('p10.weekRange')}</th>
                <th>{t('sales.units')}</th>
                <th>{t('sales.gross')}</th>
                <th>{t('sales.net')}</th>
              </tr>
            </thead>
            <tbody>
              {salesByWeek.map((w) => (
                <tr key={w.week} data-testid={`p10-week-row-${w.week}`}>
                  <td>{w.week + 1}</td>
                  <td>Day {w.startDay}–{w.endDay}</td>
                  <td>{w.units}</td>
                  <td>{formatMoney(w.gross)}</td>
                  <td>{formatMoney(w.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{t('sales.netHint')}</div>
        {salesByWeek.length > 0 && <p>{t('products.col.netRevenue')}: {formatMoney(netRevenueCents(product, refundBatches))}</p>}
      </div>

      <div className="panel" data-testid="p10-reputation">
        <h3>{t('p10.reputation.title')}</h3>
        <span className="badge badge-muted" data-testid="p10-reputation-band">
          {t(reputation === null ? 'p10.reputation.none' : `p10.reputation.${reputation}`)}
        </span>
        <p className="muted" style={{ fontSize: 11 }}>{t('p10.reputation.hint')}</p>
      </div>

      <div className="panel" data-testid="p10-positioning">
        <h3>{t('p10.positioning.title')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="p10-positioning-tags">
          {audience.length === 0 && <span className="muted">{t('p10.positioning.noSegments')}</span>}
          {audience.map((id) => {
            const segment = content.consumerSegments.find((entry) => entry.id === id)
            const tag = SEED_SEGMENT_TAGS.find((entry) => entry.tagId === id)
            const label = segment !== undefined
              ? store.locale === 'zh-CN' ? segment.displayNameZh : segment.displayName
              : tag === undefined ? t('market.missing') : store.locale === 'zh-CN' ? tag.displayName : t(`market.segment.${tag.code}`)
            return <span key={id} className={`badge ${tag?.granularity === 'niche' ? 'paused' : ''}`}>{label}</span>
          })}
        </div>
        <table className="table" style={{ marginTop: 8 }} data-testid="p10-positioning-slices">
          <thead><tr><th>{t('p10.positioning.segment')}</th><th>{t('p10.positioning.platform')}</th><th>{t('sales.units')}</th><th>{t('market.regional.salesRevenue')}</th></tr></thead>
          <tbody>
            {salesByMarket.length === 0 ? (
              <tr><td colSpan={4}>{t('p10.positioning.noSlices')}</td></tr>
            ) : (
              salesByMarket.map((row) => {
                const region = content.marketRegions.find((entry) => entry.id === row.marketId)
                const platform = content.platforms.find((entry) => entry.id === row.platformId)
                return (
                  <tr key={`${row.marketId}:${row.platformId}`}>
                    <td>{region === undefined ? '—' : store.locale === 'zh-CN' ? region.displayNameZh : region.displayName}</td>
                    <td>{platform === undefined ? '—' : store.locale === 'zh-CN' ? platform.displayNameZh : platform.displayName}</td>
                    <td>{units.format(row.units)}</td>
                    <td>{formatMoney(row.net)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11 }}>{t('p10.positioning.hint')}</p>
      </div>

      <div className="panel" data-testid="p10-attribution">
        <h3>{t('p10.attribution.title')}</h3>
        {feedback === undefined ? (
          <p className="muted" style={{ fontSize: 12 }} data-testid="p10-attribution-empty">{t('p10.attribution.empty')}</p>
        ) : (
          <>
            <p className="muted">{t('p10.attribution.day').replace('{day}', formatDay(feedback.dayIndex))}</p>
            <table className="data-table">
              <tbody>
                {attribution.map(({ key, change }) => (
                  <tr key={key} data-testid={`p10-attribution-${key}`}>
                    <th scope="row">{t(`p10.attribution.${key}`)}</th>
                    <td>{t('p10.attribution.units').replace('{units}', units.format(change === 0 ? 0 : change))}</td>
                  </tr>
                ))}
                <tr data-testid="p10-attribution-result">
                  <th scope="row">{t('sales.units')}</th>
                  <td>{t('p10.attribution.units').replace('{units}', units.format(feedback.soldUnits))}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11 }}>{t('p10.attribution.hint')}</p>
            {priorDayMarketingSpendCents > 0 && (
              <p data-testid="p10-attribution-paid-marketing">
                {t('p10.attribution.marketingPaid')
                  .replace('{amount}', formatMoney(priorDayMarketingSpendCents))
                  .replace('{units}', units.format(feedback.marketingAddedIntentUnits))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h3>{t('refund.title')}</h3>
        {refundBatches.filter((b) => b.productId === product.id).length === 0 ? <div>{t('refund.empty')}</div> : (
          <table className="table">
            <thead><tr><th>{t('refund.day')}</th><th>{t('refund.amount')}</th><th>{t('refund.source')}</th><th>{t('refund.status')}</th></tr></thead>
            <tbody>
              {refundBatches.filter((b) => b.productId === product.id).map((b) => {
                const record = product.salesByPeriod.find((r) => r.id === b.salesRecordId)
                return (
                  <tr key={b.id}>
                    <td>{b.refundDayIndex}{record === undefined ? ` · ${t('product.missingRecord')}` : ''}</td>
                    <td>{formatMoney(b.refundAmountCents)}</td>
                    <td>{t(b.source === 'auto_window' ? 'refund.auto' : 'refund.player')}</td>
                    <td>{t(b.status === 'posted' ? 'refund.posted' : 'refund.pending')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          {t('refund.pendingHint')} · {t('refund.posted')}: {postedRefunds.length} · {t('refund.pending')}: {pendingRefunds.length}
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }} data-testid="p10-refund-summary">
          <span data-testid="p10-refund-modelled">{t('p10.refund.rate')}: {refundRates.estimated === null ? '—' : percent.format(refundRates.estimated)}</span>
          {' · '}
          <span data-testid="p10-refund-actual">{t('p10.refund.actualRate')}: {refundRates.actual === null ? '—' : percent.format(refundRates.actual)}</span>
          {' · '}{t('p10.refund.weekly')}
          {refundsByWeek.length === 0
            ? ` ${t('p10.refund.none')}`
            : (
              <ul>
                {refundsByWeek.map((w) => (
                  <li key={w.week}>
                    {t('p10.week')} {w.week + 1} (Day {w.startDay}–{w.endDay}): {formatMoney(w.amountCents)}
                  </li>
                ))}
              </ul>
            )}
        </div>
        {Number.isFinite(product.defectLevel) && <p className="muted" style={{ fontSize: 11 }}>{t('p08.defect.level')} {product.defectLevel}/100</p>}
        <p className="muted" style={{ fontSize: 11 }}>{t('p10.refund.hint')}</p>
      </div>

      <div className="panel">
        <h3>{t('marketing.title')} · Day {dayIndex}</h3>
        {CHANNELS.map((channel) => {
          const campaign = marketingCampaigns.find((c) => c.productId === product.id && c.channel === channel)
          return (
            <div key={channel} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 80 }}>{t(`marketing.channel.${channel}`)}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{t('marketing.current')}: {campaign ? formatMoney(campaign.dailyBudgetCents) : '—'} ({campaign?.status ?? 'ended'})</span>
              <input placeholder={t('marketing.budget')} value={budgets[channel]} onChange={(e) => setBudgets({ ...budgets, [channel]: e.target.value })} style={{ width: 110 }} disabled={retired || isBankrupt} />
              <button
                className="btn btn-small"
                onClick={() => submitBudget(channel)}
                disabled={retired || isBankrupt}
                aria-disabled={retired || isBankrupt}
                title={isBankrupt ? t('finance.bankrupt.blocked.salesActions') : undefined}
              >{t('marketing.apply')}</button>
            </div>
          )
        })}
      </div>

      <div className="panel">
        <h3>{t('contract.title')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder={t('contract.rate')} value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} style={{ width: 110 }} />
          <input placeholder={t('contract.duration')} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} style={{ width: 110 }} />
          <button className="btn btn-small" onClick={submitRevenue}>{t('contract.signRevenue')}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }} onChange={() => setEstimate(null)}>
          <select aria-label={t('contract.template')} value={tpl} onChange={(e) => {
            const template = e.target.value as SignTemplateCmd['template']
            setPartnerId(selectedPartner?.id ?? '')
            setTpl(template)
            setTemplateRate(String(templateRateRange(template).min))
          }}>
            <option value="channel">{t('contract.template.channel')}</option>
            <option value="co_marketing">{t('contract.template.co_marketing')}</option>
            <option value="advance">{t('contract.template.advance')}</option>
          </select>
          <select aria-label={t('contract.publisher')} value={selectedPartner?.id ?? ''} onChange={(e) => setPartnerId(e.target.value)}>
            {eligiblePublishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input aria-label={t('contract.templateRate')} placeholder={t('contract.rate')} value={templateRate} onChange={(e) => setTemplateRate(e.target.value)} style={{ width: 110 }} />
          <input aria-label={t('contract.templateDuration')} placeholder={t('contract.duration')} value={templateDuration} onChange={(e) => setTemplateDuration(e.target.value)} style={{ width: 110 }} />
          <select aria-label={t('contract.marketScope')} value={selectedPartner?.markets.includes(marketScope) ? marketScope : ''} onChange={(e) => setMarketScope(e.target.value)}>
            <option value="">{t('market.regional.contractDefault')}</option>
            {content.marketRegions.filter((region) => selectedPartner?.markets.includes(region.id)).map((region) => (
              <option key={region.id} value={region.id}>{store.locale === 'zh-CN' ? region.displayNameZh : region.displayName}</option>
            ))}
          </select>
          <input placeholder={t('contract.platformScope')} value={platformScope} onChange={(e) => setPlatformScope(e.target.value)} style={{ width: 130 }} />
          {tpl === 'advance' ? <input placeholder={t('contract.prepay')} value={prepayYuan} onChange={(e) => setPrepayYuan(e.target.value)} style={{ width: 130 }} /> : null}
          {tpl === 'co_marketing' ? <input placeholder={t('contract.commitment')} value={commitmentYuan} onChange={(e) => setCommitmentYuan(e.target.value)} style={{ width: 130 }} /> : null}
          {tpl === 'advance' ? <input placeholder={t('contract.quality')} value={quality} onChange={(e) => setQuality(e.target.value)} style={{ width: 90 }} /> : null}
          {tpl === 'advance' ? <input placeholder={t('contract.deliveryDay')} value={deliveryDay} onChange={(e) => setDeliveryDay(e.target.value)} style={{ width: 100 }} /> : null}
          <button className="btn btn-secondary btn-small" onClick={runEstimate}>{t('contract.estimate')}</button>
          <button type="button" className="btn btn-secondary btn-small" onClick={requestQuote}>{t('contract.requestQuote')}</button>
          <button className="btn btn-small" onClick={submitTemplate}>{t('contract.signTemplate')}</button>
        </div>
        {estimate === null ? null : (
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <p>{t('contract.quoteHorizon').replace('{days}', String(estimate.horizonDays))}</p>
            {t('contract.projectedNet')}: {formatMoney(estimate.projectedNetCents)} · {t('contract.projectedProceeds')}: {formatMoney(estimate.projectedPlayerProceedsCents)} · {t('contract.worstNet')}: {formatMoney(estimate.worstNetCents)} · {t('contract.worstProceeds')}: {formatMoney(estimate.worstPlayerProceedsCents)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder={t('contract.threshold')} value={thresholdYuan} onChange={(e) => setThresholdYuan(e.target.value)} style={{ width: 140 }} />
          <input placeholder={t('contract.payout')} value={payoutYuan} onChange={(e) => setPayoutYuan(e.target.value)} style={{ width: 110 }} />
          <button className="btn btn-small" onClick={submitMilestone}>{t('contract.signMilestone')}</button>
        </div>
        {publishingContracts.filter((c) => c.productId === product.id).length === 0 ? <div>{t('contract.empty')}</div> : (
          <table className="table">
            <thead><tr><th>{t('products.col.name')}</th><th>{t('contract.template')}</th><th>{t('contract.rate')}</th><th>{t('contract.settled')}</th><th>{t('contract.recouped')}</th><th>{t('contract.status')}</th></tr></thead>
            <tbody>
              {publishingContracts.filter((c) => c.productId === product.id).map((c) => (
                <tr key={c.id}>
                  <td>{t(`contract.type.${c.type}`)}</td>
                  <td>{c.template === undefined ? '—' : t(`contract.template.${c.template}`)}</td>
                  <td>{c.type === 'revenue_share' ? `${c.ratePercent}%` : `${formatMoney(c.thresholdNetRevenueCents ?? 0)} → ${formatMoney(c.payoutCents ?? 0)}`}</td>
                  <td>{formatMoney(c.settledCents)}</td>
                  <td>{c.prepaymentCents === undefined ? '—' : `${formatMoney(c.recoupedCents ?? 0)} / ${formatMoney(c.prepaymentCents)}`}</td>
                  <td>{t(`contract.status.${c.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
