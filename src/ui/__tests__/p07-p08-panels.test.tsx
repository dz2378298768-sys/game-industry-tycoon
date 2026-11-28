import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectDetail } from '@ui/pages/project-detail'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/** P-07/P-08 验收：A-17/A-18 U4 预估前置、A-20 三质量不合成、A-21 fail-closed。 */
describe('P-07 变更返工 + P-08 测试优化面板（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    const r = useGameStore.getState().createExecutionProject({ name: 'Proj X', genreId: 'action', hrb: 0.45, budgetCapacityCents: 2_000_000 })
    expect(r.success).toBe(true)
  })

  /** 注入真实 WP 工作量（领域 fixtures 口径）：Wizard 无模块词表 → 默认 0 WP（OPEN-CONTENT-MODULES）。 */
  function seedReworkScope(projectId: string) {
    const exec = useGameStore.getState().game!.getExecutionProject(projectId)!
    exec.project.state = 'ACTIVE'
    const wp = (id: string, discipline: 'code' | 'art', baseline: number, delivered: number) => ({
      workPackageId: id, projectId: exec.project.projectId, snapshotId: exec.project.snapshotId,
      sourceRef: { instanceId: id }, discipline, workUnits: baseline, baselineWorkUnits: baseline,
      remainingWorkUnits: baseline - delivered, deliveredWorkUnits: delivered,
      progress: delivered / baseline, skillRef: null, requiredSkillLevel: 0,
      blockedBy: [], dependents: [], priority: 'P0' as const, state: 'READY' as const,
      kind: 'NORMAL' as const, orderIndex: 0, reworkSessionId: null, reworkMode: null,
    })
    exec.workPackages = [wp('WP-CODE', 'code', 100, 60), wp('WP-ART', 'art', 50, 25)]
    exec.project.workPackageIds = exec.workPackages.map((w) => w.workPackageId)
  }

  function renderDetail() {
    const projectId = useGameStore.getState().projects[0]!.id
    return render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
  }

  it('P-07/P-08 面板在项目详情页内可达（进入条件：非终态项目）', () => {
    renderDetail()
    expect(screen.getByTestId('p07-change-panel')).toBeTruthy()
    expect(screen.getByTestId('p08-test-panel')).toBeTruthy()
  })

  it('A-18 U4（REVISION）：返工预估弹窗先于确认出现，unit/沉没/延期为真实数值且确认可执行', () => {
    // 返工变更仅对开发中（PRODUCTION/QA）项目开放：CONCEPT → PRE_PRODUCTION → PRODUCTION
    const projectId = useGameStore.getState().projects[0]!.id
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    seedReworkScope(projectId)
    renderDetail()
    // 确认弹窗初始不存在
    expect(screen.queryByTestId('p07-rework-estimate')).toBeNull()
    fireEvent.click(screen.getByTestId('p07-open-estimate'))
    const estimate = screen.getByTestId('p07-rework-estimate')
    expect(estimate).toBeTruthy()
    // unit：按学科分列的真实工作量（code 60 + art 25 → 分摊后非零）
    const units = screen.getByTestId('p07-estimate-units').textContent ?? ''
    expect(units).not.toContain('评估不可用')
    expect(units).toContain('code')
    expect(units).toContain('art')
    // 沉没成本：B 类全额沉没 = 85 工作量（非占位）
    const sunk = screen.getByTestId('p07-estimate-sunk').textContent ?? ''
    expect(Number.parseFloat(sunk)).toBeGreaterThan(0)
    // 档位 + 延期：内核 breakdown 同源（δ=85/150>0.4 → full，延期 0.25 天）
    expect(screen.getByTestId('p07-estimate-band').textContent).toContain('full')
    expect(screen.getByTestId('p07-estimate-delay').textContent).toContain('天')
    // 确认按钮可用 → 点击走内核 planRework + beginRework，真实创建 ReworkSession
    const confirm = screen.getByTestId('p07-rework-confirm')
    expect(confirm.hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirm)
    const exec = useGameStore.getState().game!.getExecutionProject(projectId)!
    expect(exec.reworkSessions).toHaveLength(1)
    expect(exec.project.reworkSessionId).toBe(exec.reworkSessions[0]!.sessionId)
  })

  it('U4 fail-closed：未登记 ExecutionProject 时预估不可用且确认禁用（不伪造数值）', () => {
    const projectId = useGameStore.getState().projects[0]!.id
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    // 清掉双索引使 getReworkEstimate 进入 fail-closed 分支
    const gw = useGameStore.getState().game! as unknown as { executionProjects: Map<string, unknown> }
    gw.executionProjects.clear()
    renderDetail()
    fireEvent.click(screen.getByTestId('p07-open-estimate'))
    expect(screen.getByTestId('p07-estimate-units').textContent).toContain('评估不可用')
    const confirm = screen.getByTestId('p07-rework-confirm')
    expect(confirm.hasAttribute('disabled')).toBe(true)
    expect(confirm.getAttribute('aria-disabled')).toBe('true')
  })

  it('A-20 U1：三质量列分列渲染且"评估不可用"，页面无合成词', () => {
    const { container } = renderDetail()
    expect(screen.getByTestId('p08-quality-design').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p08-quality-implementation').textContent).toContain('评估不可用')
    expect(screen.getByTestId('p08-quality-completeness').textContent).toContain('评估不可用')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/综合|总评|加权平均|qualityScore|finalQualityScore|qualityCeiling|mean\(/)
  })

  it('07B-07（P2）：D-02 C-01~C-05 + B/N/T 逐项行齐全，无数据源逐行降级', () => {
    renderDetail()
    const rows = screen.getByTestId('p08-checklist').querySelectorAll('tbody tr')
    for (const id of ['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'B', 'N', 'T']) {
      expect(screen.getByText(id)).toBeTruthy()
    }
    expect(rows.length).toBeGreaterThanOrEqual(11)
  })

  it('A-21：缺陷明细 fail-closed 降级，不伪造 E 级缺陷横幅', () => {
    renderDetail()
    expect(screen.getByTestId('p08-defect-list').textContent).toContain('当前没有可用的缺陷明细')
    expect(screen.queryByTestId('p08-e-defect-banner')).toBeNull()
  })

  it('P-08 优化动作禁用且带原因文案（G-9）', () => {
    renderDetail()
    const btn = screen.getByTestId('p08-optimize')
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(btn.getAttribute('title')).toContain('完成可用的质量评估')
  })
})
