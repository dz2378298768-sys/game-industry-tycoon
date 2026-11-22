/**
 * 产品完整度与交付标准（D-02）领域类型。
 *
 * 权威条款：
 *  - D-02 产品完整度与交付标准设计规格 V0.1（就地修订稿，C1–C7 已确认）§3/§4/§5/§6/§7
 *  - 上游引用（只读，不复制主数据）：D-01 V0.2 快照/画像/HRB/RevalidationGate；QA（OPEN-D02-O2）；
 *    Project（OPEN-D02-O5）；D-07（OPEN-D02-O4）
 *
 * 红线（全文不可违反）：
 *  - R-D02-0：设计质量 / 实现质量 / 产品完整度三者独立计算、独立呈现、独立存储，
 *    禁止 overallQuality / 加权和 / mean(dq,iq,c) 等任何合成。
 *  - R-D02-1：完整度是分项覆盖向量 + 阻断项闸门，禁止 satisfied/total 单一百分比。
 *  - R-D02-2：qualityCeilingBand 在 P1 恒为 ABSENT_P1，不产出确定值。
 *  - R-D02-3：缺失核心模块不自动补齐、不自动替换、不自动降级交付形式。
 */

import type {
  DepthSelection,
  DesignVersionSnapshot,
  GameplayDomain,
  MarketFitChannel,
  ModuleTemplate,
  Platform,
  ReleaseForm,
  SlotKind,
} from '@domain/entities/product-blueprint'

// ===== §3.1/§3.2 清单实体 =====

/** §5.2 交付标准分组（不是 D-01 GameplayArchetype 玩法类型条目，§14.4）。 */
export type ArchetypeClass = 'broad' | 'niche' | 'technical' | 'generic'

export const ARCHETYPE_CLASSES: readonly ArchetypeClass[] = [
  'broad',
  'niche',
  'technical',
  'generic',
]

/** §6.3 分项覆盖向量固定五类（不合并，R-D02-1）。 */
export type CompletenessCategory =
  | 'core_loop'
  | 'support'
  | 'content'
  | 'tech'
  | 'delivery'

export const COMPLETENESS_CATEGORIES: readonly CompletenessCategory[] = [
  'core_loop',
  'support',
  'content',
  'tech',
  'delivery',
]

/** §3.2 清单项刚性三档。 */
export type ChecklistCriticality = 'blocking' | 'expected' | 'optional'

export const CHECKLIST_CRITICALITIES: readonly ChecklistCriticality[] = [
  'blocking',
  'expected',
  'optional',
]

/** D-01 枚举不变（§3.4 不新增枚举值）。 */
export type DeliveryForm = ReleaseForm

export const DELIVERY_FORMS: readonly DeliveryForm[] = ['full', 'early_access', 'demo']

/**
 * §3.3 ChecklistPredicate：P1 固定词表 9 个谓词（判别联合）。
 *
 * 词表外 kind 不存在——求值器对未知 kind fail-closed 抛错（任务卡 §2-2）。
 * 「数据缺失」与「未知谓词」是两类失败：前者按 §6.7 边界返回布尔，不得抛错。
 */
export type ChecklistPredicate =
  /** 该槽种类中 state=active 的实例数 ≥ minCount；快照无该槽时按 §6.7：minCount=0 ⇒ true，否则 false。 */
  | { kind: 'slotActive'; slotKind: SlotKind; minCount: number }
  /** content 槽绑定内容包最大 tier ≥ minTier；无绑定 ⇒ false。 */
  | { kind: 'contentTierAtLeast'; minTier: number }
  /** T_unsat ∩ domainSet = ∅；domainSet='all' ⇔ T_unsat = ∅。 */
  | { kind: 'techGatesSatisfied'; domainSet: readonly string[] | 'all' }
  /**
   * affinity[tag] ≥ threshold（缺键取 0，D-01 §6.5）。
   * tag 缺省 = B-03 的「∀tag ∈ targetSegmentClaims」全称量词（空宣称集 vacuous true）。
   */
  | { kind: 'segmentCovered'; tag?: string; threshold: number }
  /**
   * 每条 sellingPoints 被支撑（uspSupported=true）。
   * slotKind='any' ≡ ∃ slotKind: uspBackedBy(slotKind)（§6.6 约束 4：外层 ∃ / 内层 ∀）。
   * |sellingPoints|=0 ⇒ 通过（§6.7 不误报）。
   */
  | { kind: 'uspBackedBy'; slotKind: SlotKind | 'any' }
  /** 无严重度属于 severitySet 的缺陷（严重度枚举 OPEN-D02-O2）。 */
  | { kind: 'defectFree'; severitySet: readonly string[] }
  /** 平台技术标准满足；platformId='any' ≡ ∃ platformId（目标平台中存在一个达标）。 */
  | { kind: 'platformStdMet'; platformId: string | 'any' }
  /** productFields[field] 非空（如 finalTitle）；字段缺失按数据缺失处理（false），不抛错。 */
  | { kind: 'fieldNonEmpty'; field: string }
  /**
   * 核心（core_loop 槽 active）实例 depthSelection 达 level（按 §6.6-1 同构取 max 深度）。
   * alternativeMinIntensity 为 N-01 的「或 intensity ≥ τ_niche_deep」分支（TUNING）。
   */
  | { kind: 'depthAtLeast'; level: DepthSelection; alternativeMinIntensity?: number }

