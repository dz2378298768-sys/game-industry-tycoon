import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { ProjectService } from '@simulation/services/project-service'
import { makeEmployee, makeProject, makeWorld } from '../../__tests__/helpers'
import type { WorldState } from '@simulation/services/world-state'
import type { DomainEvent } from '@domain/events'
import { parseSave } from '@infrastructure/storage/save-schema'
import { GameWorld } from '@application/mediators/game-world'

/**
 * 脚手架：造一个带 FinanceService（现金 -$1,000,000）的 DailyScheduler + WorldState。
 * 复用 budget-exhaustion.test.ts 的 makeScheduler 模式，但允许负现金。
 */
function makeBankruptSetup() {
  const finance = new FinanceService()
  finance.registerCompany('company-1')
  // 先入账 $5M
  finance.postTransaction({
    idempotencyKey: 'opening',
    companyId: 'company-1',
    day: 0,
    category: 'advance',
    amountCents: 5_000_000,
    description: 'opening',
  })
  // 再用 allowNegativeBalance 支出 $6M → 现金 -$1M
  finance.postTransaction(
    {
      idempotencyKey: 'big-expense',
      companyId: 'company-1',
      day: 0,
      category: 'project_expense',
      amountCents: -6_000_000,
      description: '手动巨额支出',
    },
    { allowNegativeBalance: true },
  )
  const scheduler = new DailyScheduler({ finance })
  return { finance, scheduler }
}

function bankruptEvents(world: WorldState): DomainEvent[] {
  return world.events.filter((e) => e.type === 'CompanyBankrupted')
}

/** 替代 GameWorld.getRawPlayerCompany()（private）：直接读 WorldState.companies */
function rawPlayer(gw: GameWorld) {
  return gw.world.companies.find((c) => c.isPlayer)!
}

