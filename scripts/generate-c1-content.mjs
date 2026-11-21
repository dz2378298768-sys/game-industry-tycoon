/**
 * 生成 M3-C1 Stage 0–2 内容表。
 * 数值是建模基线，不是历史精确统计；source 字段标注为 model_estimate。
 * 运行：node scripts/generate-c1-content.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const markets = [
  { id: 'north_america', weight: 0.34 },
  { id: 'western_europe', weight: 0.27 },
  { id: 'japan', weight: 0.17 },
  { id: 'east_asia', weight: 0.09 },
  { id: 'south_america', weight: 0.06 },
  { id: 'rest_of_world', weight: 0.07 },
]

const segments = [
  { id: 'arcade_enthusiasts', start: 1970 },
  { id: 'home_players', start: 1977 },
  { id: 'pc_gamers', start: 1980 },
  { id: 'casual_players', start: 1995 },
  { id: 'online_gamers', start: 2001 },
  { id: 'mobile_gamers', start: 2008 },
]

const platforms = [
  { id: 'arcade_pre_1975', type: 'arcade', launch: 1970, peak: 1972, end: 1974, peakUnits: 120_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'arcade_classic', type: 'arcade', launch: 1975, peak: 1981, end: 1990, peakUnits: 1_200_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'pinball', type: 'pinball', launch: 1972, peak: 1976, end: 1980, peakUnits: 250_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'home_console_g1', type: 'home_console', launch: 1972, peak: 1975, end: 1978, peakUnits: 1_500_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'home_console_g2', type: 'home_console', launch: 1976, peak: 1981, end: 1983, peakUnits: 30_000_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'home_console_g3', type: 'home_console', launch: 1983, peak: 1988, end: 1994, peakUnits: 62_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia'] },
  { id: 'home_console_g4', type: 'home_console', launch: 1994, peak: 1999, end: 2006, peakUnits: 105_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america'] },
  { id: 'home_console_g5', type: 'home_console', launch: 2006, peak: 2010, end: 2013, peakUnits: 180_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america', 'rest_of_world'] },
  { id: 'pc_pre_ibm', type: 'pc', launch: 1975, peak: 1979, end: 1981, peakUnits: 4_000_000, markets: ['north_america', 'western_europe', 'japan'] },
  { id: 'pc_ibm_compatible', type: 'pc', launch: 1981, peak: 1989, end: 1995, peakUnits: 120_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia'] },
  { id: 'pc_windows', type: 'pc', launch: 1990, peak: 2002, end: 2005, peakUnits: 600_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america', 'rest_of_world'] },
  { id: 'pc_online', type: 'online', launch: 2001, peak: 2008, end: 2012, peakUnits: 350_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america', 'rest_of_world'] },
  { id: 'mobile_g1', type: 'mobile', launch: 2008, peak: 2014, end: 2018, peakUnits: 1_600_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america', 'rest_of_world'] },
  { id: 'digital_download', type: 'pc', launch: 2003, peak: 2015, end: 2026, peakUnits: 1_100_000_000, markets: ['north_america', 'western_europe', 'japan', 'east_asia', 'south_america', 'rest_of_world'] },
]

const genres = ['action', 'adventure', 'arcade', 'fighting', 'puzzle', 'racing', 'rpg', 'shooter', 'simulation', 'sports', 'strategy', 'platformer']

const segmentBase = {
  arcade_enthusiasts: 0.16,
  home_players: 0.30,
  pc_gamers: 0.26,
  casual_players: 0.38,
  online_gamers: 0.28,
  mobile_gamers: 0.40,
}

function activeSegments(year) {
  return segments.filter((s) => s.start <= year)
}

function platformSegmentWeights(platformType, year) {
  const active = activeSegments(year)
  const weights = {}
  for (const s of active) {
    let w = segmentBase[s.id]
    if (platformType === 'arcade' || platformType === 'pinball') {
      if (s.id === 'arcade_enthusiasts') w = 0.8
      else if (s.id === 'home_players') w = 0.1
      else if (s.id === 'pc_gamers') w = 0.1
      else w = 0.02
    } else if (platformType === 'home_console') {
      if (s.id === 'home_players') w = year < 1995 ? 0.75 : 0.45
      else if (s.id === 'casual_players') w = year < 1995 ? 0.02 : 0.3
      else if (s.id === 'online_gamers') w = 0.15
      else if (s.id === 'mobile_gamers') w = 0.05
      else w = 0.08
    } else if (platformType === 'pc') {
      if (s.id === 'pc_gamers') w = 0.6
      else if (s.id === 'casual_players') w = year < 1995 ? 0.02 : 0.25
      else if (s.id === 'online_gamers') w = 0.15
      else if (s.id === 'mobile_gamers') w = 0.05
      else w = 0.08
    } else if (platformType === 'online') {
      if (s.id === 'online_gamers') w = 0.55
      else if (s.id === 'pc_gamers') w = 0.2
      else if (s.id === 'casual_players') w = 0.2
      else w = 0.05
    } else if (platformType === 'mobile') {
      if (s.id === 'mobile_gamers') w = 0.7
      else if (s.id === 'casual_players') w = 0.2
      else if (s.id === 'online_gamers') w = 0.05
      else w = 0.03
    }
    weights[s.id] = w
  }
  return weights
}

function normalize(obj) {
  const total = Object.values(obj).reduce((a, b) => a + b, 0)
  if (total <= 0) return obj
  const keys = Object.keys(obj)
  let sum = 0
  for (const k of keys) {
    obj[k] = Number((obj[k] / total).toFixed(6))
    sum += obj[k]
  }
  const residual = 1 - sum
  const largest = keys.reduce((a, b) => (obj[a] >= obj[b] ? a : b), keys[0])
  obj[largest] = Number((obj[largest] + residual).toFixed(6))
  return obj
}

function installCurve(p, year) {
  if (year < p.launch || year > p.end) return { install: 0, activity: 0.05, relative: 0 }
  const peakAt = p.peak - p.launch
  const rel = year <= p.peak ? 0.15 + 0.85 * ((year - p.launch) / Math.max(1, peakAt)) : 0.85 - 0.45 * ((year - p.peak) / Math.max(1, p.end - p.peak))
  const install = Math.round(p.peakUnits * Math.max(0, rel))
  const activity = year <= p.peak ? 0.45 + 0.4 * ((year - p.launch) / Math.max(1, peakAt)) : 0.85 - 0.35 * ((year - p.peak) / Math.max(1, p.end - p.peak))
  return { install, activity: Number(activity.toFixed(4)), relative: Number(rel.toFixed(4)) }
}

function lifecycle(p) {
  const years = []
  for (let y = p.launch; y <= p.end; y += 1) {
    const c = installCurve(p, y)
    years.push(c)
  }
  return {
    launchYear: p.launch,
    peakYear: p.peak,
    endYear: p.end,
    peakUnits: p.peakUnits,
    installBaseUnits: years.map((y) => y.install),
    activityRate: years.map((y) => y.activity),
    relativeIndex: years.map((y) => y.relative),
    source: 'model_estimate',
  }
}

const platformMarketShare = []
const platformSegmentShare = []
for (const p of platforms) {
  for (let y = p.launch; y <= p.end; y += 1) {
    const covered = markets.filter((m) => p.markets.includes(m.id))
    const weights = {}
    for (const m of covered) {
      let w = m.weight
      if (m.id === 'japan' && p.type === 'home_console' && y >= 1983) w *= 1.35
      if (m.id === 'north_america' && p.type === 'home_console' && y >= 1994) w *= 1.1
      weights[m.id] = w
    }
    normalize(weights)
    for (const [marketId, share] of Object.entries(weights)) {
      platformMarketShare.push({ platformId: p.id, marketId, year: y, share })
    }

    for (const m of covered) {
      const raw = platformSegmentWeights(p.type, y)
      normalize(raw)
      for (const [segmentId, share] of Object.entries(raw)) {
        if (share <= 0) continue
        platformSegmentShare.push({ platformId: p.id, marketId: m.id, segmentId, year: y, share })
      }
    }
  }
}

const priceBase = {
  arcade: 25,
  pinball: 25,
  home_console: 3999,
  pc: 2999,
  online: 1999,
  mobile: 499,
}
const segmentPriceMul = {
  arcade_enthusiasts: 1.1,
  home_players: 1.0,
  pc_gamers: 1.15,
  casual_players: 0.7,
  online_gamers: 0.9,
  mobile_gamers: 0.55,
}
const genrePriceMul = {
  action: 1.0,
  adventure: 1.05,
  arcade: 0.8,
  fighting: 1.0,
  puzzle: 0.7,
  racing: 1.0,
  rpg: 1.2,
  shooter: 1.05,
  simulation: 1.15,
  sports: 1.0,
  strategy: 1.1,
  platformer: 0.95,
}
const priceReference = []
for (const genreId of genres) {
  for (const type of Object.keys(priceBase)) {
    for (const s of segments) {
      priceReference.push({
        genreId,
        platformType: type,
        segmentId: s.id,
        referencePriceCents: Math.round(priceBase[type] * segmentPriceMul[s.id] * genrePriceMul[genreId]),
        source: 'model_estimate',
      })
    }
  }
}

const affinityBase = {
  action: { arcade_enthusiasts: 0.7, home_players: 0.8, pc_gamers: 0.75, casual_players: 0.6, online_gamers: 0.75, mobile_gamers: 0.65 },
  adventure: { arcade_enthusiasts: 0.4, home_players: 0.7, pc_gamers: 0.75, casual_players: 0.65, online_gamers: 0.6, mobile_gamers: 0.55 },
  arcade: { arcade_enthusiasts: 0.9, home_players: 0.45, pc_gamers: 0.35, casual_players: 0.55, online_gamers: 0.35, mobile_gamers: 0.5 },
  fighting: { arcade_enthusiasts: 0.75, home_players: 0.7, pc_gamers: 0.6, casual_players: 0.55, online_gamers: 0.65, mobile_gamers: 0.45 },
  puzzle: { arcade_enthusiasts: 0.6, home_players: 0.55, pc_gamers: 0.5, casual_players: 0.8, online_gamers: 0.5, mobile_gamers: 0.85 },
  racing: { arcade_enthusiasts: 0.65, home_players: 0.75, pc_gamers: 0.65, casual_players: 0.5, online_gamers: 0.6, mobile_gamers: 0.5 },
  rpg: { arcade_enthusiasts: 0.3, home_players: 0.75, pc_gamers: 0.85, casual_players: 0.45, online_gamers: 0.7, mobile_gamers: 0.55 },
  shooter: { arcade_enthusiasts: 0.85, home_players: 0.75, pc_gamers: 0.8, casual_players: 0.5, online_gamers: 0.8, mobile_gamers: 0.55 },
  simulation: { arcade_enthusiasts: 0.35, home_players: 0.55, pc_gamers: 0.7, casual_players: 0.55, online_gamers: 0.6, mobile_gamers: 0.5 },
  sports: { arcade_enthusiasts: 0.5, home_players: 0.75, pc_gamers: 0.6, casual_players: 0.65, online_gamers: 0.6, mobile_gamers: 0.55 },
  strategy: { arcade_enthusiasts: 0.4, home_players: 0.55, pc_gamers: 0.8, casual_players: 0.5, online_gamers: 0.65, mobile_gamers: 0.5 },
  platformer: { arcade_enthusiasts: 0.7, home_players: 0.8, pc_gamers: 0.6, casual_players: 0.7, online_gamers: 0.5, mobile_gamers: 0.65 },
}
const genreSegmentAffinity = []
for (const genreId of genres) {
  for (const s of segments) {
    genreSegmentAffinity.push({ genreId, segmentId: s.id, affinity: affinityBase[genreId][s.id] })
  }
}

const platformLifecycles = {}
for (const p of platforms) platformLifecycles[p.id] = lifecycle(p)

writeFileSync('src/content/platform-market-share.json', JSON.stringify(platformMarketShare, null, 0) + '\n')
writeFileSync('src/content/platform-segment-share.json', JSON.stringify(platformSegmentShare, null, 0) + '\n')
writeFileSync('src/content/price-reference.json', JSON.stringify(priceReference, null, 0) + '\n')
writeFileSync('src/content/genre-segment-affinity.json', JSON.stringify(genreSegmentAffinity, null, 0) + '\n')
const platformFile = JSON.parse(readFileSync('src/content/platforms.json', 'utf8'))
for (const p of platformFile) p.lifecycle = platformLifecycles[p.id]
writeFileSync('src/content/platforms.json', JSON.stringify(platformFile, null, 2) + '\n')

globalThis.console.log('market rows', platformMarketShare.length)
globalThis.console.log('segment rows', platformSegmentShare.length)
globalThis.console.log('price rows', priceReference.length)
globalThis.console.log('affinity rows', genreSegmentAffinity.length)
