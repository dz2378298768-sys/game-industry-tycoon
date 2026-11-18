import { z } from 'zod'
import type { WorldState } from '@simulation/services/world-state'

/** 当前存档结构版本 */
export const SAVE_SCHEMA_VERSION = 1

/** 唯一支持的模拟算法版本 */
export const SUPPORTED_ALGORITHM_VERSION = 'mulberry32-v1'

const qualityProfile = z.object({
  gameplay: z.number(),
  technical: z.number(),
  content: z.number(),
  art: z.number(),
  innovation: z.number(),
})

const disciplineWork = z.object({
  design: z.number().nonnegative(),
  programming: z.number().nonnegative(),
  art: z.number().nonnegative(),
  qa: z.number().nonnegative(),
})

const teamAssignment = z
  .object({
    employeeId: z.string().min(1),
    projectId: z.string().min(1),
    allocationRatio: z.number().gt(0).lte(1),
    roleOnProject: z.string().min(1),
  })
  .passthrough()

const companySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    cityId: z.string().min(1),
    foundingDay: z.number().int().nonnegative(),
    brand: z.number(),
    technologyCapacity: z.number(),
    managementCapacity: z.number(),
    cashBalanceCents: z.number().int(),
    status: z.enum(['active', 'bankrupt', 'dissolved']),
    isPlayer: z.boolean(),
  })
  .passthrough()

const employeeSchema = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(['designer', 'programmer', 'artist', 'qa', 'producer', 'manager']),
    skillLevel: z.number().int().min(1).max(5),
    salaryMonthlyCents: z.number().int().positive(),
    morale: z.number().min(0).max(100),
    fatigue: z.number().min(0).max(100),
    status: z.enum(['hired', 'on_leave', 'resigned', 'fired']),
  })
  .passthrough()

const projectSchema = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    name: z.string().min(1),
    genreId: z.string().min(1),
    phase: z.enum([
      'CONCEPT',
      'PRE_PRODUCTION',
      'PRODUCTION',
      'QA',
      'READY_TO_LAUNCH',
      'LAUNCHED',
      'CANCELLED',
    ]),
    isPaused: z.boolean(),
    /** D-01：连续暂停天数，旧存档缺省 0；NaN/负数/非整数由 zod 拒绝 */
    pausedDays: z.number().int().nonnegative().default(0),
    pauseReason: z.enum(['manual', 'budget_exhausted']).nullish(),
    plannedLaunchDay: z.number().int().nonnegative(),
    budgetTotalCapCents: z.number().int().nonnegative(),
    teamAssignments: z.array(teamAssignment),
    workRemainingByDiscipline: disciplineWork,
    workTotalByDiscipline: disciplineWork,
    qualityTargets: qualityProfile,
    qualityEstimate: qualityProfile,
  })
  .passthrough()

const productSchema = z
  .object({
    id: z.string().min(1),
    sourceProjectId: z.string().min(1),
    companyId: z.string().min(1),
    name: z.string().min(1),
    launchDay: z.number().int().nonnegative(),
    launchPriceCents: z.number().int().nullable(),
    defectLevel: z.number().min(0).max(100),
    status: z.enum(['active', 'retired']),
  })
  .passthrough()

const transactionSchema = z
  .object({
    id: z.string().min(1),
    idempotencyKey: z.string().min(1),
    companyId: z.string().min(1),
    day: z.number().int().nonnegative(),
    category: z.string().min(1),
    amountCents: z.number().int(),
    balanceAfterCents: z.number().int(),
    description: z.string(),
    status: z.enum(['posted', 'reversed']),
  })
  .passthrough()

export const worldStateSchema = z
  .object({
    schemaVersion: z.number().int(),
    saveSeed: z.number().int(),
    simulationAlgorithmVersion: z.string().min(1),
    currentDayIndex: z.number().int().nonnegative(),
    companies: z.array(companySchema),
    employees: z.array(employeeSchema),
    projects: z.array(projectSchema),
    products: z.array(productSchema),
    transactions: z.array(transactionSchema),
  })
  .passthrough()

export type ParseSaveResult =
  | { ok: true; state: WorldState }
  | { ok: false; errorCode: string; errorMessage: string }

function duplicateId(ids: string[]): string | null {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) return id
    seen.add(id)
  }
  return null
}

/**
 * 校验并解析存档。
 * 任何失败都返回错误，调用方必须保持当前运行状态不变。
 */
export function parseSave(raw: unknown): ParseSaveResult {
  const parsed = worldStateSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'SAVE_SCHEMA_INVALID',
      errorMessage: `存档结构校验失败：${parsed.error.issues[0]?.path.join('.') ?? 'unknown'} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
    }
  }

  const data = parsed.data
  if (data.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      errorCode: 'SAVE_VERSION_UNSUPPORTED',
      errorMessage: `不支持的存档版本 ${data.schemaVersion}，当前仅支持 ${SAVE_SCHEMA_VERSION}。`,
    }
  }
  if (data.simulationAlgorithmVersion !== SUPPORTED_ALGORITHM_VERSION) {
    return {
      ok: false,
      errorCode: 'SAVE_ALGORITHM_UNSUPPORTED',
      errorMessage: `不支持的模拟算法版本 ${data.simulationAlgorithmVersion}。`,
    }
  }

  const state = data as unknown as WorldState

  for (const [label, ids] of [
    ['公司', state.companies.map((c) => c.id)],
    ['员工', state.employees.map((e) => e.id)],
    ['项目', state.projects.map((p) => p.id)],
    ['产品', state.products.map((p) => p.id)],
    ['交易', state.transactions.map((t) => t.id)],
  ] as const) {
    const dup = duplicateId(ids)
    if (dup) {
      return { ok: false, errorCode: 'SAVE_DUPLICATE_ID', errorMessage: `${label}存在重复 ID：${dup}` }
    }
  }

  const companyIds = new Set(state.companies.map((c) => c.id))
  const employeeIds = new Set(state.employees.map((e) => e.id))
  const projectIds = new Set(state.projects.map((p) => p.id))

  for (const e of state.employees) {
    if (!companyIds.has(e.companyId)) {
      return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `员工 ${e.id} 引用了不存在的公司` }
    }
  }
  for (const p of state.projects) {
    if (!companyIds.has(p.companyId)) {
      return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `项目 ${p.id} 引用了不存在的公司` }
    }
    for (const a of p.teamAssignments) {
      if (!employeeIds.has(a.employeeId)) {
        return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `项目 ${p.id} 引用了不存在的员工 ${a.employeeId}` }
      }
      if (a.projectId !== p.id) {
        return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `项目 ${p.id} 的团队分配 projectId 不一致` }
      }
    }
  }
  for (const pr of state.products) {
    if (!projectIds.has(pr.sourceProjectId)) {
      return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `产品 ${pr.id} 引用了不存在的项目` }
    }
  }
  for (const t of state.transactions) {
    if (!companyIds.has(t.companyId)) {
      return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `交易 ${t.id} 引用了不存在的公司` }
    }
  }

  // 现金一致性：公司现金必须等于交易流水累计
  for (const company of state.companies) {
    const sum = state.transactions
      .filter((t) => t.companyId === company.id)
      .reduce((acc, t) => acc + t.amountCents, 0)
    if (sum !== company.cashBalanceCents) {
      return {
        ok: false,
        errorCode: 'SAVE_CASH_MISMATCH',
        errorMessage: `公司 ${company.name} 现金（${company.cashBalanceCents}）与流水累计（${sum}）不一致。`,
      }
    }
  }

  return { ok: true, state }
}
