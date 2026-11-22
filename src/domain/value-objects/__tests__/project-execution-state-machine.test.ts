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
    // 存档/读档：持久化字段原样（pausedDays 未刷新）
    const archived = JSON.parse(JSON.stringify(paused)) as typeof paused
    expect(archived.project.pausedDays).toBe(0)
    const restored = restoreProjectExecution(archived, 64, params())
    expect(restored.project.pausedDays).toBe(59)
    expect(restored.project.state).toBe('PAUSED')
    const after = restoreProjectExecution(archived, 65, params())
    expect(after.project.pausedDays).toBe(60)
    expect(after.project.state).toBe('CANCELLED')
    // 纯公式一致性
    expect(computePausedDays(5, 65)).toBe(60)
    expect(isPauseTimedOut(5, 65, 60)).toBe(true)
  })

  it('重复暂停不重置起算日（防止以"再暂停"规避 60 天超时）', () => {
    const s = pauseProject(pauseProject(fresh(), 0, 'player'), 30, 'player')
    expect(s.project.pausedAtDayIndex).toBe(0)
    expect(enterPauseFields({ pausedAtDayIndex: 0, pausedDays: 5, pauseReason: 'player' }, 99, 'player').pausedAtDayIndex).toBe(0)
    const restored = restorePauseFields({ pausedAtDayIndex: 0, pausedDays: 0, pauseReason: 'player' }, 200)
    expect(restored.pausedDays).toBe(200)
  })

  it('PAUSED → 玩家恢复 → ACTIVE，暂停字段清零；团队为空时保持 PAUSED', () => {
    const paused = pauseProject(fresh(), 10, 'player')
    const blocked = resumeProject(paused, 11, [])
    expect(blocked.resumed).toBe(false)
    expect(blocked.state.project.state).toBe('PAUSED')
    const r = resumeProject(paused, 11, scenarioATeam())
    expect(r.resumed).toBe(true)
    expect(r.state.project.state).toBe('ACTIVE')
    expect(r.state.project.pausedAtDayIndex).toBeNull()
    expect(r.state.project.pausedDays).toBe(0)
    expect(r.state.project.pauseReason).toBeNull()
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
    expect(transitionProjectState('READY_TO_DELIVER', 'delivery_fail')).toBe('ACTIVE')
    expect(transitionProjectState('PAUSED', 'pause_timeout')).toBe('CANCELLED')
    expect(transitionProjectState('ACTIVE', 'rework_start')).toBe('ACTIVE')
    expect(transitionProjectState('ACTIVE', 'rework_complete')).toBe('ACTIVE')
  })
})
