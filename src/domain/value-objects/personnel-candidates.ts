/**
 * D-03 有限候选池（规格 §3.5 / §5.2 RULE-04/05 + ADJ-2026-11-22-12 S5-1）。
 *
 * S5-1 扩展：每次刷新 5 名候选，五学科随机分配（design/code/art/audio/qa）
 * 随机分配；技能档位取 D-03 现值区间（0..5）均匀分布。
 * 确定性：hash(entityId, day, salt)，禁 Math.random；已被任一公司 occupying 雇佣的人不出现（防挖角 O1）。
 */
import type { Candidate, Person } from '@domain/entities/personnel'
import { D03_POOL_DISCIPLINES } from '@domain/entities/personnel'
import type { PersonnelParams } from './personnel-tuning'
import { hash01 } from './personnel-resign'
import { candidateDisplayName } from '@content/personnel-names'

export interface CandidatePoolGuardInput {
  /** Stable save/company namespace. Random entity UUIDs must not enter candidate seeds. */
  seedKey: string
  requiredDisciplines: readonly Candidate['discipline'][]
  supplementSequence: number
}

export interface RefreshPoolInput {
  day: number
  /** 现池（过期剔除、重复去重、occupying 剔除后补足）。 */
  existing: readonly Candidate[]
  /** 已被任一公司 occupying 雇佣的 personId 集合（RULE-05）。 */
  occupiedPersonIds: ReadonlySet<string>
  params: PersonnelParams
  /** 市场月薪基准（§6.3 marketSalary；调用方注入 TUNING 表与城市系数）。 */
  marketSalaryOf: (discipline: Candidate['discipline']) => number
  regionId: string
  /** 池上限（§5.2 RULE-05 candidatePoolSize）。 */
  poolSize?: number
  /** REC-04A：首个玩家项目的公司隔离保障状态。 */
  guard?: CandidatePoolGuardInput | undefined
}

export function recruitLeadDays(seniority: Person['seniority'], params: PersonnelParams): number {
  return params.baseLeadDays + (seniority === 'senior' ? params.kLead : 0)
}

/** 确定性生成一个候选人物（S5-1：1 个主学科 + 其余 0）。 */
function makeCandidatePerson(seed: string, day: number, regionId: string): Person {
  const u1 = hash01(seed, day, 'd03-pool-name')
  const ageYears = 22 + Math.floor(u1 * 28) // 22~49 岁
  return {
    personId: `d03-cand-${seed}`,
    displayName: candidateDisplayName(seed, day),
    birthDay: Math.max(0, day - ageYears * 365),
    regionId,
    skills: { personId: `d03-cand-${seed}`, level: {}, exp: {}, lastLevelUpDay: {} },
    seniority: hash01(seed, day, 'd03-pool-seniority') < 0.25 ? 'senior' : 'junior',
    traits: null,
    preferences: null,
    baseMorale: 50 + Math.floor(u1 * 30),
    status: 'available',
    currentEmploymentId: null,
    careerRecord: [],
    rehireCount: 0,
    version: 1,
    createdAt: day,
    updatedAt: day,
  }
}

/**
 * 每游戏日刷新一次（§12）：
 *  1) 剔除过期（expiresAtDay < day）与已被 occupying 雇佣的候选；
 *  2) 池内重复同人去重（E11，D03_DUPLICATE_CANDIDATE 语义）；
 *  3) 不足 poolSize 则确定性生成新候选补足：每次刷新固定生成 5 名、五学科随机分配（S5-1），
 *     主学科等级 = 0..5 均匀分布（D-03 现值区间）。
 */
