import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { displayPriceCents, netRevenueCents, peakAwareness, refundCount } from '@ui/components/product-metrics'
import { estimateMediaReception } from '@application/queries/product-feedback'
import { formatUnitPrice } from '@ui/components/money-format'

interface Props { onNavigate: (route: string, param?: string) => void }

export const Products: React.FC<Props> = ({ onNavigate }) => {
  const { products, refundBatches } = useGameStore()

  if (products.length === 0) {
    return (
      <div>
        <h2>{t('products.title')}</h2>
        <div className="panel">{t('products.empty')}</div>
      </div>
    )
  }

  return (
    <div className="release-archive">
      <h2>{t('products.title')}</h2>
      <div className="panel" style={{ marginBottom: 8, fontSize: 12, opacity: 0.8 }}>{t('products.estimatedHint')}</div>
      <table className="table">
        <thead>
          <tr>
            <th>{t('products.col.name')}</th>
            <th>{t('products.col.stage')}</th>
            <th>{t('products.col.status')}</th>
            {/* FIX-1 / U1：删除合成平均分，三质量分列；D-02 终值向量未接线 → '—' */}
            <th>{t('p10.quality.design')}</th>
            <th>{t('p10.quality.implementation')}</th>
            <th>{t('p10.quality.completeness')}</th>
            <th title={t('p10.reputation.hint')}>{t('p10.reputation')}</th>
            <th>{t('products.col.price')}</th>
            <th>{t('products.col.netRevenue')}</th>
            <th>{t('products.col.awareness')}</th>
            <th>{t('products.col.refunds')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const price = displayPriceCents(product)
            const reputation = estimateMediaReception(product)
            return (
              <tr key={product.id} style={{ cursor: 'pointer' }} onClick={() => onNavigate('productDetail', product.id)}>
                <td>{product.name}</td>
                <td>{t(`stage.${product.lifecycleStage}`)}</td>
                <td>{t(`status.${product.status}`)}</td>
                <td data-testid="p10-quality-design">—</td>
                <td data-testid="p10-quality-implementation">—</td>
                <td data-testid="p10-quality-completeness">—</td>
                <td data-testid={`p10-reputation-${product.id}`}>
                  {t(reputation === null ? 'p10.reputation.none' : `p10.reputation.${reputation}`)}
                </td>
                <td>{price === null ? t('product.noPrice') : formatUnitPrice(price)}{product.discountRatePercent ? ` (-${product.discountRatePercent}%)` : ''}</td>
                <td>{formatMoney(netRevenueCents(product, refundBatches))}</td>
                <td>{Math.round(peakAwareness(product) * 100)}%</td>
                <td>{refundCount(product.id, refundBatches)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
