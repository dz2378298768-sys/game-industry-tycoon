/**
 * D-02 §6.3 完整度求值 + §3.8 形式资格 + §3.9/§3.10 交付闸门与决策记录 + §4 状态转换。
 *
 * 口径（§6.3 / C3 消解）：
 *  - R_k = 类别 k 中 criticality ∈ requiredFor(form) 且 itemId ∉ {C-06, C-07} 的清单项；
 *  - c_k = |R_k| = 0 ? 1 : |S_k| / |R_k|（除零边界：无要求视为已满足，不进闸门）；
 *  - 禁止 overall = mean(c₁..c₅) 或任何加权和（R-D02-1）；byCategory 逐项展示；
 *  - gate = PASS iff blockingUnmet = ∅ ∧ RevalidationGate = PASS ∧ defectFree({E})，
 *    与 c_k 数值无关（4/4 核心满足但 0/6 可选满足不影响 gate）；对 full/EA/demo 一律恒执行。
 *  - 求值 fail-closed：RevalidationGate 结果缺失按 FAIL（§12 P3 / §9.5 错状态）。
 */
import type {
  ChecklistItem,
  CompletenessCategory,
  CompletenessChecklist,
  CompletenessReport,
  DeliveryDecisionRecord,
  DeliveryForm,
  DeliveryFormQualification,
  DeliveryFormQualificationStatus,
  DeliveryGateResult,
  D02ErrorCode,
  EvaluationContext,
  QualityAssessment,
  QualityAssessmentState,
} from '@domain/entities/product-completeness'
import {
  GATE_BRIDGE_ITEM_IDS,
  QCB_ABSENT_P1,
  CompletenessDomainError,
  D02_ERROR,
  D02_IMPL_ERROR,
} from '@domain/entities/product-completeness'
import type { ExpectationBandLevel, ExpectationPolicy } from '@domain/entities/product-completeness'
import {
  DELIVERY_FORM_STANDARDS,
  getActiveChecklist,
  requiredCriticalitiesFor,
} from './product-completeness-checklists'
import { evaluatePredicate } from './product-completeness-predicates'
import { resolveArchetypeClass } from './product-completeness-classification'
import { computeDesignQuality, computeImplementationQuality } from './product-completeness-quality'
import type { CompletenessTuning } from './product-completeness-tuning'

const COMPLETENESS_CATEGORIES_ORDER = ['core_loop', 'support', 'content', 'tech', 'delivery'] as const

function isGateBridgeItem(it: ChecklistItem): boolean {
  return GATE_BRIDGE_ITEM_IDS.includes(it.itemId)
}

function evaluateItems(
  items: readonly ChecklistItem[],
  ctx: EvaluationContext,
): Map<string, boolean> {
  const results = new Map<string, boolean>()
  for (const it of items) results.set(it.itemId, evaluatePredicate(it.predicate, ctx))
  return results
}

/**
 * §6.3 完整度求值：分项覆盖向量 + blockingUnmet + 闸门。
 * 纯函数、确定性（同输入同输出，G1 / S6）。TUNING 阈值已烘焙进模板谓词参数（S9：
 * 清单模板 + formulaVersion 参数快照共同承载），求值本身无需注入 tuning。
 */
export function evaluateCompleteness(
  ctx: EvaluationContext,
  checklist: CompletenessChecklist,
): CompletenessReport {
  const required = new Set(requiredCriticalitiesFor(checklist.deliveryForm, checklist))
  const satisfied = evaluateItems(checklist.items, ctx)

  const byCategory: Record<CompletenessCategory, number> = {
    core_loop: 0,
    support: 0,
    content: 0,
    tech: 0,
    delivery: 0,
  }
  for (const k of COMPLETENESS_CATEGORIES_ORDER) {
    // R_k：category=k ∧ criticality ∈ requiredFor(form) ∧ 非闸门桥接条件（§6.3）。
    const Rk = checklist.items.filter(
      (it) => it.category === k && required.has(it.criticality) && !isGateBridgeItem(it),
    )
    const Sk = Rk.filter((it) => satisfied.get(it.itemId) === true)
    byCategory[k] = Rk.length === 0 ? 1 : Sk.length / Rk.length
  }

  const blockingUnmet = checklist.items.filter(
    (it) => it.criticality === 'blocking' && satisfied.get(it.itemId) !== true,
  )

  // §7.3 S2：对 full/EA/demo 一律恒执行；revalidation 缺失 fail-closed 为 FAIL。
  const revalidationPass = ctx.revalidation?.pass === true
  const eDefectFree = evaluatePredicate({ kind: 'defectFree', severitySet: ['E'] }, ctx)
  const gate = blockingUnmet.length === 0 && revalidationPass && eDefectFree ? 'PASS' : 'FAIL'

  return { byCategory, blockingUnmet, gate }
}

