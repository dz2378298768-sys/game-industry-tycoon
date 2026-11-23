import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@domain/entities/product'
import { Review } from '@ui/pages/review'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/** P-12 + S12-4 验收：A-35/A-36 四域空集降级、R-2 口碑直读、U1 三质量分列、A-34 第二款入口。 */
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'P-1', sourceProjectId: 'PRJ-1', companyId: 'C-1', name: 'Test Game',
    genreId: 'action', audienceSegmentIds: [], supportedPlatformIds: [],
    launchDay: 100, launchPriceCents: 2000, qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    defectLevel: 10, finalQualityScore: 90, reviewScore: null, brandImpact: 0,
    lifecycleStage: 'launch', awarenessByMarket: {}, salesByPeriod: [
      { id: 'SR-1', productId: 'P-1', dayIndex: 100, marketId: 'JP', platformId: 'home_console_g2', grossUnits: 10, unitPriceAtSaleCents: 2000, grossRevenueCents: 20000, platformFeeCents: 6000, netSalesRevenueCents: 14000, estimatedRefundUnits: 0, actualRefundUnits: 0 },
    ],
    status: 'active', version: 1, createdAt: 100, updatedAt: 110,
    ...overrides,
  }
}

describe('P-12 经营复盘 + S12-4 媒体评价聚合卡（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const company = gw.world.companies.find((c) => c.isPlayer) ?? gw.world.companies[0]!
    const financial = gw.getFinancialOverview()!
    useGameStore.setState({
      game: gw, company, financial,
      products: [makeProduct()], projects: [], transactions: [], dayIndex: financial.dayIndex,
    } as never)
  })

  function renderReview() {
    return render(<Review onNavigate={vi.fn()} />)
  }

  it('空态：无产品时显示暂无经营结果可复盘', () => {
    useGameStore.setState({ products: [] } as never)
    renderReview()
    expect(screen.getByTestId('p12-empty').textContent).toContain('暂无经营结果可复盘')
  })

  it('S12-4：口碑档降级、窗口 n/N=0/10、最近评价列表无伪造条目', () => {
    const { container } = renderReview()
    expect(screen.getByTestId('p12-media-card')).toBeTruthy()
    expect(screen.getByTestId('p12-media-band').textContent).toContain('暂无评价')
    expect(screen.getByTestId('p12-media-count').textContent).toContain('0 / 10')
    expect(screen.getByTestId('p12-media-list').textContent).toContain('暂无评价，上市后积累')
    // G1 不建 BrandMemory：不渲染品牌值 / Brand 点数
    expect(container.textContent).not.toMatch(/BrandMemory|品牌值|Brand 点数|品牌点数/)
  })

  it('A-35/A-36：四域归因空集占位，各域数据不足且无伪造锚点', () => {
    const { container } = renderReview()
    for (const domain of ['design', 'execution', 'market', 'finance']) {
      expect(screen.getByTestId(`p12-domain-${domain}`).textContent).toContain('数据不足')
    }
    expect(container.textContent).not.toMatch(/事件 id:|交易 id:|清单项 id:/)
  })

  it('U1：三质量分列终值渲染为 —，无综合分/合成词', () => {
    const { container } = renderReview()
    expect(screen.getByTestId('p12-quality-design').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p12-quality-implementation').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p12-quality-completeness').textContent?.trim()).toBe('—')
    expect(container.textContent).not.toMatch(/综合|总评|加权平均|平均分|qualityScore|finalQualityScore|overall/)
  })

  it('继承项五卡齐备，ProductArchive 未接线显示数据不足', () => {
    renderReview()
    for (const key of ['cash', 'team', 'lastProduct', 'experience', 'market']) {
      expect(screen.getByTestId(`p12-inherit-${key}`).textContent).toContain('数据不足')
    }
  })

  it('A-34 / S12-3：第二款入口无禁用态，点击跳 P-02（market）', () => {
    const onNavigate = vi.fn()
    render(<Review onNavigate={onNavigate} />)
    const btn = screen.getByTestId('p12-next-start') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(onNavigate).toHaveBeenCalledWith('market')
  })

  it('现金曲线来自账本月度净额（真实数据，不造数）', () => {
    const day = useGameStore.getState().dayIndex
    useGameStore.setState({ transactions: [{ id: 't1', day, category: 'sales_revenue', amountCents: 50000, description: '销售' }] } as never)
    renderReview()
    expect(screen.getByTestId('p12-cash-curve').textContent).toContain('$500')
  })

  it('经营汇总销量与净收入来自产品真实销售记录', () => {
    renderReview()
    const summary = screen.getByTestId('p12-summary')
    expect(summary.textContent).toContain('10')
    expect(summary.textContent).toContain('$140')
  })
})
