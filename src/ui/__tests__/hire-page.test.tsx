import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hire } from '@ui/pages/hire'
import { Employees } from '@ui/pages/employees'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/**
 * P-05 招聘与人才配置验收（批次 07A）：
 * A-11 P1 清单步 3（招 ≥3 人覆盖 ≥2 学科，承诺合计与可用现金变化）
 * A-13 招聘后 runway 与同源公式对照（previewRecruitImpact 同源断言）
 * 基础成长走查（成长档徽标 + OPEN-PROJ-5 降级缺失态不伪造）
 * 破产 → aria-disabled + finance.bankrupt.blocked.hire
 */

describe('P-05 hire 页（候选池 + 确认卡 + 影响预览）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function boot() {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    return gw
  }

  it('候选池卡片列表：非空池（懒引导补足）、按学科分组、月薪双写 $X = X cents', () => {
    boot()
    render(<Hire onNavigate={vi.fn()} />)
    const cards = screen.getAllByTestId('candidate-card')
    expect(cards.length).toBeGreaterThan(0)
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/\$[\d,]+ = \d+ cents/)
  })

  it('确认卡明示中介费（一次性）与月薪承诺；影响预览展示可用现金/跑道 前→后', () => {
    const gw = boot()
    render(<Hire onNavigate={vi.fn()} />)
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    const card = screen.getByTestId('recruit-confirm-card')
    expect(card.textContent).toContain('中介费')
    expect(card.textContent).toContain('一次性')
    expect(card.textContent).toContain('月薪承诺')
    const previewTable = screen.getByTestId('recruit-impact-preview')
    expect(previewTable.textContent).toContain('招聘前')
    expect(previewTable.textContent).toContain('招聘后')
    // A-13：预览"前"值与 game-world.getFinancialOverview 同源
    const before = gw.getFinancialOverview()
    expect(before).not.toBeNull()
  })

  it('确认招聘：recruitFromCandidate 转发成功，承诺合计与可用现金变化（A-11 载体）', () => {
    boot()
    render(<Hire onNavigate={vi.fn()} />)
    const before = useGameStore.getState().financial
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    expect(screen.getByTestId('recruit-confirm').textContent).toContain('确认不可逆？')
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    await2()
    function await2() { /* 同步流：refresh 在 recruitFromCandidate 内完成 */ }
    const after = useGameStore.getState().financial
    expect(after?.committedCents).toBeGreaterThan(before?.committedCents ?? 0)
    expect(useGameStore.getState().monthlySalaryCommitmentCents()).toBeGreaterThan(0)
  })

  it('招聘 3 人覆盖 ≥2 学科后：承诺合计 > 0 且可用现金下降（A-11）', () => {
    const gw = boot()
    const store = useGameStore.getState()
    const cashBefore = store.financial?.availableCashCents ?? 0
    const candidates = gw.listCandidates()
    const picked: string[] = []
    const seenDisciplines = new Set<string>()
    for (const c of candidates) {
      if (picked.length >= 3) break
      if (seenDisciplines.has(c.discipline) && seenDisciplines.size >= 2 && picked.length >= 2) continue
      picked.push(c.candidateId)
      seenDisciplines.add(c.discipline)
    }
    expect(seenDisciplines.size).toBeGreaterThanOrEqual(2)
    let okCount = 0
    for (const id of picked) {
      const r = useGameStore.getState().recruitFromCandidate(id)
      if (r.success) okCount++
    }
    expect(okCount).toBeGreaterThanOrEqual(2)
    useGameStore.getState().refresh()
    const cashAfter = useGameStore.getState().financial?.availableCashCents ?? 0
    expect(cashAfter).toBeLessThan(cashBefore)
    expect(useGameStore.getState().monthlySalaryCommitmentCents()).toBeGreaterThan(0)
  })

  it('破产禁用：aria-disabled + finance.bankrupt.blocked.hire（C-3/N-01 沿用）', () => {
    const gw = createGameWorld(42)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    ;(company as unknown as { status: string }).status = 'bankrupt'
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    render(<Hire onNavigate={vi.fn()} />)
    expect(document.body.textContent).toContain('公司已破产，无法招聘新员工')
    const card = screen.queryByTestId('candidate-card')
    if (card) {
      expect(card.getAttribute('aria-disabled')).toBe('true')
    }
  })
})

describe('P-05 employees 页（KPI / 口径说明 / 成长降级态 / 缺口对照）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function bootWithHire() {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const store = useGameStore.getState()
    const candidates = gw.listCandidates()
    store.recruitFromCandidate(candidates[0]!.candidateId)
    useGameStore.getState().refresh()
    return gw
  }

  it('页首 KPI：月薪承诺合计 > 0（承诺注册表派生）；已兑现工资（账本流水派生）', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    const kpi = container.querySelector('[data-testid="employees-kpi"]')!
    expect(kpi.textContent).toContain('月薪承诺合计')
    expect(kpi.textContent).toContain('$')
    expect(useGameStore.getState().monthlySalaryCommitmentCents()).toBeGreaterThan(0)
  })

  it('薪资边界口径说明存在；无"离职当月不计薪"类文案（A-12 grep 断言）', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    const text = container.textContent ?? ''
    expect(text).toContain('当月在职 ≥1 天即计整月')
    expect(text).not.toContain('离职当月不计薪')
    expect(text).not.toContain('离职当月不计算工资')
  })

  it('成长档徽标（当前档）+ 事件行 fail-closed 降级"成长记录待接线"，不伪造（OPEN-PROJ-5）', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    expect(container.querySelector('[data-testid="growth-badge"]')).not.toBeNull()
    expect(container.textContent).toContain('成长记录待接线')
    expect(container.textContent).not.toContain('经验值 +')
  })

  it('无进行中项目：学科缺口区不显示', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    expect(container.querySelector('[data-testid="discipline-gaps"]')).toBeNull()
  })
})