/** P1 谓词词表（恰好 9 个；新谓词需经设计审核升 formulaVersion，§3.3）。 */
export const P1_PREDICATE_KINDS: readonly ChecklistPredicate['kind'][] = [
  'slotActive',
  'contentTierAtLeast',
  'techGatesSatisfied',
  'segmentCovered',
  'uspBackedBy',
  'defectFree',
  'platformStdMet',
  'fieldNonEmpty',
  'depthAtLeast',
]

export interface ChecklistItem {
  itemId: string
  category: CompletenessCategory
  /** 玩家可读描述，不含数值承诺（§3.2）。 */
  label: string
  criticality: ChecklistCriticality
  predicate: ChecklistPredicate
  /** 未满足时的可选动作，至少 1 个；不得为空自动补齐（R-D02-3）。 */
  gapActionIds: readonly string[]
  /** 引入该清单项的设计版本，可追溯。 */
  sourceVersion: string
}

export type ChecklistTemplateState = 'draft' | 'active' | 'deprecated'

/** §3.1 CompletenessChecklist 清单模板。 */
export interface CompletenessChecklist {
  checklistId: string
  archetypeClass: ArchetypeClass
  deliveryForm: DeliveryForm
  items: readonly ChecklistItem[]
  /** 修改递增；Build 记录所用 revision（§4.4 / S3）。 */
  templateRevision: number
  formulaVersion: string
  /** 只有 active 用于新评估（§4.4）。 */
  state: ChecklistTemplateState
}

/** §6.3 闸门桥接条件展示位 ID：不入任何 R_k / c_k（§5.1 / §6.3 / C3 修订口径）。 */
export const GATE_BRIDGE_ITEM_IDS: readonly string[] = ['C-06', 'C-07']

// ===== §3.7 ModuleContribution =====

export type ModuleContributionStatus = 'present' | 'deactivated' | 'missing' | 'substituted'

/** §3.7 signals：对 DQ/完整度的信号（只读引用 D-01 画像）。 */
export interface ModuleContributionSignals {
  /** 该实例支撑的卖点集合（键 = sellingPoint / uspId）。 */
  uspSupported: Readonly<Record<string, boolean>>
  affinitySlice: Readonly<Record<string, number>>
  contentVolumeContribution: number
}

export interface ModuleContribution {
  contributionId: string
  instanceId: string
  templateId: string
  slotId: string
  domain: GameplayDomain
  /** 支撑的清单项 itemId（由谓词 + 模板字段派生）。 */
  contributesTo: readonly string[]
  status: ModuleContributionStatus
  /** 可替换模板建议（只建议，不自动替换，R-D02-3）。 */
  substitutableBy: readonly string[]
  signals: ModuleContributionSignals
}

// ===== §3.5 EvaluationContext（派生只读） =====

/** QA 缺陷最小事实接口（严重度枚举 OPEN-D02-O2；P1 至少 'E'）。 */
export interface DefectFact {
  defectId: string
  severity: string
}

/** Project build 事实最小接口（口径 OPEN-D02-O5）。 */
export interface BuildFacts {
  deliveredTier: number
  /** 缺省时由快照内容槽推导 plannedTier。 */
  plannedTier?: number
  costEst: number | null
  actualCost: number | null
}