/** 未满足的 expected 项（full/EA 需披露；demo 子集无 expected 项）。 */
function unmetExpectedItems(
  checklist: CompletenessChecklist,
  satisfied: Map<string, boolean>,
): ChecklistItem[] {
  return checklist.items.filter(
    (it) => it.criticality === 'expected' && satisfied.get(it.itemId) !== true,
  )
}

/** DEMO 强制披露标签（D02-11：demo 无 expected 项，强制标签单独入数据模型）。 */
export const DEMO_FORCED_DISCLOSURE_LABEL = '非完整产品（demo，强制披露）'

/**
 * §4.2 形式资格状态机（求值发生在玩家提交交付动作时，同步）。
 *  - 有 blocking 未满足 → not_qualified（D02-MISSING-CORE 在闸门结果中表达）；
 *  - 仅 expected 未满足 + 已附披露 → qualified_with_disclosure；
 *  - 仅 expected 未满足 + 未附披露 → not_qualified（D02-DISCLOSURE-REQUIRED，§4.2 注）；
 *  - 全满足 → qualified。
 */
export function evaluateDeliveryFormQualification(
  ctx: EvaluationContext,
  templates: readonly CompletenessChecklist[],
  form: DeliveryForm,
  tuning: CompletenessTuning,
): DeliveryFormQualification {
  const { archetypeClass } = resolveArchetypeClass(ctx, tuning)
  const checklist = getActiveChecklist(templates, archetypeClass, form)
  const satisfied = evaluateItems(checklist.items, ctx)

  const blockingUnmet = checklist.items
    .filter((it) => it.criticality === 'blocking' && satisfied.get(it.itemId) !== true)
    .map((it) => it.itemId)
  const unmetExpected = unmetExpectedItems(checklist, satisfied).map((it) => it.itemId)

  let status: DeliveryFormQualificationStatus
  if (blockingUnmet.length > 0) {
    status = 'not_qualified'
  } else if (unmetExpected.length > 0) {
    // disclosurePolicy 三形式均 required（§3.4）；披露齐备才可带披露通过。
    status = ctx.disclosureProvided ? 'qualified_with_disclosure' : 'not_qualified'
  } else {
    status = 'qualified'
  }

  const forcedDisclosureLabel = form === 'demo' ? DEMO_FORCED_DISCLOSURE_LABEL : null

  return {
    qualificationId: `D02-Q-${ctx.snapshot.snapshotId}-${form}`,
    form,
    evaluatedAgainst: ctx.snapshot.snapshotId,
    status,
    blockingUnmet,
    requiredDisclosures: form === 'demo' ? [] : unmetExpected,
    forcedDisclosureLabel,
    evaluatedAt: ctx.assessedAt,
    formulaVersion: ctx.formulaVersion,
  }
}

/** D02-FORM-INELIGIBLE 判定：资格结论为 not_qualified。 */
function isFormIneligible(q: DeliveryFormQualification): boolean {
  return q.status === 'not_qualified'
}

const BAND_ORDER: readonly ExpectationBandLevel[] = ['low', 'medium', 'high']

function shiftBand(band: ExpectationBandLevel, delta: number): ExpectationBandLevel {
  const idx = BAND_ORDER.indexOf(band)
  const clamped = Math.min(BAND_ORDER.length - 1, Math.max(0, idx + delta))
  const next = BAND_ORDER[clamped]
  return next ?? band
}

/**
 * §5.4 影响方向（只给方向与档位，不换算数值；数值归 D-04/产品运营）：
 *  - 缺失 expected 且带披露：预期档位下调一档、退款风险上调一档、品牌信任下调一档（TC-06 方向，C6 已裁定）；
 *  - 缺失 expected 且未披露：退款风险上调两档、品牌显著下调两档（该路径被闸门阻断，不出现在交付输出）；
 *  - 无 expected 缺口：基准档位。
 * D02-10（C8）定型：档位为 {low, medium, high} 状态档，方向由带位移表达。
 */
