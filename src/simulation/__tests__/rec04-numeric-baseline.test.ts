import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { BlueprintDraftInput } from '@application/mediators/game-world'
import type { EmployeeRole } from '@domain/enums'

type SkillVector = Record<Extract<EmployeeRole, 'designer' | 'programmer' | 'artist' | 'audio_designer' | 'qa'>, number>

type Scenario = {
  id: string
  cityId: string
  projectFirst: boolean
  hireDay: number
  projectDay: number
  skills: SkillVector
}

type BaselineResult = {
  id: string
  seed: number
  projectCreatedDay: number | null
  hireDay: number | null
  hiringErrors: string[]
  projectCreateError: string | null
  candidateSnapshots: Array<{ day: number; candidates: Array<{ discipline: string; skillLevel: number; askingSalaryCents: number }> }>
  readyDay: number | null
  delivered: boolean
  deliveryError: string | null
  launched: boolean
  launchDay: number | null
  launchError: string | null
  wpDoneDays: Record<string, number | null>
  cash: Record<string, number>
  salarySpentCents: number
  projectSpentCents: number
  salesRevenueCents: number
  finalCompanyStatus: string
  finalProjectState: string | null
  stoppedDay: number | null
  cancelledDay: number | null
  bankruptDay: number | null
}

const SEEDS = [2404, 2405, 2413, 2422, 2431]
const BUDGET_CAPACITY_CENTS = 13_600_000 // UI default: $136,000
const HRB = 0.45
const SALARY_CENTS = 130_000 // base $1,300; SF effective salary is derived by the domain
const ROLES: Array<keyof SkillVector> = ['designer', 'programmer', 'artist', 'audio_designer', 'qa']

