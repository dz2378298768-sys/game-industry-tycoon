import React, { useMemo, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import type { TransactionCategory } from '@domain/enums'

const CATEGORIES: TransactionCategory[] = [
  'salary', 'office_rent', 'project_expense', 'marketing', 'sales_revenue',
  'customer_refund', 'platform_fee', 'contract_payment', 'tax', 'advance', 'severance',
]

export const Finance: React.FC = () => {
  const { transactions, company } = useGameStore()
  const [filter, setFilter] = useState<TransactionCategory | 'all'>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return transactions
    return transactions.filter(tx => tx.category === filter)
  }, [transactions, filter])

  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    for (const tx of transactions) {
      if (tx.amountCents > 0) income += tx.amountCents
      else expense += Math.abs(tx.amountCents)
    }
    return { income, expense, net: income - expense }
  }, [transactions])

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">{t('finance.cashOnHand')}</div>
          <div className="value">{formatMoney(company?.cashBalanceCents ?? 0)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('finance.income')}</div>
          <div className="value positive">+{formatMoney(summary.income)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('finance.expense')}</div>
          <div className="value negative">-{formatMoney(summary.expense)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('finance.net')}</div>
          <div className={`value ${summary.net >= 0 ? 'positive' : 'negative'}`}>{summary.net >= 0 ? '+' : ''}{formatMoney(summary.net)}</div>
        </div>
      </div>

      {company && company.cashBalanceCents < 0 && (
        <div className="panel" style={{ borderColor: 'var(--danger, #b3423a)', background: 'rgba(179,66,58,0.08)' }}>
          <p className="negative" style={{ fontSize: 13 }}>⚠️ {t('finance.distress')}</p>
        </div>
      )}

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <h2>{t('finance.transactions')}</h2>
          <select value={filter} onChange={e => setFilter(e.target.value as TransactionCategory | 'all')}>
            <option value="all">{t('finance.filter.category')}: 全部</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{t(`finance.category.${c}`)}</option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('finance.column.day')}</th>
                <th>{t('finance.column.category')}</th>
                <th>{t('finance.column.description')}</th>
                <th className="text-right">{t('finance.column.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id}>
                  <td>{formatDay(tx.day)}</td>
                  <td>{t(`finance.category.${tx.category}`)}</td>
                  <td>{tx.description}</td>
                  <td className={`text-right ${tx.amountCents >= 0 ? 'positive' : 'negative'}`}>
                    {tx.amountCents >= 0 ? '+' : ''}{formatMoney(tx.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
