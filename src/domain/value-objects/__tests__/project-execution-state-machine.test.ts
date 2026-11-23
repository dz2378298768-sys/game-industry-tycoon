/**
 * PROJ V0.1.1 §4 状态机测试。
 * 覆盖 TC-04（无法退出状态反证，含读档路径 C5）、§4.5 返工会话子状态、无 REWORKING 枚举。
 */
import { describe, it, expect } from 'vitest'
import {
  PROJECT_STATES,
  PROJECT_TERMINAL_STATES,
  isTerminalState,
} from '@domain/entities/project-execution'
import {
  assertNoDeadlock,
  canFire,
  canTransitionProject,
  computePausedDays,
  enterPauseFields,
  isPauseTimedOut,
  outEdgesOf,
  restorePauseFields,
  transitionProjectState,
} from '@domain/value-objects/project-execution-state-machine'
import {
  advanceProjectDay,
  archiveProjectExecution,
  createProjectExecution,
  pauseProject,
  resumeProject,
  restoreProjectExecution,
  cancelProject,
  abandonProject,
  submitDelivery,
} from '@domain/value-objects/project-execution-engine'
import { ProjectError } from '@domain/entities/project-execution/errors'
import { params, scenarioATeam, tc02Decomposition } from './project-execution-fixtures'

function fresh() {
  return createProjectExecution(
    {
      projectId: 'P1',
      companyId: 'C1',
      studioId: 'ST1',
      versionId: 'V1',
      snapshotId: 'SNAP-1',
      formulaVersion: 'D01-FORMULA-v0.1',
      day: 0,
      hrb: 0.5,
      budgetCapacityCents: 1_000_000,
      availableCashCents: 2_000_000,
      decomposition: tc02Decomposition(),
    },
    params(),
  )
}

describe('§4.1 七态枚举（无 REWORKING）', () => {
  it('恰好 7 个状态，且不含 REWORKING（返工只是呈现标签）', () => {
    expect(PROJECT_STATES).toHaveLength(7)
    expect(PROJECT_STATES).not.toContain('REWORKING')
    expect(PROJECT_STATES).toEqual(
      expect.arrayContaining(['SETUP', 'ACTIVE', 'PAUSED', 'READY_TO_DELIVER', 'COMPLETED', 'CANCELLED', 'ABANDONED']),
    )
  })
})

