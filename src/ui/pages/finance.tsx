import React, { useMemo, useState } from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import type { TransactionCategory } from '@domain/enums'
import type { ProjectCostAllocation } from '@domain/entities/project-cost-allocation'
import { dayIndexToGregorian, gregorianToDayIndex } from '@domain/value-objects/day-index'

const CATEGORIES: TransactionCategory[] = [
  'salary', 'office_rent', 'project_expense', 'marketing', 'sales_revenue',
  'customer_refund', 'platform_fee', 'contract_payment', 'tax', 'advance', 'severance',
]

/** 显示纪元口径：Day 0 = 2026-01-05（ADJ-12 S1-3 / ADJ-17 §2，与 formatDay 同源）。 */
const DISPLAY_EPOCH = gregorianToDayIndex(2026, 1, 5)
function monthKeyOf(day: number): string {
  const g = dayIndexToGregorian(day + DISPLAY_EPOCH)
  return `${g.year}-${String(g.month).padStart(2, '0')}`
}

interface Props {
  onNavigate?: (route: string, param?: string) => void
}

export const Finance: React.FC<Props> = ({ onNavigate }) => {
  const store = useGameStore()
  const { transactions, company, projects, financial, dayIndex, restartNewGame } = store
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

  /** P-11 月度结算：沿用 settlementDay 语义，按交易所属自然月归类，不引入 30 天月（ADJ-12 S11-2）。 */
  const monthly = useMemo(() => {
    const key = monthKeyOf(dayIndex)
    const rows = transactions.filter((tx) => monthKeyOf(tx.day) === key)
    const sum = (cats: TransactionCategory[], sign: 'pos' | 'neg'): number =>
      rows.filter((tx) => cats.includes(tx.category) && (sign === 'pos' ? tx.amountCents > 0 : tx.amountCents < 0))
        .reduce((s, tx) => s + Math.abs(tx.amountCents), 0)
    return {
      month: key,
      income: sum(['sales_revenue'], 'pos'),
      expense: rows.filter((tx) => tx.amountCents < 0).reduce((s, tx) => s + Math.abs(tx.amountCents), 0),
      salary: sum(['salary', 'severance'], 'neg'),
      projectCost: sum(['project_expense'], 'neg') + sum(['marketing'], 'neg'),
      productRevenue: sum(['sales_revenue'], 'pos'),
      refund: sum(['customer_refund'], 'neg'),
    }
  }, [transactions, dayIndex])

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

  // 现金流预测（只读，内核同源；无应收/应付数据源时净额仅反映承诺 burn）
  const forecast = typeof store.getCashForecast === 'function' ? store.getCashForecast() : null
  const netCashByMonth = forecast?.netCashByMonth ?? []

  // U2：runway 直读内核值，零数值修饰；颜色规则同顶栏（<2 红 / <4 橙）
  const runway = financial?.runwayMonths
  const runwayColor = runway === undefined ? '#9ab7d3'
    : runway < 2.0 ? '#b3423a' : runway < 4.0 ? '#e8912d' : '#9ab7d3'
  const runwayText = runway === undefined ? '—'
    : Number.isFinite(runway) ? t('finance.runwayMonths').replace('{months}', runway.toFixed(1))
      : t('topbar.runwayInfinity')

  const crisisLevel = financial?.crisisLevel ?? 'healthy'
  const reasonCodes: string[] = financial?.reasonCodes ?? []
  const isBankrupt = company?.status === 'bankrupt' || crisisLevel === 'bankrupt'
  const inCrisis = crisisLevel === 'watch' || crisisLevel === 'warning' || crisisLevel === 'critical'

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">{t('finance.cashOnHand')}</div>
          <div className="value">{formatMoney(company?.cashBalanceCents ?? 0)}</div>
        </div>
        <div className="kpi-card" data-testid="finance-available-cash">
          <div className="label">{t('finance.availableCash')}</div>
          <div className="value">{financial ? formatMoney(financial.availableCashCents) : '—'}</div>
          <div className="label" style={{ fontSize: 10, opacity: 0.7 }}>{t('finance.availableCash.hint')}</div>
        </div>
        <div className="kpi-card" data-testid="finance-runway">
          <div className="label">{t('finance.runway')}</div>
          <div className="value" style={{ color: runwayColor }}>{runwayText}</div>
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

      {/* 危机状态区（§1.4）：状态徽标 + 原因码逐条 + 补救窗口（CrisisState 未接线 → 剩余天数 fail-closed） */}
      <div className="panel" data-testid="finance-crisis">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{t('finance.section.crisis')}</h2>
          <span className={`badge ${crisisLevel === 'critical' || isBankrupt ? 'negative' : crisisLevel === 'warning' ? 'paused' : ''}`} data-testid="finance-crisis-level">
            {t(`finance.crisis.${crisisLevel}`)}
          </span>
        </div>
        {reasonCodes.length > 0 && (
          <ul data-testid="finance-crisis-reasons" style={{ fontSize: 12, marginTop: 8 }}>
            {reasonCodes.map((code, idx) => (
              <li key={`${code}-${idx}`}>
                {t(`error.crisis.${code.toLowerCase()}`)}
                <span className="muted"> ({code})</span>
              </li>
            ))}
          </ul>
        )}
        {crisisLevel === 'critical' && !isBankrupt && (
          <div style={{ fontSize: 12, marginTop: 8 }} data-testid="finance-crisis-critical">
            {t('finance.crisis.remediation')}: <span data-testid="finance-remediation-days">—</span>
            {' · '}{t('finance.crisis.gap')}: {formatMoney(company?.cashBalanceCents ?? 0)}
            <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>{t('finance.crisis.andCondition')}</p>
          </div>
        )}
        <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>{t('finance.crisis.history.unavailable')}</p>

        {/* 补救行动：availableRemedies 内核未接线（OPEN-FIN-CRISIS-WIRING），展示静态入口 + 破产禁用 */}
        {inCrisis && !isBankrupt && onNavigate && (
          <div className="flex-gap" style={{ flexWrap: 'wrap', marginTop: 8 }} data-testid="finance-remediation-actions">
            <button className="btn btn-secondary btn-small" onClick={() => onNavigate('projects')}>{t('finance.remediation.descope')}</button>
            <button className="btn btn-secondary btn-small" onClick={() => onNavigate('employees')}>{t('finance.remediation.cutStaff')}</button>
            <button className="btn btn-secondary btn-small" onClick={() => onNavigate('projects')}>{t('finance.remediation.pauseProject')}</button>
            <p className="muted" style={{ fontSize: 11 }}>{t('finance.remediation.hint')}</p>
          </div>
        )}
      </div>

      {/* GAME OVER（ADJ-12 S11-3）：破产 → 重开新档（清档回 P-01） */}
      {isBankrupt && (
        <div className="panel" style={{ borderColor: '#b3423a' }} data-testid="finance-gameover">
          <h2 style={{ color: '#b3423a', margin: 0 }}>{t('finance.gameover.title')}</h2>
          <p className="muted" style={{ fontSize: 12 }}>{t('finance.gameover.hint')}</p>
          <button className="btn btn-danger" onClick={() => { void restartNewGame() }} data-testid="finance-gameover-restart">
            {t('finance.gameover.restart')}
          </button>
        </div>
      )}

      {/* 月度结算区（FIN §3.9 12 类三分映射，settlementDay 语义） */}
      <div className="panel" data-testid="finance-monthly">
        <h2 style={{ marginTop: 0 }}>{t('finance.section.monthly')} · {monthly.month}</h2>
        <table className="data-table">
          <tbody>
            <tr><td>{t('finance.monthly.income')}</td><td className="positive">+{formatMoney(monthly.income)}</td></tr>
            <tr><td>{t('finance.monthly.expense')}</td><td className="negative">-{formatMoney(monthly.expense)}</td></tr>
            <tr><td>{t('finance.monthly.salary')}</td><td>-{formatMoney(monthly.salary)}</td></tr>
            <tr><td>{t('finance.monthly.projectCost')}</td><td>-{formatMoney(monthly.projectCost)}</td></tr>
            <tr><td>{t('finance.monthly.productRevenue')}</td><td className="positive">+{formatMoney(monthly.productRevenue)}</td></tr>
            <tr><td>{t('finance.monthly.refund')}</td><td>-{formatMoney(monthly.refund)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* 现金流变化（CashForecast.netCashByMonth 逐月净额） */}
      <div className="panel" data-testid="finance-cashflow">
        <h2 style={{ marginTop: 0 }}>{t('finance.section.cashflow')}</h2>
        {netCashByMonth.length === 0 ? (
          <p className="muted">{t('finance.cashflow.empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('finance.cashflow.month')}</th>
                <th className="text-right">{t('finance.cashflow.expected')}</th>
                <th className="text-right">{t('finance.cashflow.low')}</th>
                <th className="text-right">{t('finance.cashflow.high')}</th>
              </tr>
            </thead>
            <tbody>
              {netCashByMonth.map((band) => (
                <tr key={band.month} data-testid={`finance-cashflow-${band.month}`}>
                  <td>{band.month}</td>
                  <td className="text-right">{formatMoney(band.expectedCents)}</td>
                  <td className="text-right">{formatMoney(band.lowCents)}</td>
                  <td className="text-right">{formatMoney(band.highCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
          <p className="muted">{t('finance.transactions.empty')}</p>
        ) : (
          <table className="data-table" data-testid="finance-transactions-table">
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
