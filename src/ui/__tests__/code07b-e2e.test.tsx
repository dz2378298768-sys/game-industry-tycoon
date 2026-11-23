import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** idb-keyval 内存 mock，使存读档链路可在 jsdom 下端到端走通（A-37）。 */
const mem = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { GameShell } from '@app/game-shell'
import { ProjectDetail } from '@ui/pages/project-detail'
import { Deliver } from '@ui/pages/deliver'
import { useGameStore, t } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import { evaluateDeliveryGate } from '@domain/value-objects/product-completeness-gate'
import { baseContext, p1Templates, tuning } from '../../domain/value-objects/__tests__/product-completeness-fixtures'

/** CODE-07B 端到端闭环：UI 页面链路可达 + store 状态链 + A-37 存读档一致性。 */
describe('CODE-07B 端到端闭环（批次 07B）', () => {
  beforeEach(() => {
    mem.clear()
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
  })

  it('UI 页面链路可达：市场 → 立项 → 项目详情 → 财务 → 产品 → 复盘，交付入口以项目为单位', () => {
    render(<GameShell />)

    fireEvent.click(screen.getByText(t('nav.market')))
    expect(screen.getByTestId('market-trend-section')).toBeTruthy()

    fireEvent.click(screen.getByText(t('nav.newProject')))
    expect(screen.getByTestId('wizard-step')).toBeTruthy()

    fireEvent.click(screen.getByText(t('nav.finance')))
    expect(screen.getByTestId('finance-runway')).toBeTruthy()
    expect(screen.getByTestId('finance-cashflow')).toBeTruthy()

    fireEvent.click(screen.getByText(t('nav.products')))
    expect(screen.getByText(t('products.title'))).toBeTruthy()

    fireEvent.click(screen.getByText(t('nav.review')))
    expect(screen.getByTestId('p12-media-card')).toBeTruthy()
  })

  it('store 状态链：建公司 → 市场调研 → 立项 → 推进 X2 → 交付视图 / 现金流 / 执行摘要可读', () => {
    const research = useGameStore.getState().conductMarketResearch()
    expect(research.success).toBe(true)
    expect(research.result?.costCents).toBe(500_000)

    const created = useGameStore.getState().createExecutionProject({
      name: 'Chain Game', genreId: 'action', hrb: 0.45, budgetCapacityCents: 2_000_000,
    })
    expect(created.success).toBe(true)
    const projectId = useGameStore.getState().projects[0]!.id

    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)

    expect(useGameStore.getState().getExecutionSummary(projectId)).not.toBeNull()
    expect(useGameStore.getState().getDeliveryStatus(projectId).state).not.toBeNull()
    expect(useGameStore.getState().getCashForecast()).not.toBeNull()
  })

  it('端到端完整 UI 链路（任务卡 §5）：招人 → 变更 → 返工 → 交付 PASS → 上市', () => {
    // —— 1. 招人：store 真招聘 + UI 可达 ——
    const hired = useGameStore.getState().hireEmployee('Dev A', 'programmer', 4, 300_000)
    expect(hired.error).toBeUndefined()
    expect(useGameStore.getState().employees).toHaveLength(1)
    const hireView = render(<GameShell />)
    fireEvent.click(screen.getByText(t('nav.hire')))
    expect(screen.getAllByTestId('candidate-card').length).toBeGreaterThan(0)
    hireView.unmount()

    // —— 2. 立项 + 变更预估（真实 domain breakdown）——
    const created = useGameStore.getState().createExecutionProject({
      name: 'E2E Game', genreId: 'action', hrb: 0.45, budgetCapacityCents: 2_000_000,
    })
    expect(created.success).toBe(true)
    const projectId = useGameStore.getState().projects[0]!.id
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)
    expect(useGameStore.getState().advanceProjectPhase(projectId).success).toBe(true)

    // 夹具：Wizard 无模块词表 → 0 WP（OPEN-CONTENT-MODULES）；注入真实 WP 工作量以驱动返工链。
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

    const estimate = useGameStore.getState().getReworkEstimate(projectId, 'B', 15)
    expect(estimate).not.toBeNull()
    expect(estimate!.available).toBe(true)
    expect(estimate!.reworkWorkUnits).toBeGreaterThan(0)
    expect(estimate!.sunkWorkUnits).toBeGreaterThan(0)

    // —— 3. 返工：UI 打开预估 → 确认后执行（planRework + beginRework）——
    const detail = render(<ProjectDetail projectId={projectId} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('p07-open-estimate'))
    expect(screen.getByTestId('p07-estimate-units').textContent).not.toContain('评估不可用')
    fireEvent.click(screen.getByTestId('p07-rework-confirm'))
    const afterRework = useGameStore.getState().game!.getExecutionProject(projectId)!
    expect(afterRework.reworkSessions).toHaveLength(1)
    expect(afterRework.project.reworkSessionId).toBe(afterRework.reworkSessions[0]!.sessionId)
    detail.unmount()

    // —— 4. 交付 PASS：真点击 UI 确认按钮（07B REVISION2，不再用 {pass:true} 夹具绕过按钮）——
    // 夹具：WP 状态机推进到可交付态（返工夹具驱动）；gate 用 domain 真实 evaluateDeliveryGate 判定。
    afterRework.project.state = 'READY_TO_DELIVER'
    const gateResult = evaluateDeliveryGate(baseContext(), p1Templates(), 'full', tuning())
    expect(gateResult.gate).toBe('PASS')
    useGameStore.getState().game!.registerDeliveryGateEvaluation(projectId, 'full', {
      pass: gateResult.gate === 'PASS',
      violations: gateResult.errorCodes.map((code) => ({ code, severity: 'P1' as const })),
      reasonCodes: [...gateResult.errorCodes],
      checkedAt: gateResult.checkedAt,
      source: 'd02-evaluateDeliveryGate',
    })

    const submitSpy = vi.spyOn(useGameStore.getState().game!, 'submitDeliveryForProject')
    const deliverView = render(<Deliver projectId={projectId} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('deliver-title')).toBeTruthy()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    fireEvent.click(screen.getByTestId('deliver-disclosure-ack'))
    const confirm = screen.getByTestId('deliver-submit-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    // 真点击触发内核命令，且传的是 UI 只读查询返回的真实 gate（非命令级夹具）
    expect(submitSpy).toHaveBeenCalledTimes(1)
    expect(submitSpy.mock.calls[0]![1].pass).toBe(true)

    const afterDelivery = useGameStore.getState().game!.getExecutionProject(projectId)!
    expect(afterDelivery.project.state).toBe('COMPLETED')
    expect(afterDelivery.builds).toHaveLength(1)
    expect(afterDelivery.builds[0]!.buildId).toBeTruthy()
    deliverView.unmount()

    // —— 5. 上市：legacy launchProject → 产品进入 Products 页 ——
    const legacy = useGameStore.getState().projects[0]!
    legacy.phase = 'READY_TO_LAUNCH' // 夹具：QA 阶段完成度内核未接线，见 07B-12 OPEN
    legacy.plannedLaunchDay = 0 // 夹具：真实玩法需推进到计划上市日
    const launched = useGameStore.getState().launchProject(projectId)
    expect(launched.success).toBe(true)
    expect(useGameStore.getState().products).toHaveLength(1)
    const productsView = render(<GameShell />)
    fireEvent.click(screen.getAllByText(t('nav.products'))[0]!)
    expect(screen.getAllByText('E2E Game').length).toBeGreaterThan(0)
    productsView.unmount()
  })

  it('A-37 存读档一致性：save → 篡改 UI 态 → load，跑道/财务派生视图与读档前一致', async () => {
    const before = useGameStore.getState().financial
    expect(before).not.toBeNull()
    await useGameStore.getState().save()

    // 篡改 UI 派生态（不写回内核），模拟脏状态
    useGameStore.setState({ dayIndex: 999, financial: null } as never)

    const ok = await useGameStore.getState().load()
    expect(ok).toBe(true)
    await waitFor(() => {
      const after = useGameStore.getState().financial
      expect(after?.runwayMonths).toBe(before!.runwayMonths)
      expect(after?.availableCashCents).toBe(before!.availableCashCents)
      expect(after?.crisisLevel).toBe(before!.crisisLevel)
    })
  })
})
