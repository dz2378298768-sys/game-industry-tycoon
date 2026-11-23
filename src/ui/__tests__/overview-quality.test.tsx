import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Overview } from '@ui/pages/overview'
import { useGameStore } from '@ui/state/game-store'

/**
 * N1 闭环（07A 审核备注 FIX-1）：三质量分列三个 data-testid 补 DOM 断言。
 * FIX-1 整改口径：产品表不得出现合成平均分，三列各自独立（D-02 未接线 → fail-closed '—'）。
 */
describe('FIX-1 产品表三质量分列 DOM 断言（N1 闭环）', () => {
  it('含产品时三列 testid 均存在、各自独立展示缺失态，且无合成平均分列', () => {
    useGameStore.setState({
      company: null,
      employees: [],
      projects: [],
      products: [{
        id: 'PRD-1',
        name: 'Quality Probe',
        genreId: 'action',
      }] as never,
    })
    render(<Overview onNavigate={() => {}} />)

    const design = screen.getByTestId('quality-design')
    const implementation = screen.getByTestId('quality-implementation')
    const completeness = screen.getByTestId('quality-completeness')
    expect(design).toBeTruthy()
    expect(implementation).toBeTruthy()
    expect(completeness).toBeTruthy()
    // 三个独立单元格，不能是同一个合成分数的三处复用
    expect(design).not.toBe(implementation)
    expect(implementation).not.toBe(completeness)
    // D-02 未接线 → 每列 fail-closed '—'，不伪造数值
    expect(design.textContent?.trim()).toBe('—')
    expect(implementation.textContent?.trim()).toBe('—')
    expect(completeness.textContent?.trim()).toBe('—')

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/综合|总评|加权平均|平均分|qualityScore|finalQualityScore/)
  })
})
