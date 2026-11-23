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

  it('A-42 / G-9：EA 披露确认弹窗逐条展示 + 显式确认控件；提交禁用带 OPEN 原因', () => {
    renderDeliver()
    expect(screen.queryByTestId('deliver-submit-confirm')).toBeNull()
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    expect(screen.getByTestId('deliver-confirm-disclosures')).toBeTruthy()
    const ack = screen.getByTestId('deliver-disclosure-ack') as HTMLInputElement
    expect(ack.checked).toBe(false)
    const confirm = screen.getByTestId('deliver-submit-confirm')
    expect(confirm.hasAttribute('disabled')).toBe(true)
    expect(confirm.getAttribute('title')).toContain('OPEN-P09-DELIVERY-WIRING')
    fireEvent.click(ack)
    expect(ack.checked).toBe(true)
  })

  it('E 级缺陷横幅不伪造（内核无缺陷明细数据源）', () => {
    const { container } = renderDeliver()
    expect(screen.queryByTestId('deliver-e-defect-banner')).toBeNull()
    expect(container.textContent).not.toContain('存在 E 级缺陷')
  })
})
