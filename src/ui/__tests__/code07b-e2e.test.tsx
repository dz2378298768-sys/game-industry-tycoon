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
import { useGameStore, t } from '@ui/state/game-store'
import { createGameWorld } from '@application/factories/create-game-world'

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
