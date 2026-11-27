import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { startOfMonthDay } from '@domain/value-objects/personnel-salary'

describe('REC-04B GameWorld arrival integration', () => {
  it('keeps confirmation out of legacy employees and creates the employee on arrival', () => {
    const world = createGameWorld(904)
    const company = world.createCompany({ name: 'Arrival Studio', cityId: 'san_francisco' })
    const project = world.createExecutionProject({ name: 'Arrival Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
    expect(project.success).toBe(true)
    const candidate = world.listCandidates()[0]
    expect(candidate).toBeDefined()
    const hired = world.recruitFromCandidate(candidate!.candidateId)
    expect(hired.success).toBe(true)
    expect(world.world.employees.filter((employee) => employee.companyId === company.id)).toHaveLength(0)
    expect(world.world.pendingHires?.filter((pending) => pending.companyId === company.id && pending.state === 'pending')).toHaveLength(1)

    const arrivalDay = hired.result!.arrivalDay
    world.advanceSimulation(Math.max(0, arrivalDay - world.world.currentDayIndex))
    expect(world.world.employees.filter((employee) => employee.companyId === company.id)).toHaveLength(1)
    expect(world.world.employments?.filter((employment) => employment.companyId === company.id && employment.occupiesPerson)).toHaveLength(1)
    expect(world.world.pendingHires?.filter((pending) => pending.companyId === company.id && pending.state === 'arrived')).toHaveLength(1)
  })

  it('uses arrival-month salary timing in the recruitment impact preview', () => {
    const world = createGameWorld(905)
    world.createCompany({ name: 'Preview Studio', cityId: 'san_francisco' })
    // Day 30 is Jan 31 in the fixed 1970 calendar; a junior's 3-day lead arrives in February.
    world.advanceSimulation(30)
    const candidateBeforeExpiryExtension = world.listCandidates().find((entry) => {
      const person = world.world.persons?.find((item) => item.personId === entry.personId)
      return person?.seniority === 'junior'
    })
    expect(candidateBeforeExpiryExtension).toBeDefined()
    // Extend this test candidate only so a Day 30 confirmation can legally arrive in the next month.
    const state = world.serialize()
    if (state.candidates !== undefined) {
      state.candidates = state.candidates.map((entry) => entry.candidateId === candidateBeforeExpiryExtension!.candidateId
        ? { ...entry, expiresAtDay: 40 }
        : entry)
    }
    world.restore(state)
    const candidate = world.listCandidates().find((entry) => entry.candidateId === candidateBeforeExpiryExtension!.candidateId)
    expect(candidate).toBeDefined()

    const preview = world.previewRecruitImpact(candidate!.candidateId)
    expect(preview).not.toBeNull()
    const hired = world.recruitFromCandidate(candidate!.candidateId)
    expect(hired.success).toBe(true)
    expect(startOfMonthDay(hired.result!.arrivalDay)).not.toBe(startOfMonthDay(world.serialize().currentDayIndex))
    const employmentId = world.world.pendingHires?.find((entry) => entry.candidateId === candidate!.candidateId)?.employmentId
    expect(employmentId).toBeDefined()
    const salaryCommitment = world.serialize().commitments?.find((entry) => entry.commitmentId === `d03-sal-${employmentId}`)
    expect(salaryCommitment).toBeDefined()
    expect(salaryCommitment?.startAt).toBe(startOfMonthDay(hired.result!.arrivalDay))
    expect(salaryCommitment?.periodCount).toBe(12)
    expect(salaryCommitment?.totalPlannedCents).toBe((salaryCommitment?.amountCents ?? 0) * 12)
    const financialOverview = world.getFinancialOverview()
    expect(preview!.after.availableCashCents).toBe(financialOverview?.availableCashCents)
    expect(preview!.after.runwayMonths).toBe(financialOverview?.runwayMonths)
  })
})
