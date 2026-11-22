import { describe, it, expect } from 'vitest'
import { DailyScheduler } from '@simulation/phase/daily-scheduler'
import { FinanceService } from '@simulation/services/finance-service'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import {
  computeSalaryAllocations,
  salaryAllocationIdempotencyKey,
} from '@domain/entities/project-cost-allocation'
import { parseSave } from '@infrastructure/storage/save-schema'
import { makeEmployee, makeProject, makeWorld, seedOpeningCash } from '../../__tests__/helpers'
import type { Project } from '@domain/entities/project'

const MONTH_END = gregorianToDayIndex(1970, 1, 31) // day 30
const PERIOD = 'm1970-1'

function makeScheduler() {
  const finance = new FinanceService()
  finance.registerCompany('company-1')
  finance.postTransaction({
    idempotencyKey: 'opening',
    companyId: 'company-1',
    day: 0,
    category: 'advance',
    amountCents: 5_000_000,
    description: 'opening',
  })
  // R7：每日现金回写改为"先断言后写入"，世界状态里的公司现金必须由账本派生量给出（不在账本中入账＝第二写入者）
  const worldOf = (parts: Parameters<typeof makeWorld>[0] = {}) => {
    const world = makeWorld(parts)
    seedOpeningCash(finance, world.companies)
    return world
  }
  return { finance, scheduler: new DailyScheduler({ finance }), worldOf }
}

function projectWith(
  id: string,
  allocationRatio: number,
  overrides: Partial<Project> = {},
): Project {
  return makeProject({
    id,
    teamAssignments: [
      { employeeId: 'emp-1', projectId: id, allocationRatio, roleOnProject: 'generalist' },
    ],
    ...overrides,
  })
}

function allocationsOf(projects: Project[]) {
  return projects.flatMap((p) => p.costAllocations ?? [])
}

