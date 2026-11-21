import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DelayLaunchDialog } from '@ui/components/delay-launch-dialog'
import { computeDelayPreview } from '@ui/components/delay-preview'
import { makeCompany, makeEmployee, makeUiProject } from './fixtures'

const employee = makeEmployee({ salaryMonthlyCents: 100_000 })

describe('DIALOG-DELAY（DESIGN-C-02 §3 / V23~V24）', () => {
  it('品牌预览：按延期点数扣减（30 天扣 1 点），不展示转化率损失', () => {
    const company = makeCompany({ brand: 60, cashBalanceCents: 1_000_000, monthlyFixedExpenseCents: 300_000 })
    render(
      <DelayLaunchDialog
        project={makeUiProject()}
        company={company}
        employees={[employee]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText(/\+30/))
    expect(dialog.textContent).toContain('品牌 60 → 59')
    expect(dialog.textContent).not.toContain('转化率损失')
    expect(dialog.textContent).toContain('（实际扣减 1）')
  })

  it('现金预览：固定成本 × 月数，明确标注估算值并给出延期后现金', () => {
    const company = makeCompany({ brand: 60, cashBalanceCents: 1_000_000, monthlyFixedExpenseCents: 300_000 })
    render(
      <DelayLaunchDialog
        project={makeUiProject()}
        company={company}
        employees={[employee]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText(/\+30/))
    expect(dialog.textContent).toContain('约 1 个月固定成本')
    expect(dialog.textContent).toContain('$3,100')
    expect(dialog.textContent).toContain('（估算值）')
    expect(dialog.textContent).toContain('延期后现金 $6,900')
  })

  it('延期后现金可能为负：使用负数样式', () => {
    const company = makeCompany({ brand: 60, cashBalanceCents: 100_000, monthlyFixedExpenseCents: 300_000 })
    const { container } = render(
      <DelayLaunchDialog
        project={makeUiProject()}
        company={company}
        employees={[employee]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText(/\+30/))
    expect(container.textContent).toContain('延期后现金 -$2,100')
    expect(container.querySelector('.negative')).not.toBeNull()
  })

  it('三档位按 original×1.5 上限逐档禁用，并显示累计与上限', () => {
    const project = makeUiProject({ plannedLaunchDay: 200, originalPlannedLaunchDay: 200, launchDelayDays: 60 })
    // 200 + 90 = 290 ≤ 300，三档均可用
    render(
      <DelayLaunchDialog
        project={project}
        company={makeCompany()}
        employees={[employee]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByText(/\+90/).closest('button') as HTMLButtonElement).disabled).toBe(false)
    expect(dialog.textContent).toContain('最多延至第 300 天')
    expect(dialog.textContent).toContain('已累计延期 60 天')
  })

  it('新上市日预览与内联二次确认', () => {
    const onConfirm = vi.fn()
    render(
      <DelayLaunchDialog
        project={makeUiProject({ plannedLaunchDay: 200 })}
        company={makeCompany()}
        employees={[employee]}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText(/\+60/))
    expect(dialog.textContent).toContain('上市日：第 200 天 → 第 260 天')
    fireEvent.click(within(dialog).getByRole('button', { name: '延期上市' }))
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认延期？' }))
    expect(onConfirm).toHaveBeenCalledWith(60)
  })

  it('纯函数：惩罚点数与现金预测不随选择档位漂移（按 §2.5 点位扣减）', () => {
    const company = makeCompany({ brand: 80, cashBalanceCents: 1_000_000, monthlyFixedExpenseCents: 300_000 })
    const preview = computeDelayPreview(makeUiProject(), company, [employee], 30)
    expect(preview.brandPenalty).toBe(1)
    expect(preview.applyPenalty).toBe(1)
    expect(preview.newBrand).toBe(79)
    expect(preview.extraMonths).toBe(1)
    expect(preview.extraBurnCents).toBe(310_000)
    expect(preview.predictedCashCents).toBe(690_000)
  })
})
