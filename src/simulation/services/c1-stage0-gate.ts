/**
 * C1-T0 Stage 0 影子门（DECISION-M3-C1-001 v1.3 §3.5）。
 * 只读：不写销售、现金、认知度、产品、合同、项目；只消费注入的快照。
 */
import { buildDailyDemand } from '@simulation/services/demand-pool'
import type { DemandProductInput, DemandScopeInput } from '@simulation/services/demand-pool'
import type { Product } from '@domain/entities/product'
import type { Company } from '@domain/entities/company'
import type { WorldState } from '@simulation/services/world-state'
import {
  buildDemandScopesForDay,
  genreSegmentAffinity,
  referencePriceCents,
} from '@content/c1-content'

export const C1_STAGE0_GATE_DAYS = 730
export const C1_STAGE0_GATE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

export interface Stage0GateDay {
  scopes: DemandScopeInput[]
  products: DemandProductInput[]
  awarenessByMarket?: Record<string, Record<string, number>>
}

export interface Stage0GateInput {
  seed: number
  days: number
  buildDay: (dayIndex: number, seed: number) => Stage0GateDay
  /** 可选：世界状态指纹，用于断言只读（前后必须相等）。 */
  fingerprint?: () => string
}

export interface Stage0GateFailure {
  seed: number
  dayIndex: number
  check: string
  detail: string
}

export interface Stage0GateSeedSummary {
  seed: number
  days: number
  totalAudienceUnits: number
  totalAllocatedUnits: number
  maxScopeUtilization: number
  failures: number
}

export interface Stage0GateReport {
  gate: 'C1-STAGE0'
  status: 'PASS' | 'FAIL'
  days: number
  seeds: number[]
  generatedAtDayIndex: number
  seedSummaries: Stage0GateSeedSummary[]
  failures: Stage0GateFailure[]
  deterministic: boolean
  readOnly: boolean
  notes: string[]
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function awarenessRollup(day: Stage0GateDay): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {}
  for (const product of day.products) {
    const perMarket: Record<string, number> = {}
    const weightPerMarket: Record<string, number> = {}
    for (const scope of day.scopes) {
      if (!product.supportedPlatformIds.includes(scope.platformId)) continue
      if (!product.audienceSegmentIds.includes(scope.segmentId)) continue
      const key = `${scope.marketId}:${scope.platformId}:${scope.segmentId}`
      const awareness = product.awarenessByScope[key] ?? 0
      const units =
        scope.installBaseUnits * scope.activityRate * scope.marketShare * scope.segmentShare
      weightPerMarket[scope.marketId] = (weightPerMarket[scope.marketId] ?? 0) + units
      perMarket[scope.marketId] =
        (perMarket[scope.marketId] ?? 0) + awareness * units
    }
    const averaged: Record<string, number> = {}
    for (const [marketId, weighted] of Object.entries(perMarket)) {
      const weight = weightPerMarket[marketId] ?? 0
      averaged[marketId] = weight > 0 ? weighted / weight : 0
    }
    result[product.productId] = averaged
  }
  return result
}

function evaluateDay(seed: number, dayIndex: number, day: Stage0GateDay): {
  failures: Stage0GateFailure[]
  audience: number
  allocated: number
  maxUtilization: number
} {
  const failures: Stage0GateFailure[] = []
  const demand = buildDailyDemand({ dayIndex, scopes: day.scopes, products: day.products })
  let maxUtilization = 0

  for (const scope of demand.scopes) {
    if (!Number.isFinite(scope.audienceUnits) || scope.audienceUnits < 0) {
      failures.push({ seed, dayIndex, check: 'audience-finite', detail: scope.scopeKey })
    }
    if (scope.allocatedUnitsTotal > Math.floor(scope.audienceUnits) + 1e-9) {
      failures.push({
        seed,
        dayIndex,
        check: 'scope-conservation',
        detail: `${scope.scopeKey}: ${scope.allocatedUnitsTotal} > ${Math.floor(scope.audienceUnits)}`,
      })
    }
    if (scope.audienceUnits > 0) {
      maxUtilization = Math.max(maxUtilization, scope.allocatedUnitsTotal / scope.audienceUnits)
    }
    for (const row of scope.rows) {
      if (row.allocatedUnits > Math.floor(row.poolUnits) + 1e-9) {
        failures.push({
          seed,
          dayIndex,
          check: 'product-cap',
          detail: `${row.productId}@${scope.scopeKey}: ${row.allocatedUnits} > ${Math.floor(row.poolUnits)}`,
        })
      }
      for (const value of [row.attraction, row.share, row.purchaseIntent, row.awareness01]) {
        if (!Number.isFinite(value)) {
          failures.push({ seed, dayIndex, check: 'row-finite', detail: `${row.productId}@${scope.scopeKey}` })
        }
      }
    }
  }

  const rollup = awarenessRollup(day)
  if (day.awarenessByMarket) {
    for (const [productId, expected] of Object.entries(day.awarenessByMarket)) {
      const actual = rollup[productId] ?? {}
      for (const [marketId, value] of Object.entries(expected)) {
        const computed = actual[marketId] ?? 0
        const tolerance = Math.max(0.01, Math.abs(value) * 0.01)
        if (Math.abs(computed - value) > tolerance) {
          failures.push({
            seed,
            dayIndex,
            check: 'awareness-rollup',
            detail: `${productId}@${marketId}: ${round(computed)} vs ${round(value)}`,
          })
        }
      }
    }
  }

  return { failures, audience: demand.totalAudienceUnits, allocated: demand.totalAllocatedUnits, maxUtilization }
}

