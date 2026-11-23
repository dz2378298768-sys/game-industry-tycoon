import React from 'react'
import { useGameStore, t, formatMoney } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { SEED_SEGMENT_TAGS } from '@content/d04-vocabulary'
import { AI_COMPANIES } from '@content/ai-companies'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import type { MarketResearchResult } from '@application/mediators/game-world'
import affinityRows from '@content/genre-segment-affinity.json'

interface Props { onNavigate: (route: string, param?: string) => void }

type Band = 'high' | 'medium' | 'low'

/** 类别→契合方向档（内容亲和度定性换算，数值机会模型 OPEN-P2，不展示数值）。 */
const AFFINITY_BY_GENRE: Map<string, { max: number; topSegmentId: string }> = (() => {
  const map = new Map<string, { max: number; topSegmentId: string }>()
  for (const row of affinityRows) {
    const prev = map.get(row.genreId)
    if (prev === undefined || row.affinity > prev.max) {
      map.set(row.genreId, { max: row.affinity, topSegmentId: row.segmentId })
    }
  }
  return map
})()

function bandOf(max: number): Band {
  // 07B-10：阈值读 P1_UI_TUNING 单一来源（契合方向为定性分档展示，非数值机会模型）。
  return max > P1_UI_TUNING.market.affinityBandHigh
    ? 'high'
    : max >= P1_UI_TUNING.market.affinityBandMedium ? 'medium' : 'low'
}

/**
 * P-02 市场分析（S02，批次 07B）：
 *  ① 类别与需求趋势（趋势档无内核数据源 → fail-closed "信息不足"，OPEN-MARKET-TREND）；
 *     契合方向档取内容亲和度定性换算（A-4，不展示数值；数值机会模型 OPEN-P2）。
 *  ② 消费者群体标签云（D-04 SegmentTag，broad/niche 灰度）+ 静态竞品档案（ADJ-12 S2-2）。
 *  ③ 调研动作（P1_UI_TUNING $5,000 = 500_000 cents；账本 research 交易 R-4）+
 *     一次性结果卡（竞品档案条数 + 方向标签，ADJ-16 R-6 / A-43）。
 *  破产 → 调研按钮 aria-disabled + finance.bankrupt.blocked.*（G-9）。
 */
