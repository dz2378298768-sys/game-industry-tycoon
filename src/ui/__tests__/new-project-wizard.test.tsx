import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NewProject } from '@ui/pages/new-project'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import { TUNING } from '@content/tuning'

/**
 * P-03/P-04 立项两步向导验收（批次 07A）：
 * A-6 步 2 走查（HRB → Budget_cap → 确认成功）
 * A-7 立项后账本交易数不变（红线 R3：承诺不改现金）
 * A-8 Σ project_budget 承诺额 = Budget_cap（TC-22）
 * A-9 DOM 无 Infinity（团队 0 场景）
 * A-10 DOM 无优先级列
 * A-39 全页面 grep qualityCeilingBand|质量上限 零命中（U5）
 * A-40 锁定后快照含 targetSegmentClaims、玩法模块、产品名称三输入
 */

describe('P-03/P-04 立项两步向导', () => {
  function boot(bankrupt = false) {
    const gw = createGameWorld(42)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    if (bankrupt) (company as unknown as { status: string }).status = 'bankrupt'
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    return gw
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    useGameStore.getState().setLocale('zh-CN')
  })

  function goStep2() {
    render(<NewProject onNavigate={vi.fn()} />)
    expect(screen.getByTestId('wizard-step').textContent).toContain('1')
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'Star Quest' } })
    fireEvent.click(screen.getByTestId('segment-multiselect').querySelector('input')!)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    expect(screen.getByTestId('wizard-step').textContent).toContain('2')
  }

  function enablePcAudience() {
    const inputs = screen.getByTestId('segment-multiselect').querySelectorAll('input')
    fireEvent.click(inputs[2]!)
  }

  it('P-03：HRB 两档 radio（0.45 默认 / 0.6），锁定生成快照（A-40）', () => {
    boot()
    render(<NewProject onNavigate={vi.fn()} />)
    expect(TUNING.project.hrbConservativeRatio).toBe(0.45)
    expect(TUNING.project.hrbStandardRatio).toBe(0.6)
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'Star Quest' } })
    fireEvent.click(screen.getByTestId('segment-multiselect').querySelector('input')!)
    // A-40：五要素摘要含 名称/目标用户/模块组合/方案
    const summary = screen.getByTestId('five-elements-summary').textContent ?? ''
    expect(summary).toContain('Star Quest')
    expect(summary).toContain('目标用户')
    expect(summary).toContain('模块组合')
    // 模块槽位 fail-closed（OPEN-CONTENT-MODULES），不伪造
    expect(screen.getByTestId('module-slots-failclosed').textContent).toContain('OPEN-CONTENT-MODULES')
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    expect(screen.getByTestId('wizard-step').textContent).toContain('2')
  })

  it('名称为空禁止锁定（E-EMPTY 逐条报因，R-COM-7）', () => {
    boot()
    render(<NewProject onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    expect(screen.getByTestId('lock-snapshot').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByTestId('wizard-step').textContent).toContain('1')
  })

  it('A-6：P-04 Budget_cap 双写联动 + 确认立项成功（HRB 0.45）', () => {
    boot()
    goStep2()
    fireEvent.change(screen.getByTestId('budget-capacity'), { target: { value: '20000' } })
    const cap = screen.getByTestId('budget-cap').textContent ?? ''
    expect(cap).toContain('$9,000')
    expect(cap).toContain('900000')
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'Proj Alpha' } })
    fireEvent.click(screen.getByTestId('confirm-create'))
    // 立项成功 → project_budget 承诺 Σ = Budget_cap（A-8）
    const gw = useGameStore.getState().game!
    const companyId = gw.getPlayerCompany()!.id
    const sum = gw.finance.getLedger()
      .getCommitments(companyId)
      .filter(c => c.sourceType === 'project_budget')
      .reduce((s, c) => s + c.amountCents, 0)
    expect(sum).toBe(9_000_00)
    expect(useGameStore.getState().monthlySalaryCommitmentCents()).toBeGreaterThanOrEqual(0)
  })

  it('A-7：立项后账本交易数不变（承诺不改现金，红线 R3）', () => {
    const gw = boot()
    const companyId = gw.getPlayerCompany()!.id
    const txCountBefore = gw.finance.getTransactionsByCompany(companyId).length
    goStep2()
    fireEvent.change(screen.getByTestId('budget-capacity'), { target: { value: '20000' } })
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'Proj Beta' } })
    fireEvent.click(screen.getByTestId('confirm-create'))
    const txCountAfter = gw.finance.getTransactionsByCompany(companyId).length
    expect(txCountAfter).toBe(txCountBefore)
  })

  it('A-9：团队 0 场景 DOM 无 Infinity，显示"暂不可估"；A-10 无优先级列', () => {
    boot()
    goStep2()
    const html = document.body.innerHTML
    expect(html).not.toContain('Infinity')
    expect(screen.getByTestId('cost-est').textContent).toContain('暂不可估')
    expect((screen.getByTestId('wp-preview').textContent ?? '')).not.toContain('优先级')
  })

  it('A-39：全页面无 qualityCeilingBand / 质量上限 字样（U5）', () => {
    boot()
    const { container } = render(<NewProject onNavigate={vi.fn()} />)
    expect(container.textContent).not.toContain('qualityCeilingBand')
    expect(container.textContent).not.toContain('质量上限')
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'Star Quest' } })
    fireEvent.click(screen.getByTestId('segment-multiselect').querySelector('input')!)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    expect(document.body.textContent).not.toContain('qualityCeilingBand')
    expect(document.body.textContent).not.toContain('质量上限')
  })

  it('预算容量超出可用现金：PROJ_BUDGET_CAPACITY_EXCEEDS_CASH 拒绝（M-01）', () => {
    boot()
    goStep2()
    fireEvent.change(screen.getByTestId('budget-capacity'), { target: { value: '5000000' } })
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'Proj Gamma' } })
    fireEvent.click(screen.getByTestId('confirm-create'))
    expect(document.body.textContent).toContain('PROJ_BUDGET_CAPACITY_EXCEEDS_CASH')
  })

  it('破产禁入（C-3/N-01）：aria-disabled + finance.bankrupt.blocked.create', () => {
    boot(true)
    render(<NewProject onNavigate={vi.fn()} />)
    expect(document.body.textContent).toContain('公司已破产，无法创建新项目')
    const lock = screen.getByTestId('lock-snapshot') as HTMLButtonElement
    expect(lock.disabled).toBe(true)
    expect(lock.getAttribute('aria-disabled')).toBe('true')
  })

  it('REC-03：内容模块卡可见，并显示内核分解工作量与内容包', () => {
    boot()
    useGameStore.setState({ dayIndex: 6000 })
    render(<NewProject onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'Module Showcase' } })
    enablePcAudience()

    const contentCard = screen.getByTestId('module-card-MOD-CONTENT-EPISODES')
    expect(contentCard.textContent).toContain('章节内容')
    expect(contentCard.textContent).toContain('提供可交付的章节内容')
    expect(contentCard.textContent).toContain('PACK-EPISODES-P1')
    expect(screen.getByTestId('module-workload-MOD-CONTENT-EPISODES').textContent).toContain('设计:')
    expect(screen.getByTestId('module-audience-MOD-CORE-ACTION').textContent).toContain('核心玩家')
  })

  it('REC-03：选择成长模块会改变四学科派生工作量和核心玩家亲和度', () => {
    boot()
    useGameStore.setState({ dayIndex: 6000 })
    render(<NewProject onNavigate={vi.fn()} />)
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'Progression Check' } })
    enablePcAudience()

    const workBefore = screen.getByTestId('module-impact-work').textContent ?? ''
    const audienceBefore = screen.getByTestId('module-impact-audience').textContent ?? ''
    fireEvent.click(screen.getByTestId('module-card-MOD-SYSTEM-PROGRESSION').querySelector('input')!)
    const workAfter = screen.getByTestId('module-impact-work').textContent ?? ''
    const audienceAfter = screen.getByTestId('module-impact-audience').textContent ?? ''

    expect(workAfter).not.toBe(workBefore)
    expect(audienceAfter).not.toBe(audienceBefore)
    expect(screen.getByTestId('module-impact-audience').textContent).not.toContain('未选择成长支援模块')
    expect(screen.getByTestId('module-workload-MOD-SYSTEM-PROGRESSION').textContent).toContain('设计:')
  })

  it('REC-03：英文模块区域不包含裸中文文案', () => {
    boot()
    useGameStore.getState().setLocale('en')
    const { unmount } = render(<NewProject onNavigate={vi.fn()} />)
    expect(screen.getByTestId('module-selection').textContent).not.toMatch(/[\u4e00-\u9fff]/)
    unmount()
    useGameStore.getState().setLocale('zh-CN')
  })
})