function runSeed(input: Stage0GateInput): {
  summary: Stage0GateSeedSummary
  failures: Stage0GateFailure[]
  trace: string[]
} {
  const firstPass: string[] = []
  const firstFailures: Stage0GateFailure[] = []
  let totalAudience = 0
  let totalAllocated = 0
  let maxUtilization = 0

  for (let day = 0; day < input.days; day += 1) {
    const dayInput = input.buildDay(day, input.seed)
    const result = evaluateDay(input.seed, day, dayInput)
    firstFailures.push(...result.failures)
    totalAudience += result.audience
    totalAllocated += result.allocated
    maxUtilization = Math.max(maxUtilization, result.maxUtilization)
    firstPass.push(
      JSON.stringify({
        day,
        scopes: result.allocated,
        audience: result.audience,
        max: round(result.maxUtilization),
      }),
    )
  }

  const secondPass: string[] = []
  for (let day = 0; day < input.days; day += 1) {
    const dayInput = input.buildDay(day, input.seed)
    const result = evaluateDay(input.seed, day, dayInput)
    secondPass.push(
      JSON.stringify({
        day,
        scopes: result.allocated,
        audience: result.audience,
        max: round(result.maxUtilization),
      }),
    )
  }

  const deterministic = firstPass.length === secondPass.length && firstPass.every((line, index) => line === secondPass[index])

  return {
    summary: {
      seed: input.seed,
      days: input.days,
      totalAudienceUnits: round(totalAudience),
      totalAllocatedUnits: round(totalAllocated),
      maxScopeUtilization: round(maxUtilization),
      failures: firstFailures.length,
    },
    failures: deterministic ? firstFailures : [...firstFailures, { seed: input.seed, dayIndex: -1, check: 'determinism', detail: 'two passes differ' }],
    trace: firstPass,
  }
}

export function runStage0Gate(input: Stage0GateInput): Stage0GateReport {
  const before = input.fingerprint?.()
  const seedRun = runSeed(input)
  const after = input.fingerprint?.()
  const readOnly = before === undefined || after === undefined || before === after
  const failures = seedRun.failures
  if (!readOnly) {
    failures.push({ seed: input.seed, dayIndex: -1, check: 'read-only', detail: 'world fingerprint changed' })
  }

  return {
    gate: 'C1-STAGE0',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    days: input.days,
    seeds: [input.seed],
    generatedAtDayIndex: 0,
    seedSummaries: [seedRun.summary],
    failures,
    deterministic: !failures.some((f) => f.check === 'determinism'),
    readOnly,
    notes: [
      '只读影子门：不写销售/现金/认知度/产品/合同/项目',
      'Gate 未过时 TUNING.c1.stage0=false，Stage 1–4 不得启用',
      '报告由 scripts/c1-stage0-gate.ts 写入 artifacts/c1/stage0/',
    ],
  }
}

