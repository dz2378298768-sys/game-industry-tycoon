import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { writeCompanyCashBalance } from '@domain/entities/company'
import { TUNING } from '@content/tuning'
import { citySalaryMultiplier } from '@content/queries'
import { DEFAULT_PERSONNEL_PARAMS } from '@domain/value-objects/personnel-tuning'
import { skillFactor } from '@simulation/systems/work-systems'
import { DEFAULT_PROJECT_FORMULA_PARAMS } from '@domain/value-objects/project-execution-tuning'

function bootstrap() {
  const gw = new GameWorld(7)
  const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  return { gw, company }
}

describe('员工规则 (E16/E17/E18)', () => {
  it('招聘时应用城市工资系数', () => {
    const { gw, company } = bootstrap()
    const out = gw.hireEmployee({
      name: 'Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 100_000,
    })
    expect(out.success).toBe(true)
    const expected = Math.round(100_000 * citySalaryMultiplier(company.cityId))
    expect(out.result?.salaryMonthlyCents).toBe(expected)
  })

  it('招聘成本为月薪 × recruitFeeMonths（CODE-06 / ADJ-12 S5-3：×1）', () => {
    const { gw } = bootstrap()
    const company = gw.getPlayerCompany()
    if (!company) throw new Error('no company')
    const before = gw.finance.getCashBalance(company.id)
    const out = gw.hireEmployee({
      name: 'Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 100_000,
    })
    const effective = out.result?.salaryMonthlyCents ?? 0
    const cost = Math.round(effective * DEFAULT_PERSONNEL_PARAMS.recruitFeeMonths)
    expect(before - gw.finance.getCashBalance(company.id)).toBe(cost)
  })

  it('管理容量满时拒绝招聘', () => {
    const { gw } = bootstrap()
    const company = gw.getPlayerCompany()
    if (company) company.managementCapacity = 2

    expect(gw.hireEmployee({ name: 'A', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 }).success).toBe(true)
    expect(gw.hireEmployee({ name: 'B', role: 'artist', skillLevel: 3, salaryMonthlyCents: 100_000 }).success).toBe(true)

    const third = gw.hireEmployee({ name: 'C', role: 'qa', skillLevel: 3, salaryMonthlyCents: 100_000 })
    expect(third.success).toBe(false)
    expect(third.errorCode).toBe('EMP_CAPACITY_FULL')
  })

  it('被解雇员工不再计入管理容量', () => {
    const { gw } = bootstrap()
    const company = gw.getPlayerCompany()
    if (company) company.managementCapacity = 1

    const first = gw.hireEmployee({ name: 'A', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 })
    expect(gw.hireEmployee({ name: 'B', role: 'artist', skillLevel: 3, salaryMonthlyCents: 100_000 }).success).toBe(false)

    gw.fireEmployee(first.result?.id ?? '')
    expect(gw.hireEmployee({ name: 'B', role: 'artist', skillLevel: 3, salaryMonthlyCents: 100_000 }).success).toBe(true)
  })

  it('解雇支付一个月工资作为补偿，且重复解雇不会重复支付', () => {
    const { gw } = bootstrap()
    const hired = gw.hireEmployee({ name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 })
    const emp = hired.result
    if (!emp) throw new Error('hire failed')

    const cashBefore = gw.finance.getCashBalance(emp.companyId)
    const fired = gw.fireEmployee(emp.id)
    expect(fired.success).toBe(true)

    const expectedSeverance = Math.round(emp.salaryMonthlyCents * TUNING.employee.severanceMonths)
    expect(cashBefore - gw.finance.getCashBalance(emp.companyId)).toBe(expectedSeverance)
    expect(gw.world.employees.find(e => e.id === emp.id)?.status).toBe('fired')

    const cashAfterFirst = gw.finance.getCashBalance(emp.companyId)
    const again = gw.fireEmployee(emp.id)
    expect(again.success).toBe(false)
    expect(gw.finance.getCashBalance(emp.companyId)).toBe(cashAfterFirst)
    expect(
      gw.finance.getTransactionsByCompany(emp.companyId).filter(tx => tx.category === 'severance'),
    ).toHaveLength(1)
  })

  it('W5-C6 日常域技能系数：skillFactor 读 skillMultiplier，技能 3 级 = 1.0 且与项目执行域刻意分域', () => {
    // 日常/招聘预览域（A）：skillFactor 必须读 TUNING.employee.skillMultiplier
    expect(skillFactor(3)).toBe(1.0)
    expect(skillFactor(3)).toBe(TUNING.employee.skillMultiplier[3])
    expect(skillFactor(1)).toBe(0.7)
    // 项目执行域（B）：fSkill 技能 3 级同为 1.0，但 L1 为 0.6，证明两域互不覆盖
    expect(DEFAULT_PROJECT_FORMULA_PARAMS.fSkill[3]).toBe(1.0)
    expect(DEFAULT_PROJECT_FORMULA_PARAMS.fSkill[1]).toBe(0.6)
    expect(skillFactor(1)).not.toBe(DEFAULT_PROJECT_FORMULA_PARAMS.fSkill[1])
  })

  it('负现金时禁止招聘', () => {
    const { gw } = bootstrap()
    const company = gw.getPlayerCompany()
    if (!company) throw new Error('no company')
    // 手动制造负现金（固定结算场景）。用 tuning 起始金 + 额外 1,000,000 确保为负。
    gw.finance.postTransaction(
      {
        idempotencyKey: 'force-negative',
        companyId: company.id,
        day: 0,
        category: 'salary',
        amountCents: -(TUNING.company.startingCashCents + 1_000_000),
        description: 'force negative',
      },
      { allowNegativeBalance: true },
    )
    writeCompanyCashBalance(company, gw.finance.getCashBalance(company.id))

    const out = gw.hireEmployee({ name: 'X', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 })
    expect(out.success).toBe(false)
    expect(out.errorCode).toBe('FIN_DISTRESS')
  })
})
