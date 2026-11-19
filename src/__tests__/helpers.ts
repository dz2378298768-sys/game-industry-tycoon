import { createNewCompany } from '@domain/entities/company'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { WorldState } from '@simulation/services/world-state'
import type { QualityProfile } from '@domain/value-objects'

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
    transactions: [],
    events: [],
    saveSeed: 42,
    simulationAlgorithmVersion: 'mulberry32-v1',
    currentDayIndex: 0,
    schemaVersion: 2, // 与生产 makeWorld 一致；v1 老档由测试显式构造
    ...parts,
  }
}
