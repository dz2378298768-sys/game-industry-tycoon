import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyAlertBanner } from '@ui/components/company-alert-banner'
import { makeCompany } from './fixtures'

describe('CompanyAlertBanner 槽位 A 优先级（DESIGN-UI-LAYER §2.1 / V1~V4）', () => {
  it('正常状态不渲染任何横幅', () => {
    const { container } = render(
      <CompanyAlertBanner company={makeCompany({ cashBalanceCents: 1_000_000 })} onNavigate={vi.fn()} />,
    )
    expect(container.querySelector('.company-alerts')).toBeNull()
  })

  it('仅现金警告：L1 role=status，显示当前值与阈值', () => {
    // 399_999 严格低于阈值 400_000（$4,000）→ WARNING；规格 §2.1：cash===400_000 属 SAFE
    render(<CompanyAlertBanner company={makeCompany({ cashBalanceCents: 399_999 })} onNavigate={vi.fn()} />)
    const alert = screen.getByRole('status')
    expect(alert.getAttribute('aria-live')).toBe('polite')
    expect(alert.textContent).toContain('现金偏低')
    expect(alert.textContent).toContain('$4,000')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('破产 + 现金警告 + 解散标记同时存在：只显示最高级 DISSOLVED', () => {
    render(
      <CompanyAlertBanner
        company={makeCompany({ status: 'dissolved', cashBalanceCents: -1, budgetExhausted: true } as never)}
        onNavigate={vi.fn()}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('公司已解散')
    expect(alert.textContent).not.toContain('公司已破产')
    expect(alert.textContent).not.toContain('现金偏低')
  })

  it('破产 + 现金警告同时存在：只显示 L2 BANKRUPT（抑制 L1）', () => {
    render(
      <CompanyAlertBanner
        company={makeCompany({ status: 'bankrupt', cashBalanceCents: -50_000 })}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('公司已破产')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('L2 不可关闭：不存在关闭按钮；onNavigate 点击回调', () => {
    const onNavigate = vi.fn()
    render(
      <CompanyAlertBanner
        company={makeCompany({ status: 'bankrupt', cashBalanceCents: 0 })}
        onNavigate={onNavigate}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.textContent).toBe('查看财务详情')
    expect(screen.queryByText('关闭')).toBeNull()
    buttons[0]!.click()
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
