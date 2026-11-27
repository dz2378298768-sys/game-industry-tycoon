import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@domain/entities/product'
import type { SalesRecord } from '@domain/entities/sales-record'
import { Products } from '@ui/pages/products'
import { ProductDetail } from '@ui/pages/product-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import { seedInitialAwareness } from '@content/market-inputs'

/** P-10 三质量分列、周聚合、真实口碑与退款、需求池结算归因。 */
function salesRecord(dayIndex: number, units = 10): SalesRecord {
  return {
    id: `SR-P1-${dayIndex}`, productId: 'P-1', dayIndex, marketId: 'japan', platformId: 'home_console_g2',
    grossUnits: units, unitPriceAtSaleCents: 2000, grossRevenueCents: units * 2000,
    platformFeeCents: units * 600, netSalesRevenueCents: units * 1400,
    estimatedRefundUnits: 0, actualRefundUnits: 0,
  }
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'P-1', sourceProjectId: 'PRJ-1', companyId: 'C-1', name: 'Test Game',
    genreId: 'action', audienceSegmentIds: ['arcade_enthusiasts'], supportedPlatformIds: ['home_console_g2'],
    launchDay: 100, launchPriceCents: 2000, pricePerUnitCents: 2000, discountRatePercent: 0,
    qualityProfile: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    defectLevel: 10, finalQualityScore: 90, reviewScore: 88, brandImpact: 0,
    lifecycleStage: 'launch', awarenessByMarket: {}, salesByPeriod: [salesRecord(100), salesRecord(103)],
    status: 'active', version: 1, createdAt: 100, updatedAt: 110,
    ...overrides,
  }
}

