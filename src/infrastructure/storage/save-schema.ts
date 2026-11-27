import { z } from 'zod'
import type { WorldState } from '@simulation/services/world-state'
import { migrateSave } from './save-migrations'
import { isTerminalProjectPhase } from '@simulation/systems/phase-rules'
import { makeSalesRecordId } from '@domain/entities/sales-record'
import type { SalesRecord } from '@domain/entities/sales-record'
import { makeRefundBatchId, refundBatchIdempotencyKey } from '@domain/entities/refund-batch'

/** 当前存档结构版本 */
export const SAVE_SCHEMA_VERSION = 3

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

const costAllocationSchema = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    projectId: z.string().min(1),
    sourceType: z.enum(['salary', 'contract', 'direct_expense']),
    sourceRefId: z.string().min(1),
    cashTransactionId: z.string().min(1).nullable(),
    amountCents: z.number().int().positive(),
    allocationRatio: z.number().gt(0).lte(1),
    periodKey: z.string().min(1),
    idempotencyKey: z.string().min(1),
    day: z.number().int().nonnegative(),
    description: z.string(),
    status: z.enum(['committed', 'spent']),
    version: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .passthrough()

const companySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    cityId: z.string().min(1),
    foundingDay: z.number().int().nonnegative(),
    brand: z.number(),
    brandMemoryBySegment: z.record(z.string(), z.number()).optional(),
    technologyCapacity: z.number(),
    managementCapacity: z.number(),
    cashBalanceCents: z.number().int(),
    status: z.enum(['active', 'bankrupt', 'dissolved']),
    isPlayer: z.boolean(),
    persona: z.enum(['indie', 'genre_specialist', 'integrated_dev_publisher']).optional(),
    bankruptSinceDay: z.number().int().nonnegative().optional(),
    bankruptcyPhase: z.enum(['restructuring', 'winddown']).optional(),
    restructuringStartedDay: z.number().int().nonnegative().optional(),
    restructuringDeadlineDay: z.number().int().nonnegative().optional(),
    restructuringExtended: z.boolean().optional(),
    restructuringStartCashCents: z.number().int().optional(),
    restructuringStartFixedCents: z.number().int().optional(),
    assetSales: z
      .array(
        z
          .object({
            assetId: z.string().min(1),
            buyerId: z.string().min(1),
            priceCents: z.number().int().nonnegative(),
            day: z.number().int().nonnegative(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

const employeeSchema = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(['designer', 'programmer', 'artist', 'audio_designer', 'qa', 'producer', 'manager']),
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
    pauseReason: z.enum(['manual', 'budget_exhausted', 'bankruptcy']).nullish(),
    plannedLaunchDay: z.number().int().nonnegative(),
    budgetTotalCapCents: z.number().int().nonnegative(),
    /** M3-C1：开发/上市营销拆分；旧档缺省不补，由预算服务回退 */
    developmentBudgetCents: z.number().int().nonnegative().optional(),
    launchMarketingReservedCents: z.number().int().nonnegative().optional(),
    launchMarketingSpentCents: z.number().int().nonnegative().optional(),
    /** DESIGN-G05 §7.3：spent/committed 非负；旧存档缺省 0 */
    budgetSpentCents: z.number().int().nonnegative().default(0),
    budgetCommittedCents: z.number().int().nonnegative().default(0),
    /** DESIGN-G05 §7.3：归属本项目的成本分摊记录；旧存档缺省 [] */
    costAllocations: z.array(costAllocationSchema).default([]),
    /** DESIGN-G05 §6.2：预算耗尽态标记；旧存档缺省 false */
    budgetExhausted: z.boolean().default(false),
    /** DESIGN-G05 §7.1 GDR R2：耗尽事件幂等键恢复周期序号；旧存档缺省 0 */
    resumeSeq: z.number().int().nonnegative().default(0),
    /** DESIGN-C-01 §3.1：累计砍范围比例；旧存档缺省 0 */
    scopeCutRatio: z.number().min(0).max(0.5).default(0),
    /** DESIGN-C-02 §3.1：原始 plannedLaunchDay；旧存档缺省 null */
    originalPlannedLaunchDay: z.number().int().nonnegative().nullable().default(null),
    /** DESIGN-C-02 §3.1：累计延期天数；旧存档缺省 0 */
    launchDelayDays: z.number().int().nonnegative().default(0),
    /**
     * DESIGN-G05 §7.3 读档一致性：预算公式快照。
     * 旧存档缺省 undefined → 校验跳过（值由权威公式推导，无漂移风险）。
     */
    remainingCapCents: z.number().int().optional(),
    teamAssignments: z.array(teamAssignment),
    workRemainingByDiscipline: disciplineWork,
    workTotalByDiscipline: disciplineWork,
    qualityTargets: qualityProfile,
    qualityEstimate: qualityProfile,
  })
  .passthrough()

// ===== M2-A：销售领域实体（DESIGN-M2-001-A §10.8.1/§10.8.2）=====

const salesRecordSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    dayIndex: z.number().int().nonnegative(),
    marketId: z.string().min(1),
    platformId: z.string().min(1),
    grossUnits: z.number().int().positive(),
    unitPriceAtSaleCents: z.number().int().nonnegative(),
    grossRevenueCents: z.number().int().nonnegative(),
    platformFeeCents: z.number().int().nonnegative(),
    netSalesRevenueCents: z.number().int().nonnegative(),
    estimatedRefundUnits: z.number().int().nonnegative(),
    actualRefundUnits: z.number().int().nonnegative(),
  })
  .superRefine((r, ctx) => {
    if (r.estimatedRefundUnits > r.grossUnits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedRefundUnits'], message: 'estimatedRefundUnits 不得超过 grossUnits' })
    }
    if (r.actualRefundUnits > r.grossUnits) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actualRefundUnits'], message: 'actualRefundUnits 不得超过 grossUnits' })
    }
    if (r.platformFeeCents > r.grossRevenueCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['platformFeeCents'], message: 'platformFeeCents 不得超过 grossRevenueCents' })
    }
    if (r.netSalesRevenueCents !== r.grossRevenueCents - r.platformFeeCents) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['netSalesRevenueCents'], message: 'netSalesRevenueCents 必须等于 grossRevenueCents - platformFeeCents' })
    }
    if (r.unitPriceAtSaleCents !== Math.round(r.grossRevenueCents / r.grossUnits)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitPriceAtSaleCents'], message: 'unitPriceAtSaleCents 必须等于 round(grossRevenueCents / grossUnits)' })
    }
  })

