import React from 'react'
import { useGameStore, t, formatMoney, formatDay } from '@ui/state/game-store'
import { content } from '@infrastructure/loading/content-loader'
import { SEED_SEGMENT_TAGS } from '@content/d04-vocabulary'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import type { MarketResearchResult } from '@application/mediators/game-world'
import { currentMarketCompetitors, readGenreSalesChanges } from '@application/queries/market-feedback'
import { latestCompanyRelease } from '@application/queries/product-feedback'
import { netRevenueCents } from '@ui/components/product-metrics'
import { getCity, isSegmentAvailable } from '@content/queries'
import { buildDemandScopesForDay } from '@content/c1-content'
import { computeAudienceUnits } from '@simulation/services/demand-pool'
import { earlyArcadeDemand } from '@content/opening-regions'
import { PUBLISHERS } from '@content/publishers'
import affinityRows from '@content/genre-segment-affinity.json'

interface Props { onNavigate: (route: string, param?: string) => void }

type Band = 'high' | 'medium' | 'low'

/** 类别→契合方向档（内容亲和度定性换算，数值机会模型 OPEN-P2，不展示数值）。 */
function affinityByGenre(dayIndex: number, regionalWeights?: Readonly<Record<string, number>>) {
  const map = new Map<string, { max: number; topSegmentId: string }>()
  for (const row of affinityRows) {
    if (!isSegmentAvailable(row.segmentId, dayIndex)) continue
    const affinity = Math.min(1, row.affinity * (regionalWeights?.[row.genreId] ?? 1))
    const prev = map.get(row.genreId)
    if (prev === undefined || affinity > prev.max) {
      map.set(row.genreId, { max: affinity, topSegmentId: row.segmentId })
    }
  }
  return map
}

function bandOf(max: number): Band {
  // 07B-10：阈值读 P1_UI_TUNING 单一来源（契合方向为定性分档展示，非数值机会模型）。
  return max > P1_UI_TUNING.market.affinityBandHigh
    ? 'high'
    : max >= P1_UI_TUNING.market.affinityBandMedium ? 'medium' : 'low'
}

/**
 * P-02 市场分析（S02，批次 07B）：
 * Observation windows read settled sales. Affinity bands are catalog estimates.
 */
