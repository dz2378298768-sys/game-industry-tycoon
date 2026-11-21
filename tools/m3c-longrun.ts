/**
 * M3-C 长期报告 harness（DECISION-M3-P0-LONGRUN-005）。
 *
 * 用法：
 *   npx tsx --tsconfig tsconfig.app.json tools/m3c-longrun.ts --seed 42 --years 10
 *   npx tsx --tsconfig tsconfig.app.json tools/m3c-longrun.ts --aggregate
 *
 * 说明：默认 10 年缩短版只用于 CI 冒烟（规格 N-1），不得替代 56 年结论。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createGameWorld } from '@application/factories/create-game-world'
import type { WorldState } from '@simulation/services/world-state'
import type { Company, CompanyPersona } from '@domain/entities/company'

const OUT = 'artifacts/longrun'
const SEEDS = [42, 7, 99, 123, 2026, 31415, 2718, 808]
const PERSONAS: CompanyPersona[] = ['indie', 'genre_specialist', 'integrated_dev_publisher']

interface YearRow {
  year: number
  day: number
  activeAi: number
  activePlayer: boolean
  bankruptcies: number
  recoveries: number
  dissolutions: number
  bankruptcyRate: number
  recoveryRate: number
  hhi: number
  products: number
  avgAiCashCents: number
  personaActive: Record<string, number>
  personaTotal: Record<string, number>
}

interface Summary {
  seed: number
  years: number
  days: number
  commit: string
  startedAt: string
  elapsedMs: number
  peakRssMb: number
  timeline: YearRow[]
  persona: Record<string, { at5: number | null; at10: number | null; at20: number | null }>
  failures: string[]
}

function eventCompanyIds(world: WorldState, type: string, fromDay: number, toDay: number): string[] {
  return world.events
    .filter((e) => e.type === type && e.day >= fromDay && e.day <= toDay)
    .map((e) => String(e.payload['companyId'] ?? ''))
    .filter((id) => id !== '')
}

function annualHhi(world: WorldState, fromDay: number, toDay: number): number {
  const revenue = new Map<string, number>()
  for (const product of world.products) {
    let net = 0
    for (const record of product.salesByPeriod) {
      if (record.dayIndex >= fromDay && record.dayIndex <= toDay) net += record.netSalesRevenueCents
    }
    if (net > 0) revenue.set(product.companyId, (revenue.get(product.companyId) ?? 0) + net)
  }
  const total = [...revenue.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let hhi = 0
  for (const value of revenue.values()) {
    const share = value / total
    hhi += share * share
  }
  return Math.round(hhi * 10000) / 10000
}

function personaAt(timeline: YearRow[], persona: CompanyPersona, atYear: number): number | null {
  const row = timeline.find((r) => r.year === 1970 + atYear - 1)
  if (row === undefined) return null
  const total = row.personaTotal[persona] ?? 0
  if (total === 0) return null
  return (row.personaActive[persona] ?? 0) / total
}

function runSeed(seed: number, years: number): Summary {
  const t0 = Date.now()
  const gw = createGameWorld(seed, { aiCompetition: true })
  const timeline: YearRow[] = []
  const startStatus = new Map<string, Company['status']>()
  let peakRss = 0
  for (let year = 1970; year < 1970 + years; year += 1) {
    const fromDay = gw.world.currentDayIndex
    gw.advanceSimulation(365)
    const world = gw.world
    const toDay = world.currentDayIndex - 1
    for (const c of world.companies) if (!startStatus.has(c.id)) startStatus.set(c.id, c.status)
    const startActive = [...startStatus.entries()].filter(([, s]) => s === 'active').map(([id]) => id)
    const ai = world.companies.filter((c) => !c.isPlayer)
    const activeAi = ai.filter((c) => c.status === 'active').length
    const bankIds = eventCompanyIds(world, 'CompanyBankrupted', fromDay, toDay)
    const recIds = eventCompanyIds(world, 'CompanyRecovered', fromDay, toDay)
    const disIds = eventCompanyIds(world, 'CompanyDissolved', fromDay, toDay)
    timeline.push({
      year,
      day: world.currentDayIndex,
      activeAi,
      activePlayer: world.companies.some((c) => c.isPlayer && c.status === 'active'),
      bankruptcies: bankIds.length,
      recoveries: recIds.length,
      dissolutions: disIds.length,
      bankruptcyRate: startActive.length === 0 ? 0 : Math.round((bankIds.length / startActive.length) * 10000) / 10000,
      recoveryRate: bankIds.length === 0 ? 0 : Math.round((recIds.length / bankIds.length) * 10000) / 10000,
      hhi: annualHhi(world, fromDay, toDay),
      products: world.products.filter((p) => p.status === 'active').length,
      avgAiCashCents: ai.length === 0 ? 0 : Math.round(ai.reduce((a, c) => a + c.cashBalanceCents, 0) / ai.length),
      personaActive: Object.fromEntries(PERSONAS.map((p) => [p, ai.filter((c) => c.persona === p && c.status === 'active').length])),
      personaTotal: Object.fromEntries(PERSONAS.map((p) => [p, ai.filter((c) => c.persona === p).length])),
    })
    for (const c of world.companies) startStatus.set(c.id, c.status)
    peakRss = Math.max(peakRss, Math.round(process.memoryUsage().rss / 1e6))
  }

  const persona: Summary['persona'] = {}
  for (const p of PERSONAS) {
    persona[p] = {
      at5: personaAt(timeline, p, 5),
      at10: personaAt(timeline, p, 10),
      at20: personaAt(timeline, p, 20),
    }
  }

  const failures: string[] = []
  if (timeline.some((r) => r.bankruptcyRate > 0.25)) failures.push('破产悬崖：任一年破产率 > 25%')
  let zeroRun = 0
  for (const row of timeline) {
    zeroRun = row.recoveryRate === 0 ? zeroRun + 1 : 0
    if (zeroRun >= 5) failures.push(`无恢复：${row.year - 4}-${row.year} 连续 5 年恢复率为 0`)
  }
  const y20 = timeline.find((r) => r.year === 1989)
  if (y20 !== undefined && y20.activeAi < 3) failures.push('AI 全灭：第 20 年 active AI < 3')
  if (y20 !== undefined && y20.hhi > 0.5) {
    const last5 = timeline.filter((r) => r.year >= 1985 && r.year <= 1989)
    const rising = last5.every((r, i) => i === 0 || r.hhi > last5[i - 1]!.hhi)
    if (rising) failures.push('单一垄断：第 20 年 HHI > 0.5 且连续 5 年上升')
  }
  if (years < 20) failures.push('未评估：AI 全灭/单一垄断需要第 20 年数据（当前为缩短版）')
  failures.push('未评估：玩家被碾压需要同策略克隆对照（本机未跑）')

  const summary: Summary = {
    seed,
    years,
    days: gw.world.currentDayIndex,
    commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
    startedAt: new Date(t0).toISOString(),
    elapsedMs: Date.now() - t0,
    peakRssMb: peakRss,
    timeline,
    persona,
    failures,
  }
  mkdirSync(`${OUT}/${seed}`, { recursive: true })
  writeFileSync(`${OUT}/${seed}/summary.json`, JSON.stringify(summary, null, 2))
  const header = 'year,day,activeAi,activePlayer,bankruptcies,recoveries,dissolutions,bankruptcyRate,recoveryRate,hhi,products,avgAiCashCents'
  const rows = timeline.map((r) =>
    [r.year, r.day, r.activeAi, r.activePlayer, r.bankruptcies, r.recoveries, r.dissolutions, r.bankruptcyRate, r.recoveryRate, r.hhi, r.products, r.avgAiCashCents].join(','),
  )
  writeFileSync(`${OUT}/${seed}/timeline.csv`, `${header}\n${rows.join('\n')}\n`)
  console.log(`seed ${seed} done: ${summary.elapsedMs}ms rss=${peakRss}MB failures=${failures.length}`)
  return summary
}

function aggregate(): void {
  const summaries: Summary[] = []
  for (const seed of SEEDS) {
    const path = `${OUT}/${seed}/summary.json`
    try {
      summaries.push(JSON.parse(readFileSync(path, 'utf8')) as Summary)
    } catch {
      console.log(`missing ${path}`)
    }
  }
  if (summaries.length === 0) throw new Error('no summaries')
  const lines = [
    '# M3-C 长期报告（缩短版）',
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- commit：\`${summaries[0]!.commit}\``,
    `- 种子：${summaries.map((s) => s.seed).join(', ')}`,
    `- 区间：1970-01-01 起，每种子 ${summaries[0]!.years} 年（${summaries[0]!.days} 天）`,
    '- **注意：这是规格 N-1 的 CI 缩短版，不得替代 56 年结论。**',
    '',
    '## 运行参数与资源',
    '',
    '| seed | 年数 | 天数 | 耗时(s) | 峰值 RSS(MB) |',
    '|---|---|---|---|---|',
    ...summaries.map((s) => `| ${s.seed} | ${s.years} | ${s.days} | ${(s.elapsedMs / 1000).toFixed(1)} | ${s.peakRssMb} |`),
    '',
    '## 年度末指标（每年）',
    '',
    '| seed | 年 | active AI | 破产 | 恢复 | 解散 | 破产率 | 恢复率 | HHI | 产品 | AI 均现金(元) |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...summaries.flatMap((s) =>
      s.timeline.map((r) => `| ${s.seed} | ${r.year} | ${r.activeAi} | ${r.bankruptcies} | ${r.recoveries} | ${r.dissolutions} | ${(r.bankruptcyRate * 100).toFixed(1)}% | ${(r.recoveryRate * 100).toFixed(1)}% | ${r.hhi} | ${r.products} | ${(r.avgAiCashCents / 100).toFixed(0)} |`),
    ),
    '',
    '## Persona 存活率',
    '',
    '| seed | persona | 5 年 | 10 年 | 20 年 |',
    '|---|---|---|---|---|',
    ...summaries.flatMap((s) =>
      Object.entries(s.persona).map(([p, v]) => `| ${s.seed} | ${p} | ${fmt(v.at5)} | ${fmt(v.at10)} | ${fmt(v.at20)} |`),
    ),
    '',
    '## 阈值判定',
    '',
    ...summaries.flatMap((s) => [`### seed ${s.seed}`, '', ...(s.failures.length === 0 ? ['- 无失败项'] : s.failures.map((f) => `- ${f}`)), '']),
    '## 结论',
    '',
    summaries.some((s) => s.failures.some((f) => !f.startsWith('未评估')))
      ? '**FAIL**：存在可判定的失败阈值，见上。'
      : '**PASS（仅限缩短版）**：可判定阈值未触发；56 年与第 20 年阈值仍未评估。',
    '',
  ]
  writeFileSync(`${OUT}/MATRIX.md`, lines.join('\n'))
  console.log(`aggregate -> ${OUT}/MATRIX.md (${summaries.length} seeds)`)
}

function fmt(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

const args = process.argv.slice(2)
if (args.includes('--aggregate')) {
  aggregate()
} else {
  const seed = Number(args[args.indexOf('--seed') + 1] ?? 42)
  const years = Number(args[args.indexOf('--years') + 1] ?? 10)
  runSeed(seed, years)
}