/** 玩家/QA 显式覆盖 archetypeClass（P1 开放，§5.2 / §10.4 X-2），必须附理由留痕。 */
export interface ArchetypeClassOverride {
  archetypeClass: ArchetypeClass
  reason: string
}

export interface EvaluationContext {
  /** D-01 DesignVersionSnapshot（只读）。 */
  snapshot: DesignVersionSnapshot
  /** 模板注入（DQ 公式需要 affinityIntensity / audienceAffinity）。 */
  templatesById: Readonly<Record<string, ModuleTemplate>>
  moduleContributions: readonly ModuleContribution[]
  defects: readonly DefectFact[]
  buildFacts: BuildFacts | null
  /** D-07 档案相似度（OPEN-D02-O4）；P1 不消费（innovation 恒 UNAVAILABLE）。 */
  archiveSimilarity: number | 'unavailable_p1'
  /** D-01 §6.5 只读画像；缺省回退 snapshot.estimates?.marketFit。 */
  marketProfile: MarketFitChannel | null
  /** 词表平台目录（platformStdMet 用）。 */
  platforms: readonly Platform[]
  /** 技术能力等级（键 = TechGate.domainId；缺键取 0）。 */
  capabilities: Readonly<Record<string, number>>
  /** C-07 桥接：D-01 RevalidationGate 结果；缺省按 fail-closed 处理为 FAIL（§12 P3）。 */
  revalidation: { pass: boolean } | null
  /** D-01 §6.2.1 HRB verdict（只读消费）；仅作 reasonNote 文本提示，不产出 qcb 数值（§6.5 / S5）。 */
  hrbVerdict: 'feasible' | 'need_more_budget_or_delay' | 'need_reduce_scope_or_lower_goal' | null
  /** Product 级字段（fieldNonEmpty：'finalTitle' 等）。 */
  productFields: Readonly<Record<string, string | null>>
  /** 玩家披露声明（§7.1 玩家决策输入）。 */
  disclosureProvided: boolean
  archetypeClassOverride: ArchetypeClassOverride | null
  assessedAt: number
  formulaVersion: string
}

// ===== §3.4 DeliveryForm 标准（三形式，不新增枚举值） =====

/** D02-10 定型（C8 处置）：档位统一为 {low, medium, high} 状态档；方向语义由带位移表达。 */
export type ExpectationBandLevel = 'low' | 'medium' | 'high'

export interface ExpectationPolicy {
  expectationBand: ExpectationBandLevel
  refundRiskBand: ExpectationBandLevel
  brandImpactBand: ExpectationBandLevel
}

export interface DeliveryFormStandard {
  form: DeliveryForm
  label: string
  /** full={blocking,expected}；EA={blocking}；demo=demo 清单项中标注的 criticality（§6.6 requiredFor）。 */
  requiredCriticality: readonly ChecklistCriticality[] | 'demo_subset'
  /** §3.4：三形式均 required。 */
  disclosurePolicy: 'required' | 'optional' | 'forbidden'
  expectationPolicy: ExpectationPolicy
  /** EA→full 走重评估；demo 不可直转（§4.3）。 */
  allowsUpgradeTo: 'full' | null
}

// ===== §3.8 DeliveryFormQualification =====

export type DeliveryFormQualificationStatus =
  | 'not_evaluated'
  | 'qualified'
  | 'qualified_with_disclosure'
  | 'not_qualified'

export interface DeliveryFormQualification {
  qualificationId: string
  form: DeliveryForm
  /** 以哪个快照评估（快照变则重算）。 */
  evaluatedAgainst: string
  status: DeliveryFormQualificationStatus
  /** 未满足的阻断项（itemId 引用）。 */
  blockingUnmet: readonly string[]
  /** 必须披露的未满足 expected 项（itemId 引用）。 */
  requiredDisclosures: readonly string[]
  /** D02-11（C8）：demo 强制「非完整产品」标签，落入数据模型。 */
  forcedDisclosureLabel: string | null
  evaluatedAt: number
  formulaVersion: string
}

// ===== §3.9 / §3.10 闸门结果与异常码 =====

export type DeliveryGate = 'PASS' | 'FAIL'

