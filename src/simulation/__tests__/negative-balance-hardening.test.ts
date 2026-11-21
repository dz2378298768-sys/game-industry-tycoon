/**
 * M2-I 负余额结算加固（交叉验证 F 组发现的唯一实质缺陷）。
 *
 * 事实：支出（工资/租金/退款/合同）允许负余额，而销售入账的 bulk 不带该选项，
 * 导致“余额已负 + 仍有在售产品”时整日结算抛 SALES_POSTING_FAILED，UI 无兜底而白屏。
 *
 * 本用例锁四件事：
 *   I01 销售入账不因负余额被拒（服务层）
 *   I02 bulk 默认语义不变（不传选项时仍拒绝透支，且原子回滚）
 *   I03 生产路径负余额下推进 30 天不抛，且现金随销售回升
 *   I04 单日结算抛错时日历不跳日（回退到本批起点）
 *   I05 store.advanceDays 不把异常抛给 React，且转成可见 toast
 */
import { describe, it, expect, vi } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { GameWorld } from '@application/mediators/game-world'
import { FinanceService } from '@simulation/services/finance-service'
import {
  SALES_DAY,
  makeSalesProduct,
  makeSalesService,
  makeSalesWorld,
} from './sales-fixtures'
import { makeCompany, makeProject } from '../../__tests__/helpers'
import { useGameStore } from '@ui/state/game-store'

function drainToNegative(finance: FinanceService, cents: number) {
  const r = finance.postTransaction(
    {
      idempotencyKey: 'fixture-drain',
      companyId: 'company-1',
      day: 0,
      category: 'office_rent',
      amountCents: -cents,
      description: 'fixture drain',
    },
    { allowNegativeBalance: true },
  )
  expect(r.success).toBe(true)
}

describe('M2-I 负余额结算加固', () => {
  it('I01 服务层：余额为负时销售仍入账，且不被 FIN_INSUFFICIENT_CASH 拒绝', () => {
    const world = makeSalesWorld([makeSalesProduct()])
    const harness = makeSalesService(world)
    drainToNegative(harness.finance, 5_000_000)
    expect(harness.finance.getCashBalance('company-1')).toBe(-5_000_000)

    const state = harness.service.simulateDailySales(world, SALES_DAY)
    const records = state.products[0]?.salesByPeriod ?? []
    const posted = harness.finance.getAllTransactions().filter((t) => t.idempotencyKey.startsWith('sales'))
    console.log('[I01] records:', records.length, 'sales tx:', posted.length, 'cash:', harness.finance.getCashBalance('company-1'))
    expect(records.length).toBeGreaterThan(0)
    expect(posted.length).toBeGreaterThan(0)
    expect(harness.finance.getCashBalance('company-1')).toBeGreaterThan(-5_000_000)
  })

  it('I02 bulk 默认语义不变：不传选项时拒绝透支且整批回滚', () => {
    const finance = new FinanceService()
    finance.registerCompany('company-1')
    const r = finance.bulkPostTransactions([
      {
        idempotencyKey: 'bulk-rent',
        companyId: 'company-1',
        day: 1,
        category: 'office_rent',
        amountCents: -1_000,
        description: 'rent',
      },
      {
        idempotencyKey: 'bulk-salary',
        companyId: 'company-1',
        day: 1,
        category: 'salary',
        amountCents: -1_000,
        description: 'salary',
      },
    ])
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_INSUFFICIENT_CASH')
    expect(finance.getAllTransactions()).toHaveLength(0)
    expect(finance.getCashBalance('company-1')).toBe(0)
  })

  it('I03 生产路径：负余额 + 在售产品推进 30 天不抛，现金回升且账实相符', () => {
    const gw = createGameWorld(42)
    const company = makeCompany({ id: 'company-1', cashBalanceCents: 10_000_000, status: 'active' })
    gw.world = { ...gw.world, companies: [company] }
    gw.finance.registerCompany(company.id)
    gw.finance.postTransaction({
      idempotencyKey: 'fixture-capital',
      companyId: company.id,
      day: 0,
      category: 'advance',
      amountCents: 10_000_000,
      description: 'capital',
    })
    drainToNegative(gw.finance, 30_000_000) // 现金 -20,000,000
    gw.world.projects.push(
      makeProject({
        id: 'project-1',
        companyId: company.id,
        phase: 'READY_TO_LAUNCH',
        plannedLaunchDay: gw.calendar.currentDayIndex,
        audienceSegmentIds: ['arcade_enthusiasts'],
        targetPlatformIds: ['arcade_pre_1975'],
        workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
      }),
    )
    const launched = gw.launchProject('project-1')
    expect(launched.success).toBe(true)
    expect(gw.setProductPrice({ productId: launched.result!.id, priceCents: 2999 }).success).toBe(true)

    expect(() => gw.advanceSimulation(30)).not.toThrow()
    const cash = gw.finance.getCashBalance(company.id)
    const txSum = gw.finance.getAllTransactions().reduce((a, t) => a + t.amountCents, 0)
    const records = gw.world.products.reduce((a, p) => a + p.salesByPeriod.length, 0)
    console.log('[I03] cash:', cash, 'txSum:', txSum, 'records:', records, 'day:', gw.calendar.currentDayIndex)
    expect(records).toBeGreaterThan(0)
    expect(cash).toBe(txSum)
    expect(cash).toBeGreaterThan(-20_000_000)
    expect(gw.calendar.currentDayIndex).toBe(30)
  })

  it('I04 单日结算抛错：日历回退到本批起点，错误仍上抛', () => {
    const gw = new GameWorld(7)
    const scheduler = (gw as unknown as { scheduler: { executeDay: () => never } }).scheduler
    const spy = vi.spyOn(scheduler, 'executeDay').mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => gw.advanceSimulation(3)).toThrow('boom')
    expect(gw.calendar.currentDayIndex).toBe(0)
    spy.mockRestore()
  })

  it('I05 store 边界：推进异常转 toast，不抛给调用方', () => {
    const advanceSimulation = vi.fn(() => {
      throw new Error('SALES_POSTING_FAILED: bulk posting failed')
    })
    const toast = vi.fn()
    useGameStore.setState({
      game: { advanceSimulation } as unknown as GameWorld,
      toast,
      refresh: () => undefined,
    })
    expect(() => useGameStore.getState().advanceDays(1)).not.toThrow()
    expect(advanceSimulation).toHaveBeenCalledWith(1)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('SALES_POSTING_FAILED'), 'error')
  })
})