export function refreshCandidatePool(input: RefreshPoolInput): {
  candidates: Candidate[]
  newPersons: Person[]
  duplicatesRemoved: string[]
  supplementSequence: number
} {
  const poolSize = input.poolSize ?? input.params.candidatePoolSize
  const kept: Candidate[] = []
  const seenPersons = new Set<string>()
  const duplicatesRemoved: string[] = []
  for (const c of input.existing) {
    if (c.expiresAtDay < input.day) continue // 过期自动移除（§11 S4）
    if (input.occupiedPersonIds.has(c.personId)) continue // 已被雇佣，从池中移除
    if (seenPersons.has(c.personId)) {
      duplicatesRemoved.push(c.candidateId)
      continue
    }
    seenPersons.add(c.personId)
    kept.push(c)
  }

  const newPersons: Person[] = []
  const batch = poolSize // S5-1：每次刷新 5 名
  for (let i = 0; i < batch && kept.length < poolSize; i++) {
    const seed = `${input.day}-${i}`
    // 五学科随机分配；seed + day 固定，重复模拟完全一致。
    const uD = hash01(seed, input.day, 'd03-pool-discipline')
    const discipline = D03_POOL_DISCIPLINES[Math.floor(uD * D03_POOL_DISCIPLINES.length)] as Candidate['discipline']
    // 技能档位取 D-03 现值区间 0..5 均匀分布（S5-1）
    const uL = hash01(seed, input.day, 'd03-pool-level')
    const skillLevel = Math.min(5, Math.floor(uL * 6))
    const person = makeCandidatePerson(seed, input.day, input.regionId)
    person.skills.level[discipline] = skillLevel
    const market = input.marketSalaryOf(discipline)
    const uA = hash01(seed, input.day, 'd03-pool-ask')
    const asking = Math.max(
      1,
      Math.round(market * (input.params.floorPriceRatio + (input.params.ceilingPriceRatio - input.params.floorPriceRatio) * uA)),
    )
    const candidate: Candidate = {
      candidateId: `d03-cand-entry-${seed}`,
      personId: person.personId,
      regionId: person.regionId,
      discipline,
      skillLevel,
      askingSalaryCents: asking,
      availableFromDay: input.day + recruitLeadDays(person.seniority, input.params),
      expiresAtDay: input.day + input.params.candidateExpiresDays,
    }
    newPersons.push(person)
    kept.push(candidate)
  }
  let supplementSequence = input.guard?.supplementSequence ?? 0
  if (input.guard !== undefined) {
    // REC-04A 首项目保障：每个学科至少保留一名 Lv5 可行候选；低技能候选仍可保留，
    // 但不能让“有候选”掩盖首项目没有可行完成路径。
    const covered = new Set(
      kept
        .filter((c) => c.skillLevel >= 5)
        .map((c) => c.discipline),
    )
    const missing = input.guard.requiredDisciplines.filter((d) => !covered.has(d))
    for (const discipline of missing) {
      const sequence = supplementSequence
      supplementSequence += 1
      const seed = `rec04a-guard:${input.guard.seedKey}:${sequence}:${discipline}`
      const person = makeCandidatePerson(seed, input.day, input.regionId)
      const skillLevel = 5
      person.skills.level[discipline] = skillLevel
      const market = input.marketSalaryOf(discipline)
      const uA = hash01(seed, input.day, 'rec04a-guard-ask')
      const asking = Math.max(
        1,
        Math.round(market * (input.params.floorPriceRatio + (input.params.ceilingPriceRatio - input.params.floorPriceRatio) * uA)),
      )
      kept.push({
        candidateId: `rec04a-guard-entry-${input.guard.seedKey}-${sequence}-${discipline}`,
        personId: person.personId,
        regionId: person.regionId,
        discipline,
        skillLevel,
        askingSalaryCents: asking,
        availableFromDay: input.day + recruitLeadDays(person.seniority, input.params),
        expiresAtDay: input.day + input.params.candidateExpiresDays,
      })
      newPersons.push(person)
    }
  } else if (kept.length > poolSize) {
    kept.sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    kept.length = poolSize
  }
  return { candidates: kept, newPersons, duplicatesRemoved, supplementSequence }
}
