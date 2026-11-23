import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Finance } from '@ui/pages/finance'
import { useGameStore, formatMoney } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/** P-11 财务结算页验收：A-30 U2 runway 直读、危机状态/月度结算/现金流、GAME OVER 重开、A-37 存读档一致性口径。 */
describe('P-11 财务结算页（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const company = gw.world.companies.find((c) => c.isPlayer) ?? gw.world.companies[0]!
    const financial = gw.getFinancialOverview()!
    useGameStore.setState({
      game: gw,
      company,
      financial,
      transactions: [],
      projects: [],
      products: [],
      dayIndex: financial.dayIndex,
    } as never)
  })

  function renderFinance() {
    return render(<Finance onNavigate={vi.fn()} />)
  }

  it('A-30 U2：runway 直读内核值（X.X 个月），无口径兜底文案', () => {
    const runway = useGameStore.getState().financial!.runwayMonths
    const { container } = renderFinance()
    const el = screen.getByTestId('finance-runway')
    const expected = Number.isFinite(runway) ? `${runway.toFixed(1)} 个月` : '∞'
    expect(el.textContent).toContain(expected)
    expect(el.textContent).not.toMatch(/兜底|说明|口径|推算/)
    // 公司级跑道展示不含 FIX-4 项目级 30 日标签（A-38）
    expect(container.textContent).not.toContain('30 日滚动')
  })

  it('AvailableCash KPI 与恒等式副标', () => {
    const available = useGameStore.getState().financial!.availableCashCents
    renderFinance()
    const el = screen.getByTestId('finance-available-cash')
    expect(el.textContent).toContain('$')
    expect(el.textContent).toContain('账面现金')
    expect(el.textContent).toContain(formatMoney(available))
  })

  it('危机状态区：等级徽标 + 原因码逐条（error.crisis i18n）', () => {
    useGameStore.setState({
      financial: { ...useGameStore.getState().financial!, crisisLevel: 'warning', reasonCodes: ['LOW_CASH'] },
    } as never)
    renderFinance()
    expect(screen.getByTestId('finance-crisis-level').textContent).toContain('警告')
    const reasons = screen.getByTestId('finance-crisis-reasons')
    expect(reasons.textContent).toContain('低现金')
    expect(reasons.textContent).toContain('LOW_CASH')
  })

  it('危机历史 time线不伪造（OPEN-FIN-CRISIS-WIRING）', () => {
    renderFinance()
    expect(screen.getByTestId('finance-crisis').textContent).toContain('待接线')
  })

  it('A-32：critical 展示补救窗口剩余天数（fail-closed “—”）+ 三条件 AND 文案', () => {
    useGameStore.setState({
      financial: { ...useGameStore.getState().financial!, crisisLevel: 'critical' },
    } as never)
    renderFinance()
    const critical = screen.getByTestId('finance-crisis-critical')
    expect(critical.textContent).toContain('—')
    expect(critical.textContent).toContain('三条件')
  })

  it('月度结算区：六分项按 settlementDay 语义归类', () => {
    const day = useGameStore.getState().dayIndex
    useGameStore.setState({
      transactions: [
        { id: 't1', day, category: 'sales_revenue', amountCents: 100000, description: '销售' },
        { id: 't2', day, category: 'salary', amountCents: -30000, description: '工资' },
        { id: 't3', day, category: 'customer_refund', amountCents: -5000, description: '退款' },
      ],
    } as never)
    renderFinance()
    const section = screen.getByTestId('finance-monthly')
    for (const label of ['本月收入', '本月支出', '员工薪酬', '项目成本', '产品收入', '退款']) {
      expect(section.textContent).toContain(label)
    }
    expect(section.textContent).toContain('$1,000')
  })

  it('现金流区：netCashByMonth 逐月净额表来自内核预测', () => {
    renderFinance()
    const section = screen.getByTestId('finance-cashflow')
    expect(section).toBeTruthy()
    // 内核 computeCashForecast 在无数据源下仍产出 horizon 个月净额带
    expect(section.querySelectorAll('[data-testid^="finance-cashflow-"]').length).toBeGreaterThan(0)
  })

  it('GAME OVER：破产展示重开新档按钮（ADJ-12 S11-3）', () => {
    const state = useGameStore.getState()
    useGameStore.setState({
      company: { ...state.company!, status: 'bankrupt' },
      financial: { ...state.financial!, crisisLevel: 'bankrupt' },
    } as never)
    renderFinance()
    const over = screen.getByTestId('finance-gameover')
    expect(over.textContent).toContain('GAME OVER')
    expect(screen.getByTestId('finance-gameover-restart')).toBeTruthy()
  })

  it('破产时补救动作不渲染（G-9）', () => {
    const state = useGameStore.getState()
    useGameStore.setState({
      company: { ...state.company!, status: 'bankrupt' },
      financial: { ...state.financial!, crisisLevel: 'critical' },
    } as never)
    renderFinance()
    expect(screen.queryByTestId('finance-remediation-actions')).toBeNull()
  })
})
