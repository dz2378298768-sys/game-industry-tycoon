/**
 * D-01 §6.2.1 HRB：玩家预算承诺 + 单向可行性检查（ADJ-2026-11-21-01 / R-08）。
 *
 * 硬约束：
 *  1. HRB 只影响 verdict 与提示，不改变 W_d / SkillDemand / TechRequirement / MarketAppealProfile。
 *  2. 预算不足只提示并等待玩家决策，不自动缩小工作量或降低质量。
 *  3. R-ORG-2：HRB 不与企业总预算混同；BudgetCapacity 由 Project 提供，只读引用。
 *  4. 不消费 qualityCeilingBand（OPEN-O5，已从输出契约移除）：返回对象无该字段。
 */
import type { HRBFeasibility } from '@domain/entities/product-blueprint'
import type { BlueprintTuning } from './product-blueprint-tuning'

/**
 * 单向可行性检查。BudgetCapacity / Cost_est 均为下游输入（Project），本函数不计算成本。
 */
export function checkHrbFeasibility(
  hrb: number,
  budgetCapacity: number,
  costEst: number,
  tuning: BlueprintTuning,
  drivers: string[] = [],
): HRBFeasibility {
  const budgetCap = hrb * budgetCapacity
  // §6.2.1：Budget_cap > 0；若 =0 则 ratio = +∞
  const ratio = budgetCap === 0 ? Number.POSITIVE_INFINITY : costEst / budgetCap
  const verdict: HRBFeasibility['verdict'] =
    ratio <= tuning.hrbFeasibleRatioMax ? 'feasible'
      : ratio <= tuning.hrbStretchRatioMax ? 'need_more_budget_or_delay'
        : 'need_reduce_scope_or_lower_goal'

  const reasons: string[] = drivers.slice(0, 3)
  if (verdict === 'need_more_budget_or_delay') {
    reasons.push('成本略超预算承诺：追加预算或延期（玩家二选一，系统不自洽）')
  } else if (verdict === 'need_reduce_scope_or_lower_goal') {
    reasons.push('成本显著超预算承诺：缩减范围或降低质量目标（玩家二选一，仅文本提示）')
  }

  return { hrb, budgetCap, costEst, ratio, verdict, reasons }
}
