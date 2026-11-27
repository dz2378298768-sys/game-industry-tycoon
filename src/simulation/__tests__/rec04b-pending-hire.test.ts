import { describe, expect, it } from 'vitest'
import { makePerson } from '../../__tests__/helpers'
import { D03_ERROR } from '@domain/entities/personnel'
import { FinanceService } from '@simulation/services/finance-service'
import { PersonnelService } from '@simulation/services/personnel-service'

function setup() {
  const finance = new FinanceService()
  finance.registerCompany('company-1')
  return { finance, service: new PersonnelService({ finance }) }
}

function seedCandidate(service: PersonnelService, overrides: Partial<Parameters<PersonnelService['adopt']>[0]> = {}) {
  const person = makePerson({
    personId: 'candidate-1',
    displayName: '候选音频师',
    seniority: 'senior',
    status: 'available',
    currentEmploymentId: null,
    skills: { personId: 'candidate-1', level: { audio: 4 }, exp: {}, lastLevelUpDay: {} },
  })
  service.adopt({
    persons: [person],
    employments: [],
    candidates: [{
      candidateId: 'candidate-entry-1',
      personId: person.personId,
      regionId: person.regionId,
      discipline: 'audio',
      skillLevel: 4,
      askingSalaryCents: 100_000,
      availableFromDay: 0,
      expiresAtDay: 10,
    }],
    personEvents: [],
    ...overrides,
  })
  return person
}

describe('REC-04B pending hire timing', () => {
  it('confirmation reserves capacity and commitments, arrival creates employment and fee once', () => {
    const { service, finance } = setup()
    const person = seedCandidate(service)
    const result = service.recruitFromCandidate({
      candidateId: 'candidate-entry-1', companyId: 'company-1', playerOfferCents: 100_000, day: 0,
    }, () => 100_000)
    expect(result.ok).toBe(true)
    expect(result.value?.arrivalDay).toBe(6) // senior: base 3 + kLead 3
    expect(service.listEmployments()).toHaveLength(0)
    expect(service.listPendingHires()).toHaveLength(1)
    expect(service.countHeadcountByCompany('company-1')).toBe(1)
    expect(finance.getCashBalance('company-1')).toBe(0)
    expect(finance.getLedger().getCommitments('company-1')).toHaveLength(2)

    expect(service.processPendingArrivals(5)).toHaveLength(0)
    const arrivals = service.processPendingArrivals(6)
    expect(arrivals).toHaveLength(1)
    expect(arrivals[0]?.employment.startDay).toBe(6)
    expect(arrivals[0]?.employment.role).toBe('audio_designer')
    expect(service.listEmployments()).toHaveLength(1)
    expect(service.getPerson(person.personId)?.currentEmploymentId).toBe(arrivals[0]?.employment.employmentId)
    expect(finance.getLedger().getCommitments('company-1').find((c) => c.period === 'one_off')?.realizedCents).toBe(100_000)
    expect(service.processPendingArrivals(6)).toHaveLength(0)
    expect(finance.getLedger().getCommitments('company-1').filter((c) => c.period === 'one_off')).toHaveLength(1)
  })

  it('accepts a candidate before expiry even when arrival is after the pool expiry', () => {
    const { service, finance } = setup()
    seedCandidate(service)
    const result = service.recruitFromCandidate({
      candidateId: 'candidate-entry-1', companyId: 'company-1', playerOfferCents: 100_000, day: 5,
    }, () => 100_000)
    expect(result.ok).toBe(true)
    expect(result.value?.arrivalDay).toBe(11)
    expect(service.listPendingHires()).toHaveLength(1)
    expect(service.listEmployments()).toHaveLength(0)
    expect(service.listCandidates()).toHaveLength(0)
    expect(finance.getLedger().getCommitments('company-1')).toHaveLength(2)
  })

  it('still rejects a candidate when confirmation itself is after expiry', () => {
    const { service, finance } = setup()
    seedCandidate(service)
    const result = service.recruitFromCandidate({
      candidateId: 'candidate-entry-1', companyId: 'company-1', playerOfferCents: 100_000, day: 11,
    }, () => 100_000)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe(D03_ERROR.CANDIDATE_EXPIRED)
    expect(service.listPendingHires()).toHaveLength(0)
    expect(service.listCandidates()).toHaveLength(1)
    expect(finance.getLedger().getCommitments('company-1')).toHaveLength(0)
  })

  it('cancels before arrival, releases commitments, and restores a valid candidate', () => {
    const { service, finance } = setup()
    seedCandidate(service)
    const hired = service.recruitFromCandidate({
      candidateId: 'candidate-entry-1', companyId: 'company-1', playerOfferCents: 100_000, day: 0,
    }, () => 100_000)
    const cancelled = service.cancelPendingHire(hired.value!.pendingHire.pendingHireId, 2)
    expect(cancelled.ok).toBe(true)
    expect(cancelled.value?.state).toBe('cancelled')
    expect(service.listCandidates()).toHaveLength(1)
    expect(service.listEmployments()).toHaveLength(0)
    expect(service.countHeadcountByCompany('company-1')).toBe(0)
    expect(finance.getLedger().getCommitments('company-1').every((c) => c.state === 'cancelled')).toBe(true)
    expect(service.cancelPendingHire(hired.value!.pendingHire.pendingHireId, 2).value?.state).toBe('cancelled')
  })
})
