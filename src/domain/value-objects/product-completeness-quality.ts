/**
 * D-02 §6.1 设计质量 DesignQuality / §6.2 实现质量 ImplementationQuality。
 *
 * 红线：输出为向量，无总分（R-D02-0）；实现质量任何一维不反向影响 DQ，也不影响 W_d。
 * 输入隔离（IND-1 修订口径）：DQ 只由快照/设计画像导出；IQ 只由 QA/Project 执行事实导出；
 * DQ 与 C 共享只读快照、IQ 与 C 共享 QA 缺陷事实，但用途隔离，无输入混合公式。
 *
 * 边界（§6.7）：M_active=∅ → structure=0、experiencePotential=0；|sellingPoints|=0 → uspSupportRatio=0；
 * plannedTier=0 → contentFidelity=1；costEst=0 → deliveryAdherence=UNAVAILABLE_P1；
 * innovation 在 P1 恒 UNAVAILABLE_P1（OPEN-D02-O4），不是 0、不是 1。
 */
import type {
  DesignQuality,
  EvaluationContext,
  ImplementationQuality,
  UnavailableP1,
} from '@domain/entities/product-completeness'
import { resolveMarketProfile, activeSnapshotInstances } from './product-completeness-classification'
import type { CompletenessTuning } from './product-completeness-tuning'

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** §6.7 plannedTier 推导：快照内容槽绑定内容包 tier 之和（buildFacts.plannedTier 优先，OPEN-D02-O5）。 */
export function derivePlannedTier(ctx: EvaluationContext): number {
  if (ctx.buildFacts?.plannedTier !== undefined) return ctx.buildFacts.plannedTier
  return deriveSnapshotContentTier(ctx.snapshot)
}

export function deriveSnapshotContentTier(snapshot: EvaluationContext['snapshot']): number {
  const { contentPacks, slots, instances } = snapshot.frozenBlueprint
  const packsById = new Map(contentPacks.map((p) => [p.packId, p]))
  const contentSlots = slots.filter((s) => s.isContentSlot)
  let sum = 0
  for (const slot of contentSlots) {
    for (const bindingId of slot.bindings) {
      const inst = instances.find((i) => i.instanceId === bindingId)
      if (inst === undefined || inst.state !== 'active' || inst.contentPackId === null) continue
      const pack = packsById.get(inst.contentPackId)
      if (pack !== undefined) sum += pack.tier
    }
  }
  return sum
}

/**
 * §6.1 设计质量：只由快照 + D-01 只读画像导出（D-02 不重算市场画像）。
 * a_i = Σ_{tag ∈ targetSegmentClaims} audienceAffinity_i[tag]（缺键取 0，D-01 §6.5）；
 * w_int(i) = ModuleTemplate.affinityIntensity[i.intensity]（缺省用注入默认表）。
 */
export function computeDesignQuality(
  ctx: EvaluationContext,
  tuning: CompletenessTuning,
): DesignQuality {
  const frozen = ctx.snapshot.frozenBlueprint
  const positioning = frozen.positioning

  // structure = filledRequiredSlots / max(1, |requiredSlots|)；空设计=0。
  const requiredSlots = frozen.slots.filter((s) => s.requiredForType)
  const activeIds = new Set(activeSnapshotInstances(ctx).map((i) => i.instanceId))
  const filled = requiredSlots.filter((s) => s.bindings.some((id) => activeIds.has(id))).length
  const structure = filled / Math.max(1, requiredSlots.length)

  // innovation：P1 恒 UNAVAILABLE_P1（OPEN-D02-O4）；archiveSimilarity 输入位保留但 P1 不消费。
  const innovation: UnavailableP1 = 'unavailable_p1'

  // experiencePotential = clamp(Σ a_i × w_int(i) × w_depth(i) / (k_exp × |M_active|), 0, 1)；|M_active|=0 → 0。
  const actives = activeSnapshotInstances(ctx)
  let expSum = 0
  for (const inst of actives) {
    const template = ctx.templatesById[inst.templateId]
    let a = 0
    for (const tag of positioning.targetSegmentClaims) {
      a += template?.audienceAffinity[tag] ?? 0
    }
    const wInt = template?.affinityIntensity[inst.intensity] ?? tuning.defaultAffinityIntensity[inst.intensity] ?? 1
    const wDepth = tuning.wDepth[inst.depthSelection]
    expSum += a * wInt * wDepth
  }
  const experiencePotential = actives.length === 0
    ? 0
    : clamp01(expSum / (tuning.kExp * actives.length))

  // marketFit = clamp(w₁·positioningFit + w₂·genreFit + w₃·uspSupportRatio, 0, 1)。
  const profile = resolveMarketProfile(ctx)
  const positioningFit = profile?.positioningFit ?? 0
  const genreFit = profile?.genreFit ?? 0
  const uspSupportedMap = profile?.uspSupported ?? {}
  const supportedCount = positioning.sellingPoints.filter((u) => uspSupportedMap[u] === true).length
  const uspSupportRatio = supportedCount / Math.max(1, positioning.sellingPoints.length)
  const w = tuning.marketFitWeights
  const marketFit = clamp01(w.positioning * positioningFit + w.genre * genreFit + w.usp * uspSupportRatio)

  return { structure, innovation, experiencePotential, marketFit }
}

/**
 * §6.2 实现质量：只由 QA/Project 执行事实导出。
 * R_tech_delivery := R_tech(权威快照, 交付时)（D02-15 派生关系：D-01 §6.4 当前值）。
 * 缺陷负载未知严重度权重按 0 计（严重度枚举 OPEN-D02-O2；E 级阻断由 defectFree({E}) 独立执行）。
 */
export function computeImplementationQuality(
  ctx: EvaluationContext,
  tuning: CompletenessTuning,
): ImplementationQuality {
  // stability = 1 − R_tech_delivery；T_unsat=∅ → 1（rTech ∈ [0,1]，D-01 §6.4）。
  const rTechDelivery = ctx.snapshot.estimates?.techRisk.rTech ?? 0
  const stability = 1 - rTechDelivery

  // contentFidelity：plannedTier=0 → 1；deliveredTier 未知 → UNAVAILABLE_P1（不伪造 0）。
  const plannedTier = derivePlannedTier(ctx)
  const deliveredTier = ctx.buildFacts?.deliveredTier ?? null
  const contentFidelity: number | UnavailableP1 =
    plannedTier === 0
      ? 1
      : deliveredTier === null
        ? 'unavailable_p1'
        : clamp01(deliveredTier / plannedTier)

  // defectLoad = clamp(1 − Σ w_def[sev]·n_sev / k_defectNorm, 0, 1)。
  const counts = new Map<string, number>()
  for (const d of ctx.defects) counts.set(d.severity, (counts.get(d.severity) ?? 0) + 1)
  let weighted = 0
  for (const [sev, n] of counts) weighted += (tuning.wDef[sev] ?? 0) * n
  const defectLoad = clamp01(1 - weighted / tuning.kDefectNorm)

  // deliveryAdherence：costEst=0 或实际成本未知 → UNAVAILABLE_P1（§6.7）。
  const facts = ctx.buildFacts
  const deliveryAdherence: number | UnavailableP1 =
    facts === null || facts.costEst === null || facts.costEst === 0 || facts.actualCost === null
      ? 'unavailable_p1'
      : clamp01(1 - Math.abs(facts.actualCost - facts.costEst) / facts.costEst)

  return { stability, contentFidelity, defectLoad, deliveryAdherence }
}
