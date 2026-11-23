import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { writeCompanyCashBalance } from '@domain/entities/company'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { createPersonnelSnapshot } from '@domain/value-objects/personnel-tuning'
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
  // CODE-06：本套件只验证月结机制。D-03 §6.7 随机离职（personId 为随机 uuid）
  // 会让员工在长跨度模拟中非确定性离职，这里把日离职概率上限清零以隔离被测行为。
  const snap = createPersonnelSnapshot(0)
  snap.params = { ...snap.params, pMax: 0, pBase: 0 }
  gw.world.personnelFormulaSnapshot = snap
  return { gw, company, emp }
}

describe('财务月度结算 (D12-D15)', () => {
  // CODE-06：月薪幂等键已从旧 periodKey `m1970-1` 迁到承诺键 `<commitmentId>:<YYYY-MM>`
  // （②流水线 realizeCommitment），租金键仍为 `rent:{companyId}:m1970-1`。
  function txInMonth(
    gw: GameWorld,
    companyId: string,
    oldPeriodKey: string,
    monthKey: string,
  ) {
    return gw.finance
      .getTransactionsByCompany(companyId)
      .filter(tx => tx.idempotencyKey.includes(oldPeriodKey) || tx.idempotencyKey.includes(monthKey))
  }

  it('月末只结算一次工资与租金', () => {
    const { gw, emp } = setup()
    gw.advanceSimulation(30) // 1970-01-31

    const jan = txInMonth(gw, emp.companyId, 'm1970-1', '1970-01')
    expect(jan).toHaveLength(2)
    expect(jan.find(tx => tx.category === 'salary')?.amountCents).toBe(-emp.salaryMonthlyCents)
    expect(jan.find(tx => tx.category === 'office_rent')?.amountCents).toBe(
      -Math.round(TUNING.company.baseMonthlyRentCents * cityRentMultiplier('san_francisco')),
    )

    gw.advanceSimulation(1) // 1970-02-01
    const stillJan = txInMonth(gw, emp.companyId, 'm1970-1', '1970-01')
    expect(stillJan).toHaveLength(2)
  })

  it('闰年 2 月 29 日才是月末结算日', () => {
    const { gw, emp } = setup()
    const feb28 = gregorianToDayIndex(1972, 2, 28)
    gw.advanceSimulation(feb28)

    const before = txInMonth(gw, emp.companyId, 'm1972-2', '1972-02')
    expect(before).toHaveLength(0)

    gw.advanceSimulation(1) // 1972-02-29
    const after = txInMonth(gw, emp.companyId, 'm1972-2', '1972-02')
    expect(after).toHaveLength(2)
  })

  it('负现金仍可继续结算工资和租金', () => {
    const { gw, company } = setup()
    gw.advanceSimulation(1700) // 起始资金 $120,000（ADJ-12 S1-1），1700 天（约 56 个月）烧穿为负

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
    gw.advanceSimulation(1700)
    writeCompanyCashBalance(company, gw.finance.getCashBalance(company.id))

    const out = gw.createProject({
      name: 'Blocked Game',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 500,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(out.success).toBe(false)
    // 推进 1700 天后公司早已破产（DESIGN-OI-21），破产守卫优先于 FIN_DISTRESS
    expect(['FIN_COMPANY_BANKRUPT', 'FIN_DISTRESS']).toContain(out.errorCode)
  })
})
