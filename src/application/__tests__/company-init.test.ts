import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { TUNING } from '@content/tuning'

describe('P0 公司初始化现金一致性', () => {
  it('创建公司后现金恰好为 $65,000', () => {
    const gw = new GameWorld(1)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })

    expect(company.cashBalanceCents).toBe(6_500_000)
    expect(company.cashBalanceCents).toBe(TUNING.company.startingCashCents)
    expect(gw.finance.getCashBalance(company.id)).toBe(6_500_000)
  })

  it('初始化交易恰好一笔 advance', () => {
    const gw = new GameWorld(1)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const txs = gw.finance.getTransactionsByCompany(company.id)

    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('advance')
    expect(txs[0]?.amountCents).toBe(TUNING.company.startingCashCents)
  })

  it('重复执行初始化不会重复增加现金', () => {
    const gw = new GameWorld(1)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })

    // 再次以同一幂等键入账（模拟重复初始化）
    const r = gw.finance.postTransaction({
      idempotencyKey: `init:${company.id}:opening-cash`,
      companyId: company.id,
      day: 0,
      category: 'advance',
      amountCents: TUNING.company.startingCashCents,
      description: '公司启动资金',
    })

    expect(r.idempotent).toBe(true)
    expect(gw.finance.getCashBalance(company.id)).toBe(6_500_000)
    expect(gw.finance.getTransactionsByCompany(company.id)).toHaveLength(1)
  })

  it('公司实体、FinanceService 余额与流水累计三者一致', () => {
    const gw = new GameWorld(1)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const sum = gw.finance
      .getTransactionsByCompany(company.id)
      .reduce((acc, tx) => acc + tx.amountCents, 0)

    expect(company.cashBalanceCents).toBe(sum)
    expect(gw.finance.getCashBalance(company.id)).toBe(sum)
  })
})