describe('P-10 市场反馈与销售页（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const company = gw.world.companies.find((c) => c.isPlayer) ?? gw.world.companies[0]!
    useGameStore.setState({
      game: gw,
      company,
      products: [makeProduct()],
      refundBatches: [],
      marketingCampaigns: [],
      publishingContracts: [],
      transactions: [],
    } as never)
  })

  function renderList() {
    return render(<Products onNavigate={vi.fn()} />)
  }

  function renderDetail(overrides: Partial<Product> = {}) {
    if (Object.keys(overrides).length > 0) {
      useGameStore.setState({ products: [makeProduct(overrides)] } as never)
    }
    return render(<ProductDetail productId="P-1" onNavigate={vi.fn()} />)
  }

  it('同一发行模板字段用于估算和签署，默认可用并按填写期限估算', () => {
    const { game } = useGameStore.getState()
    const product = makeProduct({ companyId: game!.getPlayerCompany()!.id, launchDay: 0 })
    game!.world.products = [product]
    useGameStore.getState().refresh()
    renderDetail()
    const rate = screen.getByRole('textbox', { name: '模板分成比例（%）' }) as HTMLInputElement
    const partner = screen.getByRole('combobox', { name: '发行商' }) as HTMLSelectElement
    expect(partner.value).toBe('global-star')
    expect(rate.value).toBe('15')
    const quote = screen.getByRole('button', { name: '试算合同' })
    fireEvent.change(rate, { target: { value: '10' } })
    fireEvent.click(quote)
    expect(useGameStore.getState().messages.at(-1)?.text).toContain('15%–30%')
    expect(screen.queryByText('按 30 天估算')).toBeNull()
    fireEvent.change(rate, { target: { value: '15' } })
    fireEvent.change(screen.getByRole('textbox', { name: '模板期限（天）' }), { target: { value: '30' } })
    fireEvent.click(quote)
    expect(screen.getByText('按 30 天估算')).toBeTruthy()
    fireEvent.change(rate, { target: { value: '20' } })
    expect(screen.queryByText('按 30 天估算')).toBeNull()
    fireEvent.change(rate, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: '签模板合同' }))
    expect(useGameStore.getState().publishingContracts).toMatchObject([
      { partnerId: 'global-star', ratePercent: 15, durationDays: 30, status: 'active' },
    ])
  })

  it('FIX-1 / U1：产品表三质量分列，口碑只显示媒体推算档', () => {
    const { container } = renderList()
    expect(screen.getByTestId('p10-quality-design').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-quality-implementation').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-quality-completeness').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-reputation-P-1').textContent).toContain('偏正面')
    expect(container.textContent).not.toMatch(/综合|总评|加权平均|平均分|qualityScore|finalQualityScore/)
  })

  it('A-29：销量以周为行单位（周序号 + 起止日），逐日明细不单列', () => {
    renderDetail()
    const section = screen.getByTestId('p10-sales-weekly')
    expect(section).toBeTruthy()
    // day 100 与 103 同属第 15 周（floor(100/7)=14 → 显示 15），合并为一行
    const rows = section.querySelectorAll('[data-testid^="p10-week-row-"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.textContent).toContain('Day 98–104')
    expect(rows[0]!.textContent).toContain('20') // 10 + 10 件
    expect(screen.queryByText(/^100$/)).toBeNull()
  })

  it('低于一美元的上市价、当前价和列表价保留美分', () => {
    const detail = renderDetail({ launchPriceCents: 28, pricePerUnitCents: 35 })
    expect(detail.container.textContent).toContain('$0.28')
    expect(detail.container.textContent).toContain('$0.35')
    detail.unmount()
    expect(renderList().container.textContent).toContain('$0.35')
  })

  it.each([
    [49, '偏负面'], [50, '褒贬不一'], [74, '褒贬不一'], [75, '偏正面'],
  ])('ADJ-26：媒体评价使用已裁定的边界 %d', (score, label) => {
    renderDetail({ reviewScore: null, finalQualityScore: score })
    expect(screen.getByTestId('p10-reputation-band').textContent).toBe(label)
    expect(screen.getByTestId('p10-reputation').textContent).toMatch(/产品质量.*推算/)
  })

  it('REC-06：区分退款模型与真实已退单位率，已入账退款额按周聚合', () => {
    useGameStore.setState({
      refundBatches: [{
        id: 'RB-1', productId: 'P-1', salesRecordId: 'SR-P1-100', marketId: 'JP', platformId: 'home_console_g2',
        saleDayIndex: 100, refundDayIndex: 101, refundedUnits: 1, refundAmountCents: 2000,
        source: 'auto_window', status: 'posted', idempotencyKey: 'k',
      }],
    } as never)
    renderDetail({ defectLevel: 40, salesByPeriod: [{ ...salesRecord(100), actualRefundUnits: 1 }, salesRecord(103)] })
    const summary = screen.getByTestId('p10-refund-summary')
    expect(screen.getByTestId('p10-refund-modelled').textContent).toMatch(/7%$/)
    expect(screen.getByTestId('p10-refund-actual').textContent).toMatch(/5%$/)
    expect(summary.textContent).toContain('Day 98–104')
    expect(summary.textContent).not.toMatch(/原因|reason/i)
  })

  it('A-28 CONDITIONAL：定位锚点结构可见（广谱/窄众标签 + 切片列）', () => {
    renderDetail()
    expect(screen.getByTestId('p10-positioning-tags')).toBeTruthy()
    expect(screen.getByTestId('p10-positioning-slices')).toBeTruthy()
    const slices = screen.getByTestId('p10-positioning-slices')
    expect(slices.textContent).toContain('日本')
    expect(slices.textContent).toContain('家用游戏机 G2')
    expect(slices.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('归因 fail-closed：无内核支撑原因则不出现归因行', () => {
    renderDetail()
    expect(screen.getByTestId('p10-attribution-empty')).toBeTruthy()
    expect(screen.queryByTestId('p10-attribution-result')).toBeNull()
  })

  it('需求池真实结算的三项归因对得上当天毛销量，读档保留销售事实', () => {
    const world = useGameStore.getState().game!
    const product = makeProduct({
      companyId: world.getPlayerCompany()!.id,
      launchDay: 0,
      audienceSegmentIds: ['arcade_enthusiasts'],
      supportedPlatformIds: ['arcade_pre_1975'],
      awarenessByMarket: seedInitialAwareness(7, 0),
      salesByPeriod: [],
    })
    world.world.products = [product, { ...product, id: 'same-market-competitor' }]
    world.advanceSimulation(1)
    useGameStore.getState().refresh()
    const feedback = world.sales.getLatestDemandFeedback(product.id)!
    const latest = world.world.products.find((p) => p.id === product.id)!
    const unitsSold = latest.salesByPeriod
      .filter((record) => record.dayIndex === feedback.dayIndex)
      .reduce((total, record) => total + record.grossUnits, 0)
    expect(unitsSold).toBeGreaterThan(0)
    expect(feedback.purchaseIntentReductionUnits).toBeGreaterThan(0)
    expect(feedback.allocationReductionUnits).toBeGreaterThan(0)
    expect(feedback.addressableUnits - feedback.purchaseIntentReductionUnits - feedback.allocationReductionUnits).toBe(unitsSold)
    const detail = renderDetail()
    for (const row of ['audience', 'positioning', 'competition', 'result']) {
      expect(screen.getByTestId(`p10-attribution-${row}`)).toBeTruthy()
    }
    detail.unmount()

    const restored = createGameWorld(42)
    restored.restore(world.serialize())
    useGameStore.setState({ game: restored })
    useGameStore.getState().refresh()
    expect(restored.world.products.find((p) => p.id === product.id)?.salesByPeriod).toEqual(latest.salesByPeriod)
    expect(restored.sales.getLatestDemandFeedback(product.id)).toBeUndefined()
    const restoredDetail = renderDetail()
    for (const row of ['audience', 'positioning', 'competition', 'result']) {
      expect(screen.getByTestId(`p10-attribution-${row}`)).toBeTruthy()
    }
    expect(screen.getByTestId('p10-reputation-band').textContent).toBe('偏正面')
    expect(screen.getByTestId('p10-refund-actual').textContent).toMatch(/0%$/)
    restoredDetail.unmount()
    restored.advanceSimulation(1)
    expect(restored.sales.getLatestDemandFeedback(product.id)?.dayIndex).toBe(feedback.dayIndex + 1)
  })

  it('G-9：破产时降价与追加营销按钮禁用并带原因', () => {
    const state = useGameStore.getState()
    useGameStore.setState({ company: { ...state.company!, status: 'bankrupt' } } as never)
    renderDetail()
    const discount = screen.getByText('设置折扣（0 取消）').closest('button') as HTMLButtonElement
    expect(discount.disabled).toBe(true)
    expect(discount.getAttribute('aria-disabled')).toBe('true')
    expect(discount.getAttribute('title')).toContain('公司已破产')
    const apply = screen.getAllByText('应用')[0]!.closest('button') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
  })
})