function draft(requestId: string): Extract<BlueprintDraftInput, { kind: 'draft' }> {
  return {
    kind: 'draft',
    requestId,
    workingTitle: `REC04 ${requestId}`,
    genreId: 'simulation',
    primaryTypeId: 'SEED-MGMT_SIM',
    targetSegmentClaims: ['SEG-YOUTH'],
    platformTargets: ['PLT-ARCADE'],
    modules: [
      { templateId: 'MOD-CORE-SIM', slotId: 'REC03-SLOT-CORE', instanceId: 'core', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      { templateId: 'MOD-SYSTEM-PROGRESSION', slotId: 'REC03-SLOT-SUPPORT', instanceId: 'progression', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'episodes', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
    ],
    deliveryForm: 'full',
    hrb: HRB,
    budgetCapacityCents: BUDGET_CAPACITY_CENTS,
  }
}

function createProjectAndStart(world: ReturnType<typeof createGameWorld>, requestId: string): { projectId: string | null; error: string | null } {
  const created = world.createExecutionProject(draft(requestId))
  if (!created.success || created.result === undefined) return { projectId: null, error: created.errorCode ?? created.message ?? 'project creation failed' }
  const projectId = world.world.projects[0]?.id
  if (projectId === undefined) return { projectId: null, error: 'legacy project missing' }
  expect(world.advanceProjectPhase(projectId).success).toBe(true)
  expect(world.advanceProjectPhase(projectId).success).toBe(true)
  return { projectId, error: null }
}

function hireTeam(world: ReturnType<typeof createGameWorld>, skills: SkillVector): { ids: string[]; errors: string[] } {
  const ids: string[] = []
  const errors: string[] = []
  for (const role of ROLES) {
    const hired = world.hireEmployee({ name: `${role}-${world.calendar.currentDayIndex}`, role, skillLevel: skills[role], salaryMonthlyCents: SALARY_CENTS })
    if (!hired.success || hired.result === undefined) {
      errors.push(`${role}:${hired.errorCode ?? hired.message ?? 'hire failed'}`)
      continue
    }
    ids.push(hired.result.id)
  }
  return { ids, errors }
}

function assignTeam(world: ReturnType<typeof createGameWorld>, projectId: string, ids: string[]): string[] {
  const errors: string[] = []
  for (const id of ids) {
    const employee = world.world.employees.find((e) => e.id === id)
    if (employee === undefined) continue
    const assigned = world.assignEmployeeToProject(id, projectId, 1, 'generalist')
    if (!assigned.success) errors.push(`${employee.role}:assign:${assigned.errorCode ?? assigned.message ?? 'assign failed'}`)
  }
  return errors
}

function snapshotCandidates(world: ReturnType<typeof createGameWorld>): BaselineResult['candidateSnapshots'][number] {
  return {
    day: world.calendar.currentDayIndex,
    candidates: world.listCandidates().map((c) => ({ discipline: c.discipline, skillLevel: c.skillLevel, askingSalaryCents: c.askingSalaryCents })),
  }
}

function advanceSafely(world: ReturnType<typeof createGameWorld>, targetDay: number, projectId: string | null, observed: {
  readyDay: number | null; cancelledDay: number | null; bankruptDay: number | null
  delivered: boolean; deliveryAttempted: boolean; deliveryError: string | null
  launched: boolean; launchAttempted: boolean; launchDay: number | null; launchError: string | null
}, checkpoints: Record<string, number>): number | null {
  while (world.calendar.currentDayIndex < targetDay) {
    try {
      world.advanceSimulation(1)
    } catch {
      return world.calendar.currentDayIndex + 1
    }
    const execution = projectId === null ? undefined : world.getExecutionProject(projectId)
    if (execution?.project.state === 'READY_TO_DELIVER' && observed.readyDay === null) observed.readyDay = world.calendar.currentDayIndex
    if (execution?.project.state === 'READY_TO_DELIVER' && !observed.deliveryAttempted) {
      observed.deliveryAttempted = true
      const gate = world.getDeliveryGateEvaluation(projectId!, 'full', true)
      const delivered = world.submitDeliveryForProject(projectId!, gate.gate, 'full')
      observed.delivered = delivered.success
      observed.deliveryError = delivered.success ? null : delivered.errorCode ?? delivered.message ?? 'delivery failed'
    }
    const project = projectId === null ? undefined : world.world.projects.find((p) => p.id === projectId)
    if (!observed.launchAttempted && observed.delivered && project !== undefined && world.calendar.currentDayIndex >= project.plannedLaunchDay) {
      observed.launchAttempted = true
      const launch = world.launchProject(projectId!)
      observed.launched = launch.success
      observed.launchDay = launch.success ? world.calendar.currentDayIndex : null
      observed.launchError = launch.success ? null : launch.errorCode ?? launch.message ?? 'launch failed'
      if (launch.success && launch.result !== undefined) world.setProductPrice({ productId: launch.result.id, priceCents: 3000 })
    }
    if (execution?.project.state === 'CANCELLED' && observed.cancelledDay === null) observed.cancelledDay = world.calendar.currentDayIndex
    const company = world.world.companies.find((c) => c.isPlayer)
    if (company?.status === 'bankrupt' && observed.bankruptDay === null) observed.bankruptDay = world.calendar.currentDayIndex
    if ([30, 60, 90, 120, 180, 200, 240, 300, 365].includes(world.calendar.currentDayIndex)) checkpoints[`day${world.calendar.currentDayIndex}`] = world.finance.getCashBalance(company!.id)
  }
  return null
}

function runScenario(scenario: Scenario, seed: number): BaselineResult {
  const world = createGameWorld(seed)
  const company = world.createCompany({ name: `REC04-${scenario.id}-${seed}`, cityId: scenario.cityId })
  const companyId = company.id
  const candidateSnapshots: BaselineResult['candidateSnapshots'] = [snapshotCandidates(world)]
  const hiringErrors: string[] = []
  let projectId: string | null = null
  let projectCreatedDay: number | null = null
  let hireDay: number | null = null
  let hiredIds: string[] = []
  let stoppedDay: number | null = null
  const observed = {
    readyDay: null as number | null, cancelledDay: null as number | null, bankruptDay: null as number | null,
    delivered: false, deliveryAttempted: false, deliveryError: null as string | null,
    launched: false, launchAttempted: false, launchDay: null as number | null, launchError: null as string | null,
  }

  if (scenario.projectFirst) {
    const created = createProjectAndStart(world, scenario.id)
    projectId = created.projectId
    if (projectId === null) {
      return { id: scenario.id, seed, projectCreatedDay: null, hireDay: null, hiringErrors, projectCreateError: created.error, candidateSnapshots, readyDay: null, delivered: false, deliveryError: null, launched: false, launchDay: null, launchError: null, wpDoneDays: {}, cash: { day0: world.finance.getCashBalance(companyId) }, salarySpentCents: 0, projectSpentCents: 0, salesRevenueCents: 0, finalCompanyStatus: company.status, finalProjectState: null, stoppedDay: null, cancelledDay: null, bankruptDay: null }
    }
    projectCreatedDay = world.calendar.currentDayIndex
  }

  const checkpoints: Record<string, number> = { [`day${world.calendar.currentDayIndex}`]: world.finance.getCashBalance(companyId) }
  if (scenario.hireDay > world.calendar.currentDayIndex) stoppedDay = advanceSafely(world, scenario.hireDay, projectId, observed, checkpoints)
  if (scenario.hireDay === world.calendar.currentDayIndex) {
    const hired = hireTeam(world, scenario.skills)
    hiredIds = hired.ids
    hiringErrors.push(...hired.errors)
    hireDay = world.calendar.currentDayIndex
  }
  candidateSnapshots.push(snapshotCandidates(world))

  if (projectId === null) {
    if (stoppedDay === null && scenario.projectDay > world.calendar.currentDayIndex) stoppedDay = advanceSafely(world, scenario.projectDay, projectId, observed, checkpoints)
    if (stoppedDay !== null) {
      return {
        id: scenario.id, seed, projectCreatedDay, hireDay, hiringErrors, projectCreateError: 'simulation stopped before project day',
        candidateSnapshots, readyDay: null, delivered: false, deliveryError: null, launched: false, launchDay: null, launchError: null, wpDoneDays: {}, cash: { [`day${world.calendar.currentDayIndex}`]: world.finance.getCashBalance(companyId) },
        salarySpentCents: 0, projectSpentCents: 0, salesRevenueCents: 0, finalCompanyStatus: world.world.companies.find((c) => c.id === companyId)?.status ?? 'missing', finalProjectState: null, stoppedDay, cancelledDay: observed.cancelledDay, bankruptDay: observed.bankruptDay,
      }
    }
    const created = createProjectAndStart(world, scenario.id)
    projectId = created.projectId
    if (projectId === null) {
      const tx = world.finance.getTransactionsByCompany(companyId)
      return { id: scenario.id, seed, projectCreatedDay: null, hireDay, hiringErrors, projectCreateError: created.error, candidateSnapshots, readyDay: null, delivered: false, deliveryError: null, launched: false, launchDay: null, launchError: null, wpDoneDays: {}, cash: { [`day${world.calendar.currentDayIndex}`]: world.finance.getCashBalance(companyId) }, salarySpentCents: tx.filter((t) => t.category === 'salary' && t.amountCents < 0).reduce((s, t) => s + Math.abs(t.amountCents), 0), projectSpentCents: 0, salesRevenueCents: 0, finalCompanyStatus: company.status, finalProjectState: null, stoppedDay: null, cancelledDay: null, bankruptDay: null }
    }
    projectCreatedDay = world.calendar.currentDayIndex
    if (hiredIds.length === 0 && hiringErrors.length === 0) {
      const hired = hireTeam(world, scenario.skills)
      hiredIds = hired.ids
      hiringErrors.push(...hired.errors)
      hireDay = world.calendar.currentDayIndex
    }
  }
  hiringErrors.push(...assignTeam(world, projectId, hiredIds))

  if (stoppedDay === null && world.calendar.currentDayIndex < 365) stoppedDay = advanceSafely(world, 365, projectId, observed, checkpoints)

  const stateAtReady = world.getExecutionProject(projectId)
  let readyDay: number | null = observed.readyDay
  const wpDoneDays: Record<string, number | null> = {}
  for (const wp of stateAtReady?.workPackages ?? []) {
    let output = 0
    let doneDay: number | null = null
    for (const log of stateAtReady?.worklogs.filter((item) => item.workPackageId === wp.workPackageId).sort((a, b) => a.day - b.day) ?? []) {
      output += log.outputWorkUnits
      if (output >= wp.baselineWorkUnits) { doneDay = log.day; break }
    }
    const key = `${wp.sourceRef.instanceId ?? wp.sourceRef.contentPackId ?? wp.workPackageId}:${wp.discipline}`
    wpDoneDays[key] = wp.state === 'DONE' ? doneDay : null
  }
  if (stateAtReady?.project.state === 'READY_TO_DELIVER') {
    const doneDays = Object.values(wpDoneDays).filter((day): day is number => day !== null)
    readyDay = doneDays.length > 0 ? Math.max(...doneDays) : readyDay
  }
  const transactions = world.finance.getTransactionsByCompany(companyId)
  const spent = (category: string) => transactions.filter((t) => t.category === category && t.amountCents < 0).reduce((sum, t) => sum + Math.abs(t.amountCents), 0)
  const revenue = transactions.filter((t) => t.category === 'sales_revenue' && t.amountCents > 0).reduce((sum, t) => sum + t.amountCents, 0)
  const execution = world.getExecutionProject(projectId)
  return {
    id: scenario.id,
    seed,
    projectCreatedDay,
    hireDay,
    hiringErrors,
    projectCreateError: null,
    candidateSnapshots,
    readyDay,
    delivered: observed.delivered,
    deliveryError: observed.deliveryError,
    launched: observed.launched,
    launchDay: observed.launchDay,
    launchError: observed.launchError,
    wpDoneDays,
    cash: checkpoints,
    salarySpentCents: spent('salary'),
    projectSpentCents: spent('project_expense'),
    salesRevenueCents: revenue,
    finalCompanyStatus: world.world.companies.find((c) => c.id === companyId)?.status ?? 'missing',
    finalProjectState: execution?.project.state ?? null,
    stoppedDay,
    cancelledDay: observed.cancelledDay,
    bankruptDay: observed.bankruptDay,
  }
}

describe('REC-04 numerical baseline: five-discipline execution', () => {
  it('scans multiple seeds and cities for timing, skill bottlenecks, cash and lifecycle outcomes', () => {
    const scenarios: Scenario[] = [
      { id: 'day0-high', cityId: 'san_francisco', projectFirst: true, hireDay: 0, projectDay: 0, skills: { designer: 5, programmer: 5, artist: 5, audio_designer: 5, qa: 5 } },
      { id: 'day0-code1', cityId: 'new_york', projectFirst: true, hireDay: 0, projectDay: 0, skills: { designer: 5, programmer: 1, artist: 5, audio_designer: 5, qa: 5 } },
      { id: 'day60-high', cityId: 'seattle', projectFirst: true, hireDay: 60, projectDay: 0, skills: { designer: 5, programmer: 5, artist: 5, audio_designer: 5, qa: 5 } },
      { id: 'hire-first-high', cityId: 'san_francisco', projectFirst: false, hireDay: 0, projectDay: 60, skills: { designer: 5, programmer: 5, artist: 5, audio_designer: 5, qa: 5 } },
    ]
    const cases = SEEDS.flatMap((seed) => scenarios.map((scenario) => ({ seed, scenario })))
    const results = cases.map(({ seed, scenario }) => runScenario(scenario, seed))
    expect(results.every((r) => SEEDS.includes(r.seed) && r.candidateSnapshots.length >= 2)).toBe(true)
    const replay = cases.map(({ seed, scenario }) => runScenario(scenario, seed))
    expect(replay.map((r) => JSON.stringify(r))).toEqual(results.map((r) => JSON.stringify(r)))
    const summary = results.map(({ id, seed, readyDay, delivered, launched, launchDay, bankruptDay, stoppedDay, finalCompanyStatus, finalProjectState, salesRevenueCents, cash }) => ({ id, seed, readyDay, delivered, launched, launchDay, bankruptDay, stoppedDay, finalCompanyStatus, finalProjectState, salesRevenueCents, minCashCents: Math.min(...Object.values(cash)) }))
    console.log(`REC04_NUMERIC_BASELINE ${JSON.stringify(summary)}`)
  })
})
