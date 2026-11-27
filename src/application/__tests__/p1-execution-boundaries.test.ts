import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import type { BlueprintDraftInput } from '@application/mediators/game-world'
import { computeDesignQuality } from '@domain/value-objects/product-completeness-quality'
import { DEFAULT_COMPLETENESS_TUNING } from '@domain/value-objects/product-completeness-tuning'
import { evaluateRuntimeDeliveryGate } from '@application/mediators/delivery-gate-context'

function setup() {
  const world = createGameWorld(73)
  const company = world.createCompany({ name: 'Audit Studio', cityId: 'san_francisco' })
  const draft: Extract<BlueprintDraftInput, { kind: 'draft' }> = {
    kind: 'draft', requestId: 'p1-independent', workingTitle: 'Audit Game',
    genreId: 'action', primaryTypeId: 'action', targetSegmentClaims: ['SEG-YOUTH'], platformTargets: ['PLT-ARCADE'],
    modules: [
      { templateId: 'MOD-CORE-ACTION', slotId: 'REC03-SLOT-CORE', instanceId: 'core', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: null },
      { templateId: 'MOD-CONTENT-EPISODES', slotId: 'REC03-SLOT-CONTENT', instanceId: 'episodes', intensity: 1, depthSelection: 'standard', optionSelections: {}, contentPackId: 'PACK-EPISODES-P1' },
    ],
    deliveryForm: 'full', hrb: 0.45, budgetCapacityCents: 10_000_000,
  }
  const preview = world.previewExecutionProject(draft).result!
  expect(world.createExecutionProject(draft).success).toBe(true)
  const id = world.world.projects[0]!.id
  for (const role of ['designer', 'programmer', 'artist', 'audio_designer', 'qa'] as const) {
    const hired = world.hireEmployee({ name: role, role, skillLevel: 5, salaryMonthlyCents: 1_000 })
    expect(hired.success).toBe(true)
    expect(world.assignEmployeeToProject(hired.result!.id, id, 1, 'generalist').success).toBe(true)
  }
  world.advanceSimulation(1)
  return { world, company, id, preview }
}

describe('P1 execution and recovery boundaries', () => {
  it('advances the calendar and atomically pauses when a canonical day cannot be funded', () => {
    const { world, company, id } = setup()
    const current = world.finance.getCashBalance(company.id)
    const beforeDay = world.calendar.currentDayIndex
    const beforeUnits = world.getExecutionProject(id)!.worklogs.length
    const spent = world.finance.postTransaction({
      idempotencyKey: 'audit-reduce-cash-to-one-cent', companyId: company.id, day: beforeDay,
      category: 'project_expense', amountCents: -current + 1, description: 'audit cash boundary',
    })
    expect(spent.success).toBe(true)
    expect(world.advanceSimulation(1).totalDays).toBe(1)
    expect(world.calendar.currentDayIndex).toBe(beforeDay + 1)
    expect(world.finance.getCashBalance(company.id)).toBe(1)
    expect(world.getPlayerCompany()!.status).toBe('active')
    expect(world.getExecutionProject(id)!.worklogs).toHaveLength(beforeUnits)
    expect(world.getExecutionProject(id)!.project.state).toBe('PAUSED')
    expect(world.world.projects[0]!.riskFlags).toContain('development_cash_shortage')
  })

  it('refuses legacy descope for a canonical project and preserves genuine work targets', () => {
    const { world, id } = setup()
    const before = world.getExecutionProject(id)!.workPackages.map((wp) => wp.baselineWorkUnits)
    const legacyDesign = world.world.projects[0]!.workTotalByDiscipline.design
    const result = world.descopeProject(id, 0.3)
    expect(result).toMatchObject({ success: false, errorCode: 'PRJ_USE_DESIGN_CHANGE' })
    expect(world.world.projects[0]!.workTotalByDiscipline.design).toBe(legacyDesign)
    world.advanceSimulation(1)
    expect(world.getExecutionProject(id)!.workPackages.map((wp) => wp.baselineWorkUnits)).toEqual(before)
  })

  it('retains the frozen D-01 estimates and market-fit inputs in D-02', () => {
    const { world, id, preview } = setup()
    const snapshot = preview.snapshot!
    const result = evaluateRuntimeDeliveryGate({
      execution: world.getExecutionProject(id)!, project: world.world.projects[0]!,
      dayIndex: world.calendar.currentDayIndex, snapshot, ledger: world.finance.getLedger(),
    })
    expect(snapshot.estimates!.workUnits.total).toBeGreaterThan(0)
    expect(result.context.snapshot.estimates!.workUnits.total).toBe(snapshot.estimates!.workUnits.total)
    expect(result.decision.dqVector.marketFit).toBeGreaterThan(0)
    expect(result.decision.dqVector.marketFit).toBe(computeDesignQuality({ ...result.context, snapshot }, DEFAULT_COMPLETENESS_TUNING).marketFit)
  })

  it('continues a legacy in-flight session whose target was its original frozen snapshot', () => {
    let { world } = setup()
    const id = world.world.projects[0]!.id
    world.advanceSimulation(9)
    expect(world.confirmRework(id, 'C', 2).success).toBe(true)
    const saved = JSON.parse(JSON.stringify(world.serialize())) as ReturnType<typeof world.serialize>
    for (const entry of saved.executionProjects ?? []) {
      const session = entry.state.reworkSessions.find((item) => item.status === 'active')!
      session.targetSnapshotId = session.baseSnapshotId
      session.targetDraftVersionId = entry.state.project.versionId
    }
    world = createGameWorld(saved.saveSeed)
    world.restore(saved)
    world.advanceSimulation(150)
    const state = world.getExecutionProject(id)!
    expect(state.workPackages.every((wp) => wp.state === 'DONE' || wp.state === 'DEACTIVATED')).toBe(true)
    expect(state.project.state).toBe('READY_TO_DELIVER')
    expect(state.project.reworkSessionId).toBeNull()
    expect(world.getDeliveryGateEvaluation(id, 'full', true).pass).toBe(true)
  })

  it('blocks breaking a bankruptcy pause without resetting its cancellation clock', () => {
    const { world, company, id } = setup()
    const day = world.calendar.currentDayIndex
    const cash = world.finance.getCashBalance(company.id)
    expect(world.finance.postTransaction({
      idempotencyKey: 'audit-force-negative-cash', companyId: company.id, day, category: 'project_expense',
      amountCents: -cash - 1, description: 'audit bankruptcy policy boundary',
    }, { allowNegativeBalance: true }).success).toBe(true)
    world.advanceSimulation(2)
    expect(world.world.projects[0]).toMatchObject({ isPaused: true, pauseReason: 'bankruptcy', pausedDays: 1 })
    expect(world.toggleProjectPause(id)).toMatchObject({ success: false, errorCode: 'FIN_COMPANY_BANKRUPT' })
    expect(world.world.projects[0]).toMatchObject({ isPaused: true, pauseReason: 'bankruptcy', pausedDays: 1 })
    world.advanceSimulation(29)
    expect(world.world.projects[0]).toMatchObject({ phase: 'CANCELLED', cancellationReason: 'restructuring' })
  })
})
