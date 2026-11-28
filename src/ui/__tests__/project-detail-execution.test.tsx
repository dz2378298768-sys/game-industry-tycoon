import React from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProjectDetail } from '@ui/pages/project-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import { referencePriceCents } from '@content/c1-content'

/**
 * P-06 研发推进验收（批次 07A）：
 * A-14 U6 走查（瓶颈高亮且与 Cap_d 数据一致）
 * A-16 DOM 无优先级控件（S6-3）
 * 附加：ratio/verdict 徽标、Cost_est 暂不可估（+∞ 不显示 Infinity）
 */

describe('P-06 研发推进页（project-detail 增量）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useGameStore.getState().setLocale('zh-CN')
  })

  function bootWithProject() {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const store = useGameStore.getState()
    // 立项（走 P-04 新向导命令，project_budget 承诺 + ExecutionProject 登记）
    const r = store.createExecutionProject({ name: 'Proj X', genreId: 'action', hrb: 0.45, budgetCapacityCents: 20_000_00 })
    expect(r.success).toBe(true)
    const projectId = useGameStore.getState().projects[0]!.id
    return { gw, projectId }
  }

  it('A-14：产能 Cap_d 区渲染，瓶颈学科高亮且与数据一致（U6）', () => {
    const { gw, projectId } = bootWithProject()
    render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    const panel = screen.getByTestId('capacity-panel')
    expect(panel).toBeTruthy()
    const summary = gw.getExecutionSummary(projectId)
    const bottleneckCard = panel.querySelector('[data-testid="bottleneck-card"]')
    // 无在职员工 + 无 WP 工作量 → 无瓶颈（fail-closed null）
    if (summary!.bottleneckDiscipline === null) {
      expect(bottleneckCard).toBeNull()
    } else {
      expect(bottleneckCard).not.toBeNull()
      expect(bottleneckCard!.textContent).toContain(summary!.bottleneckDiscipline)
    }
  })

  it('ratio / verdict 卡渲染；团队 0 → Cost_est 暂不可估，DOM 无 Infinity', () => {
    const { projectId } = bootWithProject()
    render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    expect(document.body.innerHTML).not.toContain('Infinity')
    expect(screen.getByTestId('exec-cost-est').textContent).toContain('暂不可估')
    expect(screen.getByTestId('exec-verdict').textContent).toMatch(/\d+\.\d%/)
  })

  it('canonical 工作包缺岗时 ratio 不泄漏 Infinity，并显示不可估原因', () => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const created = useGameStore.getState().createExecutionProject({
      kind: 'draft',
      requestId: 'project-detail-ratio-unavailable',
      workingTitle: 'Capacity Gap',
      genreId: 'action',
      primaryTypeId: 'action',
      targetSegmentClaims: ['SEG-YOUTH'],
      platformTargets: ['PLT-ARCADE'],
      modules: [
        { templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE', instanceId: 'core', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
        { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'episodes', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
      ],
      deliveryForm: 'full',
      scopePolicy: 'recommended',
      hrb: 0.45,
      budgetCapacityCents: 2_000_000,
    })
    expect(created.success).toBe(true)
    const projectId = useGameStore.getState().projects[0]!.id
    render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    const verdict = screen.getByTestId('exec-verdict')
    expect(verdict.textContent).toContain('暂不可估')
    expect(document.body.textContent).not.toContain('Infinity')
    expect(verdict.textContent).not.toContain('项目预算超支')
    const warning = screen.getByTestId('project-block-hint')
    expect(warning.textContent).toContain('音频')
    expect(warning.textContent).toContain('没有可用产能')
    expect(warning.querySelector('a')?.getAttribute('href')).toBe('#project-team')
  })

  it('A-16：DOM 无优先级控件（S6-3：优先级调整控件不渲染）', () => {
    const { projectId } = bootWithProject()
    const { container } = render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    expect(container.textContent).not.toContain('优先级')
    expect(container.querySelector('[data-priority-control]')).toBeNull()
  })

  it('warns about both projected risks and prefills the budget gap without pausing the project', () => {
    const { gw, projectId } = bootWithProject()
    const summary = gw.getExecutionSummary(projectId)!
    vi.spyOn(gw, 'getExecutionSummary').mockReturnValue({
      ...summary, remainingCostEstCents: 1_100_000, earliestCompletionDays: 365, unstaffedDisciplines: [],
    })
    render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    const warning = within(screen.getByTestId('project-block-hint'))
    expect(warning.getByText(/赶不上计划上市日/)).toBeTruthy()
    expect(warning.getByText(/相差约 \$2,000/)).toBeTruthy()
    fireEvent.click(warning.getByRole('button', { name: '按预计缺口追加' }))
    expect((screen.getByRole('spinbutton', { name: /追加金额/ }) as HTMLInputElement).value).toBe('2000')
    expect(gw.world.projects.find((project) => project.id === projectId)?.isPaused).toBe(false)
  })

  it('旧项目（未走新向导）：ExecutionSummary 为 null，详情页按旧口径渲染不报错', () => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    const out = useGameStore.getState().createProject({
      name: 'Legacy', genreId: 'action', budgetTotalCapCents: 5_000_000, plannedLaunchDay: 200,
    })
    expect(out.error).toBeUndefined()
    const projectId = useGameStore.getState().projects[0]!.id
    expect(gw.getExecutionSummary(projectId)).toBeNull()
    render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    expect(screen.queryByTestId('capacity-panel')).toBeNull()
  })

  it('REC-09：项目推进提示和分配成功反馈切换语言，保留玩家输入的名字', () => {
    const { gw, projectId } = bootWithProject()
    expect(gw.advanceProjectPhase(projectId).success).toBe(true)
    expect(gw.advanceProjectPhase(projectId).success).toBe(true)
    const hire = gw.hireEmployee({ name: '顾问 $&', role: 'designer', skillLevel: 3, salaryMonthlyCents: 1_000 })
    expect(hire.success).toBe(true)
    useGameStore.getState().refresh()
    const view = render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('project-block-hint').textContent).toContain('项目尚无团队')
    act(() => useGameStore.getState().setLocale('en'))
    expect(view.container.textContent).toContain('Action · Production')
    expect(screen.getByTestId('project-block-hint').textContent).toContain('Assign staff in Project Team')
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(screen.getByTestId('project-block-hint').textContent).toContain('Programming and Art')
    expect(useGameStore.getState().messages.at(-1)?.text).toBe('顾问 $& joined Proj X.')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(useGameStore.getState().messages.at(-1)?.text).toBe('顾问 $& was removed from the project.')
    act(() => useGameStore.getState().setLocale('zh-CN'))
    expect(screen.getByTestId('project-block-hint').textContent).toContain('项目尚无团队')
  })

  it('REC-09：项目分配失败显示当前语言的错误，领域原文不会作为玩家提示', () => {
    const { gw, projectId } = bootWithProject()
    useGameStore.getState().setLocale('en')
    vi.spyOn(gw, 'assignEmployeeToProject').mockReturnValue({
      success: false, errorCode: 'EMP_ALLOCATION_EXCEEDS_100_PERCENT', message: '领域报错',
    })
    vi.spyOn(gw, 'unassignEmployeeFromProject').mockReturnValue({ success: false, message: '领域报错' })
    expect(useGameStore.getState().assignEmployeeToProject('employee', projectId, 1, 'generalist').message)
      .toContain('combined project allocations would exceed 100%')
    expect(useGameStore.getState().unassignEmployeeFromProject('employee', projectId).message)
      .toContain('Unable to remove this assignment.')
    useGameStore.getState().setLocale('zh-CN')
  })

  it('已交付的 canonical 旧档缺上市方案时使用参考价，上市后有真实销量且没有新增推广', () => {
    const world = createGameWorld(905)
    world.createCompany({ name: 'Compatibility Studio', cityId: 'san_francisco' })
    const created = world.createExecutionProject({
      kind: 'draft', requestId: 'older-launch-plan', workingTitle: 'Old Launch', genreId: 'action',
      primaryTypeId: 'action', targetSegmentClaims: ['SEG-YOUTH'], platformTargets: ['PLT-ARCADE'],
      modules: [
        { templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE', instanceId: 'core', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
        { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'episodes', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
      ],
      deliveryForm: 'full', scopePolicy: 'recommended', hrb: 0.45, budgetCapacityCents: 10_000_000,
    })
    expect(created.success).toBe(true)
    const projectId = world.world.projects[0]!.id
    for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
      const hire = world.hireEmployee({ name: role, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
      expect(hire.success).toBe(true)
      expect(world.assignEmployeeToProject(hire.result!.id, projectId, 1, 'generalist').success).toBe(true)
    }
    expect(world.advanceProjectPhase(projectId).success).toBe(true)
    expect(world.advanceProjectPhase(projectId).success).toBe(true)
    world.advanceSimulation(200)
    const gate = world.getDeliveryGateEvaluation(projectId, 'full', true)
    expect(gate.pass, gate.unavailableReason ?? gate.reasonCodes.join(', ')).toBe(true)
    const delivered = world.submitDeliveryForProject(projectId, gate.gate, 'full', true)
    expect(delivered.result?.completed).toBe(true)

    const restored = createGameWorld(905)
    restored.restore(world.serialize())
    useGameStore.setState({ game: restored, deliveryLaunchPlans: {} })
    useGameStore.getState().refresh()
    expect(useGameStore.getState().launchProject(projectId).success).toBe(true)
    const product = useGameStore.getState().products[0]!
    expect(product.pricePerUnitCents).toBe(referencePriceCents('action', 'arcade_pre_1975', 'arcade_enthusiasts'))
    expect(useGameStore.getState().marketingCampaigns).toHaveLength(0)
    restored.advanceSimulation(1)
    expect(restored.world.products[0]?.salesByPeriod.length).toBeGreaterThan(0)
  })
})
