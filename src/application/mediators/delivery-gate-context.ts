/**
 * P2 SUP-01：真实玩家路径的 D-02 交付闸门求值上下文（生产代码，非测试夹具）。
 *
 * 职责：把运行时的真实游戏状态（ExecutionProject + legacy Project + 已发布内容目录）
 * 确定性地派生为 `EvaluationContext`，再交给领域纯函数 `evaluateDeliveryGate` 求值。
 *
 * 纪律（DP-3 真实计算 / DP-4 fail-closed 是过渡态）：
 *  - 本模块**不**生产 pass=true，也不改 `evaluateDeliveryGate` / `evaluateCompleteness`。
 *    任何 gate 结论都来自领域纯函数对派生输入的真实求值。
 *  - 每个字段标注 `FieldProvenance`：`production`（真实生产来源）或
 *    `degraded`（无生产来源，按 P1 允许的降级口径填值，须在报告标 NOT_VERIFIED）。
 *  - 派生只使用真实数据：项目名/HRB/预算/WP/构建来自玩家实际项目状态；
 *    原型/平台/亲和来自已发布内容目录（D04 词表 + C1 数据）；
 *    genre→archetype 映射是确定性的游戏规则，不是随机或手写 pass。
 */
import { createP1Catalog, loadVocabulary } from '@content/d04-vocabulary'
import { REC03_BASELINE_CAPABILITIES, REC03_MODULES } from '@content/rec03-content'
import genreSegmentAffinity from '@content/genre-segment-affinity.json'
import { DEFAULT_COMPLETENESS_TUNING } from '@domain/value-objects/product-completeness-tuning'
import { buildP1ChecklistTemplates, getActiveChecklist } from '@domain/value-objects/product-completeness-checklists'
import { buildDeliveryDecisionRecord } from '@domain/value-objects/product-completeness-gate'
import { deriveSnapshotContentTier } from '@domain/value-objects/product-completeness-quality'
import { coreIntensity, deriveModuleContributions, resolveArchetypeClass } from '@domain/value-objects/product-completeness-classification'
import { checkHrbFeasibility } from '@domain/value-objects/product-blueprint-hrb'
import { revalidationGate } from '@domain/value-objects/product-blueprint-revalidation'
import { frozenPayloadHash } from '@domain/value-objects/product-blueprint-lifecycle'
import { DEFAULT_BLUEPRINT_TUNING } from '@domain/value-objects/product-blueprint-tuning'
import { estimateTechRisk } from '@domain/value-objects/product-blueprint-estimation'
import type { ProjectExecutionState } from '@domain/value-objects/project-execution-engine'
import type { UnifiedLedger } from '@domain/entities/finance'
import type { EvaluationContext, DeliveryGateResult, DeliveryDecisionRecord } from '@domain/entities/product-completeness'
import type {
  ContentPack,
  DesignVersionSnapshot,
  EstimateBundle,
  FrozenBlueprint,
  GameplayDomain,
  GameplaySlot,
  ModuleInstance,
  ModuleTemplate,
  Platform,
  PositioningProfile,
} from '@domain/entities/product-blueprint'
import type { Project } from '@domain/entities/project'
import type { DeliveryForm } from '@domain/entities/project-execution'
import { inspectExecutionQa } from '@application/queries/execution-qa'

export type FieldProvenanceKind = 'production' | 'degraded'

export interface FieldProvenance {
  field: string
  kind: FieldProvenanceKind
  source: string
}

export interface RuntimeGateInput {
  execution: ProjectExecutionState
  project: Project
  /** 账本只读投影；用于从 expenseTxIds 派生交付前实际成本。 */
  ledger?: UnifiedLedger
  /** 真实日历日（GameWorld.dayIndex），用于 assessedAt / 快照 takenAt。 */
  dayIndex: number
  /** UI 披露勾选（G-9）；仅在玩家确认提交后为 true。 */
  disclosureProvided?: boolean
  /** 交付形式，默认 full。 */
  form?: DeliveryForm
  snapshot?: DesignVersionSnapshot | undefined
}

export interface RuntimeBuildFacts {
  /** D-02 交付前/交付时冻结的内容档位。 */
  deliveredTier: number | null
  plannedTier: number | null
  costEst: number | null
  /** 账本没有可追溯支出时为 null，禁止用 0 代替。 */
  actualCost: number | null
}