export function expectationPolicyForOutcome(
  form: DeliveryForm,
  unmetExpectedCount: number,
  disclosed: boolean,
): ExpectationPolicy {
  const standard = DELIVERY_FORM_STANDARDS.find((s) => s.form === form)
  if (standard === undefined) {
    throw new CompletenessDomainError(
      D02_IMPL_ERROR.TEMPLATE_MISSING,
      `No delivery form standard for ${form}.`,
    )
  }
  const base = standard.expectationPolicy
  if (unmetExpectedCount === 0) return { ...base }
  const step = disclosed ? 1 : 2
  return {
    expectationBand: shiftBand(base.expectationBand, -step),
    refundRiskBand: shiftBand(base.refundRiskBand, step),
    brandImpactBand: shiftBand(base.brandImpactBand, -step),
  }
}

/** D02-DISCLOSURE-REQUIRED 判定：存在未满足 expected 且未附披露声明（full/EA；demo 走强制标签）。 */
function isDisclosureRequired(
  q: DeliveryFormQualification,
  ctx: EvaluationContext,
): boolean {
  return q.requiredDisclosures.length > 0 && !ctx.disclosureProvided
}

/**
 * §3.9 交付闸门（供 Project 在 EXECUTING→COMPLETED 动作提交点同步消费）。
 * FAIL 则不切快照、阻断 COMPLETED、回路返工。
 */
export function evaluateDeliveryGate(
  ctx: EvaluationContext,
  templates: readonly CompletenessChecklist[],
  form: DeliveryForm,
  tuning: CompletenessTuning,
): DeliveryGateResult {
  const { archetypeClass } = resolveArchetypeClass(ctx, tuning)
  const checklist = getActiveChecklist(templates, archetypeClass, form)
  const report = evaluateCompleteness(ctx, checklist)
  const formQualification = evaluateDeliveryFormQualification(ctx, templates, form, tuning)

  const errorCodes: D02ErrorCode[] = []
  if (report.blockingUnmet.length > 0) errorCodes.push(D02_ERROR.MISSING_CORE)
  if (isDisclosureRequired(formQualification, ctx)) errorCodes.push(D02_ERROR.DISCLOSURE_REQUIRED)
  if (isFormIneligible(formQualification)) errorCodes.push(D02_ERROR.FORM_INELIGIBLE)
  if (evaluatePredicate({ kind: 'defectFree', severitySet: ['E'] }, ctx) === false) {
    errorCodes.push(D02_ERROR.E_DEFECT)
  }

  return {
    gate: report.gate,
    blockingUnmet: report.blockingUnmet.map((it) => it.itemId),
    formQualification,
    qcbState: QCB_ABSENT_P1,
    errorCodes,
    checkedAt: ctx.assessedAt,
    formulaVersion: ctx.formulaVersion,
  }
}

/** HRB verdict → reasonNote 文本提示（只记文本，不携带数值带宽，§6.5 / S5）。 */
function reasonNoteFromVerdict(ctx: EvaluationContext): string {
  switch (ctx.hrbVerdict) {
    case 'need_reduce_scope_or_lower_goal':
      return '需降低质量目标（HRB verdict 文本提示；qualityCeilingBand 仍 ABSENT_P1，不携带数值带宽）'
    case 'need_more_budget_or_delay':
      return '需追加预算/需延期（HRB verdict 文本提示）'
    case 'feasible':
      return '可行（HRB verdict 文本提示）'
    default:
      return '无 HRB 可行性结论（P1 提示位）'
  }
}

/**
 * §3.9 DeliveryDecisionRecord（供 D-07 归档）：写入后只读（Object.freeze）。
 * disclosedGaps = requiredDisclosures + demo 强制标签。
 */
export function buildDeliveryDecisionRecord(
  ctx: EvaluationContext,
  templates: readonly CompletenessChecklist[],
  form: DeliveryForm,
  tuning: CompletenessTuning,
): DeliveryDecisionRecord {
  const { archetypeClass } = resolveArchetypeClass(ctx, tuning)
  const checklist = getActiveChecklist(templates, archetypeClass, form)
  const gateResult = evaluateDeliveryGate(ctx, templates, form, tuning)
  const report = evaluateCompleteness(ctx, checklist)

  const disclosedGaps: string[] = [...gateResult.formQualification.requiredDisclosures]
  if (gateResult.formQualification.forcedDisclosureLabel !== null) {
    disclosedGaps.push(gateResult.formQualification.forcedDisclosureLabel)
  }

  const record: DeliveryDecisionRecord = {
    snapshotId: ctx.snapshot.snapshotId,
    form,
    checklistRevision: checklist.templateRevision,
    gateResult,
    disclosedGaps,
    dqVector: computeDesignQuality(ctx, tuning),
    iqVector: computeImplementationQuality(ctx, tuning),
    completenessVector: { ...report.byCategory },
    qcbState: QCB_ABSENT_P1,
    reasonNote: reasonNoteFromVerdict(ctx),
  }
  return Object.freeze(record)
}

