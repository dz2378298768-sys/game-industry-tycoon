/**
 * D-02 §5 清单模板：公共项（§5.1）+ 类别专属清单（§5.3）+ 三形式标准（§3.4）。
 *
 * 口径（C3 修订后的统一表述，条件确认单已确认）：
 *  - C-01–C-05 为清单分项（进入 c_k）；C-06/C-07 为闸门桥接条件，不写入任何清单项集，
 *    由 gate 对 full/EA/demo 一律恒执行（defectFree({E}) ∧ RevalidationGate=PASS），不入 c_k。
 *  - demo 独立子集：只套 C-01/C-02/C-04/C-05 + B/N/T 中 demo 列标 optional 的演示片段项；
 *    例外：technical 的 T-01 对 demo 仍为 blocking（§5.3）。
 *    注意：§5.3 demo 子集不含 C-03（finalTitle）——与 §5.1「任何产品都要过」存在表述张力，
 *    按条件确认单 §五观察项以 C3 确认后的 §5.3 子集口径实现，登记待主 AI 追认。
 *  - 每类 × 每形式模板至少含 1 条 blocking 项（任务卡 §2-5 结构校验）。
 */
import type {
  ArchetypeClass,
  ChecklistItem,
  ChecklistPredicate,
  CompletenessChecklist,
  DeliveryForm,
  DeliveryFormStandard,
} from '@domain/entities/product-completeness'
import { CompletenessDomainError, D02_IMPL_ERROR } from '@domain/entities/product-completeness'
import { DELIVERY_FORMS } from '@domain/entities/product-completeness'
import { ARCHETYPE_CLASSES } from '@domain/entities/product-completeness'
import type { CompletenessTuning } from './product-completeness-tuning'

const SOURCE_VERSION = 'D02-V0.1'

function item(
  itemId: string,
  category: ChecklistItem['category'],
  criticality: ChecklistItem['criticality'],
  label: string,
  predicate: ChecklistPredicate,
  gapActionIds: string[],
): ChecklistItem {
  return { itemId, category, criticality, label, predicate, gapActionIds, sourceVersion: SOURCE_VERSION }
}

// ===== §5.1 公共项 C-01–C-05（闸门桥接条件 C-06/C-07 不入清单项集，见文件头说明） =====

function commonItems(): ChecklistItem[] {
  return [
    item('C-01', 'core_loop', 'blocking', '核心玩法槽已绑定至少 1 个 active 模块',
      { kind: 'slotActive', slotKind: 'core_loop', minCount: 1 },
      ['ACT-REWORK-FILL-CORE', 'ACT-ABANDON']),
    item('C-02', 'core_loop', 'blocking', '每条卖点都有 active 实例支撑（R-COM-7）',
      { kind: 'uspBackedBy', slotKind: 'any' },
      ['ACT-REWORK-USP', 'ACT-ABANDON']),
    item('C-03', 'delivery', 'blocking', '上市前必须填写正式名称',
      { kind: 'fieldNonEmpty', field: 'finalTitle' },
      ['ACT-SET-TITLE', 'ACT-ABANDON']),
    item('C-04', 'delivery', 'blocking', '至少 1 个目标平台且平台标准满足',
      { kind: 'platformStdMet', platformId: 'any' },
      ['ACT-SET-PLATFORM', 'ACT-ABANDON']),
    item('C-05', 'content', 'blocking', 'content 槽必须绑定内容包',
      { kind: 'slotActive', slotKind: 'content', minCount: 1 },
      ['ACT-BIND-CONTENT', 'ACT-ABANDON']),
  ]
}

// ===== §5.3 类别专属项（criticality 三列 = full / EA / demo） =====

function broadItems(form: DeliveryForm): ChecklistItem[] {
  const crit = (full: ChecklistItem['criticality'], ea: ChecklistItem['criticality'], demo: ChecklistItem['criticality']) =>
    form === 'full' ? full : form === 'early_access' ? ea : demo
  return [
    item('B-01', 'content', crit('blocking', 'blocking', 'optional'), '内容档位达到广谱要求',
      { kind: 'contentTierAtLeast', minTier: -1 }, ['ACT-EXPAND-CONTENT', 'ACT-ABANDON']),
    item('B-02', 'core_loop', crit('blocking', 'expected', 'optional'), '至少 1 个支撑系统（广度）',
      { kind: 'slotActive', slotKind: 'support', minCount: 1 }, ['ACT-ADD-SUPPORT', 'ACT-ABANDON']),
    item('B-03', 'core_loop', crit('expected', 'expected', 'optional'), '宣称的每个目标群体亲和达标',
      { kind: 'segmentCovered', threshold: -1 }, ['ACT-REPOSITION', 'ACT-DISCLOSE', 'ACT-ABANDON']),
  ]
}

