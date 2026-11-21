/**
 * 产品蓝图（D-01）与前置词表（D-04）领域类型。
 *
 * 权威条款：
 *  - D-01 V0.2 §3.1 数据流、§4 实体、§5 组合规则、§6 四通道、§7 状态机、§11 异常、§15 返工
 *  - D-04 V0.2 §3 实体、§4 版本、§5 规则、§6 种子集
 *  - ADJ-2026-11-21-01（HRB 语义）、ADJ-2026-11-21-02（resolveRefs 前置 / tagId 语义不可变）
 *
 * 命名约定：本模块全部类型独立命名，不覆盖现有 product.ts / project.ts。
 */

// ===== 枚举与基础标量 =====

/** §6.2 / §6.7：Discipline = {design, code, art, audio, qa}。与既有 enums.Discipline 不同，独立命名避免冲突。 */
export type BlueprintDiscipline = 'design' | 'code' | 'art' | 'audio' | 'qa'

export const BLUEPRINT_DISCIPLINES: readonly BlueprintDiscipline[] = [
  'design',
  'code',
  'art',
  'audio',
  'qa',
]

/** §5.1：10 个玩法域，向量固定顺序（§6.5 typeAffinityVector / domainDistributionVector）。 */
export type GameplayDomain =
  | 'combat'
  | 'exploration'
  | 'progression'
  | 'narrative'
  | 'management'
  | 'building'
  | 'social_sp'
  | 'puzzle'
  | 'rhythm'
  | 'simulation'

export const GAMEPLAY_DOMAINS: readonly GameplayDomain[] = [
  'combat',
  'exploration',
  'progression',
  'narrative',
  'management',
  'building',
  'social_sp',
  'puzzle',
  'rhythm',
  'simulation',
]

export type DepthSelection = 'shallow' | 'standard' | 'deep'
export type ModuleInstanceState = 'active' | 'deactivated'
export type ModuleSourceOrigin = 'player' | 'inherited_from_franchise' | 'ai_reference'
export type PerspectiveId =
  | 'side_scroll'
  | 'top_down'
  | 'isometric'
  | 'first_person'
  | 'third_person'
  | 'text'
export type StructureId =
  | 'linear'
  | 'open_zone'
  | 'sandbox'
  | 'level_based'
  | 'roguelike'
  | 'persistent_online_scope_out'
export type CommercialPositioning =
  | 'premium'
  | 'budget'
  | 'free_to_play_later'
  | 'subscription_later'
export type ReleaseForm = 'full' | 'early_access' | 'demo'
export type SlotKind =
  | 'core_loop'
  | 'support'
  | 'content'
  | 'presentation'
  | 'progression'
  | 'social_sp'
export type ContentType = 'none' | 'level_set' | 'narrative_arc' | 'sandbox_seed'
export type ViolationSeverity = 'E' | 'W'
export type RevalidationMode = 'lock' | 'draft' | 'read'

/** §11 通用错误输出格式：{code, severity, ruleId, subjectIds, message, suggestedAction}。 */
export interface BlueprintViolation {
  code: string
  severity: ViolationSeverity
  /** 取自 §4.8 规则编号登记表；词表 E04 码的 ruleId 为 'E04' / 'W04'。 */
  ruleId: string
  subjectIds: string[]
  message: string
  suggestedAction: string
}

/** §6：估算一律给区间 [v(1-Δ), v(1+Δ)]。 */
export interface EstimateRange {
  low: number
  mid: number
  high: number
}

/** §4.8 TechGate 接口：档位含义由 D-06 定义，本模块只引用格式。 */
export interface TechGate {
  gateId: string
  domainId: string
  minCapabilityLevel: number
  note: string
}

// ===== D-01 §4 实体 =====

/** §4.3 定位层。已撤除 scale / complexityScore（§4.3 REWORK）。 */
export interface PositioningProfile {
  primaryTypeId: string
  secondaryTypeIds: string[]
  settingIds: string[]
  perspectiveId: PerspectiveId
  structureId: StructureId
  targetSegmentClaims: string[]
  sellingPoints: string[]
  platformTargets: string[]
  commercialPositioning: CommercialPositioning
  presetId: string | null
}

