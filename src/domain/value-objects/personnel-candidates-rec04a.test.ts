import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONNEL_PARAMS } from './personnel-tuning'
import { refreshCandidatePool } from './personnel-candidates'

const base = {
  day: 40,
  existing: [],
  occupiedPersonIds: new Set<string>(),
  params: DEFAULT_PERSONNEL_PARAMS,
  marketSalaryOf: () => 100_000,
  regionId: 'default',
}

describe('REC-04A deterministic recruiting guard', () => {
  it('fills all five usable disciplines without the ordinary pool size cap', () => {
    const guard = { seedKey: 'rec04a:42:player:1', requiredDisciplines: ['design', 'code', 'art', 'audio', 'qa'] as const, supplementSequence: 0 }
    const result = refreshCandidatePool({ ...base, guard })
    expect(new Set(result.candidates.filter((c) => c.skillLevel > 0).map((c) => c.discipline))).toEqual(new Set(guard.requiredDisciplines))
    for (const discipline of guard.requiredDisciplines) {
      expect(result.candidates.some((c) => c.discipline === discipline && c.skillLevel === 5)).toBe(true)
    }
    expect(result.candidates.filter((c) => c.skillLevel >= 1).every((c) => c.skillLevel <= 5)).toBe(true)
    expect(result.supplementSequence).toBeGreaterThan(0)

    const repeated = refreshCandidatePool({ ...base, guard })
    expect(repeated.candidates).toEqual(result.candidates)
    expect(repeated.newPersons).toEqual(result.newPersons)
  })

  it('keeps active-pool candidates and shrinks an oversized pool deterministically after guard completion', () => {
    const guard = { seedKey: 'rec04a:42:player:1', requiredDisciplines: ['design', 'code', 'art', 'audio', 'qa'] as const, supplementSequence: 0 }
    const active = refreshCandidatePool({ ...base, guard })
    const ordinary = refreshCandidatePool({ ...base, existing: active.candidates })
    const expected = [...active.candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId)).slice(0, DEFAULT_PERSONNEL_PARAMS.candidatePoolSize)
    expect(ordinary.candidates).toEqual(expected)
    expect(ordinary.candidates).toHaveLength(DEFAULT_PERSONNEL_PARAMS.candidatePoolSize)
  })
})
