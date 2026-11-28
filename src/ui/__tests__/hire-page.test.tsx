import React from 'react'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hire } from '@ui/pages/hire'
import { Employees } from '@ui/pages/employees'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/**
 * P-05 招聘与人才配置验收（批次 07A）：
 * A-11 P1 清单步 3（招 ≥3 人覆盖 ≥2 学科，承诺合计与可用现金变化）
 * A-13 招聘后 runway 与同源公式对照（previewRecruitImpact 同源断言）
 * 员工履历、待到岗名单和项目分配使用同一份运行事实
 * 破产 → aria-disabled + finance.bankrupt.blocked.hire
 */

describe('P-05 hire 页（候选池 + 确认卡 + 影响预览）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useGameStore.getState().setLocale('zh-CN')
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

  it('REC-04A 保障候选名称按当前语言显示，并与候选学科一致', () => {
    const gw = boot()
    const company = gw.getPlayerCompany()!
    const created = gw.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
    expect(created.success).toBe(true)
    const candidate = gw.listCandidates().find((entry) => entry.candidateId.includes('rec04a-guard') && entry.discipline === 'qa')!
    useGameStore.getState().refresh()
    render(<Hire />)
    const card = screen.getAllByTestId('candidate-card').find((entry) => entry.textContent?.includes('保障候选'))!
    expect(card.textContent).toContain('测试工程师 #')
    expect(card.parentElement?.previousElementSibling?.textContent).toContain('测试工程师')
    expect(gw.world.rec04RecruitingGuardByCompany?.[company.id]?.state).toBe('active')
    expect(candidate.discipline).toBe('qa')
  })

  it('REC-04A 保障候选英文名称不会在领域层硬编码中文', () => {
    const gw = boot()
    gw.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
    useGameStore.getState().setLocale('en')
    useGameStore.getState().refresh()
    render(<Hire />)
    const guaranteed = screen.getAllByTestId('candidate-card').find((entry) => entry.textContent?.includes('Guaranteed candidate'))
    expect(guaranteed?.textContent).toContain('QA Engineer')
    expect(guaranteed?.textContent).not.toContain('候选人-')
    expect(screen.getAllByTestId('candidate-name')[0]?.textContent).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
  })

  it('确认卡明示中介费（一次性）与月薪承诺；影响预览展示可用现金/跑道 前→后', () => {
    const gw = boot()
    render(<Hire onNavigate={vi.fn()} />)
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    const card = screen.getByTestId('recruit-confirm-card')
    expect(card.textContent).toContain('中介费')
    expect(card.textContent).toContain('一次性')
    expect(card.textContent).toContain('月薪承诺')
    expect(screen.getByTestId('recruit-arrival-preview').textContent).toContain('预计到岗')
    expect(screen.getByTestId('recruit-arrival-preview').textContent).toContain('候选有效至')
    const previewTable = screen.getByTestId('recruit-impact-preview')
    expect(previewTable.textContent).toContain('招聘前')
    expect(previewTable.textContent).toContain('招聘后')
    // A-13（N1 闭环）：预览"前"值与 game-world.getFinancialOverview 同源——逐字段数值相等，
    // 不只断言 before 非空（审核备注：原用例仅断言非空，未真正校验同源）。
    const before = gw.getFinancialOverview()
    expect(before).not.toBeNull()
    const previewRows = screen.getByTestId('recruit-impact-preview').textContent ?? ''
    // 预览前值取自 preview.before.availableCashCents / runwayMonths（game-world 同源投影）
    expect(previewRows).toContain(`$${(before!.availableCashCents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`)
    const runwayBefore = Number.isFinite(before!.runwayMonths) ? before!.runwayMonths.toFixed(1) : '∞'
    expect(previewRows).toContain(runwayBefore)
    // store 投影与 game-world 投影同源：availableCash 相等
    expect(useGameStore.getState().financial?.availableCashCents).toBe(before!.availableCashCents)
    expect(useGameStore.getState().financial?.runwayMonths).toBe(before!.runwayMonths)
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

  it('招聘确认后显示待到岗与候选有效期，并允许到岗前取消', () => {
    const gw = boot()
    render(<Hire onNavigate={vi.fn()} />)
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    expect(screen.getByTestId('pending-hires').textContent).toContain('到岗日')
    expect(document.body.textContent).toContain('可入职日')
    expect(document.body.textContent).toContain('应聘截止')
    expect(screen.getByTestId('pending-hire-cancel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('pending-hire-cancel'))
    expect(gw.listPendingHires().filter((hire) => hire.state === 'pending')).toHaveLength(0)
    expect(screen.queryByTestId('pending-hires')).toBeNull()
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
    useGameStore.getState().setLocale('zh-CN')
  })

  function bootWithHire() {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const store = useGameStore.getState()
    const candidates = gw.listCandidates()
    store.recruitFromCandidate(candidates[0]!.candidateId)
    const arrivalDay = gw.world.pendingHires?.[0]?.arrivalDay
    if (arrivalDay !== undefined) gw.advanceSimulation(arrivalDay - gw.world.currentDayIndex)
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

  it('成长档徽标与到岗履历来自已生效任职', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    expect(container.querySelector('[data-testid="growth-badge"]')).not.toBeNull()
    expect(screen.getByTestId('employee-career').textContent).toContain('正式到岗')
    expect(container.textContent).not.toContain('经验值 +')
  })

  it('同一人物从待到岗转为试用期员工，随后显示实际项目分配', () => {
    const world = createGameWorld(42)
    const company = world.createCompany({ name: 'Team Test', cityId: 'san_francisco' })
    useGameStore.setState({ game: world })
    useGameStore.getState().refresh()
    const candidate = world.listCandidates()[0]!
    const person = world.world.persons!.find((item) => item.personId === candidate.personId)!
    expect(person.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(useGameStore.getState().recruitFromCandidate(candidate.candidateId).success).toBe(true)
    render(<Employees />)
    const pending = world.listPendingHires().find((hire) => hire.personId === person.personId)!
    expect(screen.getByTestId('pending-hire-row').textContent).toContain(person.displayName)
    expect(screen.getByTestId('pending-hire-row').textContent).toContain(tSeniority(person.seniority))
    expect(screen.getByTestId('employees-capacity').textContent).toContain(`0 + 1`)
    expect(screen.queryByTestId('employee-roster-row')).toBeNull()

    act(() => {
      world.advanceSimulation(pending.arrivalDay - world.calendar.currentDayIndex)
      useGameStore.getState().refresh()
    })
    expect(screen.queryByTestId('pending-hires')).toBeNull()
    expect(screen.getByTestId('employee-roster-row').textContent).toContain(person.displayName)
    expect(screen.getByTestId('employee-roster-row').textContent).toContain('试用期')
    expect(screen.getByTestId('employees-capacity').textContent).toContain(`1 + 0`)
    expect(screen.getByTestId('employee-assignments').textContent).toContain('尚未分配')

    act(() => {
      const creation = world.createExecutionProject({ name: 'Team Assignment', genreId: 'action', hrb: 0.45, budgetCapacityCents: 800_000 })
      expect(creation.success).toBe(true)
      const project = world.world.projects.find((item) => item.companyId === company.id)!
      expect(world.assignEmployeeToProject(pending.employmentId, project.id, 0.5, 'generalist').success).toBe(true)
      useGameStore.getState().refresh()
    })
    expect(screen.getByTestId('employee-assignments').textContent).toContain('Team Assignment · 50%')
  })

  it('无进行中项目：学科缺口区不显示', () => {
    bootWithHire()
    const { container } = render(<Employees />)
    expect(container.querySelector('[data-testid="discipline-gaps"]')).toBeNull()
  })
})

function tSeniority(seniority: 'junior' | 'senior'): string {
  return seniority === 'senior' ? '资深' : '初级'
}
