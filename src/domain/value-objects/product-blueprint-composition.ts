/**
 * D-01 §5 组合规则与 §5.4 依赖/冲突判定算法（R1）。
 *
 * 输入：active 的 ModuleInstance 集合 M、optionSelections、positioning（§5.4）。
 * 求解顺序固定（确定性）：硬冲突 → 软冲突 → RequireRule(severity 降序) → 传递闭包环检测 → ViolationSet。
 * 依赖只检查不自动补全（§5.4 DESIGN_BASELINE）。
 */
import type {
  BlueprintViolation,
  FrozenBlueprint,
  ModuleInstance,
  ModuleTemplate,
} from '@domain/entities/product-blueprint'
import { makeViolation } from './product-blueprint-violation'
import { activeInstances, selectedOptions } from './product-blueprint-estimation'
import type { BlueprintTuning } from './product-blueprint-tuning'

/** §4.8 规则实体选择器。 */
export interface RuleSelector {
  kind: 'template' | 'tag' | 'option' | 'usp'
  value: string
}

/** §4.8 CombineRule。 */
export interface CombineRule {
  ruleId: string
  whenTags: string[]
  allow: boolean
  addWorkMultiplier: number
  note: string
}

/** §4.8 RequireRule。 */
export interface RequireRule {
  ruleId: string
  subject: RuleSelector
  requires: RuleSelector[]
  severity: 'hard' | 'soft'
  penalty: number
}

/** §4.8 ConflictRule。 */
export interface ConflictRule {
  ruleId: string
  a: RuleSelector
  b: RuleSelector
  severity: 'hard' | 'soft'
  reason: string
  penalty: number
}

export interface CompositionRules {
  combineRules: CombineRule[]
  requireRules: RequireRule[]
  conflictRules: ConflictRule[]
}

export interface CompositionResult {
  violations: BlueprintViolation[]
  /** §6.4 R_synergy 输入：Σ soft conflict penalty + Σ W-DEP penalty。 */
  penaltySum: number
}

interface InstanceView {
  instance: ModuleInstance
  template: ModuleTemplate
  optionIds: string[]
}

function buildViews(structure: FrozenBlueprint, templatesById: Record<string, ModuleTemplate>): InstanceView[] {
  const views: InstanceView[] = []
  for (const instance of activeInstances(structure)) {
    const template = templatesById[instance.templateId]
    if (template === undefined) continue
    views.push({
      instance,
      template,
      optionIds: selectedOptions(instance, template).map((o) => o.optionId),
    })
  }
  return views
}

function matches(selector: RuleSelector, view: InstanceView): boolean {
  switch (selector.kind) {
    case 'template': return view.instance.templateId === selector.value
    case 'tag': return view.template.combineTags.includes(selector.value)
    case 'option': return view.optionIds.includes(selector.value)
    case 'usp': return view.template.uspIds.includes(selector.value)
  }
}

function supports(selector: RuleSelector, views: InstanceView[]): boolean {
  // §5.4 R1 exists_active_support：template/tag/option 三类；usp 复用卖点支撑语义。
  return views.some((v) => matches(selector, v))
}

function nodeKey(selector: RuleSelector): string {
  return `${selector.kind}:${selector.value}`
}

/**
 * §5.4 第 4 步：RequireRule 传递闭包的环检测。
 * 构建「主体 → 被依赖方」有向图（节点为 active subject），DFS 找环并返回路径。
 */
function findDependencyCycle(rules: RequireRule[], views: InstanceView[]): string[] | null {
  const graph = new Map<string, string[]>()
  for (const rule of rules) {
    for (const view of views) {
      if (!matches(rule.subject, view)) continue
      const from = nodeKey(rule.subject)
      const edges = graph.get(from) ?? []
      for (const req of rule.requires) {
        if (supports(req, views)) {
          const to = nodeKey(req)
          if (!edges.includes(to)) edges.push(to)
        }
      }
      graph.set(from, edges)
    }
  }

  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []
  let cycle: string[] | null = null

  const visit = (node: string): void => {
    if (cycle !== null) return
    color.set(node, GREY)
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if ((color.get(next) ?? WHITE) === GREY) {
        cycle = [...stack.slice(stack.indexOf(next)), next]
        return
      }
      if ((color.get(next) ?? WHITE) === WHITE) visit(next)
      if (cycle !== null) return
    }
    stack.pop()
    color.set(node, BLACK)
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) visit(node)
    if (cycle !== null) break
  }
  return cycle
}

/**
 * §5.3 / §5.4 组合判定总入口。
 */