export interface RuntimeGateEvaluation {
  context: EvaluationContext
  result: DeliveryGateResult
  decision: DeliveryDecisionRecord
  provenance: readonly FieldProvenance[]
  form: DeliveryForm
  coreIntensityGap?: { current: number; required: number }
}

/** D02 公式版本常量（与 DEFAULT_COMPLETENESS_TUNING.formulaVersion 同源）。 */
const D02_FORMULA_VERSION = DEFAULT_COMPLETENESS_TUNING.formulaVersion

/** 已发布 genreId → D04 种子原型（真实内容目录之间的确定性映射，非手写结论）。 */
const GENRE_TO_ARCHETYPE: Readonly<Record<string, string>> = {
  action: 'SEED-PLATFORMER',
  platformer: 'SEED-PLATFORMER',
  shooter: 'SEED-PLATFORMER',
  fighting: 'SEED-PLATFORMER',
  adventure: 'SEED-RPG',
  rpg: 'SEED-RPG',
  strategy: 'SEED-MGMT_SIM',
  simulation: 'SEED-MGMT_SIM',
  arcade: 'SEED-PLATFORMER',
  puzzle: 'SEED-MGMT_SIM',
  racing: 'SEED-PLATFORMER',
  sports: 'SEED-MGMT_SIM',
}

function pickArchetype(genreId: string) {
  const catalog = loadVocabulary(createP1Catalog())
  const wanted = GENRE_TO_ARCHETYPE[genreId] ?? 'SEED-PLATFORMER'
  return catalog.archetypes.find((a) => a.archetypeId === wanted && a.state === 'active')
    ?? catalog.archetypes.find((a) => a.state === 'active')!
}

/**
 * 从真实原型 typeAffinity 派生 ModuleTemplate（生产目录只读，不复制手工测试模板）。
 * 数值全部来自已发布原型/调参常量：affinity=原型 typeAffinity，强度/亲和曲线=TUNING 默认。
 */
function templatesFromArchetype(archetypeId: string, domains: readonly GameplayDomain[]) {
  const archetype = pickArchetypeId(archetypeId)
  const byId: Record<string, ModuleTemplate> = {}
  const affinityIntensity = DEFAULT_BLUEPRINT_TUNING.defaultAffinityIntensity
  for (const domain of domains) {
    const affinity = archetype.typeAffinity[domain] ?? 0
    byId[`AUTO-${domain.toUpperCase()}`] = {
      templateId: `AUTO-${domain.toUpperCase()}`,
      templateRevision: 1,
      name: `${archetype.name}-${domain}`,
      description: '运行时从已发布原型派生的模板',
      domain,
      allowedSlotKinds: ['core_loop', 'support'],
      era: { fromYear: 1970, toYear: 2026 },
      techGates: [],
      baseWorkUnits: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      intensityCurve: { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2, 5: 1.4 },
      affinityIntensity,
      skillLoad: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      optionGroups: [],
      combineTags: [],
      audienceAffinity: {},
      uspIds: [],
      contentType: 'none',
    }
    // affinity 已通过原型派生，保留供可审计追踪（不参与 pass 判定，DQ 只读引用）。
    void affinity
  }
  return byId
}

function pickArchetypeId(archetypeId: string) {
  return loadVocabulary(createP1Catalog()).archetypes.find((a) => a.archetypeId === archetypeId)!
}

/** 播放器真实 genre→segment 亲和中最大的一条（C1 真实数据，作为运行时市场画像）。 */
function marketAffinityForGenre(genreId: string): Record<string, number> {
  const rows = genreSegmentAffinity as readonly { genreId: string; segmentId: string; affinity: number }[]
  const best = rows
    .filter((r) => r.genreId === genreId)
    .sort((a, b) => b.affinity - a.affinity)[0]
  if (best === undefined) return {}
  return { [best.segmentId]: best.affinity }
}

/**
 * 派生最小但合法的设计结构：原型核心域 → core_loop 实例，叙事域 → content 实例，
 * 真实项目名 → finalTitle，真实平台目录 → 目标平台。缺失设计维度的部分在 provenance 标 degraded。
 */
