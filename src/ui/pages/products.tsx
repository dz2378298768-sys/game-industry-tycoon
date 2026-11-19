import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { displayPriceCents, netRevenueCents, peakAwareness, refundCount } from '@ui/components/product-metrics'

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
    <div>
      <h2>{t('products.title')}</h2>
      <div className="panel" style={{ marginBottom: 8, fontSize: 12, opacity: 0.8 }}>{t('products.estimatedHint')}</div>
      <table className="table">
        <thead>
          <tr>
            <th>{t('products.col.name')}</th>
            <th>{t('products.col.stage')}</th>
            <th>{t('products.col.status')}</th>
            <th>{t('products.col.price')}</th>
            <th>{t('products.col.netRevenue')}</th>
            <th>{t('products.col.awareness')}</th>
            <th>{t('products.col.refunds')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const price = displayPriceCents(product)
            return (
              <tr key={product.id} style={{ cursor: 'pointer' }} onClick={() => onNavigate('productDetail', product.id)}>
                <td>{product.name}</td>
                <td>{t(`stage.${product.lifecycleStage}`)}</td>
                <td>{t(`status.${product.status}`)}</td>
                <td>{price === null ? t('product.noPrice') : formatMoney(price)}{product.discountRatePercent ? ` (-${product.discountRatePercent}%)` : ''}</td>
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
