/**
 * ProjectBudget —— 项目预算三元组（整数分）
 * remainingCapCents 是计算值。
 */
export interface ProjectBudget {
  totalCapCents: number      // 预算上限
  committedCents: number     // 已承诺（已锁定但未花）
  spentCents: number         // 已花费
  remainingCapCents: number  // = totalCap - committed
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
    remainingCapCents: b.totalCapCents - b.committedCents,
  }
}
