import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProjectDetail } from '@ui/pages/project-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/**
 * P-06 研发推进验收（批次 07A）：
 * A-14 U6 走查（瓶颈高亮且与 Cap_d 数据一致）
 * A-16 DOM 无优先级控件（S6-3）
 * 附加：ratio/verdict 徽标、Cost_est 暂不可估（+∞ 不显示 Infinity）
 */

describe('P-06 研发推进页（project-detail 增量）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('A-16：DOM 无优先级控件（S6-3：优先级调整控件不渲染）', () => {
    const { projectId } = bootWithProject()
    const { container } = render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    expect(container.textContent).not.toContain('优先级')
    expect(container.querySelector('[data-priority-control]')).toBeNull()
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
})
