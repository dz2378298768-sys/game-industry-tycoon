/**
 * D-01 §6.7 全部 TUNING/OPEN 量化项的可注入参数对象。
 *
 * 约定（任务卡 §2-3 / D-01 §6.7）：
 *  - 公式层禁止读取全局 TUNING；所有量化项由调用方注入本快照。
 *  - 每个参数标注来源条款；P2 校准前的值为候选默认值，不代表已平衡。
 *  - OPEN 项（uspCredibility / qualityCeilingBand）不在此定义——它们不是本模块输出（§6.5/§8.2）。
 */
import type {
  BlueprintDiscipline,
  DepthSelection,
  PerspectiveId,
  StructureId,
  TechGate,
} from '@domain/entities/product-blueprint'

export interface BlueprintTuning {
  /** §6.6 formulaVersion：口径版本；变化时允许口径性跳变并注明。 */
  formulaVersion: string
  /** §6 相对不确定度 Δ，输出区间 [v(1-Δ), v(1+Δ)]。 */
  uncertaintyDelta: number
  /** §6.2 depthMultiplier，键 {shallow, standard, deep}。 */
  depthMultiplier: Record<DepthSelection, number>
  /** §6.2 内容量级边际递减指数 α。 */
  contentTierAlpha: number
  /** §6.2 k_syn[d] 按学科向量，∈[0,0.25]。 */
  kSyn: Record<BlueprintDiscipline, number>
  /** §4.6 默认 affinityIntensity（模板自带时以模板为准）。 */
  defaultAffinityIntensity: Record<number, number>
  /** §6.3 k_peakEfficiency[d] > 0。P2 校准前默认 1。 */
  kPeakEfficiency: Record<BlueprintDiscipline, number>
  /** §6.2.1 HRB 默认承诺水平。 */
  hrbDefault: number
  /** §6.2.1 可行性阈值：ratio ≤ 1.0 可行；1.0 < ratio ≤ 1.2 需追加预算/延期。 */
  hrbFeasibleRatioMax: number
  hrbStretchRatioMax: number
  /** §6.4 PERSPECTIVE_GATE 常量表（TUNING）。 */
  perspectiveGate: Record<PerspectiveId, TechGate[]>
  /** §6.4 STRUCTURE_GATE 常量表（TUNING）。 */
  structureGate: Record<StructureId, TechGate[]>
  /** §6.4 k_tech > 0。P2 校准前默认 0.7。 */
  kTech: number
  /** §6.4 W_baseline_type > 0，主类型当前时代典型单产品工作量中位数。 */
  wBaselineType: number
  /** §6.4 k_scope_max > 0。 */
  kScopeMax: number
  /** §6.4 riskLevel 阈值。 */
  tauHigh: number
  tauMed: number
  /** §6.5 positioningFit 展示带阈值。 */
  positioningFitHigh: number
  positioningFitMedium: number
  /** §6.5 noveltyNote 近 N 个同类型产品。 */
  noveltyWindow: number
  /** §6.5 contentVolumeBand 映射阈值（Σ contentPack.tier）。 */
  contentVolumeLowMax: number
  contentVolumeHighMin: number
  /** §5.3 k_batch_limit。 */
  kBatchLimit: number
  /** §14.4 provisional→active 的 successCount 阈值 K。 */
  archetypePromotionK: number
  /** §15.2 返工档位阈值：变更占 W_total 比例。 */
  reworkMinimalRatio: number
  reworkFullRatio: number
  /** §15.2 有效工作量可复用比例（按档）。 */
  reworkReusableRatio: { minimal: number; partial: number; full: number }
  /** §15.2 新增集成成本系数 k_integ / 定位变更全局惩罚 k_reposition。 */
  kIntegration: number
  kReposition: number
  /** §15.2 B 类停用「少量清理」系数（TUNING，规格未给定值，P2 校准前默认）。 */
  kDeactivationCleanup: number
  /** §15.2 reworkCount 警告线 k_rework_limit。 */
  kReworkLimit: number
}

const gate = (gateId: string, domainId: string, minCapabilityLevel: number): TechGate => ({
  gateId, domainId, minCapabilityLevel, note: '',
})

/** §6.4 PERSPECTIVE_GATE（按规格表逐行落地）。 */
export const DEFAULT_PERSPECTIVE_GATE: Record<PerspectiveId, TechGate[]> = {
  side_scroll: [gate('g_pers_side', 'rendering_2d', 1)],
  top_down: [gate('g_pers_top', 'rendering_2d', 1)],
  isometric: [gate('g_pers_iso', 'rendering_3d', 2)],
  third_person: [gate('g_pers_3rd', 'rendering_3d', 2)],
  first_person: [gate('g_pers_1st', 'rendering_3d', 3)],
  text: [gate('g_pers_text', 'ui_text', 0)],
}