export function checkCompositionRules(
  structure: FrozenBlueprint,
  templatesById: Record<string, ModuleTemplate>,
  rules: CompositionRules,
  tuning: BlueprintTuning,
  pendingIncompatibleInstanceIds: string[] = [],
): CompositionResult {
  const violations: BlueprintViolation[] = []
  let penaltySum = 0
  const views = buildViews(structure, templatesById)
  const active = activeInstances(structure)

  // §5.3-1 槽位容量（硬）；§5.3-2 域接受（硬，R-MOD-1）
  for (const slot of structure.slots) {
    const bindings = slot.bindings.filter((id) => active.some((i) => i.instanceId === id))
    if (bindings.length > slot.maxInstances) {
      violations.push(makeViolation(
        'E-CONFLICT', 'E', 'R-MOD-1', [slot.slotId],
        `槽位 ${slot.slotId} 绑定数 ${bindings.length} 超过上限 ${slot.maxInstances}`, '减少实例或停用',
      ))
    }
    for (const id of bindings) {
      const instance = active.find((i) => i.instanceId === id)
      if (instance !== undefined && !slot.domainAcceptance.includes(instance.domain)) {
        violations.push(makeViolation(
          'E-CONFLICT', 'E', 'R-MOD-1', [id, slot.slotId],
          `实例 ${id} 的域 ${instance.domain} 不在槽位接受域内`, '替换模块实例',
        ))
      }
    }
  }

  // §11 E-1：必选槽为空
  for (const slot of structure.slots) {
    if (!slot.requiredForType) continue
    const hasActive = slot.bindings.some((id) => active.some((i) => i.instanceId === id))
    if (!hasActive) {
      violations.push(makeViolation('E-EMPTY', 'E', 'E-EMPTY', [slot.slotId], `必选槽 ${slot.slotId} 为空`, '装配模块到必选槽'))
    }
  }

  // §11 E-15：content 槽必须绑定 ContentPack
  for (const slot of structure.slots) {
    if (!slot.isContentSlot) continue
    const hasPack = slot.bindings.some((id) => {
      const instance = active.find((i) => i.instanceId === id)
      return instance !== undefined && instance.contentPackId !== null
    })
    if (!hasPack) {
      violations.push(makeViolation('E-EMPTY-CONTENT', 'E', 'E-EMPTY-CONTENT', [slot.slotId], `内容槽 ${slot.slotId} 未绑定内容包`, '绑定 ContentPack'))
    }
  }

  // §4.10 R-OPT-1 / §11 E-16：required 选项组必须选一项
  for (const view of views) {
    for (const group of view.template.optionGroups) {
      if (!group.required) continue
      if (view.instance.optionSelections[group.optionGroupId] === undefined) {
        violations.push(makeViolation(
          'E-OPT', 'E', 'R-OPT-1', [view.instance.instanceId, group.optionGroupId],
          `必填选项组 ${group.optionGroupId} 未选择`, '选择一个选项',
        ))
      }
    }
  }

  // §5.4 第 1/2 步：HardConflict → E-CONFLICT；SoftConflict → W-CONFLICT + penalty
  for (const rule of rules.conflictRules) {
    for (let i = 0; i < views.length; i += 1) {
      for (let j = i + 1; j < views.length; j += 1) {
        const a = views[i]!, b = views[j]!
        const hit = (matches(rule.a, a) && matches(rule.b, b)) || (matches(rule.a, b) && matches(rule.b, a))
        if (!hit) continue
        const ids = [a.instance.instanceId, b.instance.instanceId]
        if (rule.severity === 'hard') {
          violations.push(makeViolation('E-CONFLICT', 'E', rule.ruleId, ids, rule.reason, '替换其中一个模块'))
        } else {
          penaltySum += rule.penalty
          violations.push(makeViolation('W-CONFLICT', 'W', rule.ruleId, ids, rule.reason, '接受软冲突风险或替换'))
        }
      }
    }
  }

  // §5.4 第 3 步：RequireRule，按 severity 降序（hard 先）
  const sortedRules = [...rules.requireRules].sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'hard' ? -1 : 1))
  for (const rule of sortedRules) {
    for (const view of views) {
      if (!matches(rule.subject, view)) continue
      const unmet = rule.requires.filter((req) => !supports(req, views))
      if (unmet.length === 0) continue
      const ids = [view.instance.instanceId, ...unmet.map(nodeKey)]
      if (rule.severity === 'hard') {
        violations.push(makeViolation('E-DEP', 'E', rule.ruleId, ids, `依赖未满足：${unmet.map(nodeKey).join(', ')}`, '装配被依赖模块（不自动补全）'))
      } else {
        penaltySum += rule.penalty
        violations.push(makeViolation('W-DEP', 'W', rule.ruleId, ids, `软依赖未满足：${unmet.map(nodeKey).join(', ')}`, '接受风险或装配被依赖模块'))
      }
    }
  }

  // §5.4 第 4 步：传递闭包环 → E-CYCLE（列出环路径）
  const cycle = findDependencyCycle(rules.requireRules, views)
  if (cycle !== null) {
    violations.push(makeViolation('E-CYCLE', 'E', 'E-CYCLE', cycle, `依赖环：${cycle.join(' → ')}`, '打破环（不自动打破）'))
  }

  // §5.4 R-COM-7 / §11 E-9：卖点支撑（三处闸门均执行；此处为唯一实现）
  const uspSupported = new Map<string, boolean>()
  for (const usp of structure.positioning.sellingPoints) {
    const supported = views.some((v) => matches({ kind: 'usp', value: usp }, v))
    uspSupported.set(usp, supported)
    if (!supported) {
      violations.push(makeViolation('E-USP', 'E', 'R-COM-7', [usp], `卖点 ${usp} 无 active 模块/选项支撑`, '装配支撑模块或更换卖点'))
    }
  }

  // §11 E-19：不兼容模块未处理
  if (pendingIncompatibleInstanceIds.length > 0 && pendingIncompatibleInstanceIds.length <= tuning.kBatchLimit) {
    violations.push(makeViolation(
      'E-INCOMPAT', 'E', 'E-INCOMPAT', [...pendingIncompatibleInstanceIds],
      `待处理不兼容模块 ${pendingIncompatibleInstanceIds.length} 个（上限 ${tuning.kBatchLimit}）`, '替换/停用/清空草稿',
    ))
  } else if (pendingIncompatibleInstanceIds.length > tuning.kBatchLimit) {
    violations.push(makeViolation(
      'E-INCOMPAT', 'E', 'E-INCOMPAT', pendingIncompatibleInstanceIds.slice(0, tuning.kBatchLimit),
      `待处理不兼容模块超过单批上限 ${tuning.kBatchLimit}，需分批处理`, '分批处理',
    ))
  }

  return { violations, penaltySum }
}
