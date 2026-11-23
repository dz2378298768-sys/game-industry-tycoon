import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Market } from '@ui/pages/market'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

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

  it('消费者群体标签云 + 静态竞品档案渲染', () => {
    render(<Market onNavigate={() => {}} />)
    expect(screen.getByTestId('market-segments').textContent).not.toBe('')
    expect(screen.getAllByTestId('market-competitor-card').length).toBeGreaterThan(0)
  })

  it('A-43 + A-5：调研 → 一次性结果卡（竞品条数 + 方向标签）+ 账本流水可追溯', () => {
    const gw = useGameStore.getState().game!
    const company = useGameStore.getState().company!
    const txBefore = gw.finance.getTransactionsByCompany(company.id).length
    render(<Market onNavigate={() => {}} />)
    fireEvent.click(screen.getByTestId('market-research-button'))
    const card = screen.getByTestId('market-research-result')
    expect(card.textContent).toContain('竞品档案条数')
    expect(card.textContent).toMatch(/高契合|中契合|低契合/)
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
