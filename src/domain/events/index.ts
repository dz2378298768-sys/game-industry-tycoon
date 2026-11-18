/**
 * DomainEvent —— 领域层事件
 */
export interface DomainEvent {
  id: string
  type: string
  day: number
  payload: Record<string, unknown>
}

/** 系统自动取消项目的事件类型 */
export const PROJECT_CANCELLED_EVENT = 'ProjectCancelled'

/** pause_timeout 自动取消的事件载荷；actor 与 reasonCode 为固定值 */
export type ProjectCancelledPayload = {
  projectId: string
  reasonCode: 'pause_timeout'
  actor: 'system'
  description: string
}

/**
 * 构造暂停超时自动取消事件。
 * id 由调用方注入，避免领域事件层反向依赖 uuid 生成器。
 */
export function createPauseTimeoutCancelledEvent(
  id: string,
  projectId: string,
  day: number,
): DomainEvent {
  const payload: ProjectCancelledPayload = {
    projectId,
    reasonCode: 'pause_timeout',
    actor: 'system',
    description: '项目连续暂停满 60 个游戏日，系统自动取消',
  }
  return { id, type: PROJECT_CANCELLED_EVENT, day, payload }
}
