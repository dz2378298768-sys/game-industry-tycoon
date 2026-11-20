/**
 * M3-A3：AI 克隆公平性（A03）与 10 年确定性长跑（A01 扩展）。
 * 随机 id 不固定：比较按公司聚合的稳定指纹，而不是对象 id。
 */
import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { GameWorld } from '@application/mediators/game-world'

function fingerprint(gw: GameWorld, fromDay = 0): unknown {
  const companies = [...gw.world.companies]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((c) => ({
      id: c.id,
      status: c.status,
      persona: c.persona ?? null,
      brand: c.brand,
      cash: gw.finance.getCashBalance(c.id),
      staff: gw.world.employees.filter((e) => e.companyId === c.id && e.status === 'hired').length,
    }))
  const projects = gw.world.projects
    .map((p) => `${p.companyId}|${p.phase}|${p.plannedStartDay}|${p.plannedLaunchDay}`)
    .sort()
  const products = gw.world.products
    .map((p) => `${p.companyId}|${p.status}|${p.pricePerUnitCents ?? 'null'}|${p.launchDay}`)
    .sort()
  const tx = gw.finance
    .getAllTransactions()
    .filter((t) => t.day >= fromDay)
    .map((t) => `${t.companyId}|${t.category}|${t.amountCents}`)
    .sort()
  const decisions = gw
    .getAiDecisions()
    .filter((d) => d.day >= fromDay)
    .map((d) => `${d.companyId}|${d.day}|${d.chosen}`)
    .sort()
  return {
    companies,
    projects,
    products,
    txCount: tx.length,
    txAmount: tx.reduce((s, x) => s + Number(x.split('|')[2]), 0),
    decisions,
  }
}

describe('M3-A3 AI 公平性与长跑', () => {
  it('A03 克隆对照：存档副本续跑 1 年，状态与决策差异为 0', () => {
    const live = createGameWorld(2026, { aiCompetition: true })
    live.advanceSimulation(365)
    const snapshot = JSON.parse(JSON.stringify(live.serialize())) as ReturnType<GameWorld['serialize']>
    const clone = createGameWorld(2026, { aiCompetition: true })
    clone.restore(snapshot)

    expect(fingerprint(clone)).toEqual(fingerprint(live))

    live.advanceSimulation(365)
    clone.advanceSimulation(365)
    expect(fingerprint(clone, 365)).toEqual(fingerprint(live, 365))
  })

  // 十年（3652 天）在 M3-C 长跑执行：当前引擎退款批次按日全表扫描，
  // 1200 天已达 5.8s 且呈超线性，放进默认套件会把 11 分钟拉到不可接受。
  it('A01 扩展 1970→1972 两年：同 seed 双世界逐项指纹相等（十年见 M3-C）', () => {
    const a = createGameWorld(99, { aiCompetition: true })
    const b = createGameWorld(99, { aiCompetition: true })
    a.advanceSimulation(730)
    b.advanceSimulation(730)

    expect(a.world.companies.filter((c) => !c.isPlayer).length).toBeGreaterThan(0)
    expect(a.getAiDecisions().length).toBeGreaterThan(0)
    expect(fingerprint(a)).toEqual(fingerprint(b))
  })
})
