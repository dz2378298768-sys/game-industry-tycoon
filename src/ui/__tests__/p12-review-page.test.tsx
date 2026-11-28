import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
      products: [makeProduct({ companyId: company.id })], projects: [], transactions: [], refundBatches: [], dayIndex: financial.dayIndex,
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

  it('S12-4：档位摘要来自产品生产事实，页面没有伪造的评价数量和条目', () => {
    const { container } = renderReview()
    expect(screen.getByTestId('p12-media-card')).toBeTruthy()
    expect(screen.getByTestId('p12-media-band').textContent).toBe('偏正面')
    expect(screen.queryByTestId('p12-media-count')).toBeNull()
    expect(screen.queryByTestId('p12-media-list')).toBeNull()
    // G1 不建 BrandMemory：不渲染品牌值 / Brand 点数
    expect(container.textContent).not.toMatch(/BrandMemory|品牌值|Brand 点数|品牌点数/)
  })

  it('A-35/A-36：没有产品时四域均如实显示数据不足', () => {
    useGameStore.setState({ products: [] })
    const { container } = renderReview()
    for (const domain of ['design', 'execution', 'market', 'finance']) {
      expect(screen.getByTestId(`p12-domain-${domain}`).textContent).toContain('数据不足')
    }
    expect(container.textContent).not.toMatch(/事件 id:|交易 id:|清单项 id:/)
  })

  it('复盘可跳到实际销售和退款记录，缺少需求池归因仍显示数据不足', () => {
    const onNavigate = vi.fn()
    render(<Review onNavigate={onNavigate} />)
    const finance = screen.getByTestId('p12-domain-finance')
    expect(finance.textContent).toContain('$140')
    fireEvent.click(within(finance).getByRole('button'))
    expect(onNavigate).toHaveBeenCalledWith('productDetail', 'P-1')
    expect(screen.getByTestId('p12-domain-market').textContent).toContain('数据不足')
  })

  it('冷启动时读取存档中的销售归因', () => {
    const product = useGameStore.getState().products[0]!
    useGameStore.setState({
      products: [{
        ...product,
        latestMarketFeedback: {
          dayIndex: 101, soldUnits: 73, addressableUnits: 100, purchaseIntentReductionUnits: 20,
          allocationReductionUnits: 7, marketingAddedIntentUnits: 0, bySegment: {},
        },
      }],
    })
    renderReview()
    expect(screen.getByTestId('p12-domain-market').textContent).toContain('73')
  })

  it('U1：三质量分列终值渲染为 —，无综合分/合成词', () => {
    const { container } = renderReview()
    expect(screen.getByTestId('p12-quality-design').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p12-quality-implementation').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p12-quality-completeness').textContent?.trim()).toBe('—')
    expect(container.textContent).not.toMatch(/综合|总评|加权平均|平均分|qualityScore|finalQualityScore|overall/)
  })

  it('二次立项显示当前现金、团队、上款结果和市场，档案经验仍然等待数据', () => {
    renderReview()
    expect(screen.getByTestId('p12-inherit-cash').textContent).toContain('可用现金')
    expect(screen.getByTestId('p12-inherit-team').textContent).toContain('0')
    expect(screen.getByTestId('p12-inherit-lastProduct').textContent).toContain('Test Game')
    expect(screen.getByTestId('p12-inherit-market').textContent).toMatch(/0$/)
    expect(screen.getByTestId('p12-inherit-experience').textContent).toContain('数据不足')
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

  it('经营汇总按已入账退款扣减净收入，未入账退款不计', () => {
    useGameStore.setState({ refundBatches: [
      {
        id: 'posted', productId: 'P-1', salesRecordId: 'SR-1', marketId: 'JP', platformId: 'home_console_g2',
        saleDayIndex: 100, refundDayIndex: 110, refundedUnits: 1, refundAmountCents: 2000,
        source: 'auto_window', status: 'posted', idempotencyKey: 'posted',
      },
      {
        id: 'pending', productId: 'P-1', salesRecordId: 'SR-1', marketId: 'JP', platformId: 'home_console_g2',
        saleDayIndex: 100, refundDayIndex: 110, refundedUnits: 1, refundAmountCents: 2000,
        source: 'auto_window', status: 'pending', idempotencyKey: 'pending',
      },
    ] })
    renderReview()
    const summary = screen.getByTestId('p12-summary')
    expect(summary.textContent).toContain('10')
    expect(summary.textContent).toContain('$120')
    expect(summary.textContent).toContain('$20')
  })
})