export const Market: React.FC<Props> = ({ onNavigate }) => {
  const { game, company, dayIndex, locale, products, refundBatches, conductMarketResearch } = useGameStore()
  const [result, setResult] = React.useState<MarketResearchResult | null>(null)
  const [compareGenreId, setCompareGenreId] = React.useState<string | null>(null)
  const [selectedMarket, setSelectedMarket] = React.useState<string>()
  const isBankrupt = company?.status === 'bankrupt'
  const researchCost = P1_UI_TUNING.market.researchCostCents
  const marketScopes = React.useMemo(() => buildDemandScopesForDay({ dayIndex }), [dayIndex])
  const availableRegions = content.marketRegions.filter((region) => marketScopes.some((scope) => scope.marketId === region.id))
  const homeRegion = company ? getCity(company.cityId)?.regionId : undefined
  const selectedRegion = availableRegions.find((region) => region.id === (selectedMarket ?? homeRegion)) ?? availableRegions[0]
  const marketId = selectedRegion?.id
  const arcadeScopes = marketScopes.filter((scope) => scope.marketId === marketId && scope.platformId === 'arcade_pre_1975')
  const regional = arcadeScopes.length > 0 ? earlyArcadeDemand(marketId, 'arcade_pre_1975') : undefined
  const availableAffinity = React.useMemo(() => affinityByGenre(dayIndex, regional?.genreWeights), [dayIndex, regional])
  const latestRelease = latestCompanyRelease(products, company?.id)
  const competitors = currentMarketCompetitors(game?.world.companies ?? [])
  const worldProducts = game?.world.products
  const marketProducts = React.useMemo(
    () => [...products, ...(worldProducts ?? []).filter((product) => product.companyId !== company?.id)],
    [company?.id, products, worldProducts],
  )
  const salesChanges = React.useMemo(() => readGenreSalesChanges(marketProducts, dayIndex, marketId), [marketProducts, dayIndex, marketId])
  const strongestGenres = content.genres.filter((genre) => bandOf(availableAffinity.get(genre.id)?.max ?? 0) === 'high')
  const genreList = new Intl.ListFormat(locale)
  const units = new Intl.NumberFormat(locale)
  const signedUnits = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' })
  const localPublishers = PUBLISHERS.filter((publisher) => marketId && publisher.markets.includes(marketId))

  const handleResearch = () => {
    const r = conductMarketResearch()
    if (r.success && r.result) setResult(r.result)
  }

  const baseline = content.genres.find((genre) => genre.id === latestRelease?.genreId) ?? content.genres[0]
  const comparisonOptions = content.genres.filter((genre) => genre.id !== baseline?.id)
  const comparison = comparisonOptions.find((genre) => genre.id === compareGenreId)
    ?? comparisonOptions.find((genre) => result?.directionTags.some((tag) => tag.genreId === genre.id))
    ?? comparisonOptions[0]
  const comparisonGenres = [baseline, comparison].filter((genre) => genre !== undefined)

  const renderSalesChange = (genreId: string) => {
    const change = salesChanges.get(genreId)
    if (change === undefined) return <span className="badge paused">{t('market.missing')}</span>
    return t('market.trend.change')
      .replace('{previous}', units.format(change.previous))
      .replace('{current}', units.format(change.current))
      .replace('{delta}', signedUnits.format(change.current - change.previous))
  }

  return (
    <div>
      <h2>{t('market.title')}</h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{t('market.intro')}</p>
      {selectedRegion && <section className="panel">
        <label>{t('market.regional.select')}{' '}
          <select value={marketId} onChange={(event) => setSelectedMarket(event.target.value)}>
            {availableRegions.map((region) => <option key={region.id} value={region.id}>
              {locale === 'zh-CN' ? region.displayNameZh : region.displayName}
            </option>)}
          </select>
        </label>
        {regional && <>
          <p>{t('market.regional.preference').replace('{genre}', t(`genre.${regional.featuredGenre}`))}</p>
          <p>{t('market.regional.arcadeAudience').replace('{n}', units.format(Math.round(arcadeScopes.reduce((sum, scope) => sum + computeAudienceUnits(scope), 0))))}</p>
          <p>{t(`market.regional.price.${regional.priceSensitivity > 1 ? 'high' : regional.priceSensitivity < 1 ? 'low' : 'standard'}`)}</p>
        </>}
        {localPublishers.length > 0 && <p>{t('market.regional.publishers').replace('{names}', genreList.format(localPublishers.map((publisher) => publisher.name)))}</p>}
      </section>}

      <div className="panel" data-testid="market-competitors">
        <h3 style={{ marginTop: 0 }}>{t('market.section.competitors')}</h3>
        {competitors.length === 0
          ? <p className="muted">{t('market.competitor.empty')}</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {[...competitors].sort((a, b) =>
                Number(getCity(b.cityId)?.regionId === marketId) - Number(getCity(a.cityId)?.regionId === marketId),
              ).map((competitor) => {
                const release = latestCompanyRelease(marketProducts, competitor.id)
                const onSale = marketProducts.filter((product) => product.companyId === competitor.id && product.status === 'active').length
                return (
                  <div key={competitor.id} className="kpi-card" data-testid="market-competitor-card">
                    <div className="value" style={{ fontSize: 13 }}>{competitor.name}</div>
                    {getCity(competitor.cityId)?.regionId === marketId && <span className="badge active">{t('market.regional.local')}</span>}
                    {competitor.persona !== undefined && <div className="label">{t(`market.persona.${competitor.persona}`)}</div>}
                    <div className="label">{t('market.competitor.founded').replace('{day}', formatDay(competitor.foundingDay))}</div>
                    <div className="label">{t('market.competitor.onSale').replace('{n}', units.format(onSale))}</div>
                    {release !== undefined && <>
                      <div className="label">{t('market.competitor.latest').replace('{product}', release.name)}</div>
                      <div className="label">{t('market.competitor.genre').replace('{genre}', t(`genre.${release.genreId}`))}</div>
                      {release.audienceSegmentIds
                        .filter((segmentId) => isSegmentAvailable(segmentId, dayIndex))
                        .map((segmentId) => {
                          const segment = content.consumerSegments.find((item) => item.id === segmentId)
                          const segmentName = segment === undefined ? segmentId
                            : locale === 'zh-CN' ? segment.displayNameZh : segment.displayName
                          return <div className="label" key={segmentId}>
                            {t('market.competitor.audience').replace('{audience}', segmentName)}
                          </div>
                        })}
                    </>}
                    {competitor.status === 'bankrupt' && <div className="negative">{t('market.competitor.restructuring')}</div>}
                  </div>
                )
              })}
            </div>
          )}
      </div>

      {latestRelease !== undefined && (
        <div className="panel" data-testid="market-previous-release">
          <h3 style={{ marginTop: 0 }}>{t('market.previousRelease')}</h3>
          <p>{latestRelease.name} · {t(`genre.${latestRelease.genreId}`)}</p>
          {latestRelease.salesByPeriod.length > 0 ? (
            <p>
              {t('sales.units')} {units.format(latestRelease.salesByPeriod.reduce((sum, record) => sum + record.grossUnits, 0))}
              {' · '}{t('products.col.netRevenue')} {formatMoney(netRevenueCents(latestRelease, refundBatches))}
            </p>
          ) : <p className="muted">{t('sales.empty')}</p>}
          <button className="btn btn-link" onClick={() => onNavigate('productDetail', latestRelease.id)}>
            {t('p12.attribution.link')}
          </button>
        </div>
      )}

      <div className="panel" data-testid="market-trend-section">
        <h3 style={{ marginTop: 0 }}>{t('market.section.trend')}</h3>
        {dayIndex < 14 && strongestGenres.length > 0 && (
          <p style={{ marginBottom: 8 }}>
            {t('market.opening.preferences').replace('{genres}', genreList.format(strongestGenres.map((genre) => t(`genre.${genre.id}`))))}
          </p>
        )}
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
              const aff = availableAffinity.get(g.id)
              const segment = content.consumerSegments.find((s) => s.id === aff?.topSegmentId)
              const segmentLabel = segment === undefined ? t('market.missing')
                : locale === 'zh-CN' ? segment.displayNameZh : segment.displayName
              return (
                <tr key={g.id} data-testid="market-genre-row">
                  <td>{t(`genre.${g.id}`)}</td>
                  <td data-testid="market-trend">{renderSalesChange(g.id)}</td>
                  <td>
                    {aff
                      ? <span className={`badge ${bandOf(aff.max) === 'high' ? 'active' : bandOf(aff.max) === 'medium' ? '' : 'danger'}`}>
                          {t(`market.band.${bandOf(aff.max)}`)}
                        </span>
                      : <span className="badge paused">{t('market.missing')}</span>}
                  </td>
                  <td>{segmentLabel}</td>
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
          {t('market.trend.period')} {t('market.band.hint')}
        </p>
      </div>

      <div className="panel" data-testid="market-comparison">
        <h3 style={{ marginTop: 0 }}>{t('market.comparison.title')}</h3>
        <label>
          {t('market.compareGenre')}{' '}
          <select value={comparison?.id ?? ''} onChange={(event) => setCompareGenreId(event.target.value)}>
            {comparisonOptions.map((genre) => <option key={genre.id} value={genre.id}>{t(`genre.${genre.id}`)}</option>)}
          </select>
        </label>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('market.col.category')}</th>
              <th>{t('market.col.trend')}</th>
              <th>{t('market.col.affinityBand')}</th>
              <th style={{ width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {comparisonGenres.map((g) => {
              const aff = availableAffinity.get(g.id)
              const band = aff ? bandOf(aff.max) : null
              return (
                <tr key={g.id}>
                  <td>{t(`genre.${g.id}`)}</td>
                  <td>{renderSalesChange(g.id)}</td>
                  <td>{band ? t(`market.band.${band}`) : t('market.missing')}</td>
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
      </div>

      <div className="panel" data-testid="market-segments">
        <h3 style={{ marginTop: 0 }}>{t('market.section.segments')}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SEED_SEGMENT_TAGS.map((tag) => (
            <span
              key={tag.tagId}
              className={`badge ${tag.granularity === 'broad' ? '' : 'paused'}`}
              title={`${tag.tagId} · ${tag.granularity}`}
            >
              {locale === 'zh-CN' ? tag.displayName : t(`market.segment.${tag.code}`)}
            </span>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11 }}>{t('market.segment.hint')}</p>
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
                  {t(`genre.${d.genreId}`)} · {t(`market.band.${d.band}`)}
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