function nicheItems(form: DeliveryForm): ChecklistItem[] {
  const crit = (full: ChecklistItem['criticality'], ea: ChecklistItem['criticality'], demo: ChecklistItem['criticality']) =>
    form === 'full' ? full : form === 'early_access' ? ea : demo
  return [
    item('N-01', 'core_loop', crit('blocking', 'blocking', 'optional'), '核心深度或强度达到窄众要求',
      { kind: 'depthAtLeast', level: 'deep', alternativeMinIntensity: -1 }, ['ACT-DEEPEN-CORE', 'ACT-ABANDON']),
    item('N-02', 'core_loop', crit('blocking', 'expected', 'optional'), '卖点由核心玩法支撑',
      { kind: 'uspBackedBy', slotKind: 'core_loop' }, ['ACT-REWORK-USP-CORE', 'ACT-ABANDON']),
    item('N-03', 'content', crit('expected', 'expected', 'optional'), '内容档位达到窄众要求',
      { kind: 'contentTierAtLeast', minTier: -1 }, ['ACT-EXPAND-CONTENT', 'ACT-ABANDON']),
  ]
}

function technicalItems(form: DeliveryForm): ChecklistItem[] {
  const crit = (full: ChecklistItem['criticality'], ea: ChecklistItem['criticality'], demo: ChecklistItem['criticality']) =>
    form === 'full' ? full : form === 'early_access' ? ea : demo
  return [
    // T-01 例外：对 demo 仍为 blocking（§5.3：技术型试玩若技术门槛未闭合则无法运行）。
    item('T-01', 'tech', crit('blocking', 'blocking', 'blocking'), '交付时全部技术门槛已闭合（T_unsat = ∅）',
      { kind: 'techGatesSatisfied', domainSet: 'all' }, ['ACT-CLOSE-TECHGATES', 'ACT-ABANDON']),
    item('T-02', 'tech', crit('blocking', 'expected', 'optional'), 'E 级缺陷为零（D 级待 QA 枚举定义后升 formulaVersion，D02-12）',
      { kind: 'defectFree', severitySet: ['E'] }, ['ACT-FIX-DEFECTS', 'ACT-ABANDON']),
    item('T-03', 'content', crit('expected', 'expected', 'optional'), '内容档位达到技术型要求',
      { kind: 'contentTierAtLeast', minTier: -1 }, ['ACT-EXPAND-CONTENT', 'ACT-ABANDON']),
  ]
}

/** 用注入 TUNING 值回填清单谓词中的阈值参数（模板值 -1 为占位，构建时替换）。 */
function applyThresholds(items: ChecklistItem[], tuning: CompletenessTuning): ChecklistItem[] {
  return items.map((it) => {
    const p = it.predicate
    if (p.kind === 'contentTierAtLeast') {
      const tier =
        it.itemId === 'B-01' ? tuning.tBroadContent
        : it.itemId === 'N-03' ? tuning.tNicheContent
        : tuning.tTechContent
      return { ...it, predicate: { kind: 'contentTierAtLeast', minTier: tier } }
    }
    if (p.kind === 'segmentCovered') {
      return { ...it, predicate: { kind: 'segmentCovered', threshold: tuning.tauCoverBroad } }
    }
    if (p.kind === 'depthAtLeast') {
      return { ...it, predicate: { kind: 'depthAtLeast', level: p.level, alternativeMinIntensity: tuning.tauNicheDeep } }
    }
    return it
  })
}

function classItemsFor(archetypeClass: ArchetypeClass, form: DeliveryForm): ChecklistItem[] {
  switch (archetypeClass) {
    case 'broad': return broadItems(form)
    case 'niche': return nicheItems(form)
    case 'technical': return technicalItems(form)
    case 'generic': return []
  }
}

/** §5.3 demo 子集：C-01/C-02/C-04/C-05（C-03 不入 demo 子集，见文件头待裁定登记）。 */
function demoCommonItems(): ChecklistItem[] {
  return commonItems().filter((it) => it.itemId !== 'C-03')
}

/**
 * 构建 P1 全量清单模板：4 类 × 3 形式 = 12 份（state=active，同一 (class, form) 恰一份，§4.4）。
 * threshold 参数由注入 tuning 回填（S9 参数快照与 formulaVersion 绑定）。
 */
export function buildP1ChecklistTemplates(tuning: CompletenessTuning): CompletenessChecklist[] {
  const templates: CompletenessChecklist[] = []
  for (const archetypeClass of ARCHETYPE_CLASSES) {
    for (const form of DELIVERY_FORMS) {
      const base = form === 'demo' ? demoCommonItems() : commonItems()
      const items = applyThresholds([...base, ...classItemsFor(archetypeClass, form)], tuning)
      templates.push({
        checklistId: `D02-CL-${archetypeClass}-${form}`,
        archetypeClass,
        deliveryForm: form,
        items,
        templateRevision: 1,
        // S9：模板与 TUNING 参数快照共用同一 formulaVersion 键。
        formulaVersion: tuning.formulaVersion,
        state: 'active',
      })
    }
  }
  validateChecklistTemplates(templates)
  return templates
}

