/**
 * Project 执行内核错误码（PROJ_*，复用 DomainError 体系）。
 * 权威：PROJ V0.1.1 §4.3 转换表前置条件、§10 异常边界、§5.5-6/§5.6 闸门 fail-closed。
 */
import { DomainError } from '@domain/errors'

export const PROJ_ERROR = {
  INVALID_STATE_TRANSITION: 'PROJ_INVALID_STATE_TRANSITION',
  TERMINAL_STATE: 'PROJ_TERMINAL_STATE',
  UNKNOWN_WORK_PACKAGE: 'PROJ_UNKNOWN_WORK_PACKAGE',
  DEPENDENCY_CYCLE: 'PROJ_DEPENDENCY_CYCLE',
  SNAPSHOT_MISSING: 'PROJ_SNAPSHOT_MISSING',
  /** R2：切快照被拒（newWorkload 缺参/学科残缺/原子性破坏）。 */
  SNAPSHOT_SWITCH_BLOCKED: 'PROJ_SNAPSHOT_SWITCH_BLOCKED',
  /** R3：rebaseline 守恒缺口（无承载 WP 且 W_d(new)>0，或 delivered>baseline）。 */
  REBASELINE_UNBALANCED: 'PROJ_REBASELINE_UNBALANCED',
  /** R11：返工受影响学科无法确定（ADJ-08 §2，禁止默认 design）。 */
  REWORK_SCOPE_UNKNOWN: 'PROJ_REWORK_SCOPE_UNKNOWN',
  /** R1：上游声明 pass=true 但 violations 含 E 级（矛盾输入诊断，不改变 fail-closed）。 */
  GATE_INCONSISTENT: 'PROJ_GATE_INCONSISTENT',
  /** R13：存档缺 formulaParams 参数快照（读档强制用存档参数）。 */
  ARCHIVE_PARAMS_REQUIRED: 'PROJ_ARCHIVE_PARAMS_REQUIRED',
  BUDGET_CAPACITY_EXCEEDS_CASH: 'PROJ_BUDGET_CAPACITY_EXCEEDS_CASH',
  BUDGET_CAPACITY_EXCEEDED: 'PROJ_BUDGET_CAPACITY_EXCEEDED',
  LEDGER_POST_FAILED: 'PROJ_LEDGER_POST_FAILED',
  CASH_SHORTAGE: 'PROJ_DEVELOPMENT_CASH_SHORTAGE',
  REWORK_SESSION_MISSING: 'PROJ_REWORK_SESSION_MISSING',
  REWORK_SESSION_NOT_ACTIVE: 'PROJ_REWORK_SESSION_NOT_ACTIVE',
  /** s-2（ADJ-14 D-2）：planRework affected 与 changes 未对齐（显式契约，禁止按位置回退）。 */
  REWORK_CHANGE_UNMATCHED: 'PROJ_REWORK_CHANGE_UNMATCHED',
  TEAM_REQUIRED: 'PROJ_TEAM_REQUIRED',
} as const

export type ProjectErrorCode = (typeof PROJ_ERROR)[keyof typeof PROJ_ERROR]

export class ProjectError extends DomainError {
  constructor(code: ProjectErrorCode | string, message: string) {
    super(code, message)
    this.name = 'ProjectError'
  }
}
