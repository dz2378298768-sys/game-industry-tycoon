/**
 * D-01 §6 四通道估算：workUnits / skillDemand / techRisk / marketFit。
 *
 * 红线（T2 / §6.1）：四个通道互不合成单一分数；本文件不存在 compositeScore / designValue 字段。
 * 所有 TUNING/OPEN 量化项从 BlueprintTuning 注入（§6.7），公式层不读取全局 TUNING。
 * 所有公式纯函数；除零边界按 §6.2/§6.3/§6.5 处理。
 *
 * 符号表见 §6.7；输出区间见 §6（Δ_base 注入为 tuning.uncertaintyDelta）。
 */
import {
  BLUEPRINT_DISCIPLINES,
  GAMEPLAY_DOMAINS,
} from '@domain/entities/product-blueprint'
import type {
  BlueprintDiscipline,
  BlueprintOption,
  EstimateBundle,
  EstimateRange,
  FrozenBlueprint,
  GameplayArchetype,
  MarketFitChannel,
  ModuleInstance,
  ModuleTemplate,
  QualityBand,
  SkillDemandChannel,
  TechGate,
  TechRiskChannel,
  WorkUnitChannel,
} from '@domain/entities/product-blueprint'
import type { BlueprintTuning } from './product-blueprint-tuning'

/** §6.4 门槛集合的外部输入：D-06 capability、平台技术标准、§5.4 软冲突 penalty 均由调用方注入。 */
export interface EstimationInput {
  structure: FrozenBlueprint
  templatesById: Record<string, ModuleTemplate>
  /** primaryType 对应 GameplayArchetype；缺失时 genreFit 取 0（§6.5 零向量边界）。 */
  archetype: GameplayArchetype | null
  /** capability(domain) → int ≥ 0，由 D-06 提供。 */
  capabilities: Record<string, number>
  /** platform.techStandards，平台系统输入；P1 种子为 []。 */
  platformTechStandards: TechGate[]
  /** §6.4 R_synergy 的 penalty_sum（来自 §5.4 W-CONFLICT / W-DEP）。 */
  synergyPenaltySum: number
}

function zeroDisciplineMap(): Record<BlueprintDiscipline, number> {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
}

function rangeFor(mid: number, delta: number): EstimateRange {
  const low = Math.max(0, mid * (1 - delta))
  return { low, mid, high: mid * (1 + delta) }
}

/** §4.5 M_active = state=active 的 ModuleInstance 集合；deactivated 贡献 0（§6.2）。 */
export function activeInstances(structure: FrozenBlueprint): ModuleInstance[] {
  return structure.instances.filter((i) => i.state === 'active')
}

/** §4.10 selectedOptions(i)：optionSelections 的所有 value 对应的 Option。 */
export function selectedOptions(instance: ModuleInstance, template: ModuleTemplate): BlueprintOption[] {
  const out: BlueprintOption[] = []
  for (const group of template.optionGroups) {
    const optionId = instance.optionSelections[group.optionGroupId]
    if (optionId === undefined) continue
    const option = group.options.find((o) => o.optionId === optionId)
    if (option !== undefined) out.push(option)
  }
  return out
}

/** §6.2 ① 工作量 W_d。HRB 不在本公式中（ADJ-2026-11-21-01 / R-08）。 */
export function estimateWorkUnits(input: EstimationInput, tuning: BlueprintTuning): WorkUnitChannel {
  const { structure, templatesById } = input
  const active = activeInstances(structure)
  const raw = zeroDisciplineMap()
  const drivers: Array<{ label: string; value: number }> = []
  const tags: string[] = []

  for (const instance of active) {
    const template = templatesById[instance.templateId]
    if (template === undefined) continue
    const intensityMultiplier = template.intensityCurve[instance.intensity] ?? 1
    const depthMultiplier = tuning.depthMultiplier[instance.depthSelection]
    const options = selectedOptions(instance, template)
    let instanceTotal = 0
    for (const d of BLUEPRINT_DISCIPLINES) {
      const base = template.baseWorkUnits[d] ?? 0
      const optionDelta = options.reduce((sum, o) => sum + (o.costDelta[d] ?? 0), 0)
      const w = base * intensityMultiplier * depthMultiplier + optionDelta
      raw[d] += w
      instanceTotal += w
    }
    drivers.push({ label: instance.displayLabel, value: instanceTotal })
    tags.push(...template.combineTags)
  }

  for (const pack of structure.contentPacks) {
    let packTotal = 0
    for (const d of BLUEPRINT_DISCIPLINES) {
      const w = (pack.workUnitsPerTier[d] ?? 0) * Math.pow(pack.tier, tuning.contentTierAlpha)
      raw[d] += w
      packTotal += w
    }
    drivers.push({ label: `内容包:${pack.packId}`, value: packTotal })
  }

  // §6.2 synergy_d = 1 − distinct/total；total=0 ⇒ 0（除零边界）
  const total = tags.length
  const distinct = new Set(tags).size
  const synergyBase = total === 0 ? 0 : 1 - distinct / total
  const synergy = zeroDisciplineMap()
  const byDiscipline = zeroDisciplineMap()
  const ranges = {} as Record<BlueprintDiscipline, EstimateRange>
  let totalWork = 0
  for (const d of BLUEPRINT_DISCIPLINES) {
    synergy[d] = synergyBase
    const w = raw[d] * (1 - synergyBase * tuning.kSyn[d])
    byDiscipline[d] = w
    totalWork += w
    ranges[d] = rangeFor(w, tuning.uncertaintyDelta)
  }

  drivers.sort((a, b) => b.value - a.value)
  return {
    byDiscipline,
    raw,
    synergy,
    total: totalWork,
    ranges,
    drivers: drivers.slice(0, 3).map((x) => `${x.label}(+${x.value.toFixed(2)})`),
  }
}

