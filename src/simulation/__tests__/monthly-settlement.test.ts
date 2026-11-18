import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { TUNING } from '@content/tuning'
import { cityRentMultiplier } from '@content/queries'

function setup() {
  const gw = new GameWorld(11)
  const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  const hired = gw.hireEmployee({
    name: 'Dev',
    role: 'programmer',
    skillLevel: 3,
    salaryMonthlyCents: 100_000,
  })
  const emp = hired.result
  if (!emp) throw new Error('hire failed')
  return { gw, company, emp }
}

describe('财务月度结算 (D12-D15)', () => {
  it('月末只结算一次工资与租金', () => {
    const { gw, emp } = setup()
    gw.advanceSimulation(30) // 1970-01-31

    const jan = gw.finance
      .getTransactionsByCompany(emp.companyId)
      .filter(tx => tx.idempotencyKey.includes('m1970-1'))
    expect(jan).toHaveLength(2)
    expect(jan.find(tx => tx.category === 'salary')?.amountCents).toBe(-emp.salaryMonthlyCents)
    expect(jan.find(tx => tx.category === 'office_rent')?.amountCents).toBe(
      -Math.round(TUNING.company.baseMonthlyRentCents * cityRentMultiplier('san_francisco')),
    )

    gw.advanceSimulation(1) // 1970-02-01
    const stillJan = gw.finance
      .getTransactionsByCompany(emp.companyId)
      .filter(tx => tx.idempotencyKey.includes('m1970-1'))
    expect(stillJan).toHaveLength(2)
  })

  it('闰年 2 月 29 日才是月末结算日', () => {
    const { gw, emp } = setup()
    const feb28 = gregorianToDayIndex(1972, 2, 28)
    gw.advanceSimulation(feb28)

    const before = gw.finance
      .getTransactionsByCompany(emp.companyId)
      .filter(tx => tx.idempotencyKey.includes('m1972-2'))
    expect(before).toHaveLength(0)

    gw.advanceSimulation(1) // 1972-02-29
    const after = gw.finance
      .getTransactionsByCompany(emp.companyId)
      .filter(tx => tx.idempotencyKey.includes('m1972-2'))
    expect(after).toHaveLength(2)
  })

  it('负现金仍可继续结算工资和租金', () => {
    const { gw, company } = setup()
    gw.advanceSimulation(800) // 超过 26 个月，现金必然为负

    expect(gw.finance.getCashBalance(company.id)).toBeLessThan(0)
    const salaries = gw.finance.getAllTransactions().filter(tx => tx.category === 'salary')
    const rents = gw.finance.getAllTransactions().filter(tx => tx.category === 'office_rent')
    expect(salaries.length).toBeGreaterThan(12)
    expect(rents.length).toBe(salaries.length)
    // 每个幂等键只出现一次
    expect(new Set(salaries.map(tx => tx.idempotencyKey)).size).toBe(salaries.length)
  })

  it('负现金时禁止创建新项目', () => {
    const { gw, company } = setup()
    gw.advanceSimulation(800)
    company.cashBalanceCents = gw.finance.getCashBalance(company.id)

    const out = gw.createProject({
      name: 'Blocked Game',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 500,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(out.success).toBe(false)
    expect(out.errorCode).toBe('FIN_DISTRESS')
  })
})
