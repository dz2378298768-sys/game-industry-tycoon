import { describe, it, expect, beforeEach, vi } from 'vitest'
import LZString from 'lz-string'

const mem = vi.hoisted(() => new Map<string, unknown>())

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { canMigrate, migrateSave, backupKeyFor } from '@infrastructure/storage/save-migrations'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'
import { saveGame, loadGame } from '@infrastructure/storage/save-service'
import { makeFixtureWorld } from '@simulation/__tests__/m2c-fixtures'
import type { WorldState } from '@simulation/services/world-state'
import { GameWorld } from '@application/mediators/game-world'

/** 构造 v1 档：整体版本 1，产品无 M2-D 三字段（模拟线上老档） */
function v1World(): Record<string, unknown> {
  const world = structuredClone(makeFixtureWorld()) as unknown as Record<string, unknown> & {
    products: Record<string, unknown>[]
  }
  world.schemaVersion = 1
  for (const product of world.products) {
    delete product.pricePerUnitCents
    delete product.discountRatePercent
    delete product.lastPriceChangeDay
  }
  return world
}

function v2World(): WorldState {
  const world = structuredClone(makeFixtureWorld())
  world.schemaVersion = 2
  for (const product of world.products) {
    if (product.launchPriceCents !== null) product.pricePerUnitCents = product.launchPriceCents
    product.discountRatePercent = 0
    product.lastPriceChangeDay = product.launchDay
  }
  return world
}

