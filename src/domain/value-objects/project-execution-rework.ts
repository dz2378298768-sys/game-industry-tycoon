/**
 * §6.5 返工三档成本（C1：按 category 分段的确定性公式；与 D-01 §15.2 语义与成本边界对齐）。
 *
 * ```
 * progress_i = clamp(delivered_i / max(ε, W_d(old,i)), 0, 1)
 * ΔW_i       = |W_d(new,i) − W_d(old,i)|              // 绝对增量（缩减不再被 max(0,·) 吞成 0）
 * invested_i = W_d(old,i) × progress_i
 * W_change A=0
 *          B=Σ invested_i                              // 停用：已投入全额沉没
 *          C=Σ ΔW_i × progress_i                       // 80→50、progress=0.6 ⇒ 18
 *          D=Σ [W_d(new,i) + k_integ × W_d(new,i)]     // 新增全额
 *          E=Σ ΔW_i × progress_i + k_reposition × W_total
 * δ=W_change/max(ε,W_total); minimal δ<0.10 / partial 0.10–0.40 / full >0.40 或 E
 * reworkWorkUnits B = W_change + k_clean×W_change（reusable 不适用）
 *                 C = W_change×(1−reusable) + (minimal? k_clean×W_change : 0)
 *                 D = W_change（reusable 不适用）
 *                 E = (W_change − k_reposition×W_total)×(1−reusable) + k_reposition×W_total
 * ```
 * 纯函数：无随机、无全局 TUNING（参数注入）。
 */
import type { ReworkCategory, ReworkMode } from '@domain/entities/project-execution'
import type { ProjectFormulaParams } from './project-execution-tuning'

export interface ReworkAffectedItemInput {
  instanceId: string
  /** 旧快照中该项该学科的 W_d（Project 从 WP baseline 提供）。 */
  oldWorkUnits: number
  /** 已交付工作量（= delivered_i）。 */
  deliveredWorkUnits: number
  /** 新快照中该项该学科的 W_d；停用为 0。 */
  newWorkUnits: number
}

export interface ReworkSegmentInput {
  category: ReworkCategory
  affected: ReadonlyArray<ReworkAffectedItemInput>
  /** 会话开始时权威快照的 W_total（δ 分母）。 */
  workTotal: number
}

