import { describe, expect, it } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { makeProject, makeWorld, seedOpeningCash } from '../../__tests__/helpers'

function setup() {
  const finance = new FinanceService()
  const company = makeWorld().companies[0]!
  const ordinary = makeProject({
    id: 'ordinary-project',
    companyId: company.id,
    phase: 'PRE_PRODUCTION',
    teamAssignments: [{ employeeId: 'emp-1', projectId: 'ordinary-project', allocationRatio: 1, roleOnProject: 'generalist' }],
  })
  const firstCandidate = makeProject({
    id: 'candidate-a',
    companyId: company.id,
    phase: 'PRODUCTION',
    workRemainingByDiscipline: { design: 20, programming: 20, art: 20, qa: 0 },
    teamAssignments: [],
    budgetTotalCapCents: 1_000_000,
    budgetSpentCents: 1_000_000,
  })
  const secondCandidate = makeProject({
    id: 'candidate-b',
    companyId: company.id,
    phase: 'PRODUCTION',
    workRemainingByDiscipline: { design: 20, programming: 20, art: 20, qa: 0 },
    teamAssignments: [],
    budgetTotalCapCents: 1_000_000,
    budgetSpentCents: 1_000_000,
  })
  const world = makeWorld({ projects: [ordinary, firstCandidate, secondCandidate] })
  seedOpeningCash(finance, world.companies)
  finance.postTransaction({
    idempotencyKey: 'bankruptcy-test-expense',
    companyId: company.id,
    day: 0,
    category: 'project_expense',
    amountCents: -5_100_000,
    description: 'force bankruptcy',
  }, { allowNegativeBalance: true })
  return { finance, world, scheduler: new DailyScheduler({ finance }) }
}

describe('REC-04 M3 破产项目规则', () => {
  it('破产当日暂停普通项目，只保留按稳定 id 选出的一个零剩余成本例外', () => {
    const { scheduler, world } = setup()
    const next = scheduler.executeDay(world, 1)
    expect(next.companies[0]!.status).toBe('bankrupt')
    expect(next.projects.find((p) => p.id === 'ordinary-project')).toMatchObject({
      isPaused: true,
      pauseReason: 'bankruptcy',
      pausedDays: 0,
    })
    expect(next.projects.find((p) => p.id === 'candidate-a')).toMatchObject({
      isPaused: false,
      riskFlags: ['bankruptcy_retained'],
    })
    expect(next.projects.find((p) => p.id === 'candidate-b')).toMatchObject({
      isPaused: true,
      pauseReason: 'bankruptcy',
    })
  })

  it('破产暂停从次日计时，Day+29 不取消，Day+30 取消并释放团队', () => {
    const { scheduler, world } = setup()
    let state = scheduler.executeDay(world, 1)
    for (let day = 2; day <= 30; day += 1) state = scheduler.executeDay(state, day)
    expect(state.projects.find((p) => p.id === 'ordinary-project')?.phase).toBe('PRE_PRODUCTION')
    expect(state.projects.find((p) => p.id === 'ordinary-project')?.pausedDays).toBe(29)
    state = scheduler.executeDay(state, 31)
    const cancelled = state.projects.find((p) => p.id === 'ordinary-project')!
    expect(cancelled).toMatchObject({ phase: 'CANCELLED', cancellationReason: 'restructuring', teamAssignments: [] })
    expect(state.events.some((event) => event.type === 'ProjectCancelled' && event.payload.reasonCode === 'bankruptcy_timeout')).toBe(true)
  })

  it('负现金阈值按 max(0, cash) * 10% 处理，正剩余成本不能获得例外', () => {
    const { scheduler, world } = setup()
    world.projects[1] = { ...world.projects[1]!, budgetSpentCents: 1, budgetCommittedCents: 0 }
    const next = scheduler.executeDay(world, 1)
    expect(next.projects.find((p) => p.id === 'candidate-a')).toMatchObject({ isPaused: true, pauseReason: 'bankruptcy' })
  })
})
