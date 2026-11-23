import { createNewCompany } from '@domain/entities/company'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Employment, Person } from '@domain/entities/personnel'
import type { Project } from '@domain/entities/project'
import type { WorldState } from '@simulation/services/world-state'
import type { QualityProfile } from '@domain/value-objects'
import type { FinanceService } from '@simulation/services/finance-service'
import { buildSalaryCommitment } from '@domain/value-objects/personnel-salary'
import { computeProbationEndDay } from '@domain/value-objects/personnel-status'

export const QUALITY: QualityProfile = {
  gameplay: 60,
  technical: 60,
  content: 60,
  art: 60,
  innovation: 60,
}

export function makeCompany(overrides: Partial<Company> = {}): Company {
  const base = createNewCompany({
    id: 'company-1',
    name: 'Test Studios',
    cityId: 'san_francisco',
    foundingDay: 0,
    cashCents: 5_000_000,
  })
  return { ...base, ...overrides }
}

/**
 * R7 / CRT-01 夹具：账本是现金真值的场景（世界对象里的现金只是陈旧副本）。
 * 直接以账本回写对象并登记基线，使 `DailyScheduler.syncCompanyCash` 不会把夹具判成第二写入者。
 * 生产路径不使用本函数。
 */
export function syncWorldCash(
  finance: FinanceService,
  companies: ReadonlyArray<Pick<Company, 'id' | 'cashBalanceCents'>>,
): void {
  for (const c of companies) finance.syncCash(c as Company)
}

/**
 * R7 / CRT-01 夹具：以账本为现金唯一来源重建测试世界的现金。
 *
 * 把世界对象自带的 `cashBalanceCents` 作为**期初资本**入账（与生产 `createCompany` 同形：
 * 初始余额只能由一笔 advance 交易入账），再用账本权威值回写对象并登记基线。
 * 这样后续 `DailyScheduler.syncCompanyCash` 的"账实一致"断言不会把夹具判成第二写入者，
 * 同时测试断言的现金数值完全不改。生产路径不使用本函数。
 */
export function seedOpeningCash(
  finance: FinanceService,
  companies: ReadonlyArray<Pick<Company, 'id' | 'cashBalanceCents'>>,
): void {
  for (const c of companies) {
    finance.registerCompany(c.id)
    const diff = c.cashBalanceCents - finance.getCashBalance(c.id)
    if (diff !== 0) {
      finance.postTransaction(
        {
          idempotencyKey: `test-opening:${c.id}`,
          companyId: c.id,
          day: 0,
          category: 'advance',
          amountCents: diff,
          description: '测试期初资本',
        },
        { allowNegativeBalance: true },
      )
    }
    finance.syncCash(c)
  }
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyId: 'company-1',
    name: 'Dev One',
    role: 'programmer',
    primarySkill: 'gameplay',
    skillLevel: 3,
    salaryMonthlyCents: 200_000,
    contractStartDay: 0,
    contractEndDay: null,
    morale: 70,
    fatigue: 20,
    experience: 0,
    status: 'hired',
    hireDay: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  const totals = { design: 100, programming: 100, art: 100, qa: 0 }
  return {
    id: 'project-1',
    companyId: 'company-1',
    name: 'Test Game',
    genreId: 'action',
    audienceSegmentIds: ['arcade_enthusiasts'],
    targetPlatformIds: ['arcade_pre_1975'],
    phase: 'PRODUCTION',
    subPhase: null,
    isPaused: false,
    plannedStartDay: 0,
    plannedLaunchDay: 100,
    actualStartDay: null,
    actualLaunchDay: null,
    scope: [],
    budgetTotalCapCents: 3_000_000,
    budgetSpentCents: 0,
    budgetCommittedCents: 0,
    teamAssignments: [
      { employeeId: 'emp-1', projectId: 'project-1', allocationRatio: 1, roleOnProject: 'generalist' },
    ],
    workRemainingByDiscipline: { ...totals },
    workTotalByDiscipline: { ...totals },
    qualityTargets: { ...QUALITY },
    qualityEstimate: { ...QUALITY },
    riskFlags: [],
    changeLog: [],
    cancellationReason: null,
    pausedDays: 0,
    pauseReason: null,
    budgetExhausted: false,
    resumeSeq: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makeWorld(parts: Partial<WorldState> = {}): WorldState {
  return {
    companies: [makeCompany()],
    employees: [makeEmployee()],
    projects: [],
    products: [],
    refundBatches: [],
    marketingCampaigns: [],
    publishingContracts: [],
    transactions: [],
    events: [],
    saveSeed: 42,
    simulationAlgorithmVersion: 'mulberry32-v1',
    currentDayIndex: 0,
    schemaVersion: 2, // 与生产 makeWorld 一致；v1 老档由测试显式构造
    ...parts,
  }
}

// ===== CODE-06（TASK-P1-CODE-06）：D-03 人才层夹具 =====

/** D-03 Employment 夹具（与 makeEmployee 的默认 id/salary 对齐：旧 id = employmentId，§15.1）。 */
export function makeEmployment(overrides: Partial<Employment> = {}): Employment {
  const probationEndDay = computeProbationEndDay(0, 3, 21)
  return {
    employmentId: 'emp-1',
    personId: 'd03-per-emp-1',
    companyId: 'company-1',
    role: 'programmer',
    status: 'active',
    occupiesPerson: true,
    salaryMonthlyCents: 200_000,
    pendingSalaryMonthlyCents: null,
    pendingEffectiveDay: null,
    startDay: 0,
    endDay: null,
    initialTermMonths: 12,
    renewalCount: 0,
    moraleModifier: 0,
    probationEndDay,
    noticeStartDay: null,
    terminationKind: null,
    salaryCommitmentId: 'd03-sal-emp-1',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    personId: 'd03-per-emp-1',
    displayName: 'Dev One',
    birthDay: 0,
    regionId: 'default',
    skills: { personId: 'd03-per-emp-1', level: { code: 3 }, exp: {}, lastLevelUpDay: {} },
    seniority: 'junior',
    traits: null,
    preferences: null,
    baseMorale: 70,
    status: 'on_leave',
    currentEmploymentId: 'emp-1',
    careerRecord: [],
    rehireCount: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

/**
 * 按 Employment 注册薪资承诺（§7.2；月度，endAt=合同期末）。
 * 调度器②流水线按账本承诺兑现——夹具必须先注册，salary 才会在月末产出。
 */
export function seedSalaryCommitment(finance: FinanceService, employment: Employment): void {
  const r = finance.getLedger().registerCommitment(buildSalaryCommitment(employment))
  if (!r.success) throw new Error(`seedSalaryCommitment failed: ${r.errorMessage ?? ''}`)
}