/** §6.3 ② 技能负载 S_d = W_d / k_peakEfficiency[d]；ΣS=0 ⇒ peakFraction=0。 */
export function estimateSkillDemand(
  work: WorkUnitChannel,
  tuning: BlueprintTuning,
): SkillDemandChannel {
  const byDiscipline = zeroDisciplineMap()
  const peakFraction = zeroDisciplineMap()
  let sum = 0
  for (const d of BLUEPRINT_DISCIPLINES) {
    const s = work.byDiscipline[d] / tuning.kPeakEfficiency[d]
    byDiscipline[d] = s
    sum += s
  }
  if (sum !== 0) {
    for (const d of BLUEPRINT_DISCIPLINES) peakFraction[d] = byDiscipline[d] / sum
  }
  return { byDiscipline, total: sum, peakFraction }
}

function dedupeGates(gates: TechGate[]): TechGate[] {
  const seen = new Set<string>()
  const out: TechGate[] = []
  for (const g of gates) {
    if (seen.has(g.gateId)) continue
    seen.add(g.gateId)
    out.push(g)
  }
  return out
}

/** §6.4 ③ 技术门槛 T 与三风险 → riskLevel（max 分级，非加权和）。 */
export function estimateTechRisk(input: EstimationInput, work: WorkUnitChannel, tuning: BlueprintTuning): TechRiskChannel {
  const { structure, templatesById, capabilities, platformTechStandards, synergyPenaltySum } = input
  const gates: TechGate[] = [...platformTechStandards]

  for (const instance of activeInstances(structure)) {
    const template = templatesById[instance.templateId]
    if (template === undefined) continue
    gates.push(...template.techGates)
    for (const option of selectedOptions(instance, template)) gates.push(...option.techGates)
  }
  gates.push(...(tuning.perspectiveGate[structure.positioning.perspectiveId] ?? []))
  gates.push(...(tuning.structureGate[structure.positioning.structureId] ?? []))
  const uniqueGates = dedupeGates(gates)

  const unsatisfied: TechGate[] = []
  let techExponent = 0
  for (const g of uniqueGates) {
    // min=0 恒满足，不入 T_unsat（§6.7 / D-04 §3.3）
    if (g.minCapabilityLevel <= 0) continue
    const capability = capabilities[g.domainId] ?? 0
    if (capability < g.minCapabilityLevel) {
      unsatisfied.push(g)
      techExponent += tuning.kTech * (1 - capability / g.minCapabilityLevel)
    }
  }
  const rTech = 1 - Math.exp(-techExponent)
  const rSynergy = 1 - Math.exp(-Math.max(0, synergyPenaltySum))
  const rScope = Math.min(1, Math.max(0, (work.total / tuning.wBaselineType) / tuning.kScopeMax))
  const maxRisk = Math.max(rTech, rSynergy, rScope)
  const riskLevel = maxRisk >= tuning.tauHigh ? 'HIGH' : maxRisk >= tuning.tauMed ? 'MEDIUM' : 'LOW'

  return { gates: uniqueGates, unsatisfied, rTech, rSynergy, rScope, maxRisk, riskLevel }
}