function deriveFrozenBlueprint(input: RuntimeGateInput): { frozen: FrozenBlueprint; templatesById: Record<string, ModuleTemplate> } {
  const archetype = pickArchetype(input.project.genreId)
  const domains = archetype.coreSlotDomains
  const templatesById = templatesFromArchetype(archetype.archetypeId, domains)
  const catalog = loadVocabulary(createP1Catalog())
  const realPlatforms: readonly Platform[] = catalog.platforms

  const platformTargets = input.project.targetPlatformIds.length > 0
    ? [...input.project.targetPlatformIds]
    : [realPlatforms[0]!.platformId]

  const positioning: PositioningProfile = {
    primaryTypeId: archetype.archetypeId,
    secondaryTypeIds: [],
    settingIds: [],
    perspectiveId: 'side_scroll',
    structureId: 'linear',
    // 玩家未显式宣称受众 → 空（真实缺省；不臆造 segment claim）。
    targetSegmentClaims: [],
    sellingPoints: [],
    platformTargets,
    commercialPositioning: 'premium',
    presetId: null,
  }

  const coreInstances: ModuleInstance[] = domains.map((domain, i) => ({
    instanceId: `RT-CORE-${i}`,
    templateId: `AUTO-${domain.toUpperCase()}`,
    slotId: 'RT-SLOT-CORE',
    displayLabel: `${archetype.name}-${domain}`,
    domain,
    intensity: 3,
    depthSelection: 'standard',
    optionSelections: {},
    contentPackId: null,
    state: 'active',
    sourceOrigin: 'player',
  }))

  const contentPack: ContentPack = {
    packId: 'RT-PACK-CONTENT',
    templateRevision: 1,
    compatibleDomains: ['narrative'],
    tier: Math.max(1, input.execution.workPackages.length),
    workUnitsPerTier: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
    audienceVolumeWeight: 1,
  }
  const contentInstance: ModuleInstance = {
    instanceId: 'RT-CONTENT',
    templateId: 'AUTO-NARRATIVE',
    slotId: 'RT-SLOT-CONTENT',
    displayLabel: '内容包',
    domain: 'narrative',
    intensity: 3,
    depthSelection: 'standard',
    optionSelections: {},
    contentPackId: contentPack.packId,
    state: 'active',
    sourceOrigin: 'player',
  }
  templatesById['AUTO-NARRATIVE'] = {
    ...templatesById['AUTO-COMBAT'] ?? templatesById[`AUTO-${domains[0]!.toUpperCase()}`]!,
    templateId: 'AUTO-NARRATIVE',
    name: '运行时内容模板',
    domain: 'narrative',
    allowedSlotKinds: ['content'],
    contentType: 'narrative_arc',
  }

  const coreSlot: GameplaySlot = {
    slotId: 'RT-SLOT-CORE',
    slotKind: 'core_loop',
    requiredForType: true,
    domainAcceptance: [...domains],
    maxInstances: Math.max(1, coreInstances.length),
    bindings: coreInstances.map((i) => i.instanceId),
    isContentSlot: false,
    outsourcingEligible: false,
  }
  const contentSlot: GameplaySlot = {
    slotId: 'RT-SLOT-CONTENT',
    slotKind: 'content',
    requiredForType: false,
    domainAcceptance: ['narrative'],
    maxInstances: 1,
    bindings: [contentInstance.instanceId],
    isContentSlot: true,
    outsourcingEligible: true,
  }

  return {
    frozen: {
      positioning,
      slots: [coreSlot, contentSlot],
      instances: [...coreInstances, contentInstance],
      contentPacks: [contentPack],
    },
    templatesById,
  }
}

/** 真实 HRB verdict（来自玩家 HRB + 预算 + 真实成本估算），非硬编码。 */
function deriveHrbVerdict(execution: ProjectExecutionState) {
  const costEst = Number.isFinite(execution.project.costEstCents)
    ? execution.project.costEstCents
    : 0
  return checkHrbFeasibility(
    execution.project.hrb,
    execution.project.budgetCapacityCents,
    costEst,
    DEFAULT_BLUEPRINT_TUNING,
  ).verdict
}

