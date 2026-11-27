import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'

function draft(requestId: string) {
  return {
    kind: 'draft' as const,
    requestId,
    workingTitle: 'BuildFacts Test Game',
    genreId: 'action',
    primaryTypeId: 'action',
    targetSegmentClaims: ['SEG-YOUTH'],
    platformTargets: ['PLT-ARCADE'],
    modules: [
      {
        templateId: 'MOD-CORE-ACTION',
        slotId: 'REC03-SLOT-CORE',
        instanceId: `${requestId}-core`,
        intensity: 1 as const,
        depthSelection: 'standard' as const,
        optionSelections: {},
        contentPackId: null,
      },
      {
        templateId: 'MOD-CONTENT-EPISODES',
        slotId: 'REC03-SLOT-CONTENT',
        instanceId: `${requestId}-content`,
        intensity: 1 as const,
        depthSelection: 'standard' as const,
        optionSelections: {},
        contentPackId: 'PACK-EPISODES-P1',
      },
    ],
    deliveryForm: 'full' as const,
    hrb: 0.45,
    budgetCapacityCents: 10_000_000,
    scopePolicy: 'recommended' as const,
  }
}

function readyWorld(requestId: string) {
  const world = createGameWorld(905)
  world.createCompany({ name: 'BuildFacts Studio', cityId: 'san_francisco' })
  const created = world.createExecutionProject(draft(requestId))
  expect(created.success).toBe(true)
  const projectId = world.world.projects[0]!.id
  for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
    const hired = world.hireEmployee({ name: role, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
    expect(hired.success).toBe(true)
    expect(world.assignEmployeeToProject(hired.result!.id, projectId, 1, 'generalist').success).toBe(true)
  }
  expect(world.advanceProjectPhase(projectId).success).toBe(true)
  expect(world.advanceProjectPhase(projectId).success).toBe(true)
  for (let day = 0; day < 365 && world.getExecutionProject(projectId)!.project.state !== 'READY_TO_DELIVER'; day += 1) {
    world.advanceSimulation(1)
  }
  expect(world.getExecutionProject(projectId)!.project.state).toBe('READY_TO_DELIVER')
  return { world, projectId }
}

describe('REC-05 BuildFacts production source', () => {
  it('stores ledger actual cost and frozen content tier in the successful Build', () => {
    const { world, projectId } = readyWorld('rec05-buildfacts-success')
    const gate = world.getDeliveryGateEvaluation(projectId, 'full', true)
    expect(gate.pass).toBe(true)
    const delivered = world.submitDeliveryForProject(projectId, gate.gate, 'full')
    expect(delivered.success).toBe(true)

    const build = world.getExecutionProject(projectId)!.builds[0]
    expect(build).toBeDefined()
    expect(build!.actualCostCents).toBeGreaterThan(0)
    expect(build!.deliveredTier).toBeGreaterThan(0)
    expect(build!.actualCostCents).not.toBe(0)
    expect(build!.deliveredTier).not.toBe(0)
    expect(build!.deliveryDecision?.snapshotId).toBe(build!.snapshotId)
    const restored = createGameWorld(905)
    restored.restore(JSON.parse(JSON.stringify(world.serialize())))
    expect(restored.getExecutionProject(projectId)!.builds[0]?.deliveryDecision).toEqual(build!.deliveryDecision)
  })

  it('reports an unchecked required content package as a blocker and ignores caller PASS', () => {
    const { world, projectId } = readyWorld('rec05-buildfacts-qa')
    const execution = world.getExecutionProject(projectId)!
    const qa = execution.workPackages.find((wp) => wp.discipline === 'qa' && wp.sourceRef.contentPackId !== undefined)!
    execution.worklogs = execution.worklogs.filter((log) => log.workPackageId !== qa.workPackageId)
    const evaluation = world.getDeliveryGateEvaluation(projectId, 'full', true)
    expect(evaluation.pass).toBe(false)
    expect(evaluation.reasonCodes).toContain('D02-E-DEFECT')
    expect(world.submitDeliveryForProject(projectId, { pass: true, violations: [] }, 'full', true).result).toMatchObject({ completed: false, buildId: null })
    expect(world.getExecutionProject(projectId)!.builds).toHaveLength(0)
  })

  it('fails closed when an expense transaction cannot be traced', () => {
    const { world, projectId } = readyWorld('rec05-buildfacts-missing-ledger')
    const execution = world.getExecutionProject(projectId)!
    execution.expenseTxIds = ['missing-expense-transaction']
    const gate = world.getDeliveryGateEvaluation(projectId, 'full', true)
    expect(gate.pass).toBe(true)

    const delivered = world.submitDeliveryForProject(projectId, gate.gate, 'full')
    expect(delivered).toMatchObject({ success: false, errorCode: 'D02_BUILD_FACTS_UNAVAILABLE' })
    expect(world.getExecutionProject(projectId)!.builds).toHaveLength(0)
    expect(world.getExecutionProject(projectId)!.project.state).toBe('READY_TO_DELIVER')
  })
})
