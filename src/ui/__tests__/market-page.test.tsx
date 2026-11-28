import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Market } from '@ui/pages/market'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import type { Product } from '@domain/entities/product'
import type { SalesRecord } from '@domain/entities/sales-record'

function soldRelease(companyId: string): Product {
  const salesByPeriod: SalesRecord[] = [[0, 300], [1, 10], [7, 20], [8, 15], [14, 20], [15, 300]]
    .map(([dayIndex = 0, grossUnits = 0]) => ({
      id: `SR-previous-${dayIndex}`, productId: 'previous', dayIndex, marketId: 'japan', platformId: 'arcade_pre_1975',
      grossUnits, unitPriceAtSaleCents: 100, grossRevenueCents: grossUnits * 100,
      netSalesRevenueCents: grossUnits * 70, platformFeeCents: grossUnits * 30,
      estimatedRefundUnits: 0, actualRefundUnits: 0,
    }))
  return {
    id: 'previous', sourceProjectId: 'project', companyId, name: 'First Release', genreId: 'strategy',
    audienceSegmentIds: ['arcade_enthusiasts'], supportedPlatformIds: ['arcade_pre_1975'],
    launchDay: 0, launchPriceCents: 100, lifecycleStage: 'launch', status: 'active',
    qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    defectLevel: 10, finalQualityScore: 90, reviewScore: null, brandImpact: 0,
    awarenessByMarket: {}, salesByPeriod, version: 1, createdAt: 0, updatedAt: 14,
  }
}

