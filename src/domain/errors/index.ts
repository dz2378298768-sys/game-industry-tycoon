/**
 * 领域层统一错误体系
 */

export class DomainError extends Error {
  public readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'DomainError'
  }
}

export class InsufficientCashError extends DomainError {
  constructor(message = 'Insufficient cash balance') {
    super('FIN_INSUFFICIENT_CASH', message)
  }
}

export class InvalidPhaseTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('PRJ_INVALID_PHASE_TRANSITION', `Cannot transition from ${from} to ${to}`)
  }
}

export class EmployeeAllocationError extends DomainError {
  constructor(message = 'Allocation exceeds 100%') {
    super('EMP_ALLOCATION_EXCEEDS_100_PERCENT', message)
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message)
  }
}

export class ValidationError extends DomainError {
  constructor(field: string, message: string) {
    super('GEN_VALIDATION', `${field}: ${message}`)
  }
}

/** 标记为幂等命中（非错误，流程控制用） */
export class IdempotencyHit {
  public readonly idempotent = true
}