export function runStage0GateForSeeds(
  buildDay: (dayIndex: number, seed: number) => Stage0GateDay,
  options: { days?: number; seeds?: number[]; fingerprint?: () => string } = {},
): Stage0GateReport {
  const days = options.days ?? C1_STAGE0_GATE_DAYS
  const seeds = options.seeds ?? C1_STAGE0_GATE_SEEDS
  const before = options.fingerprint?.()
  const reports = seeds.map((seed) => runStage0Gate({ seed, days, buildDay }))
  const after = options.fingerprint?.()
  const readOnly = before === undefined || after === undefined || before === after
  const failures = reports.flatMap((r) => r.failures)
  if (!readOnly) failures.push({ seed: -1, dayIndex: -1, check: 'read-only', detail: 'world fingerprint changed' })

  return {
    gate: 'C1-STAGE0',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    days,
    seeds,
    generatedAtDayIndex: 0,
    seedSummaries: reports.map((r) => r.seedSummaries[0]!),
    failures,
    deterministic: reports.every((r) => r.deterministic),
    readOnly,
    notes: [
      '只读影子门：不写销售/现金/认知度/产品/合同/项目',
      'Gate 未过时 TUNING.c1.stage0=false，Stage 1–4 不得启用',
      '报告由 scripts/c1-stage0-gate.ts 写入 artifacts/c1/stage0/',
    ],
  }
}

function splitAwarenessForProduct(product: Product): Record<string, number> {
  if (product.awarenessByScope && Object.keys(product.awarenessByScope).length > 0) {
    return { ...product.awarenessByScope }
  }
  const marketIds = Object.keys(product.awarenessByMarket)
  const scopes: string[] = []
  for (const marketId of marketIds) {
    for (const platformId of product.supportedPlatformIds) {
      for (const segmentId of product.audienceSegmentIds) {
        scopes.push(`${marketId}:${platformId}:${segmentId}`)
      }
    }
  }
  const result: Record<string, number> = {}
  if (scopes.length === 0) return result
  for (const marketId of marketIds) {
    const scopesInMarket = scopes.filter((key) => key.startsWith(`${marketId}:`))
    const value = product.awarenessByMarket[marketId] ?? 0
    for (const key of scopesInMarket) result[key] = value / scopesInMarket.length
  }
  return result
}

/** 从真实世界快照构造 Gate 输入；只读，不修改 world。 */
export function buildStage0GateDayFromWorld(params: {
  world: Pick<WorldState, 'products' | 'companies'>
  dayIndex: number
}): Stage0GateDay {
  const { world, dayIndex } = params
  const activeProducts = world.products.filter((p) => p.status === 'active' && p.launchDay <= dayIndex)
  const platformIds = Array.from(new Set(activeProducts.flatMap((p) => p.supportedPlatformIds)))
  const scopes = buildDemandScopesForDay({ dayIndex, platformIds })
  const brandById = new Map(world.companies.map((c: Company) => [c.id, c.brand]))

  const products: DemandProductInput[] = activeProducts.map((p) => {
    const genreId = p.genreId
    const segmentIds = p.audienceSegmentIds
    const platformFit: Record<string, number> = {}
    for (const platformId of p.supportedPlatformIds) platformFit[platformId] = 1
    const affinity: Record<string, number> = {}
    for (const segmentId of segmentIds) affinity[segmentId] = genreSegmentAffinity(genreId, segmentId)
    const price = p.pricePerUnitCents ?? p.launchPriceCents ?? referencePriceCents(genreId, p.supportedPlatformIds[0] ?? '', segmentIds[0] ?? '')
    return {
      productId: p.id,
      companyId: p.companyId,
      status: p.status === 'active' ? 'active' : 'retired',
      supportedPlatformIds: p.supportedPlatformIds,
      audienceSegmentIds: segmentIds,
      awarenessByScope: splitAwarenessForProduct(p),
      quality01: Math.max(0, Math.min(1, p.finalQualityScore / 100)),
      brand01: Math.max(0, Math.min(1, (brandById.get(p.companyId) ?? 10) / 100)),
      referencePriceCents: referencePriceCents(genreId, p.supportedPlatformIds[0] ?? '', segmentIds[0] ?? ''),
      effectivePriceCents: price,
      genreAffinityBySegment: affinity,
      platformFitByPlatform: platformFit,
      launchDay: p.launchDay,
    }
  })

  const awarenessByMarket: Record<string, Record<string, number>> = {}
  for (const p of activeProducts) awarenessByMarket[p.id] = { ...p.awarenessByMarket }

  return { scopes, products, awarenessByMarket }
}
