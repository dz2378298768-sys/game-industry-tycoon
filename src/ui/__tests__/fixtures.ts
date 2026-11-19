import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'

export function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    name: 'Acme',
    foundingDay: 0,
    cityId: 'san_francisco',
    industryStartYear: 1970,
    brand: 50,
    technologyCapacity: 10,
    managementCapacity: 15,
    cashBalanceCents: 1_000_000,
    growthStage: 'startup',
    isPlayer: true,
    status: 'active',
    monthlyFixedExpenseCents: 0,
    officeLevel: 1,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Company
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    companyId: 'c1',
    name: 'Dev',
    role: 'programmer',
    primarySkill: 'coding',
    skillLevel: 3,
    salaryMonthlyCents: 100_000,
    contractStartDay: 0,
    contractEndDay: null,
    morale: 70,
    fatigue: 0,
    experience: 0,
    status: 'hired',
    hireDay: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Employee
}

export function makeUiProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    companyId: 'c1',
    name: 'Test Game',
    genreId: 'action',
    audienceSegmentIds: [],
    targetPlatformIds: [],
    phase: 'PRODUCTION',
    subPhase: null,
    isPaused: false,
    plannedStartDay: 0,
    plannedLaunchDay: 200,
    actualStartDay: 0,
    actualLaunchDay: null,
    scope: [],
    budgetTotalCapCents: 1_000_000,
    budgetSpentCents: 300_000,
    budgetCommittedCents: 200_000,
    remainingCapCents: 500_000,
    costAllocations: [],
    teamAssignments: [],
    workRemainingByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    qualityTargets: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    qualityEstimate: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    riskFlags: [],
    changeLog: [],
    cancellationReason: null,
    pausedDays: 0,
    pauseReason: null,
    budgetExhausted: false,
    resumeSeq: 0,
    scopeCutRatio: 0,
    originalPlannedLaunchDay: null,
    launchDelayDays: 0,
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}