export const Market: React.FC<Props> = ({ onNavigate }) => {
  const { company, conductMarketResearch } = useGameStore()
  const [result, setResult] = React.useState<MarketResearchResult | null>(null)
  const isBankrupt = company?.status === 'bankrupt'
  const researchCost = P1_UI_TUNING.market.researchCostCents

  const handleResearch = () => {
    const r = conductMarketResearch()
    if (r.success && r.result) setResult(r.result)
  }

  const comparisonGenres = React.useMemo(() => {
    const ids = result?.directionTags.map((d) => d.genreId) ?? []
    const picked = ids.length > 0
      ? ids.map((id) => content.genres.find((g) => g.id === id)).filter((g): g is NonNullable<typeof g> => Boolean(g))
      : content.genres.slice(0, 3)
    return picked
  }, [result])

  return (
    <div>
      <h2>{t('market.title')}</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{t('market.intro')}</p>

      {/* ① 类别与需求趋势档 */}
      <div className="panel" data-testid="market-trend-section">
        <h3 style={{ marginTop: 0 }}>{t('market.section.trend')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('market.col.category')}</th>
              <th>{t('market.col.trend')}</th>
              <th>{t('market.col.affinityBand')}</th>
              <th>{t('market.col.topSegment')}</th>
              <th style={{ width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {content.genres.map((g) => {
              const aff = AFFINITY_BY_GENRE.get(g.id)
              const segmentLabel = aff
                ? (content.consumerSegments.find((s) => s.id === aff.topSegmentId)?.displayNameZh ?? aff.topSegmentId)
                : t('market.missing')
              return (
                <tr key={g.id} data-testid="market-genre-row">
                  <td>{g.displayNameZh}</td>
                  {/* 趋势档内核无数据源：fail-closed 信息不足，不伪造档位（G-3 / OPEN-MARKET-TREND） */}
                  <td data-testid="market-trend"><span className="badge paused">{t('market.missing')}</span></td>
                  <td>
                    {aff
                      ? <span className={`badge ${bandOf(aff.max) === 'high' ? 'active' : bandOf(aff.max) === 'medium' ? '' : 'danger'}`}>
                          {t(`market.band.${bandOf(aff.max)}`)}
                        </span>
                      : <span className="badge paused">{t('market.missing')}</span>}
                  </td>
                  <td>{aff ? segmentLabel : t('market.missing')}</td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => onNavigate('newProject', g.id)}>
                      {t('market.startProject')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11 }}>
          {t('market.trend.open')} · {t('market.band.hint')}
        </p>
      </div>

      {/* 方向并排比较视图（总纲 §S2.2）：无调研数据 → 列降级"信息不足" */}
      <div className="panel" data-testid="market-comparison">
        <h3 style={{ marginTop: 0 }}>{t('market.comparison.title')}</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('market.col.category')}</th>
              <th>{t('market.col.trend')}</th>
              <th>{t('market.col.affinityBand')}</th>
              <th>{t('market.col.positioning')}</th>
            </tr>
          </thead>
          <tbody>
            {comparisonGenres.map((g) => {
              const aff = AFFINITY_BY_GENRE.get(g.id)
              const band = result?.directionTags.find((d) => d.genreId === g.id)?.band ?? (aff ? bandOf(aff.max) : null)
              return (
                <tr key={g.id}>
                  <td>{g.displayNameZh}</td>
                  <td>{result ? <span className="badge paused">{t('market.missing')}</span> : t('market.missing')}</td>
                  <td>{band ? t(`market.band.${band}`) : t('market.missing')}</td>
                  <td>{g.displayName}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ② 消费者群体标签云 + 静态竞品档案 */}
      <div className="panel" data-testid="market-segments">
        <h3 style={{ marginTop: 0 }}>{t('market.section.segments')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SEED_SEGMENT_TAGS.map((tag) => (
            <span
              key={tag.tagId}
              className={`badge ${tag.granularity === 'broad' ? '' : 'paused'}`}
              title={`${tag.tagId} · ${tag.granularity}`}
            >
              {tag.displayName}
            </span>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11 }}>{t('market.segment.hint')}</p>
      </div>

      <div className="panel" data-testid="market-competitors">
        <h3 style={{ marginTop: 0 }}>{t('market.section.competitors')}</h3>
        {AI_COMPANIES.length === 0
          ? <p className="muted">{t('market.competitor.empty')}</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {AI_COMPANIES.map((c) => (
                <div key={c.id} className="kpi-card" data-testid="market-competitor-card">
                  <div className="value" style={{ fontSize: 13 }}>{c.name}</div>
                  <div className="label">{t('market.competitor.positioning')}: {t(`market.persona.${c.persona}`)}</div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* ③ 调研动作 + 一次性结果卡 */}
      <div className="panel" data-testid="market-research">
        <h3 style={{ marginTop: 0 }}>{t('market.section.research')}</h3>
        <p style={{ fontSize: 13 }}>
          {t('market.research.fee')
            .replace('{fee}', formatMoney(researchCost))
            .replace('{cents}', String(researchCost))}
        </p>
        <button
          className="btn"
          onClick={handleResearch}
          disabled={isBankrupt}
          aria-disabled={isBankrupt}
          title={isBankrupt ? t('finance.bankrupt.blocked.research') : undefined}
          data-testid="market-research-button"
        >
          {t('market.research.button')}
        </button>
        {isBankrupt && <p className="negative" style={{ fontSize: 12 }}>⛔ {t('finance.bankrupt.blocked.research')}</p>}

        {result && (
          <div className="panel" style={{ marginTop: 12, borderColor: 'var(--gold)' }} data-testid="market-research-result">
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('market.research.result.title')}</h4>
            <p style={{ fontSize: 13 }}>{t('market.research.result.competitors').replace('{n}', String(result.competitorCount))}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.directionTags.map((d) => (
                <span key={d.genreId} className={`badge ${d.band === 'high' ? 'active' : d.band === 'medium' ? '' : 'danger'}`}>
                  {d.displayName} · {t(`market.band.${d.band}`)}
                </span>
              ))}
            </div>
            <button className="btn btn-secondary btn-small" style={{ marginTop: 10 }} onClick={() => setResult(null)}>
              {t('common.close')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
