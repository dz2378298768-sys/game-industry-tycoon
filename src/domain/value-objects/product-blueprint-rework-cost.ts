/**
 * D-01 §15.2 返工分档成本（A/B/C/D/E 五类；minimal/partial/full 三档）。
 *
 * 确定性公式；区间呈现，实际值在返工推进时由 Project 落实（T4）。
 * 关键裁定：
 *  - 缩减类变更（如 content tier 3→2）产生正沉没成本：已投入 - 可复用 > 0。
 *  - reusable 只作用于「已投入可复用部分」（invested），不作用于新增工作量（newWork）。
 *  - B 类停用：已投入全额沉没 + 少量清理；不可通过停用"洗掉"已做工作（T3）。
 */
import type { EstimateRange } from '@domain/entities/product-blueprint'
import type { BlueprintTuning } from './product-blueprint-tuning'

export type ReworkCategory = 'A' | 'B' | 'C' | 'D' | 'E'
export type ReworkMode = 'minimal' | 'partial' | 'full'

export interface ReworkCostInput {
  category: ReworkCategory
  /** 受影响模块已投入工作量（Project 提供）。 */
  invested: number
  /** 变更引起的工作量绝对差（缩减时为负，取绝对值判档位）。 */
  workDelta: number
  /** 产品级 W_total，用于比例判档。 */
  workTotal: number
  /** D 类新增模块完整工作量 W_d(新)。 */
  newWork: number
  /** §15.2 ΔW_d × progress_d 中的 progress_d（Project 提供，缺省 1）。 */
  progress?: number
  /** E 类定位变更强制 full。 */
  isRepositioning?: boolean
}

export interface ReworkCost {
  category: ReworkCategory
  mode: ReworkMode
  changeRatio: number
  invested: number
  /** ≤ invested × 可复用比例；新增工作量不计入。 */
  reusable: number
  /** 正沉没：invested - reusable（B 类再加清理前已全额沉没）。 */
  sunk: number
  additionalWork: number
  total: number
  /** §15.2 返工估算以区间呈现。 */
  range: EstimateRange
}

function bandRange(mid: number, delta: number): EstimateRange {
  return { low: Math.max(0, mid * (1 - delta)), mid, high: mid * (1 + delta) }
}

/** 分档判定：变更占 W_total <10% minimal；10–40% partial；>40% 或定位变更 full。 */
export function classifyReworkMode(input: ReworkCostInput, tuning: BlueprintTuning): ReworkMode {
  if (input.category === 'A') return 'minimal'
  if (input.isRepositioning === true || input.category === 'E') return 'full'
  const ratio = input.workTotal > 0 ? Math.abs(input.workDelta) / input.workTotal : (input.workDelta === 0 ? 0 : 1)
  if (ratio < tuning.reworkMinimalRatio) return 'minimal'
  if (ratio <= tuning.reworkFullRatio) return 'partial'
  return 'full'
}

/** §15.2 返工成本。所有调整量来自注入的 tuning，不读全局。 */
export function computeReworkCost(input: ReworkCostInput, tuning: BlueprintTuning): ReworkCost {
  const mode = classifyReworkMode(input, tuning)
  const invested = Math.max(0, input.invested)
  const progress = input.progress ?? 1
  const workTotal = Math.max(0, input.workTotal)
  const changeRatio = workTotal > 0
    ? Math.abs(input.workDelta) / workTotal
    : (input.workDelta === 0 ? 0 : 1)

  if (input.category === 'A') {
    const zero: EstimateRange = { low: 0, mid: 0, high: 0 }
    return {
      category: 'A', mode, changeRatio, invested: 0, reusable: 0,
      sunk: 0, additionalWork: 0, total: 0, range: zero,
    }
  }

  // §15.2 B 类停用：已投入全额沉没（reusable=0）+ 少量清理
  const reusableRatio = input.category === 'B' ? 0 : tuning.reworkReusableRatio[mode]
  const reusable = Math.min(invested, invested * reusableRatio)
  const sunk = invested - reusable

  let additionalWork: number
  switch (input.category) {
    case 'B':
      additionalWork = invested * tuning.kDeactivationCleanup
      break
    case 'C':
      // 缩减时 workDelta<0，其绝对值仍产生返工核对/回归成本；沉没由 sunk 保证为正。
      additionalWork = Math.abs(input.workDelta) * progress
      break
    case 'D':
      additionalWork = Math.max(0, input.newWork) * (1 + tuning.kIntegration)
      break
    case 'E':
      additionalWork = Math.abs(input.workDelta) * progress + tuning.kReposition * workTotal
      break
  }

  const total = sunk + additionalWork
  return {
    category: input.category,
    mode,
    changeRatio,
    invested,
    reusable,
    sunk,
    additionalWork,
    total,
    range: bandRange(total, tuning.uncertaintyDelta),
  }
}

/** §15.2 reworkCount 警告线判定（风险在 Project 侧计入，本模块只给布尔）。 */
export function isReworkCountExcessive(reworkCount: number, tuning: BlueprintTuning): boolean {
  return reworkCount >= tuning.kReworkLimit
}
