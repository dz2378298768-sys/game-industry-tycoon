import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { writeCompanyCashBalance } from '@domain/entities/company'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { citySalaryMultiplier, cityRentMultiplier } from '@content/queries'

function projectParams(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
    ...overrides,
  }
}

/** 为长时间推进补充资金，避免因租金导致负现金干扰年代测试 */
function fund(gw: GameWorld, amountCents: number) {
  const company = gw.getPlayerCompany()
  if (!company) throw new Error('no company')
  gw.finance.postTransaction({
    idempotencyKey: `test-funding:${amountCents}`,
    companyId: company.id,
    day: gw.calendar.currentDayIndex,
    category: 'advance',
    amountCents,
    description: 'test funding',
  })
  writeCompanyCashBalance(company, gw.finance.getCashBalance(company.id))
}

describe('年代准入 (F19)', () => {
  it('不可用平台不能创建项目', () => {
    const gw = new GameWorld(3)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const out = gw.createProject(projectParams({ targetPlatformIds: ['pinball'] }))
    expect(out.success).toBe(false)
    expect(out.errorCode).toBe('PRJ_PLATFORM_UNAVAILABLE')
  })

  it('在同一时代平台解锁后可以创建项目', () => {
    const gw = new GameWorld(3)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    fund(gw, 30_000_000)
    gw.advanceSimulation(gregorianToDayIndex(1972, 1, 1))
    const out = gw.createProject(projectParams({ targetPlatformIds: ['pinball'], plannedLaunchDay: 900 }))
    expect(out.success).toBe(true)
  })

  it('未解锁受众不能创建项目', () => {
    const gw = new GameWorld(3)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const out = gw.createProject(projectParams({ audienceSegmentIds: ['home_players'] }))
    expect(out.success).toBe(false)
    expect(out.errorCode).toBe('PRJ_SEGMENT_UNAVAILABLE')
  })

  it('受众解锁后可以创建项目', () => {
    const gw = new GameWorld(3)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    fund(gw, 30_000_000)
    gw.advanceSimulation(gregorianToDayIndex(1977, 1, 1))
    const out = gw.createProject(projectParams({
      audienceSegmentIds: ['home_players'],
      plannedLaunchDay: gw.calendar.currentDayIndex + 200,
    }))
    expect(out.success).toBe(true)
  })
})

describe('城市成本系数 (F20)', () => {
  it('不同城市的工资系数产生不同月薪', () => {
    const sf = new GameWorld(4)
    sf.createCompany({ name: 'SF', cityId: 'san_francisco' })
    const sfEmp = sf.hireEmployee({ name: 'A', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 }).result

    const sp = new GameWorld(4)
    sp.createCompany({ name: 'SP', cityId: 'sao_paulo' })
    const spEmp = sp.hireEmployee({ name: 'A', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 }).result

    expect(sfEmp?.salaryMonthlyCents).toBe(Math.round(100_000 * citySalaryMultiplier('san_francisco')))
    expect(spEmp?.salaryMonthlyCents).toBe(Math.round(100_000 * citySalaryMultiplier('sao_paulo')))
    expect(sfEmp?.salaryMonthlyCents).not.toBe(spEmp?.salaryMonthlyCents)
  })

  it('不同城市的租金不同', () => {
    const rentOf = (cityId: string) => {
      const gw = new GameWorld(5)
      const c = gw.createCompany({ name: 'X', cityId })
      gw.advanceSimulation(30)
      const rent = gw.finance
        .getTransactionsByCompany(c.id)
        .find(tx => tx.category === 'office_rent')
      return Math.abs(rent?.amountCents ?? 0)
    }
    expect(rentOf('san_francisco')).not.toBe(rentOf('sao_paulo'))
  })

  it('相同城市相同输入得到相同成本', () => {
    const run = () => {
      const gw = new GameWorld(6)
      const c = gw.createCompany({ name: 'X', cityId: 'tokyo' })
      const e = gw.hireEmployee({ name: 'A', role: 'artist', skillLevel: 4, salaryMonthlyCents: 120_000 }).result
      gw.advanceSimulation(30)
      const rent = gw.finance.getTransactionsByCompany(c.id).find(tx => tx.category === 'office_rent')
      return { salary: e?.salaryMonthlyCents, rent: rent?.amountCents }
    }
    expect(run()).toEqual(run())
  })

  it('租金系数来自城市内容 JSON', () => {
    expect(cityRentMultiplier('new_york')).toBeGreaterThan(cityRentMultiplier('seoul'))
  })
})