function cosine(u: number[], v: number[]): number {
  let dot = 0
  let normU = 0
  let normV = 0
  for (let i = 0; i < u.length; i += 1) {
    dot += (u[i] ?? 0) * (v[i] ?? 0)
    normU += (u[i] ?? 0) ** 2
    normV += (v[i] ?? 0) ** 2
  }
  if (normU === 0 || normV === 0) return 0
  return dot / (Math.sqrt(normU) * Math.sqrt(normV))
}

/** §6.5 ④ 市场吸引力画像。红线：不含销量/评分/uspCredibility（OPEN-O1）。 */
export function estimateMarketFit(input: EstimationInput, tuning: BlueprintTuning): MarketFitChannel {
  const { structure, templatesById, archetype } = input
  const active = activeInstances(structure)
  const affinity = new Map<string, number>()

  const bump = (tag: string, value: number): void => {
    affinity.set(tag, (affinity.get(tag) ?? 0) + value)
  }

  for (const instance of active) {
    const template = templatesById[instance.templateId]
    if (template === undefined) continue
    const intensityWeight = template.affinityIntensity[instance.intensity]
      ?? tuning.defaultAffinityIntensity[instance.intensity]
      ?? 0
    // §5.1 / X-5：audienceAffinity 缺键一律按 0
    for (const [tag, weight] of Object.entries(template.audienceAffinity)) {
      bump(tag, weight * intensityWeight)
    }
    for (const option of selectedOptions(instance, template)) {
      for (const [tag, delta] of Object.entries(option.audienceAffinityDelta)) bump(tag, delta)
    }
  }

  const claims = structure.positioning.targetSegmentClaims
  for (const tag of claims) if (!affinity.has(tag)) affinity.set(tag, 0)
  const supported = new Set([...affinity.keys()].filter((tag) => (affinity.get(tag) ?? 0) > 0))
  const claimSet = new Set(claims)
  const union = new Set([...claimSet, ...supported])
  // §6.5 Jaccard(C,S)，|C∪S|=0 ⇒ 0
  const positioningFit = union.size === 0 ? 0 : intersectionSize(claimSet, supported) / union.size
  const positioningFitBand: QualityBand =
    positioningFit >= tuning.positioningFitHigh ? 'high'
      : positioningFit >= tuning.positioningFitMedium ? 'medium' : 'low'

  // §6.5 固定 10 维 GameplayDomain 顺序
  const typeAffinityVector = GAMEPLAY_DOMAINS.map((d) => archetype?.typeAffinity[d] ?? 0)
  const domainDistributionVector = GAMEPLAY_DOMAINS.map(
    (d) => (active.length === 0 ? 0 : active.filter((i) => i.domain === d).length / active.length),
  )
  const genreFit = cosine(typeAffinityVector, domainDistributionVector)

  // §5.4 R-COM-7：布尔支撑判定
  const uspSupported: Record<string, boolean> = {}
  for (const usp of structure.positioning.sellingPoints) {
    let supportedByModule = false
    for (const instance of active) {
      const template = templatesById[instance.templateId]
      if (template === undefined) continue
      if (template.uspIds.includes(usp)) { supportedByModule = true; break }
      if (selectedOptions(instance, template).some((o) => o.supportedUspIds.includes(usp))) {
        supportedByModule = true
        break
      }
    }
    uspSupported[usp] = supportedByModule
  }

  const contentTierSum = structure.contentPacks.reduce((sum, c) => sum + c.tier, 0)
  const contentVolumeBand: QualityBand =
    contentTierSum <= tuning.contentVolumeLowMax ? 'low'
      : contentTierSum >= tuning.contentVolumeHighMin ? 'high' : 'medium'

  return {
    affinity: Object.fromEntries(affinity),
    positioningFit,
    positioningFitBand,
    genreFit,
    uspSupported,
    // 只做提示，不进入数值；N 为注入参数（§6.5）
    noveltyNote: `近 ${tuning.noveltyWindow} 个同类型产品相似度：待 D-07 档案接入（仅提示，不进入数值）`,
    contentVolumeBand,
  }
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const x of a) if (b.has(x)) n += 1
  return n
}

/** §6.1 四通道总入口：互不合成单一分数。 */
export function estimateFourChannels(input: EstimationInput, tuning: BlueprintTuning): EstimateBundle {
  const workUnits = estimateWorkUnits(input, tuning)
  const skillDemand = estimateSkillDemand(workUnits, tuning)
  const techRisk = estimateTechRisk(input, workUnits, tuning)
  const marketFit = estimateMarketFit(input, tuning)
  return { formulaVersion: tuning.formulaVersion, workUnits, skillDemand, techRisk, marketFit }
}
