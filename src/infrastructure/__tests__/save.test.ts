import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, unknown>())

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { saveGame, loadGame } from '@infrastructure/storage/save-service'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'
import { GameWorld } from '@application/mediators/game-world'

function sampleWorld() {
  const gw = new GameWorld(9)
  gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  const emp = gw.hireEmployee({ name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 }).result
  const project = gw.createProject({
    name: 'Saved Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (emp && project) gw.assignEmployeeToProject(emp.id, project.id, 1, 'generalist')
  return gw.serialize()
}

describe('存档安全 (G10/G21)', () => {
  beforeEach(() => { mem.clear() })

  it('正常保存与读取，状态一致', async () => {
    const world = sampleWorld()
    await saveGame(world)

    const result = await loadGame()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(result.state.currentDayIndex).toBe(world.currentDayIndex)
    expect(result.state.employees).toHaveLength(world.employees.length)
    expect(result.state.companies[0]?.cashBalanceCents).toBe(
      world.companies[0]?.cashBalanceCents,
    )
  })

  it('损坏存档拒绝加载', async () => {
    mem.set('git_save_v1', 'this-is-not-valid-lz-string')
    const result = await loadGame()
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errorCode).toBe('SAVE_CORRUPTED')
  })

  it('不支持的 schemaVersion 拒绝加载', () => {
    const world = { ...sampleWorld(), schemaVersion: 99 }
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_VERSION_UNSUPPORTED')
  })

  it('现金与流水不一致时拒绝加载', () => {
    const world = sampleWorld()
    const broken = structuredClone(world)
    if (broken.companies[0]) broken.companies[0].cashBalanceCents = 1
    const r = parseSave(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_CASH_MISMATCH')
  })

  it('引用不存在的员工时拒绝加载', () => {
    const world = sampleWorld()
    const broken = structuredClone(world)
    broken.employees = []
    const r = parseSave(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('读档后 FinanceService 余额与公司现金一致', async () => {
    const world = sampleWorld()
    await saveGame(world)
    const result = await loadGame()
    if (result.status !== 'ok') throw new Error('load failed')

    const gw = new GameWorld(9)
    gw.restore(result.state)
    const company = gw.getPlayerCompany()
    expect(company).toBeDefined()
    if (!company) return
    expect(gw.finance.getCashBalance(company.id)).toBe(company.cashBalanceCents)
  })

  it('读档后日期、项目和流水保持一致', async () => {
    const gw = new GameWorld(9)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    gw.advanceSimulation(40)
    const project = gw.createProject({
      name: 'Saved Game',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(project.success).toBe(true)

    await saveGame(gw.serialize())
    const loaded = await loadGame()
    if (loaded.status !== 'ok') throw new Error('load failed')

    const restored = new GameWorld(9)
    restored.restore(loaded.state)
    expect(restored.calendar.currentDayIndex).toBe(40)
    expect(restored.world.projects).toHaveLength(1)
    expect(restored.finance.getTransactionsByCompany(company.id).length).toBe(
      gw.finance.getTransactionsByCompany(company.id).length,
    )
  })
})
