/**
 * DomainEvent —— 领域层事件
 */
export interface DomainEvent {
  id: string
  type: string
  day: number
  payload: Record<string, unknown>
}
