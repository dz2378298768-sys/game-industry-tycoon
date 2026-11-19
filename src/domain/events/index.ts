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

/** 项目预算耗尽事件类型（DESIGN-G05 §6.2 / G05-R8） */
export const PROJECT_BUDGET_EXHAUSTED_EVENT = 'ProjectBudgetExhausted'

/** 预算耗尽事件载荷；remainingCapCents 为触发判定时点的剩余额度（≤0，可为负） */
export type ProjectBudgetExhaustedPayload = {
  projectId: string
  day: number
  remainingCapCents: number
}

/**
 * 构造预算耗尽事件。
 *
 * id 即幂等键 `event:budget_exhausted:{projectId}:{resumeSeq}`，随存档生命周期保留，
 * 保证同一恢复周期内至多一次；恢复使 resumeSeq+1 后可再次产生耗尽事件
 * （DESIGN-G05 §7.1 GDR R2 D-G05-R2-01 修订）。
 */
export function createBudgetExhaustedEvent(
  id: string,
  projectId: string,
  day: number,
  remainingCapCents: number,
): DomainEvent {
  const payload: ProjectBudgetExhaustedPayload = {
    projectId,
    day,
    remainingCapCents,
  }
  return { id, type: PROJECT_BUDGET_EXHAUSTED_EVENT, day, payload }
}

/**
 * 预算耗尽事件幂等键：每个恢复周期内唯一。
 * 事件 id 直接取该键，事件去重与审计共用同一标识。
 */
export function budgetExhaustedEventKey(projectId: string, resumeSeq: number): string {
  return `event:budget_exhausted:${projectId}:${resumeSeq}`
}

/** 公司破产事件类型（DESIGN-OI-21 §3.3） */
export const COMPANY_BANKRUPTED_EVENT = 'CompanyBankrupted'

/** 破产事件载荷；balanceAtBankruptcy 为破产时现金余额（负数值） */
export type CompanyBankruptedPayload = {
  companyId: string
  day: number
  balanceAtBankruptcy: number
}

/** 构造公司破产事件。 */
export function createCompanyBankruptedEvent(
  id: string,
  companyId: string,
  day: number,
  balanceAtBankruptcy: number,
): DomainEvent {
  const payload: CompanyBankruptedPayload = {
    companyId,
    day,
    balanceAtBankruptcy,
  }
  return { id, type: COMPANY_BANKRUPTED_EVENT, day, payload }
}
