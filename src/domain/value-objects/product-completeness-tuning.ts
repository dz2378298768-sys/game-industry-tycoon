/**
 * D-02 全部 TUNING/OPEN 量化项的可注入参数对象（§6.6 符号表 / §11 S9）。
 *
 * 约定：
 *  - 公式层禁止读取全局 TUNING；所有量化项由调用方注入本快照。
 *  - 每个参数标注来源条款；P2 校准前的值为候选默认值，不代表已平衡。
 *  - S9：TUNING 参数按 formulaVersion 生成参数快照持久化；历史只增不改，
 *    重放/归因读对应快照，禁止用当前值重算历史结论（TC-17）。
 *  - 强制阈值顺序 τ_niche ≤ τ_niche_deep（§6.6 约束 3，TC-03 依赖）。
 */
import type { DepthSelection } from '@domain/entities/product-blueprint'
import { CompletenessDomainError, D02_IMPL_ERROR } from '@domain/entities/product-completeness'

export interface CompletenessTuning {
  /** §6.6 formulaVersion：口径版本；变化时允许口径性跳变并注明（S9 参数快照键）。 */
  formulaVersion: string
  /** §5.2 niche 分类门槛，取值域 {1,2,3,4,5}（TUNING）。 */
  tauNiche: number
  /** §5.3 N-01 深度门槛分支，取值域 {1,2,3,4,5}；强制 τ_niche ≤ τ_niche_deep。 */
  tauNicheDeep: number
  /** §5.2 broad 标签计数门槛（≥1 整数）。 */
  tauBroadTags: number
  /** §5.3 B-03 affinity 覆盖阈值 ∈[0,1]。 */
  tauCoverBroad: number
  /** §5.3 内容档阈值（内容档序号，TUNING）。 */
  tBroadContent: number
  tNicheContent: number
  tTechContent: number
  /** §6.1 w_depth：{shallow:0.6, standard:1.0, deep:1.4}（TUNING）。 */
  wDepth: Record<DepthSelection, number>
  /** §6.1 体验潜力归一化常量。 */
  kExp: number
  /** §6.1 marketFit 权重，w₁+w₂+w₃=1（TUNING）。 */
  marketFitWeights: { positioning: number; genre: number; usp: number }
  /** §6.2 缺陷权重（键=严重度，枚举 OPEN-D02-O2；P1 至少 'E'）。未知严重度权重按 0 计。 */
  wDef: Record<string, number>
  /** §6.2 缺陷负载归一化常量。 */
  kDefectNorm: number
  /** §6.1 默认 affinityIntensity（D-01 §4.6 默认 {1:.6,2:.8,3:1,4:1.2,5:1.4}）；模板自带时以模板为准。 */
  defaultAffinityIntensity: Record<number, number>
}

/** §6.7 默认参数快照（P2 校准前候选值）。 */
export const DEFAULT_COMPLETENESS_TUNING: CompletenessTuning = {
  formulaVersion: 'D02-FORMULA-v0.1',
  tauNiche: 2,
  tauNicheDeep: 3,
  tauBroadTags: 2,
  tauCoverBroad: 0.5,
  tBroadContent: 2,
  tNicheContent: 1,
  tTechContent: 2,
  wDepth: { shallow: 0.6, standard: 1.0, deep: 1.4 },
  kExp: 1,
  marketFitWeights: { positioning: 0.4, genre: 0.3, usp: 0.3 },
  wDef: { E: 1 },
  kDefectNorm: 3,
  defaultAffinityIntensity: { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4 },
}

/** §6.6 约束 3：强制阈值顺序 τ_niche ≤ τ_niche_deep（niche 分类门槛不得高于深度满足门槛）。 */
export function assertTuningInvariants(t: CompletenessTuning): void {
  if (t.tauNiche > t.tauNicheDeep) {
    throw new CompletenessDomainError(
      D02_IMPL_ERROR.TUNING_INVARIANT,
      `tauNiche (${t.tauNiche}) must be <= tauNicheDeep (${t.tauNicheDeep}) ` +
        '(D-02 §6.6 constraint 3); otherwise N-01 loses discriminating power (TC-03).',
    )
  }
  const w = t.marketFitWeights
  const sum = w.positioning + w.genre + w.usp
  if (Math.abs(sum - 1) > 1e-9) {
    throw new CompletenessDomainError(
      D02_IMPL_ERROR.TUNING_INVARIANT,
      `marketFitWeights must sum to 1 (got ${sum}); D-02 §6.1 w1+w2+w3=1.`,
    )
  }
}

export type CompletenessTuningOverrides = Partial<{
  formulaVersion: string
  tauNiche: number
  tauNicheDeep: number
  tauBroadTags: number
  tauCoverBroad: number
  tBroadContent: number
  tNicheContent: number
  tTechContent: number
  wDepth: Partial<Record<DepthSelection, number>>
  kExp: number
  marketFitWeights: Partial<{ positioning: number; genre: number; usp: number }>
  wDef: Record<string, number>
  kDefectNorm: number
  defaultAffinityIntensity: Partial<Record<number, number>>
}>

/** 数值索引 map 合并：丢弃显式 undefined（noUncheckedIndexedAccess 索引签名含 undefined）。 */
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

/** 深合并覆盖（P2 校准/测试按需注入）；覆盖后重验不变量。 */
export function withCompletenessTuningOverrides(
  overrides: CompletenessTuningOverrides,
): CompletenessTuning {
  const merged: CompletenessTuning = {
    ...DEFAULT_COMPLETENESS_TUNING,
    ...overrides,
    wDepth: { ...DEFAULT_COMPLETENESS_TUNING.wDepth, ...overrides.wDepth },
    marketFitWeights: {
      ...DEFAULT_COMPLETENESS_TUNING.marketFitWeights,
      ...overrides.marketFitWeights,
    },
    wDef: { ...DEFAULT_COMPLETENESS_TUNING.wDef, ...overrides.wDef },
    defaultAffinityIntensity: mergeNumberMap(
      DEFAULT_COMPLETENESS_TUNING.defaultAffinityIntensity,
      overrides.defaultAffinityIntensity,
    ),
  }
  assertTuningInvariants(merged)
  return merged
}

assertTuningInvariants(DEFAULT_COMPLETENESS_TUNING)
