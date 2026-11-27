import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'

function recommendedDraft(requestId: string) {
  return {
    kind: 'draft' as const,
    requestId,
    workingTitle: 'Bridge Test Game',
    genreId: 'action',
    primaryTypeId: 'action',
    targetSegmentClaims: ['SEG-YOUTH'],
    platformTargets: ['PLT-ARCADE'],
    modules: [
      {
        templateId: 'MOD-CORE-ACTION',
        slotId: 'REC03-SLOT-CORE',
        instanceId: 'rec03-core',
        intensity: 1 as const,
        depthSelection: 'standard' as const,
        optionSelections: {},
        contentPackId: null,
      },
      {
        templateId: 'MOD-CONTENT-EPISODES',
        slotId: 'REC03-SLOT-CONTENT',
        instanceId: 'rec03-content',
        intensity: 1 as const,
        depthSelection: 'standard' as const,
        optionSelections: {},
        contentPackId: 'PACK-EPISODES-P1',
      },
    ],
    deliveryForm: 'full' as const,
    hrb: 0.45,
    budgetCapacityCents: 2_000_000,
    scopePolicy: 'recommended' as const,
  }
}

describe('REC-04 canonical delivery bridge', () => {
  it('does not let the legacy project reach launch-ready before execution WPs are ready', () => {
    const world = createGameWorld(2404)
    world.createCompany({ name: 'Bridge Studio', cityId: 'san_francisco' })
    const created = world.createExecutionProject(recommendedDraft('rec04-bridge'))
    expect(created.success).toBe(true)
    const legacyId = world.world.projects[0]!.id
    const execution = world.getExecutionProject(legacyId)!

    // Keep one execution WP unfinished while making the legacy carrier look QA-complete.
    execution.project.state = 'ACTIVE'
    execution.workPackages.forEach((wp, index) => {
      wp.state = index === 0 ? 'READY' : 'DONE'
      wp.remainingWorkUnits = index === 0 ? 1 : 0
      wp.deliveredWorkUnits = index === 0 ? 0 : wp.workUnits
      wp.progress = index === 0 ? 0 : 1
    })
    world.world.projects = world.world.projects.map((project) => project.id === legacyId
      ? {
          ...project,
          phase: 'QA',
          workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
        }
      : project)

    world.advanceSimulation(1)
    expect(world.world.projects[0]!.phase).toBe('QA')
    expect(world.getExecutionProject(legacyId)!.project.state).toBe('ACTIVE')
    expect(world.getDeliveryGateEvaluation(legacyId, 'full', true).available).toBe(false)

    // Once the final execution WP is done, both lifecycle carriers converge.
    const finalExecution = world.getExecutionProject(legacyId)!
    finalExecution.workPackages[0]!.state = 'DONE'
    finalExecution.workPackages[0]!.remainingWorkUnits = 0
    finalExecution.workPackages[0]!.deliveredWorkUnits = finalExecution.workPackages[0]!.workUnits
    finalExecution.workPackages[0]!.progress = 1
    world.advanceSimulation(1)

    expect(world.getExecutionProject(legacyId)!.project.state).toBe('READY_TO_DELIVER')
    expect(world.world.projects[0]!.phase).toBe('READY_TO_LAUNCH')
    expect(world.getDeliveryGateEvaluation(legacyId, 'full', true).available).toBe(true)
  })
})