/**
 * 结构校验（任务卡 §2-5）：每类 × 每形式恰一份模板且至少 1 条 blocking 项；
 * itemId 唯一；gapActionIds 至少 1 个；criticality/category 合法。
 * 违反抛 D02-TEMPLATE-INVALID（fail-closed，不得带坏模板求值）。
 */
export function validateChecklistTemplates(templates: readonly CompletenessChecklist[]): void {
  const seen = new Set<string>()
  for (const t of templates) {
    const key = `${t.archetypeClass}|${t.deliveryForm}`
    if (seen.has(key)) {
      throw new CompletenessDomainError(
        D02_IMPL_ERROR.TEMPLATE_INVALID,
        `Duplicate active checklist template for (${key}); at most one active per (archetypeClass, deliveryForm) (§4.4).`,
      )
    }
    seen.add(key)
    if (t.items.length === 0) {
      throw new CompletenessDomainError(
        D02_IMPL_ERROR.TEMPLATE_INVALID,
        `Checklist ${t.checklistId} has no items.`,
      )
    }
    const ids = new Set<string>()
    let blockingCount = 0
    for (const it of t.items) {
      if (ids.has(it.itemId)) {
        throw new CompletenessDomainError(
          D02_IMPL_ERROR.TEMPLATE_INVALID,
          `Duplicate itemId ${it.itemId} in checklist ${t.checklistId}.`,
        )
      }
      ids.add(it.itemId)
      if (it.criticality === 'blocking') blockingCount += 1
      if (it.gapActionIds.length === 0) {
        throw new CompletenessDomainError(
          D02_IMPL_ERROR.TEMPLATE_INVALID,
          `Item ${it.itemId} in ${t.checklistId} has empty gapActionIds; auto-remediation is forbidden (R-D02-3).`,
        )
      }
    }
    if (blockingCount < 1) {
      throw new CompletenessDomainError(
        D02_IMPL_ERROR.TEMPLATE_INVALID,
        `Checklist ${t.checklistId} must contain at least 1 blocking item (task CODE-05 §2-5).`,
      )
    }
  }
}

/** 取指定 (archetypeClass, form) 的 active 模板；缺失 fail-closed 抛错。 */
export function getActiveChecklist(
  templates: readonly CompletenessChecklist[],
  archetypeClass: ArchetypeClass,
  form: DeliveryForm,
): CompletenessChecklist {
  const found = templates.find(
    (t) => t.archetypeClass === archetypeClass && t.deliveryForm === form && t.state === 'active',
  )
  if (found === undefined) {
    throw new CompletenessDomainError(
      D02_IMPL_ERROR.TEMPLATE_MISSING,
      `No active checklist template for (${archetypeClass}, ${form}).`,
    )
  }
  return found
}

// ===== §3.4 DeliveryForm 标准（三形式，不新增枚举值；三形式 disclosurePolicy 均 required） =====

/** D02-10（C8）定型：档位统一 {low, medium, high} 状态档；见实施报告登记。 */
export const DELIVERY_FORM_STANDARDS: readonly DeliveryFormStandard[] = [
  {
    form: 'full',
    label: '正式版',
    requiredCriticality: ['blocking', 'expected'],
    disclosurePolicy: 'required',
    expectationPolicy: { expectationBand: 'high', refundRiskBand: 'low', brandImpactBand: 'high' },
    allowsUpgradeTo: null,
  },
  {
    form: 'early_access',
    label: '抢先体验版',
    requiredCriticality: ['blocking'],
    disclosurePolicy: 'required',
    expectationPolicy: { expectationBand: 'medium', refundRiskBand: 'medium', brandImpactBand: 'medium' },
    allowsUpgradeTo: 'full',
  },
  {
    form: 'demo',
    label: '试玩版',
    requiredCriticality: 'demo_subset',
    disclosurePolicy: 'required',
    expectationPolicy: { expectationBand: 'low', refundRiskBand: 'low', brandImpactBand: 'low' },
    allowsUpgradeTo: null,
  },
]

/** §6.6 requiredFor(form)：full={blocking,expected}；EA={blocking}；demo=demo 清单项中标注的 criticality。 */
export function requiredCriticalitiesFor(
  form: DeliveryForm,
  demoChecklist?: CompletenessChecklist,
): readonly ChecklistItem['criticality'][] {
  if (form === 'full') return ['blocking', 'expected']
  if (form === 'early_access') return ['blocking']
  const crits = demoChecklist?.items.map((it) => it.criticality) ?? ['blocking', 'optional']
  return [...new Set(crits)]
}
