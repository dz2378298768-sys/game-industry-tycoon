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
 * 附加：起始日期 Day 0 = 2026-01-05（A-41）、覆盖警告确认（M-03 禁态）、三问引导
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
    expect(html).not.toContain('1970')
  })

  it('A-3：无难度控件；城市下拉不渲染（隐藏入口保留代码）', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.textContent).not.toContain('难度')
  })

  it('A-41：起始日期摘要经 formatDay 单源渲染 Day 0 = 2026-01-05，无并列年份', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const text = container.textContent ?? ''
    expect(text).toContain(formatDay(0))
    expect(formatDay(0)).toContain('2026-01-05')
    expect(text).not.toContain('1978')
  })

  it('三问引导文案存在（拥有什么/能做什么/下一步）', () => {
    mockStore(false)
    const { container } = render(<CreateCompany />)
    const text = container.textContent ?? ''
    expect(text).toContain('你拥有什么')
    expect(text).toContain('你能做什么')
    expect(text).toContain('下一步')
  })

  it('已有存档：覆盖警告确认（M-03 禁态），确认前提交禁用', async () => {
    mockStore(true)
    const { container } = render(<CreateCompany />)
    await waitFor(() => expect(container.querySelector('[data-testid="overwrite-warning"]')).not.toBeNull())
    const submit = screen.getByRole('button', { name: /2026-01-05|开始|Start/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.click(container.querySelector('[data-testid="overwrite-confirm"]')!)
    expect((container.querySelector('button[type="submit"], .btn[type="submit"], form button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('无存档：直接可提交，提交走 init + createCompany（原子动作）', async () => {
    const { init, createCompany } = mockStore(false)
    render(<CreateCompany />)
    await waitFor(() => expect(screen.queryByTestId('overwrite-warning')).toBeNull())
    fireEvent.change(screen.getByPlaceholderText('My Game Studio'), { target: { value: 'Acme' } })
    fireEvent.submit(screen.getByRole('button', { name: /开始|Start/ }).closest('form')!)
    expect(init).toHaveBeenCalledWith(42)
    expect(createCompany).toHaveBeenCalledWith('Acme', 'san_francisco')
  })

  it('名称为空：行内红字 error.requiredField，不产生半成品实体', async () => {
    const { init, createCompany } = mockStore(false)
    render(<CreateCompany />)
    fireEvent.submit(screen.getByRole('button', { name: /开始|Start/ }).closest('form')!)
    expect(screen.getByText('必填字段缺失')).toBeTruthy()
    expect(init).not.toHaveBeenCalled()
    expect(createCompany).not.toHaveBeenCalled()
  })
})
