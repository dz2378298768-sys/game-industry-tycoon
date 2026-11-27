import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { BlueprintDraftInput } from '@application/mediators/game-world'

function setup() {
  const world = createGameWorld(73)
  world.createCompany({ name: 'REC03 Studio', cityId: 'san_francisco' })
  return world
}

function draft(overrides: Partial<Extract<BlueprintDraftInput, { kind: 'draft' }>> = {}): Extract<BlueprintDraftInput, { kind: 'draft' }> {
  return {
    kind: 'draft', requestId: 'rec03-test-request', workingTitle: 'Episode Works', genreId: 'simulation',
    primaryTypeId: 'SEED-MGMT_SIM', targetSegmentClaims: ['SEG-YOUTH'], platformTargets: ['PLT-ARCADE'],
    modules: [
      { templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE', instanceId: 'core', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      { templateId: 'MOD-SYSTEM-PROGRESSION', slotId: 'REC03-SLOT-SUPPORT', instanceId: 'progression', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'episodes', intensity: 3, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
    ],
    deliveryForm: 'full', hrb: 0.45, budgetCapacityCents: 2_000_000,
    ...overrides,
  }
}

describe('REC-03 project creation contract', () => {
  it('derives work and audience affinity from the selected module combination', () => {
    const world = setup()
    const withProgression = world.previewExecutionProject(draft())
    const withoutProgression = world.previewExecutionProject(draft({
      requestId: 'rec03-no-progression',
      modules: draft().modules.filter((module) => module.templateId !== 'MOD-SYSTEM-PROGRESSION'),
    }))
    expect(withProgression.success && withoutProgression.success).toBe(true)
    if (!withProgression.success || !withoutProgression.success) return
    expect(withProgression.result!.estimates!.workUnits.byDiscipline.design).toBeGreaterThan(withoutProgression.result!.estimates!.workUnits.byDiscipline.design)
    expect(withProgression.result!.estimates!.workUnits.byDiscipline.code).toBeGreaterThan(withoutProgression.result!.estimates!.workUnits.byDiscipline.code)
    expect(withProgression.result!.estimates!.marketFit!.affinity['SEG-HARDCORE']).toBeGreaterThan(withoutProgression.result!.estimates!.marketFit!.affinity['SEG-HARDCORE'] ?? 0)
    expect(withProgression.result!.decomposition!.snapshotId).toBe(withProgression.result!.snapshotId)
    expect(withProgression.result!.snapshot!.frozenBlueprint.contentPacks[0]!.era).toEqual({ fromYear: 1970, toYear: 2026 })
  })

  it('replays creates idempotently and rejects requestId reuse with a different payload', () => {
    const world = setup()
    const input = draft()
    const first = world.createExecutionProject(input)
    const replay = world.createExecutionProject(input)
    const mismatch = world.createExecutionProject({ ...input, workingTitle: 'Changed title' })
    expect(first.success).toBe(true)
    expect(replay).toMatchObject({ success: true, idempotent: true, result: first.result })
    expect(mismatch).toMatchObject({ success: false, errorCode: 'REC03_REQUEST_PAYLOAD_MISMATCH' })
    expect(world.finance.getLedger().getCommitments(world.getPlayerCompany()!.id).filter((c) => c.sourceType === 'project_budget')).toHaveLength(1)
  })

  it('restores snapshot associations and snapshotRef reuses the existing project', () => {
    const world = setup()
    const input = draft()
    const created = world.createExecutionProject(input)
    expect(created.success).toBe(true)
    const snapshot = world.previewExecutionProject(input)
    expect(snapshot.success).toBe(true)
    if (!snapshot.success) return
    const saved = structuredClone(world.serialize())
    const restored = setup()
    restored.restore(saved)
    const projectCount = restored.world.projects.length
    const ref: BlueprintDraftInput = {
      kind: 'snapshotRef', requestId: 'rec03-snapshot-ref', snapshotId: snapshot.result!.snapshotId!,
      versionId: snapshot.result!.versionId!, workingTitle: input.workingTitle, genreId: input.genreId,
      plannedLaunchDay: restored.world.currentDayIndex + 200, hrb: input.hrb, budgetCapacityCents: input.budgetCapacityCents,
    }
    const reused = restored.createExecutionProject(ref)
    expect(reused.success).toBe(true)
    expect(restored.world.projects).toHaveLength(projectCount)
    expect(restored.finance.getLedger().getCommitments(restored.getPlayerCompany()!.id).filter((c) => c.sourceType === 'project_budget')).toHaveLength(1)
  })

  it('rejects an unknown genre even when the primary type alias is valid', () => {
    const world = setup()
    const result = world.previewExecutionProject(draft({ genreId: 'genre-does-not-exist' }))
    expect(result).toMatchObject({ success: false, errorCode: 'REC03_INPUT_INVALID' })
  })

  it('advances all five-discipline work through simulated days until naturally ready to deliver', () => {
    const world = setup()
    const input = draft({ budgetCapacityCents: 10_000_000 })
    const preview = world.previewExecutionProject(input)
    expect(preview.success).toBe(true)
    expect(preview.result!.estimates!.workUnits.byDiscipline.audio).toBeGreaterThan(0)
    const created = world.createExecutionProject(input)
    expect(created.success).toBe(true)
    const projectId = world.world.projects[0]!.id
    for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
      const hired = world.hireEmployee({ name: role, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
      expect(hired.success).toBe(true)
      expect(world.assignEmployeeToProject(hired.result!.id, projectId, 1, 'generalist').success).toBe(true)
    }
    const audioEmployee = world.world.employees.find((employee) => employee.role === 'audio_designer')!
    const audioPerson = world.world.persons?.find((person) => person.currentEmploymentId === audioEmployee.id)
    if (audioPerson === undefined) throw new Error('audio employee person projection missing')
    expect(audioPerson.skills.level.audio).toBe(5)
    expect(world.getExecutionSummary(projectId)!.capacityByDiscipline.audio).toBeCloseTo(1.4)
    expect(world.getExecutionSummary(projectId)!.costEstInfinite).toBe(false)
    expect(world.advanceProjectPhase(projectId).success).toBe(true)
    expect(world.advanceProjectPhase(projectId).success).toBe(true)

    const initial = world.getExecutionProject(projectId)!
    expect(initial.project.state).toBe('ACTIVE')
    expect(initial.workPackages.some((wp) => wp.state === 'DONE')).toBe(false)
    for (let day = 0; day < 365 && world.getExecutionProject(projectId)!.project.state !== 'READY_TO_DELIVER'; day += 1) {
      world.advanceSimulation(1)
    }

    const advanced = world.getExecutionProject(projectId)!
    expect(advanced.workPackages.every((wp) => wp.state === 'DONE' || wp.state === 'DEACTIVATED')).toBe(true)
    expect(advanced.project.state).toBe('READY_TO_DELIVER')
    expect(advanced.worklogs.length).toBeGreaterThan(0)
    expect(world.world.projects[0]!.phase).toBe('READY_TO_LAUNCH')
    expect(world.launchProject(projectId)).toMatchObject({ success: false, errorCode: 'PRJ_DELIVERY_REQUIRED' })

    const gate = world.getDeliveryGateEvaluation(projectId, 'full', true)
    expect(gate.pass).toBe(true)
    const delivered = world.submitDeliveryForProject(projectId, gate.gate, 'full', true)
    expect(delivered.success).toBe(true)
    expect(world.getExecutionProject(projectId)!.project.state).toBe('COMPLETED')
    world.advanceSimulation(220)
    const launched = world.launchProject(projectId)
    expect(launched.success).toBe(true)
    expect(world.world.products).toHaveLength(1)
  })

  it('publishes a new frozen intensity only after work completes, including across a save', () => {
    let world = setup()
    const created = world.createExecutionProject(draft({ requestId: 'rec03-rework', budgetCapacityCents: 10_000_000 }))
    expect(created.success).toBe(true)
    const projectId = world.world.projects[0]!.id
    const executionId = created.result!.projectId
    const snapshotId = world.getExecutionProject(projectId)!.project.snapshotId
    const initialIntensity = world.getExecutionSummary(projectId)!.coreIntensity!
    const intensity = initialIntensity === 5 ? 4 : initialIntensity + 1
    for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
      const hired = world.hireEmployee({ name: role, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
      expect(hired.success).toBe(true)
      expect(world.assignEmployeeToProject(hired.result!.id, projectId, 1, 'generalist').success).toBe(true)
    }
    world.advanceSimulation(10)
    expect(world.getReworkEstimate(projectId, 'C', intensity)).toMatchObject({ available: true, costInfinite: false })
    expect(world.confirmRework(projectId, 'C', intensity).success).toBe(true)
    expect(world.getExecutionProject(projectId)!.project.snapshotId).toBe(snapshotId)
    const saved = JSON.parse(JSON.stringify(world.serialize()))
    world = createGameWorld(saved.saveSeed)
    world.restore(saved)
    for (let day = 0; day < 365 && world.getExecutionSummary(projectId)!.reworkStatus === 'active'; day++) {
      world.advanceSimulation(1)
    }
    expect(world.getExecutionSummary(projectId)).toMatchObject({ coreIntensity: intensity, reworkStatus: 'completed' })
    expect(world.getExecutionProject(projectId)!.project.snapshotId).not.toBe(snapshotId)
    expect(world.getExecutionProject(executionId)).toBe(world.getExecutionProject(projectId))
    for (let day = 0; day < 365 && world.getExecutionProject(projectId)!.project.state !== 'READY_TO_DELIVER'; day++) {
      world.advanceSimulation(1)
    }
    expect(world.getDeliveryGateEvaluation(projectId, 'full', true).pass).toBe(true)
  })

  it('mirrors legacy cancellation into the execution lifecycle and releases future work', () => {
    const world = setup()
    const created = world.createExecutionProject(draft({ requestId: 'rec03-cancel-test', budgetCapacityCents: 2_000_000 }))
    expect(created.success).toBe(true)
    const projectId = world.world.projects[0]!.id
    expect(world.getExecutionProject(projectId)!.project.state).toBe('ACTIVE')
    expect(world.cancelProject(projectId).success).toBe(true)
    world.advanceSimulation(1)
    expect(world.world.projects[0]!.phase).toBe('CANCELLED')
    expect(world.getExecutionProject(projectId)!.project.state).toBe('CANCELLED')
  })
})