describe('TC-04 反证：无法退出状态（出度 ≥ 1 且终态出度 = 0）', () => {
  it('全部非终态至少一条出边；终态无出边；结构自检不抛错', () => {
    expect(() => assertNoDeadlock()).not.toThrow()
    for (const s of PROJECT_STATES) {
      if (isTerminalState(s)) {
        expect(outEdgesOf(s)).toHaveLength(0)
      } else {
        const out = outEdgesOf(s).filter((t) => t !== s)
        expect(out.length).toBeGreaterThan(0)
      }
    }
    expect(PROJECT_TERMINAL_STATES).toEqual(['COMPLETED', 'CANCELLED', 'ABANDONED'])
  })

  it('PAUSED 注入 60 天 → 自动 CANCELLED（TUNING pauseTimeoutDays=60）', () => {
    let s = pauseProject(fresh(), 10, 'player')
    expect(s.project.state).toBe('PAUSED')
    expect(s.project.pausedAtDayIndex).toBe(10)
    s = advanceProjectDay(s, { day: 69, members: scenarioATeam(), params: params() }).state
    expect(s.project.state).toBe('PAUSED') // 59 天，未超时
    s = advanceProjectDay(s, { day: 70, members: scenarioATeam(), params: params() }).state
    expect(s.project.state).toBe('CANCELLED') // 恰好 60 天
  })

  it('TC-04 读档路径（C5）：PAUSED → 存档 → 读档 → 注入 60 天 ⇒ pausedDays = day − pausedAt ≥ 60 → CANCELLED', () => {
    const paused = pauseProject(fresh(), 5, 'budget_exhausted')
    // R13：存档经 archiveProjectExecution 固化参数快照，再 JSON 往返模拟持久化
    const archived = JSON.parse(JSON.stringify(archiveProjectExecution(paused, params()))) as ReturnType<typeof archiveProjectExecution>
    expect(archived.project.pausedDays).toBe(0)
    const restored = restoreProjectExecution(archived, 64)
    expect(restored.project.pausedDays).toBe(59)
    expect(restored.project.state).toBe('PAUSED')
    const after = restoreProjectExecution(archived, 65)
    expect(after.project.pausedDays).toBe(60)
    expect(after.project.state).toBe('CANCELLED')
    // 纯公式一致性
    expect(computePausedDays(5, 65)).toBe(60)
    expect(isPauseTimedOut(5, 65, 60)).toBe(true)
  })

  it('R13 反证（TC-18）：存档缺 formulaParams ⇒ 抛 PROJ_ARCHIVE_PARAMS_REQUIRED（拒绝用环境参数读档）', () => {
    const paused = pauseProject(fresh(), 5, 'budget_exhausted')
    const archived = JSON.parse(JSON.stringify(archiveProjectExecution(paused, params()))) as ReturnType<typeof archiveProjectExecution>
    delete (archived as { formulaParams?: unknown }).formulaParams
    expect(() => restoreProjectExecution(archived, 65)).toThrow(ProjectError)
  })

  it('R13：读档强制使用存档参数快照（环境参数不同也按存档超时口径判定）', () => {
    const paused = pauseProject(fresh(), 5, 'budget_exhausted')
    // 存档参数：pauseTimeoutDays=10（与环境默认 60 不同）
    const archiveParams = params({ pauseTimeoutDays: 10 })
    const archived = JSON.parse(JSON.stringify(archiveProjectExecution(paused, archiveParams)))
    // day=15：按存档参数已超时（10 天），按环境参数（60 天）远未超时 ⇒ 结果必须跟随存档参数
    const restored = restoreProjectExecution(archived, 15)
    expect(restored.project.state).toBe('CANCELLED')
  })

  it('重复暂停不重置起算日（防止以"再暂停"规避 60 天超时）', () => {
    const s = pauseProject(pauseProject(fresh(), 0, 'player'), 30, 'player')
    expect(s.project.pausedAtDayIndex).toBe(0)
    expect(enterPauseFields({ pausedAtDayIndex: 0, pausedDays: 5, pauseReason: 'player' }, 99, 'player').pausedAtDayIndex).toBe(0)
    const restored = restorePauseFields({ pausedAtDayIndex: 0, pausedDays: 0, pauseReason: 'player' }, 200)
    expect(restored.pausedDays).toBe(200)
  })

  it('PAUSED → 玩家恢复 → ACTIVE，暂停字段清零（R7/P3-3：团队为空抛 PROJ_TEAM_REQUIRED，不再静默保持 PAUSED）', () => {
    const paused = pauseProject(fresh(), 10, 'player')
    expect(() => resumeProject(paused, 11, [], params())).toThrow(ProjectError)
    const r = resumeProject(paused, 11, scenarioATeam(), params())
    expect(r.resumed).toBe(true)
    expect(r.state.project.state).toBe('ACTIVE')
    expect(r.state.project.pausedAtDayIndex).toBeNull()
    expect(r.state.project.pausedDays).toBe(0)
    expect(r.state.project.pauseReason).toBeNull()
  })

  it('R7 反证（P2-1）：PAUSED 已超 60 天 ⇒ resumeProject 先强制转 CANCELLED 并拒绝恢复（封堵状态机后门）', () => {
    const paused = pauseProject(fresh(), 0, 'player')
    // day=60：恰好 60 天超时；推进路径同式会强制 CANCELLED，恢复路径必须同样拒绝
    const out = resumeProject(paused, 60, scenarioATeam(), params())
    expect(out.resumed).toBe(false)
    expect(out.state.project.state).toBe('CANCELLED')
    expect(out.reason).toContain('pause_timeout')
    // 推进路径同式对照（同一公式 isPauseTimedOut）
    const viaAdvance = advanceProjectDay(paused, { day: 60, members: scenarioATeam(), params: params() }).state
    expect(viaAdvance.project.state).toBe('CANCELLED')
  })

  it('COMPLETED 重复交付被拒且不产生第二 Build（§10 B-6）', () => {
    const s = fresh()
    // 一次性把全部 WP 完成
    s.workPackages = s.workPackages.map((wp) => ({ ...wp, state: 'DONE', remainingWorkUnits: 0 }))
    s.project.state = 'READY_TO_DELIVER'
    const first = submitDelivery(s, {
      day: 10,
      gate: { pass: true, violations: [] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(first.completed).toBe(true)
    expect(first.state.builds).toHaveLength(1)
    expect(() =>
      submitDelivery(first.state, {
        day: 11,
        gate: { pass: true, violations: [] },
        versionLabel: '1.0',
        deliveryForm: 'full',
        actualCostCents: 0,
        deliveredTier: 1,
      }),
    ).toThrow(ProjectError)
    expect(first.state.builds).toHaveLength(1)
  })

  it('非法转换抛错（COMPLETED 无出边；ABANDONED 后不可再激活）', () => {
    expect(canTransitionProject('COMPLETED', 'ACTIVE')).toBe(false)
    expect(canTransitionProject('ACTIVE', 'COMPLETED')).toBe(false)
    const ab = abandonProject(fresh(), 3)
    expect(ab.project.state).toBe('ABANDONED')
    expect(() => cancelProject(ab, 4)).toThrow(ProjectError)
  })

  it('SETUP/ACTIVE/READY_TO_DELIVER 均可暂停与取消（§4.3 任一非终态）', () => {
    for (const from of ['SETUP', 'ACTIVE', 'READY_TO_DELIVER'] as const) {
      expect(canFire(from, 'pause')).toBe(true)
      expect(canFire(from, 'cancel')).toBe(true)
    }
    const cancelled = cancelProject(fresh(), 1)
    expect(cancelled.project.state).toBe('CANCELLED')
  })
})

describe('§4.3 转换触发映射', () => {
  it('触发 → 目标状态唯一映射与转移表一致', () => {
    expect(transitionProjectState('SETUP', 'launch')).toBe('ACTIVE')
    expect(transitionProjectState('ACTIVE', 'all_work_packages_done')).toBe('READY_TO_DELIVER')
    expect(transitionProjectState('READY_TO_DELIVER', 'delivery_pass')).toBe('COMPLETED')
    // R14（ADJ-08 §1.3）：delivery_fail 不再退回 ACTIVE，保持 READY_TO_DELIVER
    expect(transitionProjectState('READY_TO_DELIVER', 'delivery_fail')).toBe('READY_TO_DELIVER')
    expect(transitionProjectState('PAUSED', 'pause_timeout')).toBe('CANCELLED')
    expect(transitionProjectState('ACTIVE', 'rework_start')).toBe('ACTIVE')
    expect(transitionProjectState('ACTIVE', 'rework_complete')).toBe('ACTIVE')
  })
})