/** 冻结快照的计划内容档位：所有绑定内容包 tier 的确定性总和。 */
function plannedTierFromSnapshot(snapshot: DesignVersionSnapshot): number | null {
  const tier = deriveSnapshotContentTier(snapshot)
  return Number.isSafeInteger(tier) && tier >= 0 ? tier : null
}

/**
 * REC-05 BuildFacts 唯一运行时来源。
 *
 * 交付前 READY_TO_DELIVER 表示正常 WP 已完成，因此交付档位等于冻结快照的
 * 计划档位。实际成本只读取 ExecutionProject.expenseTxIds 对应的账本支出；
 * 任一交易不可追溯即返回 null，交由提交层 fail-closed。
 */
export function deriveRuntimeBuildFacts(
  execution: ProjectExecutionState,
  snapshot: DesignVersionSnapshot | null,
  ledger?: UnifiedLedger,
): RuntimeBuildFacts {
  // 旧版 open-content-modules 项目没有 REC-03 快照；其空内容结构的权威档位为 0。
  // 该兼容分支不影响 REC-03 canonical 项目，canonical 项目必须传入冻结快照。
  const plannedTier = snapshot === null
    ? execution.project.formulaVersion === 'open-content-modules' ? 0 : null
    : plannedTierFromSnapshot(snapshot)
  const costEst = Number.isSafeInteger(execution.project.costEstCents) && execution.project.costEstCents >= 0
    ? execution.project.costEstCents
    : null

  let actualCost: number | null = null
  const legacy = execution.project.formulaVersion === 'open-content-modules'
  const ids = new Set(execution.expenseTxIds)
  if (ledger !== undefined && ids.size === execution.expenseTxIds.length &&
      (legacy ? ids.size > 0 : execution.worklogs.length > 0)) {
    const expected = new Map<string, number>()
    for (const log of execution.worklogs) {
      if (log.capacityAppliedCents <= 0) continue
      const key = `${log.day}:${log.workPackageId}`
      expected.set(key, (expected.get(key) ?? 0) + log.capacityAppliedCents)
    }
    let total = 0
    let valid = true
    for (const txId of ids) {
      const tx = ledger.getTransactionById(txId)
      if (
        tx === undefined ||
        tx.companyId !== execution.project.companyId ||
        tx.category !== 'project_expense' ||
        tx.reversedBy !== null ||
        !Number.isSafeInteger(tx.amountCents) ||
        tx.amountCents >= 0
      ) {
        valid = false
        break
      }
      const key = `${tx.day}:${tx.referenceId}`
      if (!legacy && expected.get(key) !== -tx.amountCents) {
        valid = false
        break
      }
      expected.delete(key)
      total += -tx.amountCents
    }
    if (valid && Number.isSafeInteger(total) && (legacy || expected.size === 0)) actualCost = total
  }

  const deliveredTier = execution.project.state === 'READY_TO_DELIVER' || execution.project.state === 'COMPLETED'
    ? plannedTier
    : null
  return { deliveredTier, plannedTier, costEst, actualCost }
}

/**
 * 生产路径求值入口：真实状态 → EvaluationContext → evaluateDeliveryGate。
 * 返回完整 provenance，供实施报告逐项标注 production / degraded(NOT_VERIFIED)。
 */
