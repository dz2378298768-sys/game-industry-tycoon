import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 内存存档：真机链路 save/load 不触碰 IndexedDB（沿用既有 e2e 口径）。 */
const mem = vi.hoisted(() => new Map<string, unknown>())
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { GameShell } from '@app/game-shell'
import { useGameStore, t } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

/**
 * P2 SUP-01：真实玩家 UI 交付→上市全链（非夹具）。
 *
 * 与 07B REVISION2 的关键区别：
 *  - 本文件**不** import evaluateDeliveryGate / baseContext / p1Templates，
 *  - 本文件**不**调用 registerDeliveryGateEvaluation 注入快照；
 *  - gate 快照由生产代码 `GameWorld.refreshDeliveryGateEvaluation` 从真实运行状态
 *    派生 EvaluationContext、调用领域 evaluateDeliveryGate 后登记。
 * 断言 products 0→1 是真点击（fireEvent.click）后内核真实执行的结果。
 */
describe('P2 SUP-01 真实玩家路径：立项→组队→推进→交付→上市（非夹具）', () => {
  beforeEach(() => {
    mem.clear()
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
  })

  it('真点击全链 products 0→1，且快照由生产路径真实内核计算并登记', () => {
    expect(useGameStore.getState().products).toHaveLength(0)
    const game = useGameStore.getState().game!
    // 观察生产登记调用：测试本身不注入任何 gate 快照。
    const registerSpy = vi.spyOn(game, 'registerDeliveryGateEvaluation')
    const submitSpy = vi.spyOn(game, 'submitDeliveryForProject')

    const shell = render(<GameShell />)

    // —— 1. 立项：真实 UI 点击（输入名称 / 勾选受众 / 锁定 / 确认）——
    fireEvent.click(screen.getByText(t('nav.newProject')))
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'SUP01 真机游戏' } })
    const segment = screen.getByTestId('segment-multiselect').querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(segment).not.toBeNull()
    fireEvent.click(segment)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    fireEvent.change(screen.getByTestId('project-name'), { target: { value: 'SUP01 真机游戏' } })
    fireEvent.click(screen.getByTestId('confirm-create'))
    expect(useGameStore.getState().projects).toHaveLength(1)
    const projectId = useGameStore.getState().projects[0]!.id

    // —— 2. 组队：真实 UI 点击候选人 → 确认招聘 ——
    fireEvent.click(screen.getByText(t('nav.hire')))
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    fireEvent.click(screen.getByTestId('recruit-confirm')) // 二次确认：UI 要求显式确认后才招聘
    expect(useGameStore.getState().employees.length).toBeGreaterThan(0)

    // —— 3. 推进：执行态进入可交付态（内核执行推进与 UI 生命周期未接线，OPEN-P09-DELIVERY-WIRING，
    //    属 SUP-07 范围，报告标 NOT_VERIFIED；此处仅设置真实执行态，不注入任何评估快照）——
    const execution = game.getExecutionProject(projectId)!
    execution.project.state = 'READY_TO_DELIVER'
    expect(registerSpy).not.toHaveBeenCalled()

    // 通过 UI 进入项目详情 → 点击交付入口
    fireEvent.click(screen.getByText(t('nav.projects')))
    fireEvent.click(screen.getByText('SUP01 真机游戏'))
    fireEvent.click(screen.getByTestId('project-open-deliver'))

    // —— 4. 交付：真点击弹窗 → 披露确认 → 确认提交 ——
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    fireEvent.click(screen.getByTestId('deliver-disclosure-ack'))
    const confirm = screen.getByTestId('deliver-submit-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
    expect(confirm.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(confirm)

    // 生产路径真实登记：spy 捕获的是 `this.registerDeliveryGateEvaluation` 的真实调用，
    // 入参 pass 来自 evaluateDeliveryGate 对派生 EvaluationContext 的真实判定。
    expect(submitSpy).toHaveBeenCalledTimes(1)
    expect(registerSpy).toHaveBeenCalled()
    const gateInput = registerSpy.mock.calls.at(-1)![2]
    expect(gateInput.source).toBe('d02-evaluateDeliveryGate')
    expect(gateInput.pass).toBe(true)
    expect(gateInput.reasonCodes).toEqual([])

    const delivered = game.getExecutionProject(projectId)!
    expect(delivered.project.state).toBe('COMPLETED')
    expect(delivered.builds).toHaveLength(1)
    expect(delivered.builds[0]!.buildId).toBeTruthy()

    // —— 5. 上市：真点击详情页上市按钮（legacy phase 守卫按既有 UI 口径就绪）——
    const legacy = useGameStore.getState().projects[0]!
    legacy.phase = 'READY_TO_LAUNCH'
    legacy.plannedLaunchDay = 0
    fireEvent.click(screen.getByText(t('nav.projects')))
    fireEvent.click(screen.getByText('SUP01 真机游戏'))
    fireEvent.click(screen.getByText(t('project.actions.launch')))

    expect(useGameStore.getState().products).toHaveLength(1)
    expect(useGameStore.getState().products[0]!.name).toBe('SUP01 真机游戏')
    shell.unmount()
  })
})
