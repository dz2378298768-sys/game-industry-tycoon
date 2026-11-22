/**
 * D-02 §3.3 谓词求值器：P1 固定词表 9 个谓词，全部对 EvaluationContext 确定性求值（纯函数，S6）。
 *
 * 两条铁律（任务卡 §2-2 / §6 风险提示）：
 *  1. 未知谓词必须 fail-closed：词表外 kind 抛 UnknownPredicateError，绝不静默返回 true/false。
 *  2. 「数据缺失」≠「未知谓词」：缺数据按 §6.7 边界返回布尔（如 slotActive 快照无该槽：
 *     minCount=0 ⇒ true（0 ≥ 0），否则 false），不得抛错。
 *
 * 共享输入、用途隔离（IND-1 修订口径）：谓词只读快照/画像/缺陷事实，不产出质量分数；
 * 完整度分量由 §6.3 覆盖向量给出（gate.ts）。
 */
import type {
  ChecklistPredicate,
  EvaluationContext,
  ModuleContribution,
} from '@domain/entities/product-completeness'
import { UnknownPredicateError } from '@domain/entities/product-completeness'
import type { ModuleInstance, SlotKind } from '@domain/entities/product-blueprint'
import {
  activeInstanceCountInSlotKind,
  activeCoreLoopInstances,
  resolveMarketProfile,
  slotKindOf,
  unsatisfiedTechGates,
} from './product-completeness-classification'

const DEPTH_RANK: Record<string, number> = { shallow: 0, standard: 1, deep: 2 }

function instanceById(ctx: EvaluationContext, instanceId: string): ModuleInstance | null {
  return ctx.snapshot.frozenBlueprint.instances.find((i) => i.instanceId === instanceId) ?? null
}

/** content 槽绑定的内容包（active 实例 → contentPackId → ContentPack）。 */
function boundContentTiers(ctx: EvaluationContext): number[] {
  const packsById = new Map(ctx.snapshot.frozenBlueprint.contentPacks.map((p) => [p.packId, p]))
  const contentSlots = ctx.snapshot.frozenBlueprint.slots.filter((s) => s.isContentSlot)
  const tiers: number[] = []
  for (const slot of contentSlots) {
    for (const bindingId of slot.bindings) {
      const inst = instanceById(ctx, bindingId)
      if (inst === null || inst.state !== 'active' || inst.contentPackId === null) continue
      const pack = packsById.get(inst.contentPackId)
      if (pack !== undefined) tiers.push(pack.tier)
    }
  }
  return tiers
}

/**
 * uspBackedBy 的贡献路径：每条 sellingPoint 须被「该槽种类内 present 实例」支撑
 * （外层 ∀ u ∈ sellingPoints，§6.6 约束 4 内层语义）。无该槽 present 实例 ⇒ false
 * （卖点未被该槽支撑，N-02 的语义要求严格判定）。
 */
function uspSupportedBySlotKindViaContributions(
  ctx: EvaluationContext,
  slotKind: SlotKind,
): boolean {
  const sellingPoints = ctx.snapshot.frozenBlueprint.positioning.sellingPoints
  const contributions: ModuleContribution[] = ctx.moduleContributions.filter((c) => {
    if (c.status !== 'present') return false
    return slotKindOf(ctx, c.slotId) === slotKind
  })
  if (contributions.length === 0) return false
  return sellingPoints.every((u) =>
    contributions.some((c) => c.signals.uspSupported[u] === true),
  )
}

/** 产品级回退（简化求值路径，P6/TC-14）：画像 uspSupported 全真 ⇒ 支持；|sellingPoints|=0 ⇒ 通过。 */
function uspBackedByProductLevel(ctx: EvaluationContext): boolean {
  const sellingPoints = ctx.snapshot.frozenBlueprint.positioning.sellingPoints
  if (sellingPoints.length === 0) return true
  const profile = resolveMarketProfile(ctx)
  const map = profile?.uspSupported ?? {}
  return sellingPoints.every((u) => map[u] === true)
}

function uspBackedBy(ctx: EvaluationContext, slotKind: SlotKind | 'any'): boolean {
  const sellingPoints = ctx.snapshot.frozenBlueprint.positioning.sellingPoints
  if (sellingPoints.length === 0) return true

  if (ctx.moduleContributions.length === 0) {
    // 无贡献记录：按产品级画像求值（P6 简化求值；与完整路径同真值，TC-14 验证）。
    return uspBackedByProductLevel(ctx)
  }
  if (slotKind === 'any') {
    // ∃ slotKind: uspBackedBy(slotKind)（§6.6 约束 4 外层存在量词）。
    const kinds = new Set<SlotKind>(
      ctx.snapshot.frozenBlueprint.slots.map((s) => s.slotKind),
    )
    for (const kind of kinds) {
      if (uspSupportedBySlotKindViaContributions(ctx, kind) === true) return true
    }
    return false
  }
  return uspSupportedBySlotKindViaContributions(ctx, slotKind)
}