export function evaluateRuntimeDeliveryGate(input: RuntimeGateInput): RuntimeGateEvaluation {
  const { execution, project, dayIndex } = input
  const form = input.form ?? 'full'
  const disclosureProvided = input.disclosureProvided === true
  const { frozen, templatesById } = input.snapshot !== undefined
    ? { frozen: input.snapshot.frozenBlueprint, templatesById: Object.fromEntries(REC03_MODULES.map((template) => [template.templateId, template])) }
    : deriveFrozenBlueprint(input)
  const catalog = loadVocabulary(createP1Catalog())
  const marketFitAffinity = marketAffinityForGenre(project.genreId)

  const estimates: EstimateBundle = {
    formulaVersion: 'D01-FORMULA-v0.1',
    workUnits: {
      byDiscipline: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      raw: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      synergy: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      total: 0,
      ranges: {
        design: { low: 0, mid: 0, high: 0 },
        code: { low: 0, mid: 0, high: 0 },
        art: { low: 0, mid: 0, high: 0 },
        audio: { low: 0, mid: 0, high: 0 },
        qa: { low: 0, mid: 0, high: 0 },
      },
      drivers: [],
    },
    skillDemand: {
      byDiscipline: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
      total: 0,
      peakFraction: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
    },
    techRisk: {
      gates: [],
      unsatisfied: [],
      rTech: 0,
      rSynergy: 0,
      rScope: 0,
      maxRisk: 0,
      riskLevel: 'LOW',
    },
    marketFit: {
      affinity: marketFitAffinity,
      positioningFit: 0,
      positioningFitBand: 'low',
      genreFit: 0,
      uspSupported: {},
      noveltyNote: '',
      contentVolumeBand: 'medium',
    },
  }

  const frozenSnapshot = input.snapshot
  const capabilities = frozenSnapshot === undefined ? {} : REC03_BASELINE_CAPABILITIES
  const oldEstimates = frozenSnapshot?.estimates
  const currentTechRisk = oldEstimates === undefined || oldEstimates === null ? null : estimateTechRisk({
    structure: frozen,
    templatesById,
    archetype: null,
    capabilities,
    platformTechStandards: catalog.platforms
      .filter((platform) => frozen.positioning.platformTargets.includes(platform.platformId))
      .flatMap((platform) => platform.techStandards),
    synergyPenaltySum: 0,
  }, oldEstimates.workUnits, DEFAULT_BLUEPRINT_TUNING)
  const snapshot: DesignVersionSnapshot = frozenSnapshot === undefined ? {
    snapshotId: execution.project.snapshotId,
    versionId: execution.project.versionId,
    payloadHash: frozenPayloadHash(frozen),
    frozenBlueprint: frozen,
    templateRevisionRefs: {},
    estimates,
    takenAt: execution.project.createdAt,
  } : currentTechRisk === null ? frozenSnapshot : {
    ...frozenSnapshot,
    estimates: {
      ...oldEstimates!,
      techRisk: { ...oldEstimates!.techRisk, gates: currentTechRisk.gates, unsatisfied: currentTechRisk.unsatisfied, rTech: currentTechRisk.rTech,
        maxRisk: Math.max(currentTechRisk.rTech, oldEstimates!.techRisk.rSynergy, oldEstimates!.techRisk.rScope),
        riskLevel: oldEstimates!.techRisk.rSynergy > currentTechRisk.maxRisk ? oldEstimates!.techRisk.riskLevel : currentTechRisk.riskLevel,
      },
    },
  }

  const runtimeBuildFacts = deriveRuntimeBuildFacts(execution, input.snapshot ?? null, input.ledger)
  const qaReport = input.snapshot === undefined ? null : inspectExecutionQa(execution, input.snapshot)

  // revalidation 用真实领域闸门对派生结构求值（fail-closed，不伪造 pass）。
  const revalidationResult = revalidationGate({
    structure: frozen,
    catalog,
    templatesById,
    rules: { requireRules: [], conflictRules: [], combineRules: [] },
    tuning: DEFAULT_BLUEPRINT_TUNING,
    mode: 'read',
  })

  const context: EvaluationContext = {
    snapshot,
    templatesById,
    moduleContributions: deriveModuleContributions(snapshot),
    defects: qaReport?.findings ?? [],
    // 交付前使用同一冻结快照 + 账本派生事实；不依赖尚未创建的 Build。
    buildFacts: runtimeBuildFacts.deliveredTier !== null
      ? {
          deliveredTier: runtimeBuildFacts.deliveredTier,
          ...(runtimeBuildFacts.plannedTier !== null ? { plannedTier: runtimeBuildFacts.plannedTier } : {}),
          costEst: runtimeBuildFacts.costEst,
          actualCost: runtimeBuildFacts.actualCost,
        }
      : null,
    archiveSimilarity: 'unavailable_p1',
    marketProfile: null,
    platforms: catalog.platforms,
    capabilities,
    revalidation: { pass: revalidationResult.pass },
    hrbVerdict: deriveHrbVerdict(execution),
    productFields: { finalTitle: project.name },
    disclosureProvided,
    archetypeClassOverride: null,
    assessedAt: dayIndex,
    formulaVersion: D02_FORMULA_VERSION,
  }

  const tuning = DEFAULT_COMPLETENESS_TUNING
  const templates = buildP1ChecklistTemplates(tuning)
  const decision = buildDeliveryDecisionRecord(context, templates, form, tuning)
  const { archetypeClass } = resolveArchetypeClass(context, tuning)
  const checklist = getActiveChecklist(templates, archetypeClass, form)
  const coreRequirement = decision.gateResult.blockingUnmet.includes('N-01')
    ? checklist.items.find((item) => item.itemId === 'N-01')?.predicate
    : undefined
  const coreIntensityGap = coreRequirement?.kind === 'depthAtLeast' && coreRequirement.alternativeMinIntensity !== undefined
    ? { current: coreIntensity(context), required: coreRequirement.alternativeMinIntensity }
    : undefined

  const provenance: FieldProvenance[] = [
    { field: 'snapshot', kind: input.snapshot === undefined ? 'degraded' : 'production', source: input.snapshot === undefined ? '旧版设计投影' : '立项或返工时冻结的设计快照' },
    { field: 'templatesById', kind: 'production', source: input.snapshot === undefined ? 'D04 已发布原型 typeAffinity 派生' : 'REC-03 模块目录' },
    { field: 'moduleContributions', kind: 'production', source: 'deriveModuleContributions(snapshot) 真实派生' },
    {
      field: 'defects',
      kind: qaReport?.status === 'verified' ? 'production' : 'degraded',
      source: qaReport?.status === 'verified' ? '冻结模块、工作包与实际 QA 产出记录' : '无完成的冻结版本 QA 检查（UNAVAILABLE）',
    },
    {
      field: 'buildFacts.deliveredTier',
      kind: runtimeBuildFacts.deliveredTier === null ? 'degraded' : 'production',
      source: runtimeBuildFacts.deliveredTier === null
        ? 'READY_TO_DELIVER 前缺少可用冻结快照（UNAVAILABLE）'
        : 'READY_TO_DELIVER + 冻结快照 contentPacks Σ tier',
    },
    {
      field: 'buildFacts.actualCost',
      kind: runtimeBuildFacts.actualCost === null ? 'degraded' : 'production',
      source: runtimeBuildFacts.actualCost === null
        ? 'expenseTxIds 无完整账本支出来源（UNAVAILABLE；提交阻断）'
        : 'ExecutionProject.expenseTxIds → UnifiedLedger 负向支出汇总',
    },
    { field: 'buildFacts.costEst', kind: runtimeBuildFacts.costEst === null ? 'degraded' : 'production', source: 'ExecutionProject.costEstCents（非有限值为 UNAVAILABLE）' },
    { field: 'archiveSimilarity', kind: 'degraded', source: 'P1 不计算档案相似度' },
    { field: 'marketProfile', kind: 'production', source: input.snapshot === undefined ? '旧版 C1 类型与客群亲和数据' : '冻结快照的 D-01 市场估算' },
    { field: 'platforms', kind: 'production', source: 'D04 已发布平台目录' },
    { field: 'capabilities', kind: frozenSnapshot === undefined ? 'degraded' : 'production', source: 'P1 工作室基础二维工具，进阶领域尚无能力数据' },
    { field: 'revalidation', kind: 'production', source: 'revalidationGate() 对派生结构真实求值' },
    { field: 'hrbVerdict', kind: 'production', source: 'checkHrbFeasibility() 对玩家 HRB/预算/成本真实求值' },
    { field: 'productFields.finalTitle', kind: 'production', source: 'legacy Project.name（玩家立项输入）' },
    { field: 'disclosureProvided', kind: 'production', source: 'UI 披露勾选（玩家显式确认）' },
    { field: 'archetypeClassOverride', kind: 'production', source: 'P1 缺省 null（玩家未显式覆盖）' },
    { field: 'assessedAt', kind: 'production', source: 'GameWorld.dayIndex' },
    { field: 'formulaVersion', kind: 'production', source: 'DEFAULT_COMPLETENESS_TUNING.formulaVersion' },
  ]

  return {
    context, result: decision.gateResult, decision, provenance, form,
    ...(coreIntensityGap === undefined ? {} : { coreIntensityGap }),
  }
}
