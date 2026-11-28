import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'

describe('REC-04A first project recruiting guard', () => {
  it('generates identical candidate IDs and attributes for repeated runs with the same save seed', () => {
    const run = () => {
      const world = createGameWorld(80)
      world.createCompany({ name: 'Repeat Studio', cityId: 'san_francisco' })
      world.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
      return world.listCandidates()
    }
    expect(run()).toEqual(run())
  })

  it('activates on successful first project, covers all disciplines immediately, and restores the company state', () => {
    const world = createGameWorld(81)
    const company = world.createCompany({ name: 'First Project Studio', cityId: 'san_francisco' })
    const created = world.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
    expect(created.success).toBe(true)

    const guard = world.world.rec04RecruitingGuardByCompany?.[company.id]
    expect(guard).toMatchObject({ state: 'active', projectId: created.result!.projectId, supplementSequence: expect.any(Number) })
    const candidates = world.listCandidates()
    expect(new Set(candidates.filter((candidate) => candidate.skillLevel >= 1).map((candidate) => candidate.discipline))).toEqual(new Set(['design', 'code', 'art', 'audio', 'qa']))

    const saved = structuredClone(world.serialize())
    const restored = createGameWorld(81)
    restored.restore(saved)
    expect(restored.serialize().rec04RecruitingGuardByCompany).toEqual(saved.rec04RecruitingGuardByCompany)
    expect(restored.listCandidates()).toEqual(candidates)
  })

  it('uses the same active guard during empty-pool lazy refresh and the next daily refresh', () => {
    const world = createGameWorld(83)
    world.createCompany({ name: 'Refresh Studio', cityId: 'san_francisco' })
    expect(world.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 }).success).toBe(true)

    world.world.candidates = []
    const lazy = world.listCandidates()
    expect(new Set(lazy.filter((candidate) => candidate.skillLevel >= 1).map((candidate) => candidate.discipline))).toEqual(new Set(['design', 'code', 'art', 'audio', 'qa']))

    world.world.candidates = []
    world.advanceSimulation(1)
    const daily = world.world.candidates ?? []
    expect(new Set(daily.filter((candidate) => candidate.skillLevel >= 1).map((candidate) => candidate.discipline))).toEqual(new Set(['design', 'code', 'art', 'audio', 'qa']))
  })

  it('does not restore legacy eligibility and marks an active guard cancelled with its project', () => {
    const world = createGameWorld(82)
    const company = world.createCompany({ name: 'Legacy Studio', cityId: 'san_francisco' })
    const created = world.createExecutionProject({ name: 'First Game', genreId: 'simulation', hrb: 0.5, budgetCapacityCents: 1_000_000 })
    expect(created.success).toBe(true)
    const saved = structuredClone(world.serialize())
    delete saved.rec04RecruitingGuardByCompany
    const legacy = createGameWorld(82)
    legacy.restore(saved)
    expect(legacy.world.rec04RecruitingGuardByCompany).toBeUndefined()

    const restored = createGameWorld(82)
    restored.restore(world.serialize())
    const project = restored.world.projects[0]!
    expect(restored.cancelProject(project.id).success).toBe(true)
    expect(restored.world.rec04RecruitingGuardByCompany?.[company.id]?.state).toBe('cancelled')
  })
})
