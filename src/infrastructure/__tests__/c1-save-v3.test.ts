import { describe, it, expect } from 'vitest'
import { migrateSave } from '@infrastructure/storage/save-migrations'
import { parseSave } from '@infrastructure/storage/save-schema'
import { makeFixtureWorld } from '@simulation/__tests__/m2c-fixtures'

function v2World(): Record<string, unknown> {
  const world = structuredClone(makeFixtureWorld()) as unknown as Record<string, unknown>
  world.schemaVersion = 2
  return world
}

function firstCompany(world: Record<string, unknown>): Record<string, unknown> {
  const companies = world.companies as Record<string, unknown>[]
  const company = companies[0]
  if (company === undefined) throw new Error('fixture missing company')
  return company
}

function firstProduct(world: Record<string, unknown>): Record<string, unknown> {
  const products = world.products as Record<string, unknown>[]
  const product = products[0]
  if (product === undefined) throw new Error('fixture missing product')
  return product
}

describe('存档迁移 v2→v3 (M3-C1 T1)', () => {
  it('V01 v2 档迁移后版本为 3，历史交易/事件不变', () => {
    const input = v2World()
    const beforeTx = structuredClone(input.transactions)
    const beforeEvents = structuredClone(input.events)
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    expect(r.state.schemaVersion).toBe(3)
    expect(r.state.transactions).toEqual(beforeTx)
    expect(r.state.events).toEqual(beforeEvents)
  })

  it('V02 认知度按支持 scope 等分，market 汇总值不丢', () => {
    const input = v2World()
    const product = firstProduct(input)
    product.awarenessByMarket = { north_america: 0.4 }
    product.supportedPlatformIds = ['p1', 'p2']
    product.audienceSegmentIds = ['s1', 's2']
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstProduct(r.state as unknown as Record<string, unknown>)
    expect(migrated.awarenessByScope).toEqual({
      'north_america:p1:s1': 0.1,
      'north_america:p1:s2': 0.1,
      'north_america:p2:s1': 0.1,
      'north_america:p2:s2': 0.1,
    })
    expect(migrated.awarenessByMarket).toEqual({ north_america: 0.4 })
  })

  it('V03 已有 awarenessByScope 不被覆盖', () => {
    const input = v2World()
    const product = firstProduct(input)
    product.awarenessByMarket = { north_america: 0.4 }
    product.awarenessByScope = { 'north_america:p1:s1': 0.7 }
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstProduct(r.state as unknown as Record<string, unknown>)
    expect(migrated.awarenessByScope).toEqual({ 'north_america:p1:s1': 0.7 })
  })

  it('V04 破产 0–90 天回填 restructuring，deadline = start + 90', () => {
    const input = v2World()
    input.currentDayIndex = 150
    const company = firstCompany(input)
    company.status = 'bankrupt'
    company.bankruptSinceDay = 100
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstCompany(r.state as unknown as Record<string, unknown>)
    expect(migrated.bankruptcyPhase).toBe('restructuring')
    expect(migrated.restructuringStartedDay).toBe(100)
    expect(migrated.restructuringDeadlineDay).toBe(190)
    expect(migrated.restructuringExtended).toBe(false)
  })

  it('V05 破产 91–180 天回填 restructuring + extended，deadline = start + 180', () => {
    const input = v2World()
    input.currentDayIndex = 250
    const company = firstCompany(input)
    company.status = 'bankrupt'
    company.bankruptSinceDay = 100
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstCompany(r.state as unknown as Record<string, unknown>)
    expect(migrated.bankruptcyPhase).toBe('restructuring')
    expect(migrated.restructuringExtended).toBe(true)
    expect(migrated.restructuringDeadlineDay).toBe(280)
  })

  it('V06 破产 181–359 天回填 winddown，deadline = start + 360', () => {
    const input = v2World()
    input.currentDayIndex = 350
    const company = firstCompany(input)
    company.status = 'bankrupt'
    company.bankruptSinceDay = 100
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstCompany(r.state as unknown as Record<string, unknown>)
    expect(migrated.bankruptcyPhase).toBe('winddown')
    expect(migrated.restructuringDeadlineDay).toBe(460)
  })

  it('V07 破产 ≥360 天给 30 天宽限，不立即解散', () => {
    const input = v2World()
    input.currentDayIndex = 500
    const company = firstCompany(input)
    company.status = 'bankrupt'
    company.bankruptSinceDay = 100
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstCompany(r.state as unknown as Record<string, unknown>)
    expect(migrated.bankruptcyPhase).toBe('winddown')
    expect(migrated.status).toBe('bankrupt')
    expect(migrated.restructuringDeadlineDay).toBe(530)
  })

  it('V08 旧档无 bankruptSinceDay 时用读档日回填，仍给 90 天', () => {
    const input = v2World()
    input.currentDayIndex = 300
    const company = firstCompany(input)
    company.status = 'bankrupt'
    delete company.bankruptSinceDay
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const migrated = firstCompany(r.state as unknown as Record<string, unknown>)
    expect(migrated.bankruptSinceDay).toBe(300)
    expect(migrated.bankruptcyPhase).toBe('restructuring')
    expect(migrated.restructuringDeadlineDay).toBe(390)
  })

  it('V09 合同补 rateProfile=legacy；已有 realistic 不覆盖', () => {
    const input = v2World()
    const contracts = [
      { id: 'CT-a', productId: 'p', type: 'revenue_share', signedDay: 0, durationDays: null, status: 'active', settledCents: 0, version: 1, createdAt: 0, updatedAt: 0 },
      { id: 'CT-b', productId: 'p', type: 'revenue_share', rateProfile: 'realistic', signedDay: 0, durationDays: null, status: 'active', settledCents: 0, version: 1, createdAt: 0, updatedAt: 0 },
    ]
    input.publishingContracts = contracts
    const r = migrateSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    const out = (r.state as unknown as { publishingContracts: Record<string, unknown>[] }).publishingContracts
    expect(out[0]?.rateProfile).toBe('legacy')
    expect(out[1]?.rateProfile).toBe('realistic')
  })

  it('V10 迁移幂等，且不修改入参', () => {
    const input = v2World()
    const snapshot = structuredClone(input)
    const once = migrateSave(input)
    if (!once.ok) throw new Error(once.errorMessage)
    const twice = migrateSave(once.state)
    if (!twice.ok) throw new Error(twice.errorMessage)
    expect(twice.state).toEqual(once.state)
    expect(input).toEqual(snapshot)
  })

  it('V11 v2 档 parseSave 成功，migratedFrom=2', () => {
    const input = v2World()
    const r = parseSave(input)
    if (!r.ok) throw new Error(r.errorMessage)
    expect(r.migratedFrom).toBe(2)
    expect(r.state.schemaVersion).toBe(3)
  })
})
