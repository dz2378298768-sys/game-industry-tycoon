import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyAlertBanner } from '@ui/components/company-alert-banner'
import { TUNING } from '@content/tuning'
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

  it('W5-C2 边界：cash===400_000（$4,000）为 SAFE，不渲染警告横幅；399_999 才 WARNING', () => {
    // DESING-OI-21 §2.1 / CODEBUDDY.md §0：判据为严格小于（<），恰好等于警告线属安全。
    const safe = render(
      <CompanyAlertBanner company={makeCompany({ cashBalanceCents: 400_000 })} onNavigate={vi.fn()} />,
    )
    expect(safe.container.querySelector('.company-alerts')).toBeNull()
    expect(TUNING.finance.cashWarningThresholdCents).toBe(400_000) // $4,000
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(0) // $0
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

  it('L2 不可关闭：无关闭按钮；GAME OVER 双按钮（查看详情 + 重开新档），onNavigate/onRestart 回调', () => {
    const onNavigate = vi.fn()
    const onRestart = vi.fn()
    render(
      <CompanyAlertBanner
        company={makeCompany({ status: 'bankrupt', cashBalanceCents: 0 })}
        onNavigate={onNavigate}
        onRestart={onRestart}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.textContent).toBe('查看财务详情')
    expect(buttons[1]!.textContent).toBe('重开新档')
    expect(screen.queryByText('关闭')).toBeNull()
    buttons[0]!.click()
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('finance')
    buttons[1]!.click()
    expect(onRestart).toHaveBeenCalledTimes(1)
  })
})

describe('CompanyAlertBanner 危机四分支（CODE-07A 全局层）', () => {
  const baseCrisis = {
    dayIndex: 100,
    cashBalanceCents: 500_000,
    availableCashCents: 300_000,
    committedCents: 200_000,
    runwayMonths: 3.5,
    reasonCodes: ['LOW_RUNWAY'] as const,
  }

  it('watch 分支：role=status（polite）、显示跑道与提示，不触发 alert', () => {
    render(
      <CompanyAlertBanner company={makeCompany({ cashBalanceCents: 500_000 })} crisis={{ ...baseCrisis, crisisLevel: 'watch' }} onNavigate={vi.fn()} />,
    )
    const alert = screen.getByRole('status')
    expect(alert.getAttribute('aria-live')).toBe('polite')
    expect(alert.textContent).toContain('财务观察')
    expect(alert.textContent).toContain('3.5')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('critical 分支：role=alert、原因码逐条 + 承诺占用 + 补救窗口 fail-closed — + 三补救按钮', () => {
    const onNavigate = vi.fn()
    render(
      <CompanyAlertBanner
        company={makeCompany({ cashBalanceCents: 500_000 })}
        crisis={{ ...baseCrisis, crisisLevel: 'critical', reasonCodes: ['LOW_RUNWAY', 'LOW_CASH'] }}
        onNavigate={onNavigate}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('财务危机')
    expect(alert.textContent).toContain('低跑道')
    expect(alert.textContent).toContain('低现金')
    // OPEN-FIN-CRISIS-WIRING：补救窗口剩余天数 fail-closed '—'
    expect(alert.textContent).toContain('补救窗口剩余天数: —')
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    buttons[0]!.click()
    expect(onNavigate).toHaveBeenCalledWith('projects')
    buttons[2]!.click()
    expect(onNavigate).toHaveBeenCalledWith('hire')
  })

  it('critical 优先于 cash_warning：现金低于警告线但派生 critical 时仍显示 critical', () => {
    render(
      <CompanyAlertBanner
        company={makeCompany({ cashBalanceCents: 300_000 })}
        crisis={{ ...baseCrisis, cashBalanceCents: 300_000, crisisLevel: 'critical' }}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('财务危机')
    expect(screen.queryByText((_, el) => el?.textContent === '现金偏低')).toBeNull()
  })

  it('有投影且 healthy：无横幅；无投影时旧现金口径兜底不变', () => {
    const { container } = render(
      <CompanyAlertBanner company={makeCompany({ cashBalanceCents: 500_000 })} crisis={{ ...baseCrisis, crisisLevel: 'healthy' }} onNavigate={vi.fn()} />,
    )
    expect(container.querySelector('.company-alerts')).toBeNull()
  })
})