describe('存档迁移 v1→v2 (M2-E)', () => {
  beforeEach(() => { mem.clear() })

  // ---- 版本判据 M01–M04 ----
  it('M01 canMigrate(1,2) 为真', () => { expect(canMigrate(1, 2)).toBe(true) })
  it('M02 canMigrate(2,2) 为真（同版本视为已就绪）', () => { expect(canMigrate(2, 2)).toBe(true) })
  it('M03 canMigrate(1,3) 为假（无分步路径）', () => { expect(canMigrate(1, 3)).toBe(false) })
  it('M04 canMigrate(2,1) 为假（不支持回退）', () => { expect(canMigrate(2, 1)).toBe(false) })

  // ---- 纯函数 M05–M10b ----
  it('M05 迁移把 schemaVersion 改为 2', () => {
    const r = migrateSave(v1World())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.schemaVersion).toBe(2)
  })

  it('M06 已定价产品补 pricePerUnitCents = launchPriceCents', () => {
    const r = migrateSave(v1World())
    if (!r.ok) throw new Error('migration failed')
    expect(r.state.products[0]?.pricePerUnitCents).toBe(2000)
  })

  it('M07 未定价产品（launchPriceCents=null）不补价格', () => {
    const world = v1World()
    ;(world.products as Record<string, unknown>[])[0]!.launchPriceCents = null
    const r = migrateSave(world)
    if (!r.ok) throw new Error('migration failed')
    expect(r.state.products[0]?.pricePerUnitCents).toBeUndefined()
    expect(r.state.products[0]?.discountRatePercent).toBeUndefined()
  })

  it('M08 折扣率补 0、改价日补 0', () => {
    const r = migrateSave(v1World())
    if (!r.ok) throw new Error('migration failed')
    expect(r.state.products[0]?.discountRatePercent).toBe(0)
    expect(r.state.products[0]?.lastPriceChangeDay).toBe(0)
  })

  it('M09 不重算历史：销售记录与流水逐字段不变', () => {
    const world = v1World()
    const before = structuredClone(world)
    const r = migrateSave(world)
    if (!r.ok) throw new Error('migration failed')
    expect(r.state.events).toEqual(before.events)
    expect((r.state.products[0] as { salesByPeriod: unknown }).salesByPeriod).toEqual(
      (before.products as Record<string, unknown>[])[0]!.salesByPeriod,
    )
    expect(r.state.transactions).toEqual(before.transactions)
  })

  it('M10 迁移不修改入参（纯函数）', () => {
    const world = v1World()
    const before = structuredClone(world)
    migrateSave(world)
    expect(world).toEqual(before)
  })

  it('M10b 迁移档 lastPriceChangeDay=0 而非 currentDayIndex（不给冷却特权）', () => {
    const world = v1World()
    world.currentDayIndex = 137
    const r = migrateSave(world)
    if (!r.ok) throw new Error('migration failed')
    expect(r.state.products[0]?.lastPriceChangeDay).toBe(0)
    expect(r.state.products[0]?.lastPriceChangeDay).not.toBe(137)
  })

  // ---- 幂等 M11–M12 ----
  it('M11 migrateSave(v2) 幂等且业务字段不变', () => {
    const v2 = v2World()
    const r = migrateSave(v2)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect({ ...r.state, schemaVersion: 0 }).toEqual({ ...v2, schemaVersion: 0 })
      expect(r.state.schemaVersion).toBe(2)
    }
  })

  it('M12 连续两次迁移结果一致（含价格字段不重复叠加）', () => {
    const once = migrateSave(v1World())
    if (!once.ok) throw new Error('migration failed')
    const twice = migrateSave(once.state)
    if (!twice.ok) throw new Error('second migration failed')
    expect(twice.state.products).toEqual(once.state.products)
  })

  // ---- parseSave M13–M18 ----
  it('M13 v1 档 parseSave 成功并标记 migratedFrom=1、版本 2', () => {
    const r = parseSave(v1World())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.migratedFrom).toBe(1)
      expect(r.state.schemaVersion).toBe(2)
      expect(r.state.products[0]?.pricePerUnitCents).toBe(2000)
    }
  })

  it('M14 v2 档 parseSave 无 migratedFrom', () => {
    const r = parseSave(v2World())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.migratedFrom).toBeUndefined()
  })

  it('M15 版本 3 仍拒绝（迁移不放宽版本闸门）', () => {
    const world = structuredClone(v1World())
    world.schemaVersion = 3
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_VERSION_UNSUPPORTED')
  })

  it('M15b 迁移层自身拒绝版本 3（双层闸门的第一层可独立生效）', () => {
    const r = migrateSave({ schemaVersion: 3 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_VERSION_UNSUPPORTED')
  })

  it('M16 迁移路径仍校验现金一致', () => {
    const world = v1World()
    ;((world.companies as Record<string, unknown>[])[0]!).cashBalanceCents = 1
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_CASH_MISMATCH')
  })

  it('M17 迁移路径仍校验引用完整性', () => {
    const world = v1World()
    world.employees = []
    ;(world.projects as Record<string, unknown>[])[0]!.teamAssignments = [
      { employeeId: 'ghost', projectId: 'prj-001', allocationRatio: 1, roleOnProject: 'generalist' },
    ]
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('M18 迁移档销售记录逐字段与 v1 一致', () => {
    const world = v1World()
    const r = parseSave(world)
    if (!r.ok) throw new Error('parse failed')
    const original = (world.products as Record<string, unknown>[])[0]!.salesByPeriod
    expect(r.state.products[0]?.salesByPeriod).toEqual(original)
    expect(r.state.transactions).toEqual(world.transactions)
  })

  // ---- 存储 M19–M23 ----
  function seedV1Save(): Record<string, unknown> {
    const world = v1World()
    mem.set('git_save_v1', LZString.compressToUTF16(JSON.stringify(world)))
    return world
  }

  it('M19 v1 档读档成功并写 seed 备份', async () => {
    seedV1Save()
    const r = await loadGame()
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.migratedFrom).toBe(1)
    expect(r.backupWritten).toBe(true)
    expect(mem.has(backupKeyFor(r.state.saveSeed))).toBe(true)
  })

  it('M20 同 seed 二次读档不覆盖备份（保留最原始 v1 档）', async () => {
    seedV1Save()
    const first = await loadGame()
    if (first.status !== 'ok') throw new Error('load failed')
    const key = backupKeyFor(first.state.saveSeed)
    const backupBefore = mem.get(key)

    const second = await loadGame()
    if (second.status !== 'ok') throw new Error('load failed')
    expect(second.backupWritten).toBe(false)
    expect(mem.get(key)).toBe(backupBefore)
  })

  it('M21 不同 seed 各留一份备份', async () => {
    seedV1Save()
    const a = await loadGame()
    if (a.status !== 'ok') throw new Error('load failed')
    const worldB = v1World()
    worldB.saveSeed = 424242
    mem.set('git_save_v1', LZString.compressToUTF16(JSON.stringify(worldB)))
    const b = await loadGame()
    if (b.status !== 'ok') throw new Error('load failed')
    expect(b.backupWritten).toBe(true)
    expect(mem.has(backupKeyFor(a.state.saveSeed))).toBe(true)
    expect(mem.has(backupKeyFor(424242))).toBe(true)
  })

  it('M22 迁移/校验失败不写任何键', async () => {
    const broken = v1World()
    delete (broken as Record<string, unknown>).companies
    mem.set('git_save_v1', LZString.compressToUTF16(JSON.stringify(broken)))
    const r = await loadGame()
    expect(r.status).toBe('invalid')
    expect([...mem.keys()]).toEqual(['git_save_v1'])
  })

  it('M23 saveGame 写出 v2 档', async () => {
    await saveGame(v2World())
    const compressed = mem.get('git_save_v1') as string
    const json = JSON.parse(LZString.decompressFromUTF16(compressed) as string) as { schemaVersion: number }
    expect(json.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(SAVE_SCHEMA_VERSION).toBe(2)
  })

  // ---- 回归 M24 ----
  it('M24 迁移档 GameWorld.restore 后可运行且价格字段生效', async () => {
    seedV1Save()
    const r = await loadGame()
    if (r.status !== 'ok') throw new Error('load failed')
    const gw = new GameWorld(9)
    gw.restore(r.state)
    expect(gw.calendar.currentDayIndex).toBe(r.state.currentDayIndex)
    expect(gw.world.products[0]?.pricePerUnitCents).toBe(2000)
  })
})
