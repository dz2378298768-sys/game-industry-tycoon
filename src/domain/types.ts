import type { DomainEvent } from './events'

/**
 * 生成 v4 风格 UUID（纯确定性 fallback，无 Date.now / Math.random）
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
