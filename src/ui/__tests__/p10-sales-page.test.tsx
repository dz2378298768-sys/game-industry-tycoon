import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@domain/entities/product'
import type { SalesRecord } from '@domain/entities/sales-record'
import { Products } from '@ui/pages/products'
import { ProductDetail } from '@ui/pages/product-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/** P-10 市场反馈与销售验收：FIX-1 三质量分列、A-29 周聚合、R-2 口碑降级、A-28 锚点结构、G-9 破产禁用。 */
function salesRecord(dayIndex: number, units = 10): SalesRecord {
  return {
    id: `SR-P1-${dayIndex}`, productId: 'P-1', dayIndex, marketId: 'JP', platformId: 'home_console_g2',
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

  it('FIX-1 / U1：产品表三质量分列且不合成，口碑档降级为暂无评价', () => {
    const { container } = renderList()
    expect(screen.getByTestId('p10-quality-design').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-quality-implementation').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-quality-completeness').textContent?.trim()).toBe('—')
    expect(screen.getByTestId('p10-reputation-P-1').textContent).toContain('暂无评价')
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

  it('R-2 / ADJ-16 R-2：口碑档降级为暂无评价，不由 reviewScore 推算档位', () => {
    renderDetail()
    const band = screen.getByTestId('p10-reputation-band').textContent ?? ''
    expect(band).toContain('暂无评价')
    for (const fabricated of ['poor', 'mixed', 'positive', '好评', '差评', '毁誉参半']) {
      expect(band).not.toContain(fabricated)
    }
  })

  it('S10-2 / S10-3：退款率取 TUNING 常数，退款额按周聚合，不展示原因明细', () => {
    useGameStore.setState({
      refundBatches: [{
        id: 'RB-1', productId: 'P-1', salesRecordId: 'SR-P1-100', marketId: 'JP', platformId: 'home_console_g2',
        saleDayIndex: 100, refundDayIndex: 101, refundedUnits: 1, refundAmountCents: 2000,
        source: 'auto_window', status: 'posted', idempotencyKey: 'k',
      }],
    } as never)
    renderDetail()
    const summary = screen.getByTestId('p10-refund-summary')
    // ADJ-18 §6：退款率权威值 5%，锁定具体值而非仅含 '%'（07B-06）。
    expect(summary.textContent).toContain('5%')
    expect(summary.textContent).toContain('Day 98–104')
    expect(summary.textContent).not.toMatch(/原因|reason/i)
  })

  it('A-28 CONDITIONAL：定位锚点结构可见（广谱/窄众标签 + 切片列）', () => {
    renderDetail()
    expect(screen.getByTestId('p10-positioning-tags')).toBeTruthy()
    expect(screen.getByTestId('p10-positioning-slices')).toBeTruthy()
    expect(screen.getByTestId('p10-positioning-slices').textContent).toContain('home_console_g2')
  })

  it('归因 fail-closed：无内核支撑原因则不出现归因行', () => {
    renderDetail()
    expect(screen.getByTestId('p10-attribution').textContent).toContain('暂无可归因')
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
