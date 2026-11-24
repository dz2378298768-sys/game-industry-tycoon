import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** idb-keyval 内存 mock（A-25 交付失败读档持久：save → 全新 GameWorld → load → UI 逐条展示）。 */
const mem = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { Deliver } from '@ui/pages/deliver'
import { useGameStore } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'
import { P1_UI_TUNING } from '@content/p1-ui-tuning'
import { evaluateDeliveryGate } from '@domain/value-objects/product-completeness-gate'
import { baseContext, p1Templates, tuning } from '../../domain/value-objects/__tests__/product-completeness-fixtures'

/** P-09 交付与上市页验收：A-24/A-25 U3 失败原因持久、A-26 无 demo、R-5 定价三档、A-42 披露确认。 */
describe('P-09 交付与上市页（批次 07B）', () => {
  beforeEach(() => {
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
    const r = useGameStore.getState().createExecutionProject({
      name: 'Proj X', genreId: 'action', hrb: 0.45, budgetCapacityCents: 2_000_000,
    })
    expect(r.success).toBe(true)
  })

  function renderDeliver() {
    const projectId = useGameStore.getState().projects[0]!.id
    return render(<Deliver projectId={projectId} onNavigate={vi.fn()} />)
  }

  /** 夹具：把项目推进到可交付态（WP 状态机由返工夹具驱动，见 code07b-e2e）。 */
  function readyToDeliver(): string {
    const projectId = useGameStore.getState().projects[0]!.id
    useGameStore.getState().game!.getExecutionProject(projectId)!.project.state = 'READY_TO_DELIVER'
    return projectId
  }

  /** 用 domain 真实 evaluateDeliveryGate 判定产物登记 gate 快照（非手写 pass=true 夹具）。 */
  function registerRealGate(projectId: string, overrides: Parameters<typeof baseContext>[0] = {}) {
    const result = evaluateDeliveryGate(baseContext(overrides), p1Templates(), 'full', tuning())
    useGameStore.getState().game!.registerDeliveryGateEvaluation(projectId, 'full', {
      pass: result.gate === 'PASS',
      violations: result.errorCodes.map((code) => ({ code, severity: 'P1' as const })),
      reasonCodes: [...result.errorCodes],
      checkedAt: result.checkedAt,
      source: 'd02-evaluateDeliveryGate',
    })
    return result
  }

  it('A-26：三形式资格区仅渲染 full / EA，DOM 无 demo 行', () => {
    const { container } = renderDeliver()
    expect(screen.getByTestId('deliver-qualification-full')).toBeTruthy()
    expect(screen.getByTestId('deliver-qualification-early_access')).toBeTruthy()
    expect(screen.queryByTestId('deliver-qualification-demo')).toBeNull()
    expect(container.textContent).not.toContain('试玩版')
  })

  it('资格 / 披露 / 未解决项 fail-closed 降级，不伪造结论', () => {
    renderDeliver()
    expect(screen.getByTestId('deliver-qual-status-full').textContent).toContain('评估不可用')
    expect(screen.getByTestId('deliver-qual-status-early_access').textContent).toContain('评估不可用')
    expect(screen.getByTestId('deliver-disclosures-early_access').textContent).toContain('信息不足')
    expect(screen.getByTestId('deliver-unmet-blocking').textContent).toContain('评估不可用')
  })

  it('方向档直读领域标准（low/medium/high），DOM 无合成质量词（U1）', () => {
    const { container } = renderDeliver()
    const full = screen.getByTestId('deliver-expectation-full').textContent ?? ''
    const ea = screen.getByTestId('deliver-expectation-early_access').textContent ?? ''
    expect(full).toContain('高')
    expect(ea).toContain('中')
    expect(container.textContent).not.toMatch(/综合|总评|加权平均|质量上限|qualityScore|finalQualityScore|overall/)
  })

  it('R-5：定价三档 + 营销预算三档来自 TUNING，标 NUMERIC_PENDING_P2，无自定义价格', () => {
    const { container } = renderDeliver()
    for (const id of ['low', 'medium', 'high']) {
      expect(screen.getByTestId(`deliver-pricing-${id}`)).toBeTruthy()
      expect(screen.getByTestId(`deliver-budget-${id}`)).toBeTruthy()
    }
    const pending = (container.textContent?.match(/NUMERIC_PENDING_P2/g) ?? []).length
    expect(pending).toBeGreaterThanOrEqual(6)
    expect(screen.queryByTestId('deliver-custom-price')).toBeNull()
  })

  it('W5-C3：三档数值保持 null 硬占位（无权威档位映射，禁止臆造终值），营销预算档同理', () => {
    // ADJ-2026-11-24-19 §1 C3：referencePriceCents + basePurchaseConversion 无权威三档换算公式，
    // 既有 TUNING 也无营销 dailyBudget 档位字段；故 fail-closed 保持，登记 OPEN-W5-C3-01。
    const { pricingTiers, marketingBudgetTiers } = P1_UI_TUNING.delivery
    expect(pricingTiers.map((t) => t.id)).toEqual(['low', 'medium', 'high'])
    expect(marketingBudgetTiers.map((t) => t.id)).toEqual(['low', 'medium', 'high'])
    for (const tier of pricingTiers) {
      expect(tier.priceCents).toBeNull()
      expect(tier.status).toBe('NUMERIC_PENDING_P2')
    }
    for (const tier of marketingBudgetTiers) {
      expect(tier.dailyBudgetCents).toBeNull()
      expect(tier.status).toBe('NUMERIC_PENDING_P2')
    }
    // UI 逐档显示"数值待标定"，且不渲染任何自定义价格输入框
    const { container } = renderDeliver()
    const pendingLabels = container.textContent?.match(/数值待标定/g) ?? []
    expect(pendingLabels.length).toBeGreaterThanOrEqual(6)
    expect(screen.queryByTestId('deliver-custom-price')).toBeNull()
  })

  it('U3 / A-24 / A-25：FAIL 后 reasonCodes 与 eViolations 逐条持久展示 + 计数', () => {
    const projectId = useGameStore.getState().projects[0]!.id
    const exec = useGameStore.getState().game!.getExecutionProject(projectId)!
    exec.project.deliveryFailures = 2
    exec.project.lastDeliveryFailure = {
      day: 7,
      reasonCodes: ['D02-MISSING-CORE', 'D02-DISCLOSURE-REQUIRED'],
      eViolations: [{ code: 'D02-MISSING-CORE', severity: 'E' }],
    }
    renderDeliver()
    expect(screen.getByTestId('deliver-failure-count').textContent).toContain('2')
    expect(screen.getByTestId('deliver-failure-day').textContent).toContain('7')
    expect(screen.getByTestId('deliver-failure-reasons').querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByTestId('deliver-failure-reason-0').textContent).toContain('D02-MISSING-CORE')
    expect(screen.getByTestId('deliver-failure-eviolations').querySelectorAll('li')).toHaveLength(1)
  })

  it('07B-04（REVISION）：blockingUnmet 逐条呈现（闸门 FAIL 的 reasonCodes 全列，不折叠为一句）', () => {
    const projectId = useGameStore.getState().projects[0]!.id
    const exec = useGameStore.getState().game!.getExecutionProject(projectId)!
    exec.project.lastDeliveryFailure = {
      day: 12,
      reasonCodes: ['D02-MISSING-CORE', 'D02-DISCLOSURE-REQUIRED', 'D01-QUALITY-GATE'],
      eViolations: [{ code: 'D01-QUALITY-GATE', severity: 'E' }],
    }
    renderDeliver()
    const list = screen.getByTestId('deliver-unmet-list')
    expect(list.querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByTestId('deliver-unmet-item-0').textContent).toContain('D02-MISSING-CORE')
    expect(screen.getByTestId('deliver-unmet-item-1').textContent).toContain('D02-DISCLOSURE-REQUIRED')
    expect(screen.getByTestId('deliver-unmet-item-2').textContent).toContain('D01-QUALITY-GATE')
    expect(screen.queryByTestId('deliver-unmet-blocking')).toBeNull()
  })

  it('A-25（REVISION）：交付失败 → 存档 → 读档 → UI 仍逐条显示 reasonCodes', async () => {
    const projectId = useGameStore.getState().projects[0]!.id
    const exec = useGameStore.getState().game!.getExecutionProject(projectId)!
    exec.project.deliveryFailures = 1
    exec.project.lastDeliveryFailure = {
      day: 9,
      reasonCodes: ['D02-MISSING-CORE', 'D02-DISCLOSURE-REQUIRED'],
      eViolations: [{ code: 'D02-MISSING-CORE', severity: 'E' }],
    }
    await useGameStore.getState().save()

    // 全新 GameWorld 内存 Map 为空，只有存档切片能恢复交付失败审计（A-25 成立条件）。
    useGameStore.setState({ game: createGameWorld(42) } as never)
    const ok = await useGameStore.getState().load()
    expect(ok).toBe(true)
    await waitFor(() => {
      const restored = useGameStore.getState().game!.getExecutionProject(projectId)
      expect(restored?.project.lastDeliveryFailure?.reasonCodes).toEqual([
        'D02-MISSING-CORE', 'D02-DISCLOSURE-REQUIRED',
      ])
    })

    render(<Deliver projectId={projectId} onNavigate={vi.fn()} />)
    expect(screen.getByTestId('deliver-failure-count').textContent).toContain('1')
    expect(screen.getByTestId('deliver-failure-day').textContent).toContain('9')
    expect(screen.getByTestId('deliver-failure-reasons').querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByTestId('deliver-failure-reason-0').textContent).toContain('D02-MISSING-CORE')
    expect(screen.getByTestId('deliver-failure-reason-1').textContent).toContain('D02-DISCLOSURE-REQUIRED')
    expect(screen.getByTestId('deliver-failure-eviolations').querySelectorAll('li')).toHaveLength(1)
  })

  it('首次提交前失败区不渲染', () => {
    renderDeliver()
    expect(screen.queryByTestId('deliver-failure')).toBeNull()
  })

  it('A-42 / G-9：EA 披露确认弹窗逐条展示 + 显式确认控件；评估快照缺失时提交禁用带 fail-closed 原因', () => {
    renderDeliver()
    expect(screen.queryByTestId('deliver-submit-confirm')).toBeNull()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    expect(screen.getByTestId('deliver-confirm-disclosures')).toBeTruthy()
    const ack = screen.getByTestId('deliver-disclosure-ack') as HTMLInputElement
    expect(ack.checked).toBe(false)
    const confirm = screen.getByTestId('deliver-submit-confirm')
    // 07B REVISION2：不再写死永久禁用——缺真实 gate 快照时如实禁用并给出原因（fail-closed）。
    expect(confirm.hasAttribute('disabled')).toBe(true)
    expect(confirm.getAttribute('title')).toContain('评估不可用')
    expect(screen.getByTestId('deliver-submit-blocked').textContent).toContain('可交付态')
    fireEvent.click(ack)
    expect(ack.checked).toBe(true)
  })

  it('E 级缺陷横幅不伪造（内核无缺陷明细数据源）', () => {
    const { container } = renderDeliver()
    expect(screen.queryByTestId('deliver-e-defect-banner')).toBeNull()
    expect(container.textContent).not.toContain('存在 E 级缺陷')
  })

  // ===== 07B REVISION2：P-09 真点击链路（核心验收：按钮可用 + 点击闭合，不绕过按钮） =====

  it('07B-REV2/SUP-01 fail-closed：上下文无法派生 → 提交禁用带原因，不伪造 pass', () => {
    const projectId = readyToDeliver()
    // SUP-01：生产路径会真实求值并登记；这里移除 legacy Project 使派生失败，
    // 验证 fail-closed 仍是诚实降级（不是写死禁用、不伪造 pass）。
    const gw = useGameStore.getState().game!
    gw.world.projects = gw.world.projects.filter((p) => p.id !== projectId)
    renderDeliver()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    const confirm = screen.getByTestId('deliver-submit-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(screen.getByTestId('deliver-submit-blocked').textContent).toContain('评估不可用')
    expect(screen.queryByTestId('deliver-gate-reasons')).toBeNull()
  })

  it('07B-REV2 真点击 PASS：确认弹窗 → 真点击确认 → 内核提交被触发 → 上市 products 0→1', () => {
    const projectId = readyToDeliver()
    expect(useGameStore.getState().products).toHaveLength(0)
    const gate = registerRealGate(projectId)
    expect(gate.gate).toBe('PASS')

    const game = useGameStore.getState().game!
    const submitSpy = vi.spyOn(game, 'submitDeliveryForProject')
    renderDeliver()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    const ack = screen.getByTestId('deliver-disclosure-ack') as HTMLInputElement
    fireEvent.click(ack)
    expect(ack.checked).toBe(true)
    const confirm = screen.getByTestId('deliver-submit-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    expect(confirm.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(confirm)

    // 真点击触发内核命令，且传的是 UI 只读查询返回的真实 gate（非 {pass:true} 夹具）
    expect(submitSpy).toHaveBeenCalledTimes(1)
    expect(submitSpy.mock.calls[0]![1].pass).toBe(true)
    const after = game.getExecutionProject(projectId)!
    expect(after.project.state).toBe('COMPLETED')
    expect(after.builds).toHaveLength(1)
    expect(after.builds[0]!.buildId).toBeTruthy()

    const legacy = useGameStore.getState().projects[0]!
    legacy.phase = 'READY_TO_LAUNCH'
    legacy.plannedLaunchDay = 0
    expect(useGameStore.getState().launchProject(projectId).success).toBe(true)
    expect(useGameStore.getState().products).toHaveLength(1)
  })

  it('SUP-01 真点击 FAIL：真实字段缺失 → 生产求值 FAIL → 失败原因逐条可见、state 保持 READY_TO_DELIVER（R14）', () => {
    const projectId = readyToDeliver()
    // 真实 FAIL：玩家把项目正式名清空 → fieldNonEmpty('finalTitle') 未满足 →
    // 生产路径 evaluateDeliveryGate 真实产出 D02-MISSING-CORE（非夹具注入）。
    useGameStore.getState().projects[0]!.name = ''
    const gate = useGameStore.getState().game!.getDeliveryGateEvaluation(projectId, 'full')!
    expect(gate.available).toBe(true)
    expect(gate.pass).toBe(false)
    expect(gate.reasonCodes.length).toBeGreaterThan(0)

    renderDeliver()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    fireEvent.click(screen.getByTestId('deliver-disclosure-ack'))
    const confirm = screen.getByTestId('deliver-submit-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    const after = useGameStore.getState().game!.getExecutionProject(projectId)!
    expect(after.project.state).toBe('READY_TO_DELIVER')
    expect(after.project.deliveryFailures).toBe(1)
    expect(after.project.lastDeliveryFailure!.reasonCodes).toEqual(gate.reasonCodes)
    expect(after.builds).toHaveLength(0)
    // U3：失败原因逐条可见（真点击后 UI 重渲染，非命令级夹具）
    expect(screen.getByTestId('deliver-failure-reasons').querySelectorAll('li')).toHaveLength(gate.reasonCodes.length)
    gate.reasonCodes.forEach((code, idx) => {
      expect(screen.getByTestId(`deliver-failure-reason-${idx}`).textContent).toContain(code)
    })
  })
})