/** 平台技术标准：全部 gate 满足（minCapabilityLevel=0 恒满足）；平台不存在 ⇒ false。 */
function platformStdMet(ctx: EvaluationContext, platformId: string): boolean {
  const platform = ctx.platforms.find((p) => p.platformId === platformId)
  if (platform === undefined) return false
  return platform.techStandards.every(
    (gate) => (ctx.capabilities[gate.domainId] ?? 0) >= gate.minCapabilityLevel,
  )
}

/**
 * 求值一个谓词 → boolean。纯函数：同输入同输出（G1 / S6）。
 * 词表外 kind fail-closed 抛错。TUNING 阈值已在模板构建期烘焙进谓词参数（applyThresholds），
 * 故求值只需谓词 + 上下文。
 */
export function evaluatePredicate(
  predicate: ChecklistPredicate,
  ctx: EvaluationContext,
): boolean {
  const frozen = ctx.snapshot.frozenBlueprint

  switch (predicate.kind) {
    case 'slotActive': {
      // §6.7 数据缺失：快照无该槽 ⇒ count=0；minCount=0 ⇒ 0≥0 通过，否则 false。
      return activeInstanceCountInSlotKind(ctx, predicate.slotKind) >= predicate.minCount
    }

    case 'contentTierAtLeast': {
      const tiers = boundContentTiers(ctx)
      if (tiers.length === 0) return false
      return Math.max(...tiers) >= predicate.minTier
    }

    case 'techGatesSatisfied': {
      const unsat = unsatisfiedTechGates(ctx)
      if (predicate.domainSet === 'all') return unsat.length === 0
      const domainSet = new Set(predicate.domainSet)
      return unsat.every((gate) => !domainSet.has(gate.domainId))
    }

    case 'segmentCovered': {
      const profile = resolveMarketProfile(ctx)
      const affinity = profile?.affinity ?? {}
      if (predicate.tag !== undefined) {
        return (affinity[predicate.tag] ?? 0) >= predicate.threshold
      }
      // tag 缺省 = B-03 全称量词 ∀tag ∈ targetSegmentClaims；空宣称集 vacuous true。
      const claims = frozen.positioning.targetSegmentClaims
      return claims.every((tag) => (affinity[tag] ?? 0) >= predicate.threshold)
    }

    case 'uspBackedBy': {
      return uspBackedBy(ctx, predicate.slotKind)
    }

    case 'defectFree': {
      const severitySet = new Set(predicate.severitySet)
      return !ctx.defects.some((d) => severitySet.has(d.severity))
    }

    case 'platformStdMet': {
      if (predicate.platformId === 'any') {
        // ∃ platformId（§6.6 约束 4）：目标平台中存在一个标准满足。
        return frozen.positioning.platformTargets.some((pid) => platformStdMet(ctx, pid))
      }
      return platformStdMet(ctx, predicate.platformId)
    }

    case 'fieldNonEmpty': {
      // 字段缺失按数据缺失处理（false），不抛错。
      const value = ctx.productFields[predicate.field]
      return typeof value === 'string' && value.trim() !== ''
    }

    case 'depthAtLeast': {
      const cores = activeCoreLoopInstances(ctx)
      if (cores.length === 0) return false
      const maxDepthRank = Math.max(...cores.map((i) => DEPTH_RANK[i.depthSelection] ?? 0))
      if (maxDepthRank >= (DEPTH_RANK[predicate.level] ?? 0)) return true
      // N-01「或」分支：core intensity ≥ alternativeMinIntensity（§6.6 约束 1 聚合）。
      if (predicate.alternativeMinIntensity !== undefined) {
        return Math.max(...cores.map((i) => i.intensity)) >= predicate.alternativeMinIntensity
      }
      return false
    }

    default: {
      // fail-closed：词表外谓词抛错，绝不静默返回 true/false（任务卡验收项）。
      throw new UnknownPredicateError((predicate as { kind?: string }).kind ?? String(predicate))
    }
  }
}

/** 求值一批谓词，全部为 true 才通过（供清单项批量判定复用）。 */
export function evaluatePredicates(
  predicates: readonly ChecklistPredicate[],
  ctx: EvaluationContext,
): boolean {
  return predicates.every((p) => evaluatePredicate(p, ctx))
}
