import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CreateCompany } from '@app/create-company'
import { useGameStore } from '@ui/state/game-store'
import { formatDay } from '@i18n'
import { TUNING } from '@content/tuning'

/**
 * P-01 创建公司验收（批次 07A）：
 * A-1 期初现金展示恒等账本期初交易 12_000_000 cents（INV-1 UI 抽查）
 * A-2 页面 DOM 无 $50,000/5_000_000 字面量（grep 断言）
 * A-3 无难度控件（DOM 断言）
 * 附加：模拟起始日、覆盖警告确认、三问引导
 */

const realTuningCash = TUNING.company.startingCashCents

describe('P-01 创建公司页（create-company.tsx 改造）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mockStore(hasSave: boolean) {
    const getHasSave = vi.fn().mockResolvedValue(hasSave)
    const init = vi.fn()
    const createCompany = vi.fn()
    // zustand：直接 patch store 的 action 字段（hook 订阅同一 state）
    useGameStore.setState({ getHasSave, init, createCompany } as never)
    return { getHasSave, init, createCompany }
  }

  it('A-1：固定条件摘要显示初始资金 = TUNING startingCashCents（12_000_000 cents = $120,000）', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const text = container.textContent ?? ''
    expect(realTuningCash).toBe(12_000_000)
    expect(text).toContain('初始资金')
    expect(text).toContain('$120,000')
  })

  it('A-2：DOM 无 $50,000 / 5_000_000 遗留硬编码字面量', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const html = container.innerHTML
    expect(html).not.toContain('$50,000')
    expect(html).not.toContain('5_000_000')
    expect(html).not.toContain('5000000')
  })

  it('A-3：无难度控件；城市下拉不渲染（隐藏入口保留代码）', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.textContent).not.toContain('难度')
  })

  it('开局显示平台和账本共用的模拟日期', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const text = container.textContent ?? ''
    expect(text).toContain(formatDay(0))
    expect(text).toContain('1970-01-01')
    expect(text).not.toContain('2026-01-05')
  })

  it('开局页显示市场选择，底部不再重复三问引导', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const text = container.textContent ?? ''
    expect(screen.getByRole('button', { name: '选择' })).toBeTruthy()
    expect(text).toContain('选择开局市场')
    expect(text).toContain('当地薪资和租金')
    expect(text).toContain('月雀工作室 · 弹珠冲刺')
    expect(text).toContain('北极星互动 · 星际巡航')
    expect(text).toContain('街机之王 · 街头拳王')
    expect(container.querySelectorAll('.welcome-market-option')).toHaveLength(3)
    expect(text).not.toContain('你拥有什么')
    expect(text).not.toContain('你能做什么')
  })

  it('选择日本市场后，以东京作为公司开局城市', async () => {
    const { createCompany } = mockStore(false)
    const { container } = render(<CreateCompany />)
    await waitFor(() => expect(screen.queryByTestId('overwrite-warning')).toBeNull())
    fireEvent.change(screen.getByPlaceholderText('My Game Studio'), { target: { value: 'Acme' } })
    fireEvent.click(container.querySelector('.welcome-market-options button:nth-child(3)')!)
    fireEvent.submit(screen.getByRole('button', { name: /创建工作室|Start a studio/ }).closest('form')!)
    expect(createCompany).toHaveBeenCalledWith('Acme', 'tokyo')
  })

  it('已有存档：覆盖警告确认（M-03 禁态），确认前提交禁用', async () => {
    mockStore(true)
    const { container } = render(<CreateCompany />)
    await waitFor(() => expect(container.querySelector('[data-testid="overwrite-warning"]')).not.toBeNull())
    const submit = screen.getByRole('button', { name: /创建工作室|Start a studio/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(container.querySelector('[data-testid="overwrite-confirm"]')!)
    expect((container.querySelector('button[type="submit"], .btn[type="submit"], form button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('已有存档时可直接继续，读取失败留在开局页并显示原因', async () => {
    const { init, createCompany } = mockStore(true)
    const load = vi.fn().mockResolvedValue(false)
    useGameStore.setState({ load })
    render(<CreateCompany />)
    fireEvent.click(await screen.findByTestId('continue-saved-game'))
    expect(load).toHaveBeenCalledTimes(1)
    expect((await screen.findByRole('alert')).textContent).toContain('无法读取存档')
    expect(init).not.toHaveBeenCalled()
    expect(createCompany).not.toHaveBeenCalled()
    expect(screen.getByTestId('overwrite-warning')).toBeTruthy()
  })

  it('无存档：直接可提交，提交走 init + createCompany（原子动作）', async () => {
    const { init, createCompany } = mockStore(false)
    render(<CreateCompany />)
    await waitFor(() => expect(screen.queryByTestId('overwrite-warning')).toBeNull())
    fireEvent.change(screen.getByPlaceholderText('My Game Studio'), { target: { value: 'Acme' } })
    fireEvent.submit(screen.getByRole('button', { name: /创建工作室|Start a studio/ }).closest('form')!)
    expect(init).toHaveBeenCalledWith(42, { aiCompetition: true })
    expect(createCompany).toHaveBeenCalledWith('Acme', 'san_francisco')
  })

  it('名称为空：行内红字 error.requiredField，不产生半成品实体', async () => {
    const { init, createCompany } = mockStore(false)
    render(<CreateCompany />)
    fireEvent.submit(screen.getByRole('button', { name: /创建工作室|Start a studio/ }).closest('form')!)
    expect(screen.getByText('必填字段缺失')).toBeTruthy()
    expect(init).not.toHaveBeenCalled()
    expect(createCompany).not.toHaveBeenCalled()
  })
})