/** §4.4 玩法层结构位。 */
export interface GameplaySlot {
  slotId: string
  slotKind: SlotKind
  requiredForType: boolean
  domainAcceptance: GameplayDomain[]
  maxInstances: number
  /** §5.3-1：len(bindings) ≤ maxInstances。存 instanceId。 */
  bindings: string[]
  isContentSlot: boolean
  outsourcingEligible: boolean
}

/** §4.10 Option：每个 option 必须至少改变 workload/skill/affinity/risk 之一（R-OPT-3）。 */
export interface BlueprintOption {
  optionId: string
  costDelta: Partial<Record<BlueprintDiscipline, number>>
  skillLoadDelta: Partial<Record<BlueprintDiscipline, number>>
  audienceAffinityDelta: Record<string, number>
  riskDelta: number
  techGates: TechGate[]
  supportedUspIds: string[]
}

/** §4.10 OptionGroup：组内互斥，最多选 1 项（R-OPT-1）；required=true 时必选（E-OPT）。 */
export interface OptionGroup {
  optionGroupId: string
  name: string
  required: boolean
  options: BlueprintOption[]
}

/** §4.6 ModuleTemplate（策划数据）。baseWorkUnits / intensityCurve / affinityIntensity / audienceAffinity 均为 TUNING。 */
export interface ModuleTemplate {
  templateId: string
  templateRevision: number
  name: string
  description: string
  domain: GameplayDomain
  allowedSlotKinds: SlotKind[]
  era: { fromYear: number; toYear: number }
  techGates: TechGate[]
  baseWorkUnits: Record<BlueprintDiscipline, number>
  /** 工作量倍率，键 1–5。 */
  intensityCurve: Record<number, number>
  /** 受众亲和权重，键 1–5；与工作量倍率语义分离。 */
  affinityIntensity: Record<number, number>
  skillLoad: Record<BlueprintDiscipline, number>
  optionGroups: OptionGroup[]
  combineTags: string[]
  audienceAffinity: Record<string, number>
  uspIds: string[]
  contentType: ContentType
}

/** §4.7 ContentPack。compatibleDomains 仅作语义约束，不是工作量索引键。 */
export interface ContentPack {
  packId: string
  templateRevision: number
  compatibleDomains: GameplayDomain[]
  tier: number
  workUnitsPerTier: Record<BlueprintDiscipline, number>
  audienceVolumeWeight: number
}

/** §4.5 ModuleInstance。state 锁定后只能 active→deactivated，不可逆（T3）。 */
export interface ModuleInstance {
  instanceId: string
  templateId: string
  slotId: string
  displayLabel: string
  domain: GameplayDomain
  intensity: number
  depthSelection: DepthSelection
  /** optionGroupId → optionId。 */
  optionSelections: Record<string, string>
  contentPackId: string | null
  state: ModuleInstanceState
  sourceOrigin: ModuleSourceOrigin
}

/** §4.2 ProductBlueprint 根对象；state ∈ {active, archived}（§7.3）。 */
export interface ProductBlueprint {
  blueprintId: string
  ownerCompanyId: string
  workingTitle: string
  finalTitle: string | null
  franchiseId: string | null
  currentVersionId: string
  lockedVersions: string[]
  originTemplateId: string | null
  seedIdea: string
  createdAt: number
  updatedAt: number
  archivedAt: number | null
  state: 'active' | 'archived'
}

/** §4.9 BlueprintVersion。REWORK 不是状态枚举值（§7.1 / C2）。 */
export type BlueprintVersionState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'LOCKED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'ABANDONED'

/** §4.9 birthState：正常锁定为 LOCKED；返工完成派生版本出生即 EXECUTING。 */
export type BlueprintBirthState = 'LOCKED' | 'EXECUTING'

