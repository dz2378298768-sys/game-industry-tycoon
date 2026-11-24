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
})
