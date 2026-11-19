import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../../i18n/en.json'
import zhCN from '../../i18n/zh-CN.json'
import { setLocale, t } from '../../i18n'
import { ERROR_I18N } from '@ui/state/game-store'
import { Products } from '@ui/pages/products'
import { ProductDetail } from '@ui/pages/product-detail'

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    products: [] as any[],
    refundBatches: [] as any[],
    marketingCampaigns: [] as any[],
    publishingContracts: [] as any[],
    dayIndex: 120,
    setProductPrice: vi.fn(() => ({ success: true, message: '价格已更新' })),
    applyProductDiscount: vi.fn(() => ({ success: true, message: '折扣已更新' })),
    retireProduct: vi.fn(() => ({ success: true, message: '已退市' })),
    setMarketingBudget: vi.fn(() => ({ success: true, message: '营销预算已更新' })),
    signRevenueShare: vi.fn(() => ({ success: true, message: '合同已签署' })),
    signMilestone: vi.fn(() => ({ success: true, message: '合同已签署' })),
    toast: vi.fn(),
  },
}))

vi.mock('@ui/state/game-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@ui/state/game-store')>()
  return { ...actual, useGameStore: () => mockStore }
})

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'PROJ-001',
    name: 'Test Game',
    lifecycleStage: 'launch',
    status: 'active',
    launchDay: 100,
    launchPriceCents: 2000,
    pricePerUnitCents: 2000,
    discountRatePercent: 0,
    awarenessByMarket: { JP: 0.1, NA: 0.4 },
    salesByPeriod: [
      { id: 'SR-1', dayIndex: 100, marketId: 'JP', platformId: 'home_console_g2', grossUnits: 10, unitPriceAtSaleCents: 2000, grossRevenueCents: 20_000, platformFeeCents: 6_000, netSalesRevenueCents: 14_000, estimatedRefundUnits: 0, actualRefundUnits: 0 },
    ],
    ...overrides,
  }
}

const refund = (overrides: Record<string, unknown> = {}) => ({
  id: 'RB-1', productId: 'PROJ-001', salesRecordId: 'SR-1', marketId: 'JP', platformId: 'home_console_g2',
  saleDayIndex: 100, refundDayIndex: 110, refundedUnits: 1, refundAmountCents: 2000,
  source: 'auto_window', status: 'posted', idempotencyKey: 'customer-refund:RB-1',
  ...overrides,
})

beforeEach(() => {
  setLocale('zh-CN')
  mockStore.products = []
  mockStore.refundBatches = []
  mockStore.marketingCampaigns = []
  mockStore.publishingContracts = []
  vi.clearAllMocks()
})

describe('M2-G 产品列表', () => {
  it('G01 渲染产品名与生命周期文案', () => {
    mockStore.products = [product()]
    render(<Products onNavigate={vi.fn()} />)
    expect(screen.getByText('Test Game')).toBeTruthy()
    expect(screen.getByText('上市期')).toBeTruthy()
  })

  it('G02 净收入不含 pending 退款', () => {
    mockStore.products = [product()]
    mockStore.refundBatches = [refund(), refund({ id: 'RB-2', status: 'pending', refundAmountCents: 5000 })]
    render(<Products onNavigate={vi.fn()} />)
    // 14,000 − 2,000 = 12,000 分 = $120
    expect(screen.getByText('$120')).toBeTruthy()
  })

  it('G03 净收入扣 posted 退款（按实际金额，不按件数×单价）', () => {
    mockStore.products = [product({ pricePerUnitCents: 1500 })]
    // 退款实际金额 1,200 ≠ 1 件×单价 1,500：口径必须按实际金额，按件数×单价会算成 $125
    mockStore.refundBatches = [refund({ refundAmountCents: 1200 })]
    render(<Products onNavigate={vi.fn()} />)
    expect(screen.getByText('$128')).toBeTruthy()
  })

  it('G04 空态引导文案', () => {
    render(<Products onNavigate={vi.fn()} />)
    expect(screen.getByText(/还没有产品/)).toBeTruthy()
  })

  it('G12 认知度取各市场最大值', () => {
    mockStore.products = [product()]
    render(<Products onNavigate={vi.fn()} />)
    expect(screen.getByText('40%')).toBeTruthy()
  })

  it('G15 点击产品跳转详情并携带 id', () => {
    const onNavigate = vi.fn()
    mockStore.products = [product()]
    render(<Products onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText('Test Game'))
    expect(onNavigate).toHaveBeenCalledWith('productDetail', 'PROJ-001')
  })
})