/** §4.9 设计版本（可编辑单元）。 */
export interface BlueprintVersion {
  versionId: string
  blueprintId: string
  versionNo: number
  state: BlueprintVersionState
  positioning: PositioningProfile
  slots: GameplaySlot[]
  instances: ModuleInstance[]
  contentPacks: ContentPack[]
  lockTargetReleaseForm: ReleaseForm
  lockedAt: number | null
  lockedBy: string | null
  changeHistory: string[]
  supersedesVersionId: string | null
  birthState: BlueprintBirthState
}

/** §4.12 冻结载荷（深拷贝结构：定位 + 槽位 + 实例 + 内容包）。 */
export interface FrozenBlueprint {
  positioning: PositioningProfile
  slots: GameplaySlot[]
  instances: ModuleInstance[]
  contentPacks: ContentPack[]
}

/** §4.12 DesignVersionSnapshot：不可变。estimates 为锁定时刻快照值。 */
export interface DesignVersionSnapshot {
  snapshotId: string
  versionId: string
  payloadHash: string
  frozenBlueprint: FrozenBlueprint
  /** §12 S2：templateId / packId → templateRevision。 */
  templateRevisionRefs: Record<string, number>
  estimates: EstimateBundle | null
  takenAt: number
}

/** §15.5 DesignChangeRecord。 */
export interface DesignChangeRecord {
  changeId: string
  versionId: string
  category: 'A' | 'B' | 'C' | 'D' | 'E'
  requestedBy: string
  requestedAt: number
  reworkRequired: boolean
  reworkTaskIds: string[]
  reworkSessionId: string | null
  sunkCostEstimate: number
}

/** §12 S1 ReworkTask。 */
export interface ReworkTask {
  taskId: string
  sessionId: string
  changeId: string
  done: boolean
}

/** §12 S1/S8 ReworkSession：EXECUTING 的呈现标签容器，state 永不赋 REWORK。 */
export interface ReworkSession {
  sessionId: string
  projectId: string
  versionId: string
  targetDraftVersionId: string
  status: 'active' | 'completed' | 'cancelled'
  reworkTaskIds: string[]
  changeIds: string[]
  startedAt: number
}

// ===== D-01 §6 四通道派生对象（互不合成单一分数，T2） =====

export interface WorkUnitChannel {
  /** 各学科最终工作量 W_d（已乘协同增益）。 */
  byDiscipline: Record<BlueprintDiscipline, number>
  /** 协同前原始工作量 W_d^raw。 */
  raw: Record<BlueprintDiscipline, number>
  /** §6.2 synergy_d（每学科）。 */
  synergy: Record<BlueprintDiscipline, number>
  total: number
  ranges: Record<BlueprintDiscipline, EstimateRange>
  /** §9.4 前三个成本驱动。 */
  drivers: string[]
}