/** P-02 市场分析验收：A-4 四问、A-5 调研流水、A-43 结果卡、比较视图降级。 */
describe('P-02 市场分析（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
  })

  it('A-4：类别表渲染，趋势档缺失降级"信息不足"，不伪造档位', () => {
    render(<Market onNavigate={() => {}} />)
    const rows = screen.getAllByTestId('market-genre-row')
    expect(rows.length).toBeGreaterThan(0)
    const trends = screen.getAllByTestId('market-trend')
    expect(trends.length).toBe(rows.length)
    for (const t of trends) expect(t.textContent).toContain('信息不足')
  })

  it('消费者群体标签云可见，竞品卡只显示已在当前世界入场的公司', () => {
    const first = render(<Market onNavigate={() => {}} />)
    expect(screen.getByTestId('market-segments').textContent).not.toBe('')
    expect(screen.queryAllByTestId('market-competitor-card')).toHaveLength(0)
    first.unmount()

    const world = createGameWorld(42, { aiCompetition: true })
    world.createCompany({ name: 'Competitor Test', cityId: 'san_francisco' })
    const openingCompanies = world.world.companies.filter((company) => !company.isPlayer)
    expect(openingCompanies).toHaveLength(3)
    expect(world.world.products.filter((product) => product.status === 'active')).toHaveLength(3)
    expect(new Set(world.world.products.map((product) => product.genreId)).size).toBe(3)
    useGameStore.setState({ game: world })
    useGameStore.getState().refresh()
    const opponents = world.world.companies.filter((company) => !company.isPlayer)
    expect(opponents.length).toBeGreaterThan(0)
    expect(world.world.employees.some((employee) => employee.companyId === opponents[0]?.id)).toBe(true)
    expect(useGameStore.getState().employees).toHaveLength(0)
    render(<Market onNavigate={() => {}} />)
    const cards = screen.getAllByTestId('market-competitor-card')
    expect(cards).toHaveLength(opponents.length)
    expect(cards[0]?.textContent).toContain('月雀工作室')
    fireEvent.change(screen.getByLabelText('查看地区'), { target: { value: 'japan' } })
    expect(screen.getAllByTestId('market-competitor-card')[0]?.textContent).toContain('街机之王')
    expect(screen.getByText('当地更偏好格斗类游戏')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('查看地区'), { target: { value: 'north_america' } })
    for (const product of world.world.products) {
      expect(screen.getByTestId('market-competitors').textContent).toContain(product.name)
    }
    expect(screen.getByTestId('market-trend-section').textContent).toMatch(/最偏好的品类是.*街机/)
    for (const company of opponents) {
      expect(screen.getByTestId('market-competitors').textContent).toContain(company.name)
    }
    world.advanceSimulation(1)
    expect(world.world.products.every((product) => product.salesByPeriod.length > 0)).toBe(true)
  })

  it('A-43 + A-5：调研 → 一次性结果卡（竞品条数 + 方向标签）+ 账本流水可追溯', () => {
    const gw = useGameStore.getState().game!
    const company = useGameStore.getState().company!
    const txBefore = gw.finance.getTransactionsByCompany(company.id).length
    render(<Market onNavigate={() => {}} />)
    fireEvent.click(screen.getByTestId('market-research-button'))
    const card = screen.getByTestId('market-research-result')
    expect(card.textContent).toMatch(/当前对手数量[:：]\s*0/)
    expect(card.textContent).toMatch(/高匹配|中等匹配|低匹配/)
    // A-5：账本新增该笔调研交易（description='市场调研'）
    const txs = gw.finance.getTransactionsByCompany(company.id)
    expect(txs.length).toBe(txBefore + 1)
    expect(txs.some((tx) => tx.description === '市场调研')).toBe(true)
    // 一次性：关闭后结果卡消失
    fireEvent.click(screen.getByText('关闭'))
    expect(screen.queryByTestId('market-research-result')).toBeNull()
  })

  it('比较视图无调研数据时列显示"信息不足"，不伪造', () => {
    render(<Market onNavigate={() => {}} />)
    expect(screen.getByTestId('market-comparison').textContent).toContain('信息不足')
  })

  it('以首款为对照基线，并使用完整的两档七日成交窗口', () => {
    const world = useGameStore.getState().game!
    world.advanceSimulation(14)
    useGameStore.getState().refresh()
    useGameStore.setState({ products: [soldRelease(world.getPlayerCompany()!.id)] })
    const onNavigate = vi.fn()
    render(<Market onNavigate={onNavigate} />)
    expect(screen.getByTestId('market-previous-release').textContent).toContain('First Release')
    fireEvent.change(screen.getByLabelText('查看地区'), { target: { value: 'japan' } })
    const comparison = screen.getByTestId('market-comparison')
    expect(comparison.textContent).toMatch(/30\s*→\s*35\s*[（(]\+5[）)]/)
    expect(comparison.textContent).toContain('信息不足')
    fireEvent.change(within(comparison).getByRole('combobox'), { target: { value: 'rpg' } })
    const buttons = within(comparison).getAllByRole('button')
    fireEvent.click(buttons[1]!)
    expect(onNavigate).toHaveBeenCalledWith('newProject', 'rpg')
  })

  it('英文市场页的品类、受众与方向选择使用同一语言', () => {
    useGameStore.getState().setLocale('en')
    const view = render(<Market onNavigate={() => {}} />)
    try {
      expect(screen.getByTestId('market-segments').textContent).toContain('Mass market')
      expect(view.container.textContent).not.toMatch(/\p{Script=Han}|market\.segment\./u)
    } finally {
      view.unmount()
      useGameStore.getState().setLocale('zh-CN')
    }
  })

  it('破产 → 调研按钮 aria-disabled + 原因文案', () => {
    const gw = useGameStore.getState().game!
    const company = useGameStore.getState().company!
    ;(company as unknown as { status: string }).status = 'bankrupt'
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    render(<Market onNavigate={() => {}} />)
    const btn = screen.getByTestId('market-research-button')
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    expect(document.body.textContent).toContain('公司已破产，无法执行市场调研')
  })

  it('类别行"以此方向立项"携带类别参数跳转 P-03', () => {
    const nav = vi.fn()
    render(<Market onNavigate={nav} />)
    const rows = screen.getAllByTestId('market-genre-row')
    fireEvent.click(screen.getAllByText('以此方向立项')[0]!)
    expect(nav).toHaveBeenCalledWith('newProject', expect.any(String))
    expect(rows.length).toBeGreaterThan(0)
  })
})
