import type { DomainEvent } from './events'

/**
 * 生成 v4 风格 UUID。
 *
 * 优先使用平台原生 `crypto.randomUUID()`；仅当该 API 不可用时，
 * 回退到基于 `Math.random()` 的模板生成（此分支**不保证**可复现）。
 *
 * 口径说明（确定性）：
 *   - 实体 ID 只用于标识与引用，不参与任何数值模拟计算；
 *   - 模拟结果的可复现性由 `RandomService`（mulberry32 + saveSeed）保证；
 *   - 若将来要求「同存档 + 同种子 → 连 ID 也一致」，需改为 seed + 计数器生成。
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export interface CommandResult<T = void> {
  success: boolean
  result?: T
  errorCode?: string
  errorMessage?: string
  idempotent?: boolean
  events?: DomainEvent[]
}

export function okNoResult(events?: DomainEvent[]): CommandResult<never> {
  if (events === undefined) return { success: true }
  return { success: true, events }
}

export function okWithResult<T>(result: T, events?: DomainEvent[]): CommandResult<T> {
  if (events === undefined) return { success: true, result }
  return { success: true, result, events }
}

/** Compatibility shim — use okWithResult when you have a result */
export function ok<T>(result?: T, events?: DomainEvent[]): CommandResult<T> {
  if (result === undefined && events === undefined) {
    return { success: true } as CommandResult<T>
  }
  if (result === undefined) {
    return { success: true, events } as CommandResult<T>
  }
  return { success: true, result, events } as CommandResult<T>
}

export function fail<T>(
  errorCode: string,
  errorMessage: string,
): CommandResult<T> {
  return { success: false, errorCode, errorMessage }
}
