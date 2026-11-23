import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import { dayIndexToGregorian, gregorianToDayIndex } from '@domain/value-objects/day-index'

/**
 * P-12 经营复盘与第二款（S12，批次 07B）+ §3 S12-4 媒体评价聚合卡。
 *
 * fail-closed 纪律（ADJ-17 §4 / M-02 缺口）：
 *  - ProductArchive / 口碑档三档 / 评价记录切片 / 归因锚点内核零实现 → 对应区块显示"数据不足 /
 *    暂无评价，上市后积累"，登记 OPEN，不伪造档位、不写死示例评价、不前端推算（R-2 / A-35 / A-36）；
 *  - G1 不建 BrandMemory：不渲染任何品牌值 / Brand 点数，不做跨产品品牌聚合；
 *  - 四域归因空集占位（OPEN-S12-1），无可点锚点条目；
 *  - 预算/工期/现金曲线来自账本与项目已有字段（真实数据，不造数）；
 *  - 第二款入口无禁用态（强制走完整 S2–S11，ADJ-12 S12-3）。
 */

interface Props {
  onNavigate: (route: string, param?: string) => void
}

const DISPLAY_EPOCH = gregorianToDayIndex(2026, 1, 5)
function monthKeyOf(day: number): string {
  const g = dayIndexToGregorian(day + DISPLAY_EPOCH)
  return `${g.year}-${String(g.month).padStart(2, '0')}`
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
  const { products, projects, transactions, financial, dayIndex } = store

  // 账本派生：月度净额（现金曲线，简单分段列表，不引入图表库）
  const cashCurve = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of transactions) {
      const key = monthKeyOf(tx.day)
      map.set(key, (map.get(key) ?? 0) + tx.amountCents)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [transactions])

  const latestProject = React.useMemo(() => [...projects].sort((a, b) => b.createdAt - a.createdAt)[0], [projects])

  // 周聚合汇总（真实数据）
  const totalUnits = products.reduce((sum, p) => sum + p.salesByPeriod.reduce((s, r) => s + r.grossUnits, 0), 0)
  const totalRevenue = products.reduce((sum, p) => sum + p.salesByPeriod.reduce((s, r) => s + r.netSalesRevenueCents, 0), 0)
  const totalRefunds = transactions
    .filter((tx) => tx.category === 'customer_refund' && tx.amountCents < 0)
    .reduce((s, tx) => s + Math.abs(tx.amountCents), 0)

  const windowN = P1_UI_TUNING.review.mediaWindowN
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
                {t('p12.schedule.rework')}: —
              </td>
            </tr>
            <tr>
              <td>{t('p12.salesTotal')}</td>
              <td>{t('sales.units')}: {totalUnits} · {t('finance.net')}: {formatMoney(totalRevenue)} · {t('finance.monthly.refund')}: {formatMoney(totalRefunds)}</td>
            </tr>
          </tbody>
        </table>
        {/* U1：三质量分列终值，D-02 ProductArchive 未接线 → '—'，无综合分 */}
        <div style={{ marginTop: 12 }} data-testid="p12-quality">
          <p style={{ fontSize: 13, fontWeight: 600 }}>{t('p12.quality.title')}</p>
          <table className="data-table">
            <thead><tr>
              <th>{t('p12.quality.design')}</th>
              <th>{t('p12.quality.implementation')}</th>
              <th>{t('p12.quality.completeness')}</th>
            </tr></thead>
            <tbody><tr>
              <td data-testid="p12-quality-design">—</td>
              <td data-testid="p12-quality-implementation">—</td>
              <td data-testid="p12-quality-completeness">—</td>
            </tr></tbody>
          </table>
          <p className="muted" style={{ fontSize: 11 }}>{t('p12.quality.hint')}</p>
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

      {/* 四域归因空集占位（OPEN-S12-1，A-35 / A-36 CONDITIONAL） */}
      <div className="panel" data-testid="p12-attribution">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.attribution')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          {ATTRIBUTION_DOMAINS.map((domain) => (
            <div key={domain.key} className="panel" data-testid={`p12-domain-${domain.key}`}>
              <strong style={{ fontSize: 13 }}>{t(domain.labelKey)}</strong>
              <p className="muted" style={{ fontSize: 12 }}>{t('p12.dataInsufficient')}</p>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11 }}>{t('p12.attribution.hint')}</p>
      </div>

      {/* S12-4 媒体评价聚合卡（独立卡区，G1 仅复盘页） */}
      <div className="panel" data-testid="p12-media-card">
        <h2 style={{ marginTop: 0 }}>{t('p12.media.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="badge badge-muted" data-testid="p12-media-band">{t('p10.reputation.none')}</span>
          <span data-testid="p12-media-count">
            {t('p12.media.count').replace('{n}', '0').replace('{N}', String(windowN))}
          </span>
        </div>
        <ul data-testid="p12-media-list" style={{ fontSize: 12, marginTop: 8 }}>
          <li className="muted">{t('p12.media.empty')}</li>
        </ul>
        <p className="muted" style={{ fontSize: 11 }}>{t('p12.media.hint')}</p>
        {/* G1 不建 BrandMemory：不渲染品牌值 / Brand 点数，不做跨产品品牌聚合 */}
      </div>

      {/* 继承项五项（ProductArchive 未接线 → 数据不足，纯展示不做选项解锁） */}
      <div className="panel" data-testid="p12-inheritance">
        <h2 style={{ marginTop: 0 }}>{t('p12.section.inheritance')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
          {INHERITANCE_ITEMS.map((item) => (
            <div key={item.key} className="panel" data-testid={`p12-inherit-${item.key}`}>
              <strong style={{ fontSize: 13 }}>{t(item.labelKey)}</strong>
              <p className="muted" style={{ fontSize: 12 }}>{t('p12.dataInsufficient')}</p>
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