describe('G-05 工资成本分摊（DESIGN-G05 §3 / BDD）', () => {
  it('一笔工资交易多项目分摊：同一现金交易、按 60/40 归属、spent 累加', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({
      employees: [emp],
      projects: [projectWith('project-a', 0.6), projectWith('project-b', 0.4)],
    })

    const next = scheduler.executeDay(world, MONTH_END)

    // 公司现金账：该员工仅一笔 salary 交易
    const salaries = finance.getAllTransactions().filter((tx) => tx.category === 'salary')
    expect(salaries).toHaveLength(1)
    expect(salaries[0]?.amountCents).toBe(-1_000_000)

    const a = next.projects.find((p) => p.id === 'project-a')!
    const b = next.projects.find((p) => p.id === 'project-b')!
    expect(a.costAllocations).toHaveLength(1)
    expect(b.costAllocations).toHaveLength(1)
    expect(a.costAllocations![0]!.amountCents).toBe(600_000)
    expect(b.costAllocations![0]!.amountCents).toBe(400_000)
    expect(a.costAllocations![0]!.status).toBe('spent')
    expect(a.costAllocations![0]!.sourceType).toBe('salary')
    // 两条分摊引用同一 cashTransactionId
    expect(a.costAllocations![0]!.cashTransactionId).toBe(salaries[0]!.id)
    expect(b.costAllocations![0]!.cashTransactionId).toBe(salaries[0]!.id)
    // spentCents 随分摊累加
    expect(a.budgetSpentCents).toBe(600_000)
    expect(b.budgetSpentCents).toBe(400_000)
    // 对账恒等式 §8.1：committed + spent = Σalloc
    for (const p of [a, b]) {
      const sum = allocationsOf([p]).reduce((s, x) => s + x.amountCents, 0)
      expect(p.budgetCommittedCents + p.budgetSpentCents).toBe(sum)
    }
    // Σalloc = salaryMonthly
    expect(allocationsOf(next.projects).reduce((s, x) => s + x.amountCents, 0)).toBe(1_000_000)
  })

  it('分摊取整守恒：月薪 100 分、三项目各 1/3，最大余数法分币不丢失', () => {
    const { scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 100 })
    const world = worldOf({
      employees: [emp],
      projects: [
        projectWith('project-a', 1 / 3),
        projectWith('project-b', 1 / 3),
        projectWith('project-c', 1 / 3),
      ],
    })

    const next = scheduler.executeDay(world, MONTH_END)

    const allocs = allocationsOf(next.projects)
    expect(allocs).toHaveLength(3)
    expect(allocs.reduce((s, a) => s + a.amountCents, 0)).toBe(100)
    const byId = new Map(next.projects.map((p) => [p.id, p]))
    // 小数部分相等，按 projectId 字典序把 1 分余数给 project-a
    expect(byId.get('project-a')?.costAllocations?.[0]?.amountCents).toBe(34)
    expect(byId.get('project-b')?.costAllocations?.[0]?.amountCents).toBe(33)
    expect(byId.get('project-c')?.costAllocations?.[0]?.amountCents).toBe(33)
  })

  it('暂停项目工资仍按原比例归属（G05-R6）', () => {
    const { scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({
      employees: [emp],
      projects: [
        projectWith('project-a', 0.6, { isPaused: true }),
        projectWith('project-b', 0.4),
      ],
    })

    const next = scheduler.executeDay(world, MONTH_END)

    const a = next.projects.find((p) => p.id === 'project-a')!
    expect(a.isPaused).toBe(true)
    expect(a.costAllocations?.[0]?.amountCents).toBe(600_000)
    expect(a.budgetSpentCents).toBe(600_000)
  })

  it('幂等重复分摊：同一周期重复结算不新增记录、不重复增加 spent', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({
      employees: [emp],
      projects: [projectWith('project-a', 0.6), projectWith('project-b', 0.4)],
    })

    const first = scheduler.executeDay(world, MONTH_END)
    const firstCount = allocationsOf(first.projects).length
    const firstSpentA = first.projects.find((p) => p.id === 'project-a')!.budgetSpentCents

    // 重置 currentDayIndex 以绕过「同日只执行一次」门控，模拟同一月末再次结算
    const replayed = scheduler.executeDay({ ...first, currentDayIndex: 0 }, MONTH_END)

    expect(allocationsOf(replayed.projects).length).toBe(firstCount)
    expect(replayed.projects.find((p) => p.id === 'project-a')!.budgetSpentCents).toBe(firstSpentA)
    expect(finance.getAllTransactions().filter((tx) => tx.category === 'salary')).toHaveLength(1)

    // 纯函数层：命中既有幂等键时不新建（idempotent），duplicateKeys 返回既有键
    const existingKeys = new Set(allocationsOf(first.projects).map((a) => a.idempotencyKey))
    const dup = computeSalaryAllocations({
      companyId: 'company-1',
      employeeId: 'emp-1',
      salaryMonthlyCents: 1_000_000,
      periodKey: PERIOD,
      cashTransactionId: 'any-tx',
      day: MONTH_END,
      assignments: [
        { projectId: 'project-a', allocationRatio: 0.6 },
        { projectId: 'project-b', allocationRatio: 0.4 },
      ],
      existingIdempotencyKeys: existingKeys,
      description: 'dup',
    })
    expect(dup.created).toHaveLength(0)
    expect(dup.duplicateKeys).toContain(
      salaryAllocationIdempotencyKey('company-1', 'emp-1', PERIOD, 'project-a'),
    )
  })

  it('闲置工时（Σratio<1）不分摊到任何项目', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({ employees: [emp], projects: [projectWith('project-a', 0.5)] })

    const next = scheduler.executeDay(world, MONTH_END)

    const allocs = allocationsOf(next.projects)
    expect(allocs).toHaveLength(1)
    expect(allocs[0]!.amountCents).toBe(500_000) // 仅投入 50%，其余 50% 留公司账作间接成本
    expect(next.projects[0]!.budgetSpentCents).toBe(500_000)
    expect(finance.getAllTransactions().filter((tx) => tx.category === 'salary')[0]?.amountCents).toBe(
      -1_000_000,
    )
  })

  it('离职员工不参与分摊，也不产生工资交易', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', status: 'fired', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({ employees: [emp], projects: [projectWith('project-a', 1)] })

    const next = scheduler.executeDay(world, MONTH_END)

    expect(allocationsOf(next.projects)).toHaveLength(0)
    expect(finance.getAllTransactions().filter((tx) => tx.category === 'salary')).toHaveLength(0)
  })

  it('分摊记录随存档持久化，并通过现金交易引用完整性校验', () => {
    const { finance, scheduler, worldOf } = makeScheduler()
    const emp = makeEmployee({ id: 'emp-1', salaryMonthlyCents: 1_000_000 })
    const world = worldOf({
      employees: [emp],
      projects: [projectWith('project-a', 0.6), projectWith('project-b', 0.4)],
    })
    const first = scheduler.executeDay(world, MONTH_END)

    const persistable = { ...first, transactions: finance.getAllTransactions() }
    expect(parseSave(persistable).ok).toBe(true)

    const broken = structuredClone(persistable)
    const target = allocationsOf(broken.projects)[0]!
    target.cashTransactionId = 'missing-tx'
    const result = parseSave(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorCode).toBe('SAVE_BROKEN_REF')
  })
})