// ===== §4.1 QualityAssessment 生命周期 =====

/** §4.1 合法状态转换表；FINAL/ARCHIVED 不可变（终态只能沿表退出或冻结）。 */
const ASSESSMENT_TRANSITIONS: Record<QualityAssessmentState, readonly QualityAssessmentState[]> = {
  pending: ['provisional'],
  provisional: ['final', 'pending'],
  final: ['superseded', 'archived'],
  superseded: [],
  archived: [],
}

/** 状态转换（纯函数，不原地覆盖）：非法转换 fail-closed 抛错。 */
export function transitionQualityAssessment(
  assessment: QualityAssessment,
  to: QualityAssessmentState,
): QualityAssessment {
  const allowed = ASSESSMENT_TRANSITIONS[assessment.state]
  if (!allowed.includes(to)) {
    throw new CompletenessDomainError(
      D02_IMPL_ERROR.INVALID_ASSESSMENT_TRANSITION,
      `Illegal QualityAssessment transition ${assessment.state} → ${to} (D-02 §4.1).`,
    )
  }
  return { ...assessment, state: to }
}

// ===== §4.3 交付形式间转换 =====

/**
 * §4.3：仅 EA→full 允许（且必须走新 Build + full 清单重评估，§10.2）；
 * demo→full 不允许直转；full→EA 不允许倒退；EA→demo 不允许。
 */
export function canTransitionDeliveryForm(from: DeliveryForm, to: DeliveryForm): boolean {
  return from === 'early_access' && to === 'full'
}

/**
 * §10.2 / S4：EA→full 重评估产生新评估，旧评估转 SUPERSEDED 保留（不原地覆盖、不删除）。
 * 新评估以 provisional 出生；旧评估必须已是 final。
 */
export function supersedeForUpgrade(
  previous: QualityAssessment,
  nextDraft: Omit<QualityAssessment, 'state'>,
): { superseded: QualityAssessment; next: QualityAssessment } {
  const superseded = transitionQualityAssessment(previous, 'superseded')
  const next: QualityAssessment = { ...nextDraft, state: 'provisional' }
  return { superseded, next }
}

// ===== §6.5 / X-4 qualityCeilingBand 契约守卫 =====

/**
 * 下游按「已交付接口」读取 qualityCeilingBand 的数值 ⇒ 契约错误（D02-QCB-UNDEFINED）。
 * P1 该字段恒 ABSENT_P1（R-D02-2 / ADJ-2026-11-21-01 第 5 条）：不是数值、不是档位、
 * 不得默认 high/1.0、不得参与任何合成。存档读档缺 qcbState 时按 ABSENT_P1 处理（S4 / TC-18）。
 */
export function readQualityCeilingBandValue(assessment: QualityAssessment): never {
  throw new CompletenessDomainError(
    D02_ERROR.QCB_UNDEFINED,
    `${D02_ERROR.QCB_UNDEFINED}: qualityCeilingBand is ABSENT_P1 in P1 (OPEN-O5) — consuming it as a ` +
      `delivered interface is a contract error (D-02 §3.10 / X-4); offending assessment "${assessment.assessmentId}".`,
  )
}

/** qcbState 唯一合法读取方式：只确认其 ABSENT 状态，不产出数值。 */
export function readQualityCeilingBandState(
  assessment: QualityAssessment,
): typeof QCB_ABSENT_P1 {
  return assessment.qualityCeilingBand
}

/** 读档兜底（S4 / TC-18）：qcbState 缺失按 ABSENT_P1 处理并返回迁移标记（由调用方记日志）。 */
export function migrateQcbState(missing: undefined | null): {
  qcbState: typeof QCB_ABSENT_P1
  migrated: boolean
} {
  return { qcbState: QCB_ABSENT_P1, migrated: missing === undefined || missing === null }
}
