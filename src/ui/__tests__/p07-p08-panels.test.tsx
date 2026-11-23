import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDetail } from '@ui/pages/project-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/** P-07/P-08 验收：A-17/A-18 U4 预估前置、A-20 三质量不合成、A-21 fail-closed。 */
describe('P-07 变更返工 + P-08 测试优化面板（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const r = useGameStore.getState().createExecutionProject({ name: 'Proj X', genreId: 'action', hrb: 0.45, budgetCapacityCents: 2_000_000 })
    expect(r.success).toBe(true)
  })

  function renderDetail() {
    const projectId = useGameStore.getState().projects[0]!.id
    return render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
  }

  it('P-07/P-08 面板在项目详情页内可达（进入条件：非终态项目）', () => {
    renderDetail()
    expect(screen.getByTestId('p07-change-panel')).toBeTruthy()
    expect(screen.getByTestId('p08-test-panel')).toBeTruthy()
  })

  it('A-18 U4：返工预估弹窗先于确认出现，四项预估齐全，确认按钮禁用', () => {
    // 返工变更仅对开发中（PRODUCTION/QA）项目开放：CONCEPT → PRE_PRODUCTION → PRODUCTION
    const projectId = useGameStore.getState().projects[0]!.id
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    renderDetail()
    // 确认弹窗初始不存在
    expect(screen.queryByTestId('p07-rework-estimate')).toBeNull()
    fireEvent.click(screen.getByTestId('p07-open-estimate'))
    const estimate = screen.getByTestId('p07-rework-estimate')
    expect(estimate).toBeTruthy()
    expect(screen.getByTestId('p07-estimate-units').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p07-estimate-sunk').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p07-estimate-band').textContent).not.toBe('')
    expect(screen.getByTestId('p07-estimate-delay').textContent).toContain('评估不可用')
    const confirm = screen.getByTestId('p07-rework-confirm')
    expect(confirm.hasAttribute('disabled')).toBe(true)
    expect(confirm.getAttribute('aria-disabled')).toBe('true')
  })

  it('A-20 U1：三质量列分列渲染且"评估不可用"，页面无合成词', () => {
    const { container } = renderDetail()
    expect(screen.getByTestId('p08-quality-design').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p08-quality-implementation').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p08-quality-completeness').textContent).toContain('评估不可用')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/综合|总评|加权平均|qualityScore|finalQualityScore|qualityCeiling|mean\(/)
  })

  it('A-21：缺陷明细 fail-closed 降级，不伪造 E 级缺陷横幅', () => {
    renderDetail()
    expect(screen.getByTestId('p08-defect-list').textContent).toContain('缺陷明细待接线')
    expect(screen.queryByTestId('p08-e-defect-banner')).toBeNull()
  })

  it('P-08 优化动作禁用且带原因文案（G-9）', () => {
    renderDetail()
    const btn = screen.getByTestId('p08-optimize')
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(btn.getAttribute('title')).toContain('OPEN-D02-WIRING')
  })
})