export interface ReworkCostBreakdown {
  category: ReworkCategory
  mode: ReworkMode
  /** §6.5 变更规模 W_change。 */
  changeWorkUnits: number
  /** δ = W_change / max(ε, W_total)。 */
  changeRatio: number
  /** 已投入合计（沉没 / 可复用基数来源）。 */
  investedWorkUnits: number
  /** reusable 比例（档位；B/D 不使用）。 */
  reusableRatio: number
  /** §6.5 reusable 只作用于已投入可复用部分。 */
  reusableWorkUnits: number
  /** 正沉没工作量（缩减类恒 > 0）。 */
  sunkWorkUnits: number
  /** 返工总工作量（= 记账基数）。 */
  reworkWorkUnits: number
  /** 工期延长方向（TUNING 区间，§6.5 durationExtension）。 */
  durationExtension: { low: number; high: number }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** §6.5 档位判定。 */
export function classifyReworkModeByRatio(category: ReworkCategory, delta: number, params: ProjectFormulaParams): ReworkMode {
  if (category === 'A') return 'minimal'
  if (category === 'E') return 'full'
  if (delta < params.reworkMinimalRatio) return 'minimal'
  if (delta <= params.reworkFullRatio) return 'partial'
  return 'full'
}

/** §6.5 ① 变更规模 W_change（仅用于档位判定 δ）。 */
export function computeChangeWorkUnits(input: ReworkSegmentInput, params: ProjectFormulaParams): number {
  const total = Math.max(0, input.workTotal)
  switch (input.category) {
    case 'A':
      return 0
    case 'B':
      return input.affected.reduce(
        (sum, i) => sum + i.oldWorkUnits * clamp01(i.deliveredWorkUnits / Math.max(params.epsilon, i.oldWorkUnits)),
        0,
      )
    case 'C':
      return input.affected.reduce(
        (sum, i) =>
          sum +
          Math.abs(i.newWorkUnits - i.oldWorkUnits) *
            clamp01(i.deliveredWorkUnits / Math.max(params.epsilon, i.oldWorkUnits)),
        0,
      )
    case 'D':
      return input.affected.reduce((sum, i) => sum + Math.max(0, i.newWorkUnits) * (1 + params.kIntegration), 0)
    case 'E':
      return (
        input.affected.reduce(
          (sum, i) =>
            sum +
            Math.abs(i.newWorkUnits - i.oldWorkUnits) *
              clamp01(i.deliveredWorkUnits / Math.max(params.epsilon, i.oldWorkUnits)),
          0,
        ) +
        params.kReposition * total
      )
    default:
      return 0
  }
}

/**
 * §6.5 返工工作量（记账基数）。`reusable` 只作用于「已投入可复用部分」：
 * B 类全额沉没、D 类新增全额均不乘 reusable；C/E 类仅已投入可复用部分按档返还。
 */
export function computeReworkWorkUnits(
  input: ReworkSegmentInput,
  mode: ReworkMode,
  changeWorkUnits: number,
  params: ProjectFormulaParams,
): number {
  const total = Math.max(0, input.workTotal)
  switch (input.category) {
    case 'A':
      return 0
    case 'B':
      // 已投入全额沉没 + 少量清理（沉没不返还）
      return changeWorkUnits + params.kClean * changeWorkUnits
    case 'C': {
      const reusable = params.reworkReusableRatio[mode]
      const base = changeWorkUnits * (1 - reusable)
      return mode === 'minimal' ? base + params.kClean * changeWorkUnits : base
    }
    case 'D':
      // 新增全额，无已投入可返还
      return changeWorkUnits
    case 'E': {
      const reusable = params.reworkReusableRatio.full
      const penalty = params.kReposition * total
      return (changeWorkUnits - penalty) * (1 - reusable) + penalty
    }
    default:
      return 0
  }
}

/** §6.5 全量分段成本。 */
export function computeReworkCostBreakdown(
  input: ReworkSegmentInput,
  params: ProjectFormulaParams,
): ReworkCostBreakdown {
  const total = Math.max(0, input.workTotal)
  const changeWorkUnits = computeChangeWorkUnits(input, params)
  const denom = Math.max(params.epsilon, total)
  const changeRatio = changeWorkUnits / denom
  const mode = classifyReworkModeByRatio(input.category, changeRatio, params)

  const investedWorkUnits = input.affected.reduce(
    (sum, i) => sum + i.oldWorkUnits * clamp01(i.deliveredWorkUnits / Math.max(params.epsilon, i.oldWorkUnits)),
    0,
  )
  const reusableRatio = input.category === 'B' || input.category === 'D' || input.category === 'A'
    ? 0
    : params.reworkReusableRatio[mode]
  const reusableWorkUnits = Math.min(investedWorkUnits, investedWorkUnits * reusableRatio)
  const sunkWorkUnits = input.category === 'A' ? 0 : Math.max(0, investedWorkUnits - reusableWorkUnits)
  const reworkWorkUnits = computeReworkWorkUnits(input, mode, changeWorkUnits, params)

  const durationExtension =
    mode === 'partial'
      ? { low: params.kDurPartialLow, high: params.kDurPartialHigh }
      : mode === 'full'
        ? { low: params.kDurFull, high: params.kDurFull }
        : { low: 0, high: 0 }

  return {
    category: input.category,
    mode,
    changeWorkUnits,
    changeRatio,
    investedWorkUnits,
    reusableRatio,
    reusableWorkUnits,
    sunkWorkUnits,
    reworkWorkUnits,
    durationExtension,
  }
}

/**
 * §6.5 区间估算（Cents）：`low = reworkWorkUnits × min_d(costPerUnit_d) × (1−Δ)`，
 * `high = reworkWorkUnits × max_d(costPerUnit_d) × (1+Δ)`。
 * 存在 `+∞` 单位成本（无团队）时两端均为 `+∞`（不伪造区间）。
 */
export function estimateReworkCostRange(
  reworkWorkUnits: number,
  costPerUnit: ReadonlyArray<number>,
  params: ProjectFormulaParams,
): { lowCents: number; highCents: number } {
  if (reworkWorkUnits <= 0) return { lowCents: 0, highCents: 0 }
  const finite = costPerUnit.filter((c) => Number.isFinite(c) && c > 0)
  if (finite.length === 0) {
    return { lowCents: Number.POSITIVE_INFINITY, highCents: Number.POSITIVE_INFINITY }
  }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const delta = params.reworkUncertaintyDelta
  return {
    lowCents: Math.round(reworkWorkUnits * min * (1 - delta)),
    highCents: Math.round(reworkWorkUnits * max * (1 + delta)),
  }
}