/** §3.10 D-02 新增码（不自造 D-01 已有编号）。 */
export type D02ErrorCode =
  | 'D02-MISSING-CORE'
  | 'D02-DISCLOSURE-REQUIRED'
  | 'D02-FORM-INELIGIBLE'
  | 'D02-E-DEFECT'
  | 'D02-QCB-UNDEFINED'

export type QualityCeilingBandState = 'ABSENT_P1'

/** P1 恒定值（R-D02-2 / ADJ-2026-11-21-01 第 5 条）。 */
export const QCB_ABSENT_P1: QualityCeilingBandState = 'ABSENT_P1'

export interface DeliveryGateResult {
  gate: DeliveryGate
  blockingUnmet: readonly string[]
  formQualification: DeliveryFormQualification
  qcbState: QualityCeilingBandState
  /** §3.10 五码中本次闸门实际触发的码（确定性排序）。 */
  errorCodes: readonly D02ErrorCode[]
  checkedAt: number
  formulaVersion: string
}

/** §3.9 交付决策记录：供 D-07 归档，不可变。 */
export interface DeliveryDecisionRecord {
  readonly snapshotId: string
  readonly form: DeliveryForm
  readonly checklistRevision: number
  readonly gateResult: DeliveryGateResult
  /** 披露缺口（itemId）+ demo 强制标签。 */
  readonly disclosedGaps: readonly string[]
  readonly dqVector: DesignQuality
  readonly iqVector: ImplementationQuality
  /** 分项覆盖向量（分量，不合并）。 */
  readonly completenessVector: Readonly<Record<CompletenessCategory, number>>
  readonly qcbState: QualityCeilingBandState
  /** HRB verdict 文本提示（如「需降低质量目标」），不携带数值带宽（§6.5）。 */
  readonly reasonNote: string
}

// ===== §6.1/§6.2/§6.3 三质量向量（独立，R-D02-0） =====

/** P1 不可用维标记（§6.7：显示"—"，不计闸门，不按 0 处理）。 */
export type UnavailableP1 = 'unavailable_p1'

/** §6.1 设计质量四维向量，无总分。 */
export interface DesignQuality {
  /** 结构完整性 ∈[0,1]；空设计=0。 */
  structure: number
  /** P1 恒 UNAVAILABLE_P1（OPEN-D02-O4），不是 0、不是 1。 */
  innovation: UnavailableP1 | number
  experiencePotential: number
  marketFit: number
}

/** §6.2 实现质量四维向量，无总分；实现质量任何一维不反向影响 DQ。 */
export interface ImplementationQuality {
  /** 1 − R_tech_delivery；T_unsat=∅ → 1（R_tech_delivery := R_tech(权威快照,交付时)，D02-15）。 */
  stability: number
  /** plannedTier=0 → 1；deliveredTier 未知 → UNAVAILABLE_P1。 */
  contentFidelity: number | UnavailableP1
  defectLoad: number
  /** costEst=0 或实际成本未知 → UNAVAILABLE_P1（§6.7）。 */
  deliveryAdherence: number | UnavailableP1
}

/** §6.3 完整度 = 分项覆盖向量 + 闸门，禁止单一百分比（R-D02-1）。 */
export interface CompletenessReport {
  /** c_k 分量：|R_k|=0 ⇒ 1（除零边界，§6.7）。 */
  byCategory: Readonly<Record<CompletenessCategory, number>>
  /** criticality=blocking 且未满足的清单项。 */
  blockingUnmet: readonly ChecklistItem[]
  /** PASS iff blockingUnmet=∅ ∧ RevalidationGate=PASS ∧ defectFree({E})；与 c_k 数值无关。 */
  gate: DeliveryGate
}

// ===== §3.6 QualityAssessment =====

export type QualityAssessmentState =
  | 'pending'
  | 'provisional'
  | 'final'
  | 'superseded'
  | 'archived'

export interface QualityAssessment {
  assessmentId: string
  buildId: string
  snapshotId: string
  /** 所用清单模板修订（历史可重放，S2）。 */
  checklistRevision: number
  designQuality: DesignQuality
  implementationQuality: ImplementationQuality
  completeness: CompletenessReport
  deliveryFormQualificationId: string
  /** P1 恒 ABSENT_P1（S4：状态必须持久化，防旧档穿越赋值）。 */
  qualityCeilingBand: QualityCeilingBandState
  state: QualityAssessmentState
  assessedAt: number
  formulaVersion: string
}