/** §6.4 STRUCTURE_GATE（linear/level_based 为空集；persistent_online 标 REJECTED 不应出现）。 */
export const DEFAULT_STRUCTURE_GATE: Record<StructureId, TechGate[]> = {
  linear: [],
  level_based: [],
  open_zone: [gate('g_struct_open', 'world_streaming', 2)],
  sandbox: [gate('g_struct_sbx', 'world_streaming', 3)],
  roguelike: [gate('g_struct_proc', 'procedural_gen', 2)],
  persistent_online_scope_out: [],
}

/** §6.7 默认参数快照。所有值可由调用方整体或部分覆盖（注入），公式层不读此对象以外的全局量。 */
export const DEFAULT_BLUEPRINT_TUNING: BlueprintTuning = {
  formulaVersion: 'D01-FORMULA-v0.1',
  uncertaintyDelta: 0.25,
  depthMultiplier: { shallow: 0.8, standard: 1.0, deep: 1.3 },
  contentTierAlpha: 0.85,
  kSyn: { design: 0.05, code: 0.22, art: 0.18, audio: 0.12, qa: 0.15 },
  defaultAffinityIntensity: { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4 },
  kPeakEfficiency: { design: 1, code: 1, art: 1, audio: 1, qa: 1 },
  hrbDefault: 0.5,
  hrbFeasibleRatioMax: 1.0,
  hrbStretchRatioMax: 1.2,
  perspectiveGate: DEFAULT_PERSPECTIVE_GATE,
  structureGate: DEFAULT_STRUCTURE_GATE,
  kTech: 0.7,
  wBaselineType: 1000,
  kScopeMax: 1.5,
  tauHigh: 0.7,
  tauMed: 0.4,
  positioningFitHigh: 0.8,
  positioningFitMedium: 0.5,
  noveltyWindow: 20,
  contentVolumeLowMax: 4,
  contentVolumeHighMin: 10,
  kBatchLimit: 8,
  archetypePromotionK: 3,
  reworkMinimalRatio: 0.1,
  reworkFullRatio: 0.4,
  reworkReusableRatio: { minimal: 0.7, partial: 0.5, full: 0.2 },
  kIntegration: 0.3,
  kReposition: 0.25,
  kDeactivationCleanup: 0.05,
  kReworkLimit: 3,
}

/** 深合并覆盖：嵌套 map 也允许只覆盖部分键（供测试与 P2 校准按需注入）。 */
export type BlueprintTuningOverrides = Partial<
  Omit<BlueprintTuning, 'depthMultiplier' | 'kSyn' | 'defaultAffinityIntensity' | 'kPeakEfficiency' | 'perspectiveGate' | 'structureGate' | 'reworkReusableRatio'>
> & {
  depthMultiplier?: Partial<BlueprintTuning['depthMultiplier']>
  kSyn?: Partial<BlueprintTuning['kSyn']>
  defaultAffinityIntensity?: Partial<BlueprintTuning['defaultAffinityIntensity']>
  kPeakEfficiency?: Partial<BlueprintTuning['kPeakEfficiency']>
  perspectiveGate?: Partial<BlueprintTuning['perspectiveGate']>
  structureGate?: Partial<BlueprintTuning['structureGate']>
  reworkReusableRatio?: Partial<BlueprintTuning['reworkReusableRatio']>
}

/** 数值索引 map 合并：丢弃显式 undefined（Partial<Record<number,number>> 的索引签名含 undefined）。 */
function mergeNumberMap(
  base: Record<number, number>,
  override?: Partial<Record<number, number>>,
): Record<number, number> {
  const out: Record<number, number> = { ...base }
  if (override !== undefined) {
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) out[Number(key)] = value
    }
  }
  return out
}

export function withTuningOverrides(overrides: BlueprintTuningOverrides): BlueprintTuning {
  return {
    ...DEFAULT_BLUEPRINT_TUNING,
    ...overrides,
    depthMultiplier: { ...DEFAULT_BLUEPRINT_TUNING.depthMultiplier, ...overrides.depthMultiplier },
    kSyn: { ...DEFAULT_BLUEPRINT_TUNING.kSyn, ...overrides.kSyn },
    defaultAffinityIntensity: mergeNumberMap(DEFAULT_BLUEPRINT_TUNING.defaultAffinityIntensity, overrides.defaultAffinityIntensity),
    kPeakEfficiency: { ...DEFAULT_BLUEPRINT_TUNING.kPeakEfficiency, ...overrides.kPeakEfficiency },
    perspectiveGate: { ...DEFAULT_BLUEPRINT_TUNING.perspectiveGate, ...overrides.perspectiveGate },
    structureGate: { ...DEFAULT_BLUEPRINT_TUNING.structureGate, ...overrides.structureGate },
    reworkReusableRatio: { ...DEFAULT_BLUEPRINT_TUNING.reworkReusableRatio, ...overrides.reworkReusableRatio },
  }
}
