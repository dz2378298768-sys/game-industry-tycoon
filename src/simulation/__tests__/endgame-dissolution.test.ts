/**
 * M3-A1 终局：破产满 360 天 → 解散（DECISION-M3-P0-ENDGAME-002）。
 *
 * E01 到期解散 + 清算处置 + 事件
 * E02 差一天不解散
 * E03 恢复清除起算日；再次破产重新起算
 * E04 解散后不再产生交易、不重复事件
 * E06 旧档无 bankruptSinceDay → 读档回填当日
 */
import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { GameWorld } from '@application/mediators/game-world'
import { TUNING } from '@content/tuning'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { makeCompany, makeEmployee, makeProject, makeWorld } from '../../__tests__/helpers'
import { makeSalesProduct } from '../__tests__/sales-fixtures'
import type { PublishingContract } from '@domain/entities/publishing-contract'

const MONTH_END = gregorianToDayIndex(1972, 1, 31)
/** 裁定值写死为 360：不得从 TUNING 反推，否则改常量测试永远绿（自证） */
const GRACE = 360

function schedule(world: ReturnType<typeof makeWorld>, balanceCents = -500_000) {
  const finance = new FinanceService()
  finance.registerCompany('company-1')
  finance.postTransaction(
    {
      idempotencyKey: 'seed',
      companyId: 'company-1',
      day: 0,
      category: 'advance',
      amountCents: balanceCents,
      description: 'seed balance',
    },
    { allowNegativeBalance: true },
  )
  const scheduler = new DailyScheduler({ finance })
  return { scheduler, finance }
}

function contract(): PublishingContract {
  return {
    id: 'CT-PROD-1-revenue_share-1',
    productId: 'PROD-1',
    type: 'revenue_share',
    ratePercent: 10,
    signedDay: 0,
    durationDays: null,
    status: 'active',
    settledCents: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
  }
}

function doomedWorld(sinceDay: number) {
  return makeWorld({
    currentDayIndex: MONTH_END - 1,
    companies: [
      makeCompany({
        status: 'bankrupt',
        bankruptSinceDay: sinceDay,
        cashBalanceCents: -500_000,
      }),
    ],
    employees: [makeEmployee()],
    projects: [makeProject()],
    products: [makeSalesProduct()],
    publishingContracts: [contract()],
  })
}

describe('M3-A1 终局解散', () => {
  it('E01 破产满 360 天 → dissolved；产品/合同/项目/员工全部清算', () => {
    const world = doomedWorld(MONTH_END - GRACE)
    const { scheduler } = schedule(world)
    const next = scheduler.executeDay(world, MONTH_END)

    expect(next.companies[0]!.status).toBe('dissolved')
    expect(next.products[0]!.status).toBe('retired')
    expect(next.publishingContracts[0]!.status).toBe('terminated')
    expect(next.projects[0]!.phase).toBe('CANCELLED')
    expect(next.projects[0]!.cancellationReason).toBe('company_dissolved')
    expect(next.employees[0]!.status).toBe('fired')

    const events = next.events.filter((e) => e.type === 'CompanyDissolved')
    expect(events).toHaveLength(1)
    expect(events[0]!.payload).toMatchObject({
      companyId: 'company-1',
      reason: 'bankruptcy_timeout',
    })
    // 解散前已结算当日工资/租金，故现金低于种入值
    expect((events[0]!.payload as { cashAtDissolution: number }).cashAtDissolution).toBeLessThan(0)
    console.log('[E01] dissolved + event + 清算完成；lifetimeDays=', (events[0]!.payload as { lifetimeDays: number }).lifetimeDays)
  })

  it('E02 差一天（359 天）不解散', () => {
    const world = doomedWorld(MONTH_END - (GRACE - 1))
    const { scheduler } = schedule(world)
    const next = scheduler.executeDay(world, MONTH_END)
    expect(TUNING.ai.dissolutionGraceDays).toBe(GRACE)
    expect(next.companies[0]!.status).toBe('bankrupt')
    expect(next.events.filter((e) => e.type === 'CompanyDissolved')).toHaveLength(0)
  })

  it('E03 恢复清除起算日；再次破产重新起算', () => {
    const gw = new GameWorld(7)
    gw.world = makeWorld({
      companies: [makeCompany({ status: 'bankrupt', bankruptSinceDay: 100, cashBalanceCents: 0 })],
      employees: [],
      projects: [],
    })
    gw.finance.registerCompany('company-1')
    gw.finance.postTransaction(
      {
        idempotencyKey: 'revive',
        companyId: 'company-1',
        day: 0,
        category: 'sales_revenue',
        amountCents: 600_000,
        description: 'revive',
      },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(1)
    const recovered = gw.world.companies[0]!
    expect(recovered.status).toBe('active')
    expect(recovered.bankruptSinceDay).toBeUndefined()

    gw.finance.postTransaction(
      {
        idempotencyKey: 'sink',
        companyId: 'company-1',
        day: 1,
        category: 'office_rent',
        amountCents: -1_000_000,
        description: 'sink',
      },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(1)
    const bankruptAgain = gw.world.companies[0]!
    expect(bankruptAgain.status).toBe('bankrupt')
    expect(bankruptAgain.bankruptSinceDay).toBe(gw.calendar.currentDayIndex)
  })

  it('E04 解散后不再产生新交易、不重复事件', () => {
    const world = doomedWorld(MONTH_END - GRACE)
    const { scheduler, finance } = schedule(world)
    const first = scheduler.executeDay(world, MONTH_END)
    const txCount = finance.getAllTransactions().length
    const cash = finance.getCashBalance('company-1')

    // 次日再推进（非月末，但应被跳过）
    const second = scheduler.executeDay(first, MONTH_END + 1)
    expect(second.companies[0]!.status).toBe('dissolved')
    expect(finance.getAllTransactions().length).toBe(txCount)
    expect(finance.getCashBalance('company-1')).toBe(cash)
    expect(second.events.filter((e) => e.type === 'CompanyDissolved')).toHaveLength(1)
  })

  it('E06 旧档破产无起算日 → restore 回填当日', () => {
    const gw = new GameWorld(7)
    const world = makeWorld({
      currentDayIndex: 500,
      companies: [makeCompany({ status: 'bankrupt', cashBalanceCents: 0 })],
      employees: [],
      projects: [],
    })
    gw.restore(world)
    expect(gw.world.companies[0]!.bankruptSinceDay).toBe(500)
  })
})