const refundBatchSchema = z
  .object({
    id: z.string().regex(/^RB-.+-\d+-\d+-[1-9]\d*$/, 'id 必须为 RB-<productId>-<saleDay>-<refundDay>-<seq≥1>'),
    productId: z.string().min(1),
    salesRecordId: z.string().min(1),
    marketId: z.string().min(1),
    platformId: z.string().min(1),
    saleDayIndex: z.number().int().nonnegative(),
    refundDayIndex: z.number().int().nonnegative(),
    refundedUnits: z.number().int().positive(),
    refundAmountCents: z.number().int().nonnegative(),
    source: z.enum(['auto_window', 'player_request']),
    status: z.enum(['pending', 'posted', 'rejected']),
    firstRefundRequestId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1),
  })
  .superRefine((b, ctx) => {
    if (b.refundDayIndex < b.saleDayIndex) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['refundDayIndex'], message: 'refundDayIndex 不得早于 saleDayIndex' })
    }
    if (b.idempotencyKey !== `customer-refund:${b.id}`) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['idempotencyKey'], message: 'idempotencyKey 必须等于 customer-refund:<id>' })
    }
  })

const productSchema = z
  .object({
    id: z.string().min(1),
    sourceProjectId: z.string().min(1),
    companyId: z.string().min(1),
    name: z.string().min(1),
    launchDay: z.number().int().nonnegative(),
    launchPriceCents: z.number().int().nullable(),
    moduleTemplateIds: z.array(z.string().min(1)).optional(),
    moduleAffinityBySegment: z.record(z.string(), z.number()).optional(),
    /** M2-D：三字段可选，旧档缺失即 undefined，由 effectivePriceCents 兜底（不升 schemaVersion） */
    pricePerUnitCents: z.number().int().positive().optional(),
    discountRatePercent: z.number().int().min(0).max(50).optional(),
    lastPriceChangeDay: z.number().int().nonnegative().optional(),
    defectLevel: z.number().min(0).max(100),
    status: z.enum(['active', 'retired']),
    clearanceDiscountRatePercent: z.number().int().min(0).max(50).optional(),
    /** M3-C1：按 scope 的认知度；旧档缺省，由迁移层从 awarenessByMarket 拆分 */
    awarenessByScope: z.record(z.string(), z.number()).optional(),
    /** M2-A：旧存档缺省 []；读取即补，不提升 schemaVersion */
    salesByPeriod: z.array(salesRecordSchema).default([]),
    latestMarketFeedback: z.object({
      dayIndex: z.number().int().nonnegative(),
      addressableUnits: z.number().int().nonnegative(),
      purchaseIntentReductionUnits: z.number().int().nonnegative(),
      allocationReductionUnits: z.number().int().nonnegative(),
      marketingAddedIntentUnits: z.number().int().nonnegative(),
      priorDayMarketingSpendCents: z.number().int().nonnegative().optional(),
      soldUnits: z.number().int().nonnegative(),
      bySegment: z.record(z.string(), z.object({ addressableUnits: z.number().int().nonnegative(), soldUnits: z.number().int().nonnegative() })),
    }).optional(),
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

const marketingCampaignSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    prelaunch: z.boolean().optional(),
    channel: z.enum(['social', 'expo', 'ads']),
    dailyBudgetCents: z.number().int().nonnegative(),
    startDay: z.number().int().nonnegative(),
    status: z.enum(['active', 'ended']),
    version: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .passthrough()

const publishingContractSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    type: z.enum(['revenue_share', 'milestone']),
    ratePercent: z.number().int().min(5).max(35).optional(),
    thresholdNetRevenueCents: z.number().int().nonnegative().optional(),
    payoutCents: z.number().int().nonnegative().optional(),
    signedDay: z.number().int().nonnegative(),
    durationDays: z.number().int().min(30).max(365).nullable(),
    status: z.enum(['active', 'completed', 'terminated']),
    settledCents: z.number().int(),
    template: z.enum(['channel', 'co_marketing', 'advance']).optional(),
    partnerId: z.string().min(1).optional(),
    marketScope: z.array(z.string().min(1)).optional(),
    platformScope: z.array(z.string().min(1)).optional(),
    prepaymentCents: z.number().int().positive().optional(),
    recoupRatePercent: z.number().int().min(1).max(100).optional(),
    recoupedCents: z.number().int().nonnegative().optional(),
    marketingCommitmentCents: z.number().int().positive().optional(),
    marketingInjectedCents: z.number().int().nonnegative().optional(),
    qualityThreshold: z.number().min(0).max(100).optional(),
    deliveryDay: z.number().int().nonnegative().optional(),
    controlLevel: z.enum(['full', 'shared', 'none']).optional(),
    terminationClause: z
      .enum(['mutual', 'quality_breach', 'delivery_breach', 'dissolved'])
      .optional(),
    rateProfile: z.enum(['legacy', 'realistic']).optional(),
    version: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .passthrough()
  .refine((contract) => (contract.ratePercent ?? 0) <= 30 || contract.template === 'co_marketing', {
    path: ['ratePercent'],
    message: 'Only co-marketing contracts may exceed 30%',
  })

export const worldStateSchema = z
  .object({
    schemaVersion: z.number().int(),
    saveSeed: z.number().int(),
    simulationAlgorithmVersion: z.string().min(1),
    currentDayIndex: z.number().int().nonnegative(),
    aiCompetitionEnabled: z.boolean().optional(),
    companies: z.array(companySchema),
    employees: z.array(employeeSchema),
    projects: z.array(projectSchema),
    products: z.array(productSchema),
    /** M2-A：旧存档缺省 []；读取即补，不提升 schemaVersion */
    refundBatches: z.array(refundBatchSchema).default([]),
    /** M2-F：旧档缺省 []，不升存档版本 */
    marketingCampaigns: z.array(marketingCampaignSchema).default([]),
    publishingContracts: z.array(publishingContractSchema).default([]),
    transactions: z.array(transactionSchema),
    /**
     * CODE-04：账本承诺集合（FIN §3.3）。旧档缺省 []，不升存档版本。
     * 结构性字段逐一约定；`cancelEffectiveMonth` 等取消溯源字段可空（旧档/未取消）。
     */
    commitments: z
      .array(
        z
          .object({
            commitmentId: z.string().min(1),
            companyId: z.string().min(1),
            sourceType: z.enum(['employment_salary', 'office_rent', 'project_budget', 'contract_obligation']),
            sourceRef: z.string().min(1),
            amountCents: z.number().int().positive(),
            period: z.enum(['monthly', 'one_off']),
            periodCount: z.number().int().nonnegative(),
            totalPlannedCents: z.number().int().nonnegative(),
            startAt: z.number().int().nonnegative(),
            endAt: z.number().int().nonnegative(),
            realizedCents: z.number().int().nonnegative(),
            state: z.enum(['committed', 'partially_realized', 'realized', 'cancelled']),
            linkedTxIds: z.array(z.string().min(1)),
            cancelEffectiveMonth: z.string().nullable().optional(),
            releasedPeriods: z.number().int().nonnegative().optional(),
            releasedCents: z.number().int().nonnegative().optional(),
            cancelledAtPeriods: z.number().int().nonnegative().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
    /** M3-A3：旧档缺省 []；AI 决策日志随档，供克隆对照与审计；不升版本 */
    aiDecisionLog: z
      .array(
        z
          .object({ companyId: z.string().min(1), day: z.number().int().nonnegative() })
          .passthrough(),
      )
      .default([]),
    /**
     * CODE-06 / D-03（TASK-P1-CODE-06）：人才与组织实体。旧档缺省 []，不升存档版本
     * （d03SchemaVersion 独立管理，§11 S7）。passthrough 以容纳 D-03 后续扩展字段。
     */
    persons: z.array(z.object({ personId: z.string().min(1) }).passthrough()).default([]),
    employments: z
      .array(
        z
          .object({
            employmentId: z.string().min(1),
            personId: z.string().min(1),
            companyId: z.string().min(1),
            status: z.enum(['probation', 'active', 'resigning', 'terminated', 'contract_ended']),
            occupiesPerson: z.boolean(),
            salaryMonthlyCents: z.number().int().positive(),
            startDay: z.number().int().nonnegative(),
            salaryCommitmentId: z.string().min(1),
          })
          .passthrough(),
      )
      .default([]),
    candidates: z.array(z.object({ candidateId: z.string().min(1), personId: z.string().min(1) }).passthrough()).default([]),
    personEvents: z.array(z.object({ eventId: z.string().min(1), personId: z.string().min(1), kind: z.string().min(1) }).passthrough()).default([]),
    pendingHires: z.array(z.object({
      pendingHireId: z.string().min(1), employmentId: z.string().min(1), personId: z.string().min(1), companyId: z.string().min(1),
      candidateId: z.string().min(1), role: z.enum(['designer', 'programmer', 'artist', 'audio_designer', 'qa', 'producer', 'manager']),
      discipline: z.enum(['design', 'code', 'art', 'audio', 'qa']), skillLevel: z.number().int().min(1).max(5), seniority: z.enum(['junior', 'senior']),
      negotiatedSalaryCents: z.number().int().positive(), askingSalaryCents: z.number().int().positive(), initialTermMonths: z.number().int().positive(), hireConfirmDay: z.number().int().nonnegative(), candidateAvailableFromDay: z.number().int().nonnegative(),
      arrivalDay: z.number().int().nonnegative(), candidateExpiresAtDay: z.number().int().nonnegative(), salaryCommitmentId: z.string().min(1),
      recruitFeeCommitmentId: z.string().min(1), state: z.enum(['pending', 'arrived', 'cancelled']), cancelledAtDay: z.number().int().nonnegative().nullable(),
    }).passthrough()).default([]),
    /** §11 S7：D-03 存档结构版本（V0.1.1=2，编码时升 3）；旧档缺省 undefined。 */
    d03SchemaVersion: z.number().int().optional(),
    /** §11 S7 / §18.3 C13 必存项：参数快照三元组。 */
    personnelFormulaSnapshot: z
      .object({ version: z.string().min(1), params: z.record(z.union([z.number(), z.array(z.number())])), createdAt: z.number().int().nonnegative() })
      .passthrough()
      .optional(),
    /**
     * CODE-07B REVISION / U3（A-25）：ExecutionProject 切片。内核状态结构含嵌套领域对象与
     * `+∞` 数值（JSON 落盘为 null），此处只校验外层键，内部原样 passthrough 保留，不升存档版本。
     */
    executionProjects: z
      .array(
        z
          .object({
            key: z.string().min(1),
            state: z.object({ project: z.object({}).passthrough() }).passthrough(),
          })
          .passthrough(),
      )
      .default([]),
    deliveryLaunchPlans: z.record(z.object({
      priceCents: z.number().int().positive(),
      dailyBudgetCents: z.number().int().nonnegative(),
    })).optional(),
    rec04RecruitingGuardByCompany: z
      .record(z.object({
        state: z.enum(['eligible', 'active', 'completed', 'cancelled']),
        projectId: z.string().nullable(),
        seedKey: z.string().min(1),
        requiredDisciplines: z.array(z.enum(['design', 'code', 'art', 'audio', 'qa'])),
        supplementSequence: z.number().int().nonnegative(),
      }))
      .default({}),
  })
  .passthrough()

export type ParseSaveResult =
  | { ok: true; state: WorldState; migratedFrom?: number }
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
  // 版本先行（DESIGN-M2-001-E §7 / R1 P2-1）：无迁移路径即拒绝，再判结构
  const rawVersion =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { schemaVersion?: unknown }).schemaVersion
      : undefined
  let candidate = raw
  let migratedFrom: number | undefined
  if (typeof rawVersion === 'number' && Number.isInteger(rawVersion) && rawVersion !== SAVE_SCHEMA_VERSION) {
    const migration = migrateSave(raw)
    if (!migration.ok) {
      return { ok: false, errorCode: migration.errorCode, errorMessage: migration.errorMessage }
    }
    candidate = migration.state
    migratedFrom = migration.from
  }

  const parsed = worldStateSchema.safeParse(candidate)
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
  // M3-B C08：旧档无 template → 按原 type 推断（revenue_share/milestone 均归 channel），结算口径不变
  for (const contract of data.publishingContracts) {
    if (contract.template === undefined) {
      contract.template = contract.type === 'milestone' ? 'channel' : 'channel'
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

  // 终态解除团队分配（DESIGN-G05 v1.7 §3.3）：历史存档中终态项目残留的 teamAssignments
  // 属历史数据而非损坏，读档时静默置空（不改存档版本、不新增字段、不因此拒绝加载）。
  let releasedTerminalAssignments = 0
  state.projects = state.projects.map((p) => {
    if (!isTerminalProjectPhase(p.phase) || p.teamAssignments.length === 0) return p
    releasedTerminalAssignments += p.teamAssignments.length
    return { ...p, teamAssignments: [] }
  })
  if (releasedTerminalAssignments > 0) {
    // 仅控制台留痕便于追溯，不弹 toast 打扰玩家
    console.info(
      `[save] 终态项目团队分配已按 DESIGN-G05 §3.3 释放（${releasedTerminalAssignments} 条）`,
    )
  }

  for (const [label, ids] of [
    ['公司', state.companies.map((c) => c.id)],
    ['员工', state.employees.map((e) => e.id)],
    ['项目', state.projects.map((p) => p.id)],
    ['产品', state.products.map((p) => p.id)],
    ['销售记录', state.products.flatMap((p) => p.salesByPeriod.map((r) => r.id))],
    ['退款批次', state.refundBatches.map((b) => b.id)],
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
    for (const r of pr.salesByPeriod) {
      if (r.productId !== pr.id) {
        return {
          ok: false,
          errorCode: 'SAVE_BROKEN_REF',
          errorMessage: `销售记录 ${r.id} 的产品归属（${r.productId}）与所属产品 ${pr.id} 不一致`,
        }
      }
      if (r.id !== makeSalesRecordId(r.productId, r.dayIndex, r.marketId, r.platformId)) {
        return {
          ok: false,
          errorCode: 'SAVE_ID_MISMATCH',
          errorMessage: `销售记录 ID ${r.id} 与实体字段的规范化编码不一致`,
        }
      }
    }
  }
  for (const t of state.transactions) {
    if (!companyIds.has(t.companyId)) {
      return { ok: false, errorCode: 'SAVE_BROKEN_REF', errorMessage: `交易 ${t.id} 引用了不存在的公司` }
    }
  }

  // ===== M2-A 跨实体校验（DESIGN-M2-001-A §10.8.4 第 3–9 步）=====
  // 销售记录索引：重复 ID 已在上方统一拦截。
  const salesRecordById = new Map<string, SalesRecord>()
  for (const p of state.products) {
    for (const r of p.salesByPeriod) salesRecordById.set(r.id, r)
  }

  const autoNonRejectedCount = new Map<string, number>()
  const nonRejectedUnitsByRecord = new Map<string, number>()
  const postedUnitsByRecord = new Map<string, number>()

  for (const b of state.refundBatches) {
    // 第 4 步：批次 ID 规范化（seq 为 id 最后一段；格式本身已由 zod 保证）。
    const seqText = b.id.slice(b.id.lastIndexOf('-') + 1)
    const seq = Number(seqText)
    if (!Number.isInteger(seq) || seq < 1) {
      return {
        ok: false,
        errorCode: 'SAVE_SCHEMA_INVALID',
        errorMessage: `退款批次 ID ${b.id} 的 seq 段非法`,
      }
    }
    if (b.id !== makeRefundBatchId(b.productId, b.saleDayIndex, b.refundDayIndex, seq)) {
      return {
        ok: false,
        errorCode: 'SAVE_ID_MISMATCH',
        errorMessage: `退款批次 ID ${b.id} 与实体字段的规范化编码不一致`,
      }
    }

    // 第 5 步：引用完整性与元组一致性。
    const record = salesRecordById.get(b.salesRecordId)
    if (!record) {
      return {
        ok: false,
        errorCode: 'SAVE_BROKEN_REF',
        errorMessage: `退款批次 ${b.id} 引用了不存在的销售记录 ${b.salesRecordId}`,
      }
    }
    if (
      b.productId !== record.productId ||
      b.saleDayIndex !== record.dayIndex ||
      b.marketId !== record.marketId ||
      b.platformId !== record.platformId
    ) {
      return {
        ok: false,
        errorCode: 'SAVE_BROKEN_REF',
        errorMessage: `退款批次 ${b.id} 的产品/日期/市场/平台与销售记录不一致`,
      }
    }

    // 第 6 步：auto_window 严格等于预测值。
    if (b.source === 'auto_window' && b.refundedUnits !== record.estimatedRefundUnits) {
      return {
        ok: false,
        errorCode: 'SAVE_REFUND_INCONSISTENT',
        errorMessage: `自动退款批次 ${b.id} 的退款件数（${b.refundedUnits}）不等于预测值（${record.estimatedRefundUnits}）`,
      }
    }

    // 第 7 步：每条销售记录至多一条非 rejected 的 auto_window 批次。
    if (b.source === 'auto_window' && b.status !== 'rejected') {
      const count = (autoNonRejectedCount.get(b.salesRecordId) ?? 0) + 1
      if (count > 1) {
        return {
          ok: false,
          errorCode: 'SAVE_REFUND_INCONSISTENT',
          errorMessage: `销售记录 ${b.salesRecordId} 存在多条非 rejected 的自动退款批次`,
        }
      }
      autoNonRejectedCount.set(b.salesRecordId, count)
    }

    if (b.status !== 'rejected') {
      nonRejectedUnitsByRecord.set(
        b.salesRecordId,
        (nonRejectedUnitsByRecord.get(b.salesRecordId) ?? 0) + b.refundedUnits,
      )
    }
    if (b.status === 'posted') {
      postedUnitsByRecord.set(
        b.salesRecordId,
        (postedUnitsByRecord.get(b.salesRecordId) ?? 0) + b.refundedUnits,
      )
    }
  }

  // 第 8 步：Σ 非 rejected 退款量不得超过毛销量。
  for (const record of state.products.flatMap((p) => p.salesByPeriod)) {
    const total = nonRejectedUnitsByRecord.get(record.id) ?? 0
    if (total > record.grossUnits) {
      return {
        ok: false,
        errorCode: 'SAVE_REFUND_OVER_LIMIT',
        errorMessage: `销售记录 ${record.id} 的累计退款量（${total}）超过毛销量（${record.grossUnits}）`,
      }
    }
  }

  // 第 9 步：posted 累加必须等于 actualRefundUnits。
  for (const record of state.products.flatMap((p) => p.salesByPeriod)) {
    const posted = postedUnitsByRecord.get(record.id) ?? 0
    if (posted !== record.actualRefundUnits) {
      return {
        ok: false,
        errorCode: 'SAVE_REFUND_INCONSISTENT',
        errorMessage: `销售记录 ${record.id} 的已入账退款量（${posted}）与 actualRefundUnits（${record.actualRefundUnits}）不一致`,
      }
    }
  }

  // ===== M2-C 退款金额校验（DESIGN-M2-001-C §10.9.2 / DECISION-M2-C-Q06-Q07）=====
  // 段 1（全局、无条件）：每个 posted 批次的金额必须等于 refundedUnits × unitPriceAtSaleCents。
  //   这一段不得以"有没有交易凭据"为前提，否则在旧存档上永不生效（R1 P1-2）。
  // 段 2（有凭据才校验）：仅当存档中确实存在 customer-refund:<batchId> 交易时，账实必须一致。
  //   Q7：不强制"每个 posted 必有交易"，故无凭据不是错误。
  const transactionByKey = new Map(state.transactions.map((t) => [t.idempotencyKey, t]))
  for (const b of state.refundBatches) {
    if (b.status !== 'posted') continue
    const record = salesRecordById.get(b.salesRecordId)
    if (record === undefined) continue // 第 5 步已拦截，此处不可达
    const expectedAmount = b.refundedUnits * record.unitPriceAtSaleCents
    if (b.refundAmountCents !== expectedAmount) {
      return {
        ok: false,
        errorCode: 'SAVE_REFUND_INCONSISTENT',
        errorMessage: `已入账退款批次 ${b.id} 的金额（${b.refundAmountCents}）不等于 件数×单价（${expectedAmount}）`,
      }
    }
    const tx = transactionByKey.get(refundBatchIdempotencyKey(b.id))
    if (tx !== undefined) {
      if (tx.category !== 'customer_refund' || tx.amountCents !== -b.refundAmountCents) {
        return {
          ok: false,
          errorCode: 'SAVE_REFUND_INCONSISTENT',
          errorMessage: `已入账退款批次 ${b.id} 与交易流水不一致（分类或金额不符）`,
        }
      }
    }
  }

  // 预算权威公式读档一致性校验（DESIGN-G05 §7.3 / 001-A 权威公式）：
  // 存档若携带 remainingCapCents 快照，必须等于 totalCap - committed - spent。
  // 不一致即拒绝加载并由调用方保持当前运行状态不变（不覆盖原存档）。
  for (const p of data.projects) {
    const expected = p.budgetTotalCapCents - p.budgetCommittedCents - p.budgetSpentCents
    if (p.remainingCapCents !== undefined && p.remainingCapCents !== expected) {
      return {
        ok: false,
        errorCode: 'SAVE_BUDGET_FORMULA_MISMATCH',
        errorMessage: `项目 ${p.id} 的 remainingCapCents（${p.remainingCapCents}）与权威公式结果（${expected}）不一致。`,
      }
    }
  }

  // 成本分摊（DESIGN-G05 §7.1/§7.3）：幂等键全局唯一、现金交易引用完整
  const transactionIds = new Set(state.transactions.map((t) => t.id))
  const allocationIds = new Set<string>()
  const allocationKeys = new Set<string>()
  for (const p of state.projects) {
    for (const a of p.costAllocations ?? []) {
      if (allocationIds.has(a.id)) {
        return { ok: false, errorCode: 'SAVE_DUPLICATE_ID', errorMessage: `成本分摊存在重复 ID：${a.id}` }
      }
      allocationIds.add(a.id)
      if (allocationKeys.has(a.idempotencyKey)) {
        return {
          ok: false,
          errorCode: 'SAVE_DUPLICATE_ALLOCATION',
          errorMessage: `成本分摊幂等键重复：${a.idempotencyKey}`,
        }
      }
      allocationKeys.add(a.idempotencyKey)
      if (a.cashTransactionId !== null && !transactionIds.has(a.cashTransactionId)) {
        return {
          ok: false,
          errorCode: 'SAVE_BROKEN_REF',
          errorMessage: `成本分摊 ${a.id} 引用了不存在的现金交易 ${a.cashTransactionId}`,
        }
      }
      if (a.companyId !== p.companyId || a.projectId !== p.id) {
        return {
          ok: false,
          errorCode: 'SAVE_BROKEN_REF',
          errorMessage: `成本分摊 ${a.id} 的公司/项目归属与所在项目不一致`,
        }
      }
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

  return migratedFrom === undefined ? { ok: true, state } : { ok: true, state, migratedFrom }
}
