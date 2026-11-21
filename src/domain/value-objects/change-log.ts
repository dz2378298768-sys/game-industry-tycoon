/**
 * ChangeLogEntry —— 项目变更日志
 */
export interface ChangeLogEntry {
  id: string
  type: 'add' | 'remove' | 'update'
  timestampDay: number // dayIndex
  details: Record<string, unknown>
}

/** 预算追加在 changeLog 中的事件标识 */
export const BUDGET_TOP_UP_EVENT = 'BudgetTopUp'

/**
 * 预算追加幂等键（DESIGN-G05 §7.1）：`budget:topup:{projectId}:{seq}`。
 * 同一 seq 重复调用返回既有结果，不重复计入 totalCap。
 */
export function topUpIdempotencyKey(projectId: string, seq: number): string {
  return `budget:topup:${projectId}:${seq}`
}

export interface TopUpChangeLogInput {
  id: string
  projectId: string
  seq: number
  amountCents: number
  reason: string
  newTotalCapCents: number
  day: number
}

/**
 * 构造一条预算追加 changeLog 条目（DESIGN-G05 §9 / 001-D §8）。
 * 记录金额、原因、执行日与新 totalCap，并写入幂等键供去重与审计。
 */
export function createTopUpChangeLogEntry(input: TopUpChangeLogInput): ChangeLogEntry {
  return {
    id: input.id,
    type: 'update',
    timestampDay: input.day,
    details: {
      event: BUDGET_TOP_UP_EVENT,
      idempotencyKey: topUpIdempotencyKey(input.projectId, input.seq),
      seq: input.seq,
      amountCents: input.amountCents,
      reason: input.reason,
      newTotalCapCents: input.newTotalCapCents,
      day: input.day,
    },
  }
}
