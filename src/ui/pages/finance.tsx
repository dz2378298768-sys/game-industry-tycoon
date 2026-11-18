import React, { useMemo, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import type { TransactionCategory } from '@domain/enums'
import type { ProjectCostAllocation } from '@domain/entities/project-cost-allocation'

const CATEGORIES: TransactionCategory[] = [
  'salary', 'office_rent', 'project_expense', 'marketing', 'sales_revenue',
  'customer_refund', 'platform_fee', 'contract_payment', 'tax', 'advance', 'severance',
]

export const Finance: React.FC = () => {
  const { transactions, company, projects } = useGameStore()
  const [filter, setFilter] = useState<TransactionCategory | 'all'>('all')
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

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

  // 一笔工资现金交易 → 多个项目成本分摊（DESIGN-G05 §10.3）
  const allocationsByTx = useMemo(() => {
    const map = new Map<string, Array<ProjectCostAllocation & { projectName: string }>>()
    for (const p of projects) {
      for (const a of p.costAllocations ?? []) {
        if (!a.cashTransactionId) continue
        const list = map.get(a.cashTransactionId) ?? []
        list.push({ ...a, projectName: p.name })
        map.set(a.cashTransactionId, list)
      }
    }
    return map
  }, [projects])

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
            <option value="all">{t('finance.filter.category')}: {t('common.all')}</option>
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
              {filtered.map(tx => {
                const allocations = allocationsByTx.get(tx.id) ?? []
                const expanded = expandedTxId === tx.id
                const projectTotal = allocations.reduce((s, a) => s + a.amountCents, 0)
                const cashExpense = Math.abs(tx.amountCents)
                const indirect = cashExpense - projectTotal
                return (
                  <React.Fragment key={tx.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedTxId(expanded ? null : tx.id)}>
                      <td>{formatDay(tx.day)}</td>
                      <td>{t(`finance.category.${tx.category}`)}</td>
                      <td>{tx.description}{allocations.length > 0 ? ` (${allocations.length})` : ''}</td>
                      <td className={`text-right ${tx.amountCents >= 0 ? 'positive' : 'negative'}`}>
                        {tx.amountCents >= 0 ? '+' : ''}{formatMoney(tx.amountCents)}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={4} style={{ background: 'rgba(0,0,0,0.15)' }}>
                          <div style={{ padding: 8 }}>
                            <h4 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('finance.allocation.title')}</h4>
                            {allocations.length === 0 ? (
                              <p className="muted" style={{ fontSize: 12 }}>{t('finance.allocation.noLink')}</p>
                            ) : (
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>{t('finance.column.project')}</th>
                                    <th>{t('project.budget.drilldown.sourceType')}</th>
                                    <th>{t('project.budget.drilldown.period')}</th>
                                    <th className="text-right">{t('project.budget.drilldown.amount')}</th>
                                    <th>{t('project.budget.drilldown.status')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {allocations.map(a => (
                                    <tr key={a.id}>
                                      <td>{a.projectName}</td>
                                      <td>{t(`project.cost.source.${a.sourceType}`)}</td>
                                      <td>{a.periodKey}</td>
                                      <td className="text-right positive">+{formatMoney(a.amountCents)}</td>
                                      <td>{t(`project.cost.status.${a.status}`)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                              {t('finance.allocation.projectTotal')}: +{formatMoney(projectTotal)} ·{' '}
                              {t('finance.allocation.cashExpense')}: {formatMoney(cashExpense)} ·{' '}
                              {t('finance.allocation.indirect')}: {formatMoney(indirect)}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
