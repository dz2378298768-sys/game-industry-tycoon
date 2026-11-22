/**
 * §4 ProjectState 七态状态机（含 §4.4 无法退出状态反证所需的结构）。
 *
 * 关键裁定：
 *  1. 无 REWORKING 枚举；返工是 ACTIVE + ReworkSession(active) 的呈现标签（§4.1）。
 *  2. 终态 COMPLETED/CANCELLED/ABANDONED 出度为 0（接受态，非死锁，§4.4）。
 *  3. PAUSED 超时判定 `pausedDays = max(0, dayIndex − pausedAtDayIndex) ≥ pauseTimeoutDays`
 *     —— 读档路径按同一公式重算（C5），封堵"永久暂停"死锁。
 *  4. 所有非终态至少一条出边（§4.4 判据，`assertNoDeadlock` 断言）。
 */
import type { PauseReason, ProjectState } from '@domain/entities/project-execution'
import { PROJECT_STATES, isTerminalState } from '@domain/entities/project-execution'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'

/** §4.3 转换表（return 之后的状态；ACTIVE→ACTIVE 为返工标签出现/消失，state 不变）。 */
const OUT_EDGES: Record<ProjectState, readonly ProjectState[]> = {
  SETUP: ['ACTIVE', 'PAUSED', 'CANCELLED', 'ABANDONED'],
  ACTIVE: ['ACTIVE', 'READY_TO_DELIVER', 'PAUSED', 'CANCELLED', 'ABANDONED'],
  // PAUSED→PAUSED 幂等自环：重复暂停请求合法但**不重置**超时起算日（C5 反证）
  PAUSED: ['ACTIVE', 'PAUSED', 'CANCELLED', 'ABANDONED'],
  READY_TO_DELIVER: ['COMPLETED', 'ACTIVE', 'PAUSED', 'CANCELLED', 'ABANDONED'],
  COMPLETED: [],
  CANCELLED: [],
  ABANDONED: [],
}

/** 允许"任意非终态 → CANCELLED"与"任意非 COMPLETED → ABANDONED"（§4.3）。 */
const WILDCARD_TARGETS: readonly ProjectState[] = ['CANCELLED', 'ABANDONED']

/** 细粒度触发（用于错误信息与测试断言；不参与状态存储）。 */
export type ProjectTransitionTrigger =
  | 'launch'
  | 'rework_start'
  | 'rework_complete'
  | 'all_work_packages_done'
  | 'delivery_pass'
  | 'delivery_fail'
  | 'pause'
  | 'resume'
  | 'pause_timeout'
  | 'cancel'
  | 'abandon'

/** 触发 → 目标状态的唯一映射（§4.3）。 */
const TRIGGER_TARGET: Record<ProjectTransitionTrigger, ProjectState> = {
  launch: 'ACTIVE',
  rework_start: 'ACTIVE',
  rework_complete: 'ACTIVE',
  all_work_packages_done: 'READY_TO_DELIVER',
  delivery_pass: 'COMPLETED',
  delivery_fail: 'ACTIVE',
  pause: 'PAUSED',
  resume: 'ACTIVE',
  pause_timeout: 'CANCELLED',
  cancel: 'CANCELLED',
  abandon: 'ABANDONED',
}

/** 每个触发的合法起点（§4.3）。 */
const TRIGGER_SOURCES: Record<ProjectTransitionTrigger, readonly ProjectState[]> = {
  launch: ['SETUP'],
  rework_start: ['ACTIVE'],
  rework_complete: ['ACTIVE'],
  all_work_packages_done: ['ACTIVE'],
  delivery_pass: ['READY_TO_DELIVER'],
  delivery_fail: ['READY_TO_DELIVER'],
  pause: ['SETUP', 'ACTIVE', 'PAUSED', 'READY_TO_DELIVER'],
  resume: ['PAUSED'],
  pause_timeout: ['PAUSED'],
  cancel: ['SETUP', 'ACTIVE', 'PAUSED', 'READY_TO_DELIVER'],
  abandon: ['SETUP', 'ACTIVE', 'PAUSED', 'READY_TO_DELIVER'],
}