describe('M2-G 产品详情', () => {
  beforeEach(() => { mockStore.products = [product()] })

  it('G05 退款表展示状态与缺失记录标记', () => {
    mockStore.refundBatches = [refund(), refund({ id: 'RB-3', salesRecordId: 'gone' })]
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    expect(screen.getAllByText('已入账').length).toBe(2)
    expect(screen.getByText(/记录缺失/)).toBeTruthy()
  })

  it('G06 改价按元→分提交', () => {
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('定价 / 改价'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: '定价 / 改价' }))
    expect(mockStore.setProductPrice).toHaveBeenCalledWith('PROJ-001', 2500)
  })

  it('G07 折扣提交整数百分比', () => {
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('%'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('设置折扣（0 取消）'))
    expect(mockStore.applyProductDiscount).toHaveBeenCalledWith('PROJ-001', 20)
  })

  it('G08 退市按钮调用', () => {
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByText('退市'))
    expect(mockStore.retireProduct).toHaveBeenCalledWith('PROJ-001')
  })

  it('G09 营销预算三渠道按元→分提交', () => {
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    const inputs = screen.getAllByPlaceholderText('预算（元/天）')
    fireEvent.change(inputs[0]!, { target: { value: '100' } })
    fireEvent.click(screen.getAllByText('应用')[0]!)
    expect(mockStore.setMarketingBudget).toHaveBeenCalledWith('PROJ-001', 'social', 10_000)
  })

  it('G10 签约失败走 toast(error)', () => {
    mockStore.signRevenueShare = vi.fn(() => ({ success: false, message: '该产品已有同类型生效合同。' }))
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByText('签分成合同'))
    expect(mockStore.toast).toHaveBeenCalledWith('该产品已有同类型生效合同。', 'error')
  })

  it('G11 合同已结为负值时正常展示', () => {
    mockStore.publishingContracts = [{
      id: 'CT-1', productId: 'PROJ-001', type: 'revenue_share', ratePercent: 10,
      signedDay: 100, durationDays: null, status: 'active', settledCents: -500, version: 1, createdAt: 100, updatedAt: 110,
    }]
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    expect(screen.getByText('-$5')).toBeTruthy()
  })

  it('G_market 未定价产品显示未定价且可定价', () => {
    mockStore.products = [product({ launchPriceCents: null, pricePerUnitCents: undefined })]
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    expect(screen.getAllByText(/未定价/).length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: '定价 / 改价' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('G_retired 退市后价格控件禁用', () => {
    mockStore.products = [product({ status: 'retired' })]
    render(<ProductDetail productId="PROJ-001" onNavigate={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: '定价 / 改价' }) as HTMLButtonElement[]
    expect(buttons[0]!.disabled).toBe(true)
    expect((screen.getByText('退市') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('M2-G i18n', () => {
  it('G13 14 个新错误码全部有双语映射且不出原始码', () => {
    const codes = ['PRICE_COOLDOWN','PRICE_RANGE','PRICE_DISCOUNT_RANGE','PRICE_LIFECYCLE_LOCKED','LIFECYCLE_NOT_ELAPSED','PRD_NOT_FOUND','MARKETING_PRODUCT_NOT_FOUND','MARKETING_PRODUCT_NOT_ACTIVE','MARKETING_BUDGET_OUT_OF_RANGE','CONTRACT_PRODUCT_NOT_LAUNCHED','CONTRACT_RATE_OUT_OF_RANGE','CONTRACT_THRESHOLD_OUT_OF_RANGE','CONTRACT_ALREADY_ACTIVE','CONTRACT_NOT_FOUND']
    const zh = zhCN as Record<string, string>
    const enDict = en as Record<string, string>
    for (const code of codes) {
      const key = ERROR_I18N[code]
      expect(key).toBeTruthy()
      expect(zh[key!]).toBeTruthy()
      expect(enDict[key!]).toBeTruthy()
      expect(zh[key!]).not.toBe(code)
    }
  })

  it('G14 双语切换后导航与页面文案变化', () => {
    expect(t('nav.products')).toBe('产品')
    setLocale('en')
    expect(t('nav.products')).toBe('Products')
    expect(t('products.title')).toBe('Products & Sales')
    setLocale('zh-CN')
  })
})
