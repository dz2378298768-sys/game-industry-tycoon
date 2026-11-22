/**
 * PROJ V0.1.1 §6 全部 TUNING 参数的可注入参数快照。
 *
 * 约定（§6 首注 / §11 S4）：
 *  - 公式层禁止读取全局 TUNING；全部系数由调用方注入 `ProjectFormulaParams`。
 *  - 每项标注来源条款；P2 校准前的值为候选默认值，不代表已平衡。
 *  - `projectFormulaVersion` 变化 = 口径跳变（§7.3 S5），需升版本号。
 */
import type { Discipline } from '@domain/entities/project-execution'

export interface ProjectFormulaParams {
  /** §6.6 公式口径版本。 */
  projectFormulaVersion: string
  /** §6.1/§6.3/§6.5/§6.7 除零极小值 ε。 */
  epsilon: number
  /** §6.2 k_output > 0。 */
  kOutput: number
  /** §6.2 f_skill(ℓ)，ℓ∈{0..5}（D-03 映射）。 */
  fSkill: Record<number, number>
  /** §6.4 workingDaysPerMonth（月薪折算工作日）。 */
  workingDaysPerMonth: number
  /** §6.4 k_riskCost（风险缓冲系数）。 */
  kRiskCost: number
  /** §6.2.1 可行性阈值（D-01 原样，本文不重定义）。 */
  hrbFeasibleRatioMax: number
  hrbStretchRatioMax: number
  /** §4.3 PAUSE_TIMEOUT_DAYS（旧制 60）。 */
  pauseTimeoutDays: number
  /** §5.4-6 C6 累计延期上限。 */
  launchDelayMaxDays: number
  /** §5.5-7 k_rework_limit。 */
  kReworkLimit: number
  /** §6.5 档位阈值 δ。 */
  reworkMinimalRatio: number
  reworkFullRatio: number
  /** §6.5 reusable（D-01 §15.2 同值）。 */
  reworkReusableRatio: Record<'minimal' | 'partial' | 'full', number>
  /** §6.5 k_integ / k_reposition / k_clean / Δ。 */
  kIntegration: number
  kReposition: number
  kClean: number
  reworkUncertaintyDelta: number
  /** §6.5 k_dur_partial（区间下限，5%–15%）/ k_dur_full。 */
  kDurPartialLow: number
  kDurPartialHigh: number
  kDurFull: number
}

export const DEFAULT_PROJECT_FORMULA_PARAMS: ProjectFormulaParams = {
  projectFormulaVersion: 'PROJ-FORMULA-v0.1.1',
  epsilon: 1e-9,
  kOutput: 1,
  fSkill: { 0: 0, 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4 },
  workingDaysPerMonth: 21,
  kRiskCost: 0.2,
  hrbFeasibleRatioMax: 1.0,
  hrbStretchRatioMax: 1.2,
  pauseTimeoutDays: 60,
  launchDelayMaxDays: 180,
  kReworkLimit: 3,
  reworkMinimalRatio: 0.1,
  reworkFullRatio: 0.4,
  reworkReusableRatio: { minimal: 0.7, partial: 0.5, full: 0.2 },
  kIntegration: 0.3,
  kReposition: 0.25,
  kClean: 0.05,
  reworkUncertaintyDelta: 0.2,
  kDurPartialLow: 0.05,
  kDurPartialHigh: 0.15,
  kDurFull: 0.25,
}

/** 部分覆盖（嵌套 map 逐键合并），供测试与 P2 校准按需注入。 */
export function withProjectFormulaParams(
  overrides: Partial<Omit<ProjectFormulaParams, 'fSkill' | 'reworkReusableRatio'>> & {
    fSkill?: Partial<Record<number, number>>
    reworkReusableRatio?: Partial<Record<'minimal' | 'partial' | 'full', number>>
  } = {},
): ProjectFormulaParams {
  const merged: ProjectFormulaParams = {
    ...DEFAULT_PROJECT_FORMULA_PARAMS,
    ...overrides,
    fSkill: { ...DEFAULT_PROJECT_FORMULA_PARAMS.fSkill },
    reworkReusableRatio: {
      ...DEFAULT_PROJECT_FORMULA_PARAMS.reworkReusableRatio,
      ...overrides.reworkReusableRatio,
    },
  }
  if (overrides.fSkill !== undefined) {
    for (const [k, v] of Object.entries(overrides.fSkill)) {
      if (v !== undefined) merged.fSkill[Number(k)] = v
    }
  }
  return merged
}

/** 学科列表的固定顺序（确定性遍历；D-01 §6.7）。 */
export const DISCIPLINE_ORDER: readonly Discipline[] = ['design', 'code', 'art', 'audio', 'qa']
