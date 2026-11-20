import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { displayPriceCents } from '@ui/components/product-metrics'
import type { MarketingChannel } from '@domain/value-objects/marketing-response'

interface Props { productId: string; onNavigate: (route: string, param?: string) => void }

const CHANNELS: MarketingChannel[] = ['social', 'expo', 'ads']

export const ProductDetail: React.FC<Props> = ({ productId, onNavigate }) => {
  const store = useGameStore()
  const {
    products, refundBatches, marketingCampaigns, publishingContracts,
    setProductPrice, applyProductDiscount, retireProduct, setMarketingBudget,
    signRevenueShare, signMilestone, signContractTemplate, toast, dayIndex,
  } = store
  const product = products.find((p) => p.id === productId)

  const [priceYuan, setPriceYuan] = React.useState('')
  const [discountRate, setDiscountRate] = React.useState('')
  const [budgets, setBudgets] = React.useState<Record<MarketingChannel, string>>({ social: '', expo: '', ads: '' })
  const [ratePercent, setRatePercent] = React.useState('10')
  const [durationDays, setDurationDays] = React.useState('0')
  const [thresholdYuan, setThresholdYuan] = React.useState('')
  const [payoutYuan, setPayoutYuan] = React.useState('')
  const [tpl, setTpl] = React.useState<'channel' | 'co_marketing' | 'advance'>('channel')
  const [partnerId, setPartnerId] = React.useState('pub-global')
  const [prepayYuan, setPrepayYuan] = React.useState('')
  const [commitmentYuan, setCommitmentYuan] = React.useState('')
  const [quality, setQuality] = React.useState('60')
  const [deliveryDay, setDeliveryDay] = React.useState('')

  /** Hook 必须在任何 early return 之前调用（rules-of-hooks），产品缺失时返回空表。 */
  const salesByDay = React.useMemo(() => {
    const map = new Map<number, { units: number; gross: number; net: number }>()
    for (const record of product?.salesByPeriod ?? []) {
      const acc = map.get(record.dayIndex) ?? { units: 0, gross: 0, net: 0 }
      acc.units += record.grossUnits
      acc.gross += record.grossRevenueCents
      acc.net += record.netSalesRevenueCents
      map.set(record.dayIndex, acc)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [product])

  if (!product) {
    return <div className="panel">{t('product.missingRecord')}</div>
  }

  const retired = product.status === 'retired'
  const price = displayPriceCents(product)
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

  const submitTemplate = () => {
    const days = Number(durationDays || '0')
    const r = signContractTemplate({
      productId: product.id,
      template: tpl,
      ratePercent: Number(ratePercent),
      durationDays: days === 0 ? null : days,
      partnerId: partnerId.trim(),
      ...(tpl === 'advance' ? { prepaymentCents: parseYuan(prepayYuan) ?? 0 } : {}),
      ...(tpl === 'co_marketing' ? { marketingCommitmentCents: parseYuan(commitmentYuan) ?? 0 } : {}),
      ...(tpl === 'advance' ? { qualityThreshold: Number(quality) || 60 } : {}),
      ...(tpl === 'advance' && deliveryDay !== '' ? { deliveryDay: Number(deliveryDay) } : {}),
    })
    toast(r.message ?? '', r.success ? 'success' : 'error')
  }

  return (
    <div>
      <button className="btn btn-secondary btn-small" onClick={() => onNavigate('products')}>{t('product.back')}</button>
      <h2>{product.name}</h2>

      <div className="panel">
        <h3>{t('product.overview')}</h3>
        <div>{t('product.stage')}: {t(`stage.${product.lifecycleStage}`)} · {t('product.launchDay')}: {product.launchDay === null ? '—' : product.launchDay}</div>
        <div>{t('product.launchPrice')}: {product.launchPriceCents === null ? t('product.noPrice') : formatMoney(product.launchPriceCents)} · {t('product.currentPrice')}: {price === null ? t('product.noPrice') : formatMoney(price)} · {t('product.discount')}: {product.discountRatePercent ?? 0}%</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder={t('product.setPrice')} value={priceYuan} onChange={(e) => setPriceYuan(e.target.value)} disabled={retired} />
          <button className="btn btn-small" onClick={submitPrice} disabled={retired}>{t('product.setPrice')}</button>
          <input placeholder="%" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} disabled={retired} />
          <button className="btn btn-small" onClick={submitDiscount} disabled={retired}>{t('product.applyDiscount')}</button>
          <button className="btn btn-secondary btn-small" onClick={() => { const r = retireProduct(product.id); toast(r.message ?? '', r.success ? 'success' : 'error') }} disabled={retired}>{t('product.retire')}</button>
        </div>
      </div>

      <div className="panel">
        <h3>{t('sales.title')}</h3>
        {salesByDay.length === 0 ? <div>{t('sales.empty')}</div> : (
          <table className="table">
            <thead><tr><th>{t('sales.day')}</th><th>{t('sales.units')}</th><th>{t('sales.gross')}</th><th>{t('sales.net')}</th></tr></thead>
            <tbody>
              {salesByDay.map(([day, agg]) => (
                <tr key={day}><td>{day}</td><td>{agg.units}</td><td>{formatMoney(agg.gross)}</td><td>{formatMoney(agg.net)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{t('sales.netHint')}</div>
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
      </div>

      <div className="panel">
        <h3>{t('marketing.title')} · Day {dayIndex}</h3>
        {CHANNELS.map((channel) => {
          const campaign = marketingCampaigns.find((c) => c.productId === product.id && c.channel === channel)
          return (
            <div key={channel} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ width: 80 }}>{t(`marketing.channel.${channel}`)}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{t('marketing.current')}: {campaign ? formatMoney(campaign.dailyBudgetCents) : '—'} ({campaign?.status ?? 'ended'})</span>
              <input placeholder={t('marketing.budget')} value={budgets[channel]} onChange={(e) => setBudgets({ ...budgets, [channel]: e.target.value })} style={{ width: 110 }} disabled={retired} />
              <button className="btn btn-small" onClick={() => submitBudget(channel)} disabled={retired}>{t('marketing.apply')}</button>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <select value={tpl} onChange={(e) => setTpl(e.target.value as typeof tpl)}>
            <option value="channel">{t('contract.template.channel')}</option>
            <option value="co_marketing">{t('contract.template.co_marketing')}</option>
            <option value="advance">{t('contract.template.advance')}</option>
          </select>
          <input placeholder={t('contract.partnerId')} value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 130 }} />
          {tpl === 'advance' ? <input placeholder={t('contract.prepay')} value={prepayYuan} onChange={(e) => setPrepayYuan(e.target.value)} style={{ width: 130 }} /> : null}
          {tpl === 'co_marketing' ? <input placeholder={t('contract.commitment')} value={commitmentYuan} onChange={(e) => setCommitmentYuan(e.target.value)} style={{ width: 130 }} /> : null}
          {tpl === 'advance' ? <input placeholder={t('contract.quality')} value={quality} onChange={(e) => setQuality(e.target.value)} style={{ width: 90 }} /> : null}
          {tpl === 'advance' ? <input placeholder={t('contract.deliveryDay')} value={deliveryDay} onChange={(e) => setDeliveryDay(e.target.value)} style={{ width: 100 }} /> : null}
          <button className="btn btn-small" onClick={submitTemplate}>{t('contract.signTemplate')}</button>
        </div>
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