export function canTransitionProject(from: ProjectState, to: ProjectState): boolean {
  if (isTerminalState(from)) return false
  if (OUT_EDGES[from].includes(to)) return true
  return WILDCARD_TARGETS.includes(to)
}

/** 触发合法性判定。 */
export function canFire(from: ProjectState, trigger: ProjectTransitionTrigger): boolean {
  return TRIGGER_SOURCES[trigger].includes(from)
}

/** 非静默转换：非法起点/目标抛 ProjectError。 */
export function transitionProjectState(
  from: ProjectState,
  trigger: ProjectTransitionTrigger,
): ProjectState {
  if (!canFire(from, trigger)) {
    throw new ProjectError(
      PROJ_ERROR.INVALID_STATE_TRANSITION,
      `Trigger ${trigger} not allowed from ${from}`,
    )
  }
  const to = TRIGGER_TARGET[trigger]
  if (!canTransitionProject(from, to)) {
    throw new ProjectError(
      PROJ_ERROR.INVALID_STATE_TRANSITION,
      `Transition ${from} → ${to} not allowed`,
    )
  }
  return to
}

/** §4.4 判据：所有非终态出度 ≥ 1；终态出度 = 0。违反即抛错（结构自检）。 */
export function assertNoDeadlock(): void {
  for (const state of PROJECT_STATES) {
    if (isTerminalState(state)) {
      if (OUT_EDGES[state].length !== 0) {
        throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, `Terminal ${state} must have no out-edge`)
      }
      continue
    }
    const reachable = new Set<ProjectState>([...OUT_EDGES[state], ...WILDCARD_TARGETS])
    reachable.delete(state)
    if (reachable.size === 0) {
      throw new ProjectError(PROJ_ERROR.INVALID_STATE_TRANSITION, `Non-terminal ${state} has no out-edge`)
    }
  }
}

export function outEdgesOf(state: ProjectState): readonly ProjectState[] {
  return OUT_EDGES[state]
}

/** 确定性 id 序列（无随机、无 Date.now；§11 S6 纯函数要求；读档重放安全）。 */
export function deterministicId(prefix: string, ...parts: ReadonlyArray<string | number>): string {
  return `${prefix}:${parts.join(':')}`
}

// ===== §4.3 PAUSED 超时（C5） =====

/** `pausedDays = max(0, dayIndex − pausedAtDayIndex)`（C5）。非 PAUSED 或缺锚点时 0。 */
export function computePausedDays(
  pausedAtDayIndex: number | null,
  dayIndex: number,
): number {
  if (pausedAtDayIndex === null) return 0
  return Math.max(0, dayIndex - pausedAtDayIndex)
}

/** 暂停超时判定（≥ pauseTimeoutDays；读档按同一公式重算，C5）。 */
export function isPauseTimedOut(
  pausedAtDayIndex: number | null,
  dayIndex: number,
  pauseTimeoutDays: number,
): boolean {
  return computePausedDays(pausedAtDayIndex, dayIndex) >= pauseTimeoutDays
}

export interface PauseFields {
  pausedAtDayIndex: number | null
  pausedDays: number
  pauseReason: PauseReason | null
}

/** §4.3 进入 PAUSED 写入字段：注意幂等——重复暂停不重置起算日（否则可无限延长超时）。 */
export function enterPauseFields(current: PauseFields, dayIndex: number, reason: PauseReason): PauseFields {
  if (current.pausedAtDayIndex !== null) {
    // 已处于 PAUSED：保持起算日与原因，避免"重复暂停"规避 60 天超时（C5 反证）。
    return current
  }
  return { pausedAtDayIndex: dayIndex, pausedDays: 0, pauseReason: reason }
}

/** §4.3 恢复 ACTIVE：清零。 */
export function clearPauseFields(): PauseFields {
  return { pausedAtDayIndex: null, pausedDays: 0, pauseReason: null }
}

/** 读档：按公式重算 pausedDays（S1/C5）。 */
export function restorePauseFields(fields: PauseFields, dayIndex: number): PauseFields {
  if (fields.pausedAtDayIndex === null) return clearPauseFields()
  return { ...fields, pausedDays: computePausedDays(fields.pausedAtDayIndex, dayIndex) }
}
