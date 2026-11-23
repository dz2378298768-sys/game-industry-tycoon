import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DescopeDialog } from '@ui/components/descope-dialog'
import { selectDescopeTiers } from '@ui/components/project-actions'
import { makeCompany, makeUiProject } from './fixtures'

const daily = { design: 5, programming: 5, art: 5, qa: 5 }

describe('DIALOG-DESCOPE（DESIGN-C-01 §3.2 / V20~V22）', () => {
  it('三档位逐档可用；累计超过 50% 的档位禁用', () => {
    const project = makeUiProject({ scopeCutRatio: 0.3 })
    render(
      <DescopeDialog
        project={project}
        company={makeCompany()}
        daily={daily}
        dailyBurnCents={10_000}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect((within(dialog).getByText('−10%').closest('button') as HTMLButtonElement).disabled).toBe(false)
    expect((within(dialog).getByText('−20%').closest('button') as HTMLButtonElement).disabled).toBe(false)
    const capped = within(dialog).getByText('−30%').closest('button') as HTMLButtonElement
    expect(capped.disabled).toBe(true)
    expect(capped.getAttribute('aria-disabled')).toBe('true')
    expect(capped.getAttribute('title')).toContain('50%')
  })

  it('已达累计上限 50% 时三档全部禁用', () => {
    const project = makeUiProject({ scopeCutRatio: 0.5 })
    expect(selectDescopeTiers(project).every(tier => !tier.enabled)).toBe(true)
    render(
      <DescopeDialog
        project={project}
        company={makeCompany()}
        daily={daily}
        dailyBurnCents={10_000}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    for (const pct of ['−10%', '−20%', '−30%']) {
      expect((screen.getByText(pct).closest('button') as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('选择档位后展示实时预览、累计值与不可逆警示；二次确认后回调', () => {
    const onConfirm = vi.fn()
    render(
      <DescopeDialog
        project={makeUiProject({ scopeCutRatio: 0.1 })}
        company={makeCompany()}
        daily={daily}
        dailyBurnCents={10_000}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('砍范围不可逆')

    fireEvent.click(within(dialog).getByText('−20%'))
    expect(dialog.textContent).toContain('本次削减 20%，累计 30%')
    expect(dialog.textContent).toContain('预计节省')
    expect(dialog.textContent).toContain('砍范围后五维质量目标（逐项，不合成）')
    expect(dialog.textContent).toContain('玩法')
    expect(dialog.textContent).toContain('54')

    const confirm = within(dialog).getByRole('button', { name: '砍范围' })
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认不可逆？' }))
    expect(onConfirm).toHaveBeenCalledWith(0.2)
  })

  it('QA 阶段提示 Q&A 进度重置，取消了 QA 工作回滚', () => {
    render(
      <DescopeDialog
        project={makeUiProject({ phase: 'QA' })}
        company={makeCompany()}
        daily={daily}
        dailyBurnCents={10_000}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('QA 进度将重置')
    fireEvent.click(within(dialog).getByText('−10%'))
    expect(dialog.textContent).toContain('QA 进度将重置')
  })

  it('破产时仍可砍范围，并提示自救', () => {
    render(
      <DescopeDialog
        project={makeUiProject()}
        company={makeCompany({ status: 'bankrupt' })}
        daily={daily}
        dailyBurnCents={10_000}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog').textContent).toContain('破产状态下仍可砍范围自救')
    expect((screen.getByText('−10%').closest('button') as HTMLButtonElement).disabled).toBe(false)
  })
})
