import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
 * REC-04/SUP-01：自动化集成覆盖交付→上市接线，不替代真实浏览器体验。
 *
 * 与 07B REVISION2 的关键区别：
 *  - 本文件**不** import evaluateDeliveryGate / baseContext / p1Templates，
 *  - 本文件**不**调用 registerDeliveryGateEvaluation 注入快照；
 *  - gate 快照由生产代码 `GameWorld.refreshDeliveryGateEvaluation` 从真实运行状态
 *    派生 EvaluationContext、调用领域 evaluateDeliveryGate 后登记。
 * 本用例不手写生命周期状态，但用应用命令推进日期与组队；真实浏览器体验另见 BLOCKED 报告。
 */
describe('REC-04/SUP-01 自动化集成：立项→自然推进→交付→上市（非手写状态）', () => {
  beforeEach(() => {
    mem.clear()
    const gw = createGameWorld(42)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    useGameStore.setState({ game: gw } as never)
    useGameStore.getState().refresh()
  })

  it('覆盖交付与上市接线，且快照由生产路径真实内核计算并登记', () => {
    expect(useGameStore.getState().products).toHaveLength(0)
    const game = useGameStore.getState().game!
    // 观察生产登记调用：测试本身不注入任何 gate 快照。
    const registerSpy = vi.spyOn(game, 'registerDeliveryGateEvaluation')
    const submitSpy = vi.spyOn(game, 'submitDeliveryForProject')

    const shell = render(<GameShell />)

    // —— 1. 立项：真实 UI 点击（输入名称 / 勾选受众 / 锁定 / 确认）——
    const nav = screen.getByRole('navigation')
    fireEvent.click(within(nav).getByRole('button', { name: t('nav.newProject') }))
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'SUP01 真机游戏' } })
    const segment = screen.getByTestId('segment-multiselect').querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(segment).not.toBeNull()
    fireEvent.click(segment)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    fireEvent.click(screen.getByTestId('confirm-create'))
    expect(useGameStore.getState().projects).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'SUP01 真机游戏' })).toBeTruthy()
    expect(screen.getByTestId('project-block-hint').textContent).toContain('没有可用产能')
    const projectId = useGameStore.getState().projects[0]!.id

    // —— 2. 组队：真实 UI 点击候选人 → 确认招聘 ——
    fireEvent.click(within(nav).getByRole('button', { name: t('nav.hire') }))
    fireEvent.click(screen.getAllByTestId('candidate-card')[0]!)
    fireEvent.click(screen.getByTestId('recruit-confirm'))
    fireEvent.click(screen.getByTestId('recruit-confirm')) // 二次确认：UI 要求显式确认后才招聘
    const pendingArrivalDay = game.world.pendingHires?.[0]?.arrivalDay
    expect(pendingArrivalDay).toBeTypeOf('number')
    expect(useGameStore.getState().employees.length).toBe(0)

    // 为自然推进提供完整的五学科团队；岗位招聘走同一应用命令，随后分配到玩家项目。
    for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
      const hired = game.hireEmployee({ name: `SUP-${role}`, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
      expect(hired.success).toBe(true)
      expect(game.assignEmployeeToProject(hired.result!.id, projectId, 1, 'generalist').success).toBe(true)
    }
    game.advanceSimulation(pendingArrivalDay! - game.world.currentDayIndex)
    useGameStore.getState().refresh()
    expect(useGameStore.getState().employees.length).toBeGreaterThan(0)
    const phaseAfterArrival = game.world.projects.find((project) => project.id === projectId)?.phase
    if (phaseAfterArrival === 'CONCEPT' || phaseAfterArrival === 'PRE_PRODUCTION') {
      expect(game.advanceProjectPhase(projectId).success).toBe(true)
    }
    const phaseAfterFirstAdvance = game.world.projects.find((project) => project.id === projectId)?.phase
    if (phaseAfterFirstAdvance === 'PRE_PRODUCTION') {
      expect(game.advanceProjectPhase(projectId).success).toBe(true)
    }
    game.advanceSimulation(365)
    useGameStore.getState().refresh()
    const execution = game.getExecutionProject(projectId)!
    expect(execution.project.state).toBe('READY_TO_DELIVER')
    expect(registerSpy).not.toHaveBeenCalled()

    // 由工作室样机进入交付页，使用真实研发状态。
    fireEvent.click(within(nav).getByRole('button', { name: t('studio.title') }))
    fireEvent.click(screen.getByRole('button', { name: t('studio.delivery') }))

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

    // —— 5. 上市：真点击详情页上市按钮（自然阶段投影 + 计划日守卫就绪）——
    fireEvent.click(within(nav).getByRole('button', { name: t('nav.projects') }))
    fireEvent.click(screen.getByText('SUP01 真机游戏'))
    fireEvent.click(screen.getByText(t('project.actions.launch')))

    expect(useGameStore.getState().products).toHaveLength(1)
    expect(useGameStore.getState().products[0]!.name).toBe('SUP01 真机游戏')
    fireEvent.click(within(nav).getByRole('button', { name: t('studio.title') }))
    fireEvent.click(screen.getByRole('button', { name: t('studio.latestRelease') }))
    expect(screen.getByRole('heading', { name: t('contract.title') })).toBeTruthy()
    const firstProduct = useGameStore.getState().products[0]!
    const quote = game.requestPublisherQuote({
      productId: firstProduct.id, partnerId: 'global-star', template: 'channel', ratePercent: 30,
      durationDays: 30, marketScope: ['japan'],
    })
    expect(quote.result?.rate).toBeLessThan(30)
    expect(game.world.publishingContracts).toHaveLength(0)
    expect(game.expandProductReach(firstProduct.id, 'japan').success).toBe(true)
    expect(game.expandProductReach(firstProduct.id, 'japan').errorCode).toBe('catalog.expand.used')
    fireEvent.click(screen.getByRole('button', { name: t('catalog.newSequel') }))
    expect(screen.getByText(t('catalog.sequelOf').replace('{name}', firstProduct.name))).toBeTruthy()
    fireEvent.change(screen.getByTestId('product-name'), { target: { value: 'SUP02 sequel' } })
    fireEvent.click(screen.getByTestId('segment-multiselect').querySelector('input')!)
    fireEvent.click(screen.getByTestId('lock-snapshot'))
    fireEvent.click(screen.getByTestId('confirm-create'))
    const sequel = game.world.projects.find((project) => project.name === 'SUP02 sequel')!
    expect(sequel.predecessorProductId).toBe(firstProduct.id)
    game.advanceSimulation(90)
    expect(game.retireProduct({ productId: firstProduct.id }).success).toBe(true)
    expect(game.updateCatalogProduct(firstProduct.id).success).toBe(true)
    expect(game.updateCatalogProduct(firstProduct.id).errorCode).toBe('catalog.update.cooldown')
    expect(game.world.products.find((product) => product.id === firstProduct.id)?.status).toBe('active')
    for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
      const current = game.world.employees.find((employee) => employee.name === `SUP-${role}` && employee.status === 'hired')
      const member = current ?? game.hireEmployee({ name: `SUP02-${role}`, role, skillLevel: 5, salaryMonthlyCents: 1_000 }).result
      expect(member).toBeDefined()
      expect(game.assignEmployeeToProject(member!.id, sequel.id, 1, 'generalist').success).toBe(true)
    }
    for (let i = 0; i < 2; i += 1) {
      const phase = game.world.projects.find((project) => project.id === sequel.id)?.phase
      if (phase === 'CONCEPT' || phase === 'PRE_PRODUCTION') expect(game.advanceProjectPhase(sequel.id).success).toBe(true)
    }
    game.advanceSimulation(365)
    if (game.getExecutionSummary(sequel.id)?.unstaffedDisciplines?.includes('art')) {
      const artist = game.hireEmployee({ name: 'SUP02 replacement artist', role: 'artist', skillLevel: 5, salaryMonthlyCents: 1_000 })
      expect(artist.success).toBe(true)
      expect(game.assignEmployeeToProject(artist.result!.id, sequel.id, 1, 'generalist').success).toBe(true)
      game.advanceSimulation(20)
    }
    useGameStore.getState().refresh()
    expect(game.getExecutionProject(sequel.id)?.project.state).toBe('READY_TO_DELIVER')
    fireEvent.click(within(nav).getByRole('button', { name: t('studio.title') }))
    fireEvent.click(screen.getByRole('button', { name: t('studio.delivery') }))
    fireEvent.click(screen.getByTestId('deliver-submit-open'))
    fireEvent.click(screen.getByTestId('deliver-disclosure-ack'))
    fireEvent.click(screen.getByTestId('deliver-submit-confirm'))
    fireEvent.click(within(nav).getByRole('button', { name: t('nav.projects') }))
    fireEvent.click(screen.getByText('SUP02 sequel'))
    fireEvent.click(screen.getByText(t('project.actions.launch')))
    expect(useGameStore.getState().products.find((product) => product.name === sequel.name)?.predecessorProductId).toBe(firstProduct.id)
    shell.unmount()
  })
})
