/**
 * ProjectBudget —— 项目预算三元组（整数分）
 * remainingCapCents 是计算值：`totalCap - committed - spent`，可为负。
 */
export interface ProjectBudget {
  totalCapCents: number      // 预算上限
  committedCents: number     // 已承诺（已锁定但未花）
  spentCents: number         // 已花费
  remainingCapCents: number  // = totalCap - committed - spent（≤0 即耗尽，可为负）
}

export function createBudget(totalCapCents: number): ProjectBudget {
  return {
    totalCapCents,
    committedCents: 0,
    spentCents: 0,
    remainingCapCents: totalCapCents,
  }
}

export function recomputeRemaining(b: ProjectBudget): ProjectBudget {
  return {
    ...b,
    remainingCapCents: b.totalCapCents - b.committedCents - b.spentCents,
  }
}

/**
 * 预算使用率 = (committed + spent) / totalCap。
 * totalCapCents === 0 时定义为 0（避免除零）。
 */
export function budgetUsageRatio(b: ProjectBudget): number {
  return b.totalCapCents === 0
    ? 0
    : (b.committedCents + b.spentCents) / b.totalCapCents
}