export interface SkillDemandChannel {
  byDiscipline: Record<BlueprintDiscipline, number>
  total: number
  peakFraction: Record<BlueprintDiscipline, number>
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface TechRiskChannel {
  /** §6.4 门槛集合 T（每个成员可追溯 §4.8 来源表）。 */
  gates: TechGate[]
  /** T_unsat：minCapabilityLevel=0 恒满足，不入此集。 */
  unsatisfied: TechGate[]
  rTech: number
  rSynergy: number
  rScope: number
  maxRisk: number
  /** 仅展示分类，三个子风险仍分别输出；不是"设计价值分"。 */
  riskLevel: RiskLevel
}

export type QualityBand = 'low' | 'medium' | 'high'

export interface MarketFitChannel {
  affinity: Record<string, number>
  positioningFit: number
  positioningFitBand: QualityBand
  genreFit: number
  /** §5.4 R-COM-7 的确定性布尔判定；OPEN-O1 uspCredibility 不在此输出。 */
  uspSupported: Record<string, boolean>
  noveltyNote: string
  contentVolumeBand: QualityBand
}

/** 四通道估算集合。红线：不存在 compositeScore / designValue / 综合分字段。 */
export interface EstimateBundle {
  formulaVersion: string
  workUnits: WorkUnitChannel
  skillDemand: SkillDemandChannel
  techRisk: TechRiskChannel
  marketFit: MarketFitChannel
}

/** §6.2.1 HRBFeasibility：只读；不含 qualityCeilingBand（OPEN-O5，已从输出契约移除）。 */
export interface HRBFeasibility {
  hrb: number
  budgetCap: number
  costEst: number
  ratio: number
  verdict: 'feasible' | 'need_more_budget_or_delay' | 'need_reduce_scope_or_lower_goal'
  reasons: string[]
}

/** §7.2.1 RevalidationGate 返回。 */
export interface RevalidationResult {
  pass: boolean
  violations: BlueprintViolation[]
  /** resolveRefs 独立前置结果，便于反证测试断言闸门确实先做了引用解析。 */
  refViolations: BlueprintViolation[]
  hardRuleViolations: BlueprintViolation[]
}

// ===== D-04 §3 词表实体（字段严格对齐 D-01 §4.13 / D-04 §3） =====

export type SegmentTagDimension = 'demographic' | 'preference'
export type SegmentTagGranularity = 'broad' | 'niche'
export type VocabularyState = 'active' | 'deprecated'

/**
 * §3.1 SegmentTag。已发布 tagId 的 displayName/dimension/granularity/regionScope/eraRange
 * 及语义永久不可变（ADJ-2026-11-21-02 裁定二）；跨版本仅允许新增 tagId 或 active→deprecated。
 */
export interface SegmentTag {
  tagId: string
  code: string
  displayName: string
  dimension: SegmentTagDimension
  granularity: SegmentTagGranularity
  regionScope: { kind: 'global' | 'regional'; regionIds: string[] }
  eraRange: { fromYear: number; toYear: number }
  state: VocabularyState
  source: 'seed_data' | 'game_master'
  vocabularyVersion: string
}

/** §3.2 / D-01 §4.13 GameplayArchetype。字段不新增、不改名、不改类型。 */
export interface GameplayArchetype {
  archetypeId: string
  name: string
  coreSlotDomains: GameplayDomain[]
  /** 缺键一律取 0（D-01 §6.5）。 */
  typeAffinity: Partial<Record<GameplayDomain, number>>
  subtypeTableId: string | null
  isProvisional: boolean
  state: 'provisional' | 'active' | 'deprecated'
  successCount: number
  source: 'seed_data' | 'player_created' | 'ai_created'
  createdAt: number | null
  promotedAt: number | null
}

/** §3.3 Platform。P1 techStandards=[]；inputCapabilities 供 §5.2 硬兼容检查。 */
export interface Platform {
  platformId: string
  code: string
  displayName: string
  existence: {
    available: boolean
    eraRange: { fromYear: number; toYear: number }
    regionCoverage: string[]
  }
  inputCapabilities: Array<'gamepad' | 'keyboard_mouse' | 'touch'>
  techStandards: TechGate[]
  state: VocabularyState
  source: 'seed_data' | 'historical'
}

/** §4.1 词表版本。sealed=true 只读。 */
export interface SegmentTagVocabulary {
  vocabularyVersion: string
  effectiveFrom: number
  changelog: string[]
  tags: SegmentTag[]
  sealed: boolean
}

/** §7.1 词表总目录（传入 resolveRefs，保持纯函数、不依赖全局单例）。 */
export interface VocabularyCatalog {
  vocabulary: SegmentTagVocabulary
  archetypes: GameplayArchetype[]
  platforms: Platform[]
}

/** §7.1 resolveRefs 输入引用集合。 */
export interface VocabularyRefs {
  tagIds: string[]
  primaryTypeId: string
  secondaryTypeIds: string[]
  platformIds: string[]
}

/** §7.1 ResolveResult。read 模式下未知引用进入 rejected 而非 violations。 */
export interface ResolveResult {
  resolved: {
    tags: string[]
    archetypes: string[]
    platforms: string[]
  }
  violations: BlueprintViolation[]
  /** 读档降级：被拒绝的引用 ID（不触发 E 级、不整体拒绝读档）。 */
  rejected: string[]
}