describe('OI-21 破产守卫 V1~V3', () => {
  it('V1：负现金触发破产，company.status 从 active 变为 bankrupt', () => {
    const { scheduler } = makeBankruptSetup()
    const world = makeWorld()

    // 前置 sanity：执行前 status 还是 active
    expect(world.companies[0]!.status).toBe('active')

    const next = scheduler.executeDay(world, 1)
    expect(next.companies[0]!.status).toBe('bankrupt')
  })

  it('V2：破产后 cancelProject() 仍成功（自救手段，DESIGN-OI-21 §6.3）', () => {
    const gw = new GameWorld(7)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const proj = gw.createProject({
      name: 'Game',
      genreId: 'action',
      budgetTotalCapCents: 1_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    }).result!

    // 启动金 6.5M，支出 -15M → 余额 -8.5M
    gw.finance.postTransaction(
      {
        idempotencyKey: 'big-expense',
        companyId: rawPlayer(gw).id,
        day: 0,
        category: 'project_expense',
        amountCents: -15_000_000,
        description: '手动巨额支出',
      },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(1)
    const company = rawPlayer(gw)
    expect(company.status).toBe('bankrupt')

    // cancelProject 不检查 assertCompanyActive，破产后仍可调用（自救）
    const r = gw.cancelProject(proj.id)
    expect(r.success).toBe(true)
    expect(gw.world.projects.find((p) => p.id === proj.id)?.phase).toBe('CANCELLED')
  })

  it('V3：破产事件被派发，payload 含 companyId / day / balanceAtBankruptcy', () => {
    const { scheduler, finance } = makeBankruptSetup()
    const world = makeWorld()

    const balanceBefore = finance.getCashBalance('company-1')
    const next = scheduler.executeDay(world, 1)

    const events = bankruptEvents(next)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('CompanyBankrupted')
    expect(events[0]!.day).toBe(1)
    expect(events[0]!.payload).toMatchObject({
      companyId: 'company-1',
      day: 1,
      balanceAtBankruptcy: balanceBefore, // 触发破产判定时的现金余额
    })
  })

  it('V3 幂等：同一 active 公司在破产判定后，后续调度不再重复派发破产事件', () => {
    const { scheduler } = makeBankruptSetup()
    const world = makeWorld()

    const first = scheduler.executeDay(world, 1)
    expect(bankruptEvents(first)).toHaveLength(1)

    // 后续调度不会再触发（status 已是 bankrupt，applyBankruptcyCheck 跳过）
    const second = scheduler.executeDay(first, 2)
    expect(bankruptEvents(second)).toHaveLength(1)
  })
})

describe('OI-21 破产守卫 V4 存档兼容', () => {
  it('V4：旧存档 status="active" 但 cashBalanceCents=-5000，恢复后推进一天触发破产', () => {
    // 造一份合法的 WorldState：company cash=-5000，transactions 加起来也是 -5000
    const companyId = 'co-1'
    const empId = 'emp-1'
    const projectId = 'prj-1'
    const world = {
      schemaVersion: 1,
      saveSeed: 42,
      simulationAlgorithmVersion: 'mulberry32-v1',
      currentDayIndex: 0,
      companies: [
        {
          id: companyId,
          name: 'Legacy Co',
          cityId: 'san_francisco',
          foundingDay: 0,
          brand: 10,
          technologyCapacity: 10,
          managementCapacity: 15,
          cashBalanceCents: -5_000, // 负现金
          status: 'active', // 旧存档遗留
          isPlayer: true,
          // passthrough 字段
          industryStartYear: 1970,
          growthStage: 'startup',
          monthlyFixedExpenseCents: 0,
          officeLevel: 1,
          version: 1,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      employees: [
        {
          id: empId,
          companyId,
          name: 'Dev',
          role: 'programmer',
          skillLevel: 3,
          salaryMonthlyCents: 200_000,
          morale: 70,
          fatigue: 20,
          experience: 0,
          status: 'hired',
          hireDay: 0,
          version: 1,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      projects: [
        {
          id: projectId,
          companyId,
          name: 'Legacy Game',
          genreId: 'action',
          phase: 'PRODUCTION',
          subPhase: null,
          isPaused: false,
          pausedDays: 0,
          pauseReason: null,
          plannedLaunchDay: 100,
          budgetTotalCapCents: 1_000_000,
          budgetSpentCents: 0,
          budgetCommittedCents: 0,
          teamAssignments: [],
          workRemainingByDiscipline: { design: 50, programming: 100, art: 80, qa: 0 },
          workTotalByDiscipline: { design: 100, programming: 150, art: 120, qa: 0 },
          qualityTargets: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
          qualityEstimate: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
          riskFlags: [],
          changeLog: [],
          cancellationReason: null,
          version: 1,
          createdAt: 0,
          updatedAt: 0,
          // passthrough 字段
          scope: [],
          actualStartDay: 0,
          plannedStartDay: 0,
        },
      ],
      products: [],
      transactions: [
        {
          id: 'tx-1',
          idempotencyKey: 'legacy-opening',
          companyId,
          day: 0,
          category: 'advance',
          amountCents: -5_000, // 让 sum = -5_000 = cashBalanceCents
          balanceAfterCents: -5_000,
          description: 'legacy',
          status: 'posted',
        },
      ],
      // passthrough 字段
      events: [],
    }

    const r = parseSave(world)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // 用 GameWorld.restore 加载 + 推进一天 → DailyScheduler.applyBankruptcyCheck 扫描到负现金
    const gw = new GameWorld(9)
    gw.restore(r.state)
    expect(rawPlayer(gw).status).toBe('active') // 加载时还是 active（旧存档遗留）

    gw.advanceSimulation(1)
    expect(rawPlayer(gw).status).toBe('bankrupt') // 推进后被破产守卫重判
  })
})

describe('OI-21 破产守卫 V6 命令守卫', () => {
  function makeBankruptGameWorld(): GameWorld {
    const gw = new GameWorld(5)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    // 启动金 6.5M，支出 -15M → 余额 -8.5M
    gw.finance.postTransaction(
      {
        idempotencyKey: 'big-expense',
        companyId: rawPlayer(gw).id,
        day: 0,
        category: 'project_expense',
        amountCents: -15_000_000,
        description: '手动巨额支出',
      },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(1)
    expect(rawPlayer(gw).status).toBe('bankrupt')
    return gw
  }

  it('V6：破产公司 hireEmployee() 返回 FIN_COMPANY_BANKRUPT', () => {
    const gw = makeBankruptGameWorld()
    const r = gw.hireEmployee({
      name: 'Dev',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 100_000,
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_COMPANY_BANKRUPT')
  })

  it('V6：破产公司 createProject() 返回 FIN_COMPANY_BANKRUPT', () => {
    const gw = makeBankruptGameWorld()
    const r = gw.createProject({
      name: 'New Game',
      genreId: 'action',
      budgetTotalCapCents: 1_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_COMPANY_BANKRUPT')
  })

  it('V6：破产公司 topUpBudget() 返回 FIN_COMPANY_BANKRUPT', () => {
    const gw = makeBankruptGameWorld()
    // topUpBudget 内部先调 assertCompanyActive，破产公司直接返回 FIN_COMPANY_BANKRUPT
    const r = gw.topUpBudget({
      projectId: 'nonexistent',
      amountCents: 500_000,
      seq: 1,
      reason: 'test',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_COMPANY_BANKRUPT')
  })
})

describe('T-FIX-1/2 破产后仍可解雇 / 上市', () => {
  function bankruptWorldWith(projectIds: string[] = []) {
    const gw = new GameWorld(11)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    gw.world.employees.push(makeEmployee({ companyId: company.id }))
    for (const id of projectIds) {
      gw.world.projects.push(
        makeProject({
          id,
          companyId: company.id,
          phase: 'READY_TO_LAUNCH',
          plannedLaunchDay: 0,
          workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
          workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
          teamAssignments: [],
        }),
      )
    }
    gw.projects.reset(gw.world.projects)
    gw.finance.postTransaction(
      {
        idempotencyKey: 'big-expense',
        companyId: company.id,
        day: 0,
        category: 'project_expense',
        amountCents: -15_000_000,
        description: '手动巨额支出',
      },
      { allowNegativeBalance: true },
    )
    gw.advanceSimulation(1)
    expect(rawPlayer(gw).status).toBe('bankrupt')
    return { gw, company }
  }

  it('V19：破产公司 fireEmployee() 成功，员工状态变为 fired，不再 NO_COMPANY', () => {
    const { gw } = bankruptWorldWith()
    const r = gw.fireEmployee('emp-1')
    expect(r.success).toBe(true)
    expect(r.errorCode).toBeUndefined()
    expect(gw.world.employees.find((e) => e.id === 'emp-1')!.status).toBe('fired')
  })

  it('V20：破产公司 launchProject() 成功上市，不再 PRJ_COMPANY_INACTIVE', () => {
    const { gw } = bankruptWorldWith(['prj-bankrupt-launch'])
    const r = gw.launchProject('prj-bankrupt-launch')
    expect(r.success).toBe(true)
    expect(gw.world.projects.find((p) => p.id === 'prj-bankrupt-launch')!.phase).toBe('LAUNCHED')
    expect(gw.world.products).toHaveLength(1)
  })

  it('V20：ProjectService.launch 仅对 dissolved 返回 PRJ_COMPANY_INACTIVE', () => {
    const makeSvc = (status: 'active' | 'bankrupt' | 'dissolved') => {
      const svc = new ProjectService({ getCompanyStatus: () => status })
      svc.reset([
        makeProject({
          phase: 'READY_TO_LAUNCH',
          plannedLaunchDay: 0,
          workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
          workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
          teamAssignments: [],
        }),
      ])
      return svc
    }
    expect(makeSvc('active').launch('project-1', 1).success).toBe(true)
    expect(makeSvc('bankrupt').launch('project-1', 1).success).toBe(true)
    const dissolved = makeSvc('dissolved').launch('project-1', 1)
    expect(dissolved.success).toBe(false)
    expect(dissolved.errorCode).toBe('PRJ_COMPANY_INACTIVE')
  })
})
