import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '@ui/state/game-store'
import type { GameWorld } from '@application/mediators/game-world'
import type { Company } from '@domain/entities/company'

// V11：不 mock 任何对象，直接驱动真实 zustand store + 真实 GameWorld，
// 只改 world.companies 中 isPlayer 公司的字段模拟破产（TASK-M1.2-UI-COVERAGE-FOLLOWUP §8.1）。

function bootWorld(seed = 11): GameWorld {
  useGameStore.setState({
    game: null,
    company: null,
    employees: [],
    projects: [],
    products: [],
    transactions: [],
    messages: [],
    dayIndex: 0,
    speed: 'paused',
  })
  useGameStore.getState().init(seed)
  useGameStore.getState().createCompany('Acme', 'san_francisco')
  const gw = useGameStore.getState().game
  if (!gw) throw new Error('game 未初始化')
  return gw
}

function playerCompany(gw: GameWorld): Company {
  const company = gw.world.companies.find((c) => c.isPlayer)
  if (!company) throw new Error('world 中缺少 isPlayer 公司')
  return company
}

// 展示层字段：直接写 cashBalanceCents（OQ-4 口径），-50_000 = -$500
function markBankrupt(gw: GameWorld, cashCents = -50_000): Company {
  const company = playerCompany(gw)
  company.status = 'bankrupt'
  company.cashBalanceCents = cashCents
  return company
}

describe('V11 game-store 破产态 refresh 兜底（DESIGN-UI-LAYER v1.1 §3.4 / §8.1 V11）', () => {
  beforeEach(() => {
    useGameStore.setState({ messages: [] })
  })

  it('V11-1 破产后 refresh 仍保留公司引用与破产状态', () => {
    const gw = bootWorld()
    const raw = markBankrupt(gw)

    // 前置条件：getPlayerCompany 只返回 active，破产后必须为 undefined
    expect(gw.getPlayerCompany()).toBeUndefined()

    useGameStore.getState().refresh()
    const store = useGameStore.getState()

    expect(store.company).not.toBeNull()
    expect(store.company?.status).toBe('bankrupt')
    expect(store.company?.cashBalanceCents).toBe(-50_000)
    expect(store.company?.id).toBe(raw.id)

    // 其他切片与真实世界同步刷新（不是旧快照）
    expect(store.employees).toBe(gw.world.employees)
    expect(store.projects).toBe(gw.world.projects)
    expect(store.products).toBe(gw.world.products)
    expect(store.transactions).toEqual(gw.finance.getTransactionsByCompany(raw.id))
    expect(store.dayIndex).toBe(gw.calendar.currentDayIndex)
  })

  it('V11-2 破产后 brand 与现金字段不被清零', () => {
    const gw = bootWorld()
    const raw = playerCompany(gw)
    markBankrupt(gw)
    raw.brand = 37

    expect(gw.getPlayerCompany()).toBeUndefined()

    useGameStore.getState().refresh()
    const company = useGameStore.getState().company

    expect(company).not.toBeNull()
    expect(company?.brand).toBe(37)
    expect(company?.cashBalanceCents).toBe(-50_000)
    expect(company?.id).toBe(raw.id)
    expect(company?.id).toBe(playerCompany(gw).id)
  })

  it('V11-3 active 路径不回归', () => {
    const gw = bootWorld()

    useGameStore.getState().refresh()
    // active 路径仍取 getPlayerCompany() 的同一引用
    expect(useGameStore.getState().company).toBe(gw.getPlayerCompany())
    const activeId = useGameStore.getState().company?.id
    expect(activeId).toBeDefined()

    markBankrupt(gw)
    useGameStore.getState().refresh()

    expect(gw.getPlayerCompany()).toBeUndefined()
    expect(useGameStore.getState().company).not.toBeNull()
    expect(useGameStore.getState().company?.id).toBe(activeId)
  })
})
