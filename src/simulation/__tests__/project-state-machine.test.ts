import { describe, it, expect } from 'vitest'
import { ProjectService } from '@simulation/services/project-service'
import { makeProject } from '../../__tests__/helpers'
import { TUNING } from '@content/tuning'

function serviceWith(project = makeProject()) {
  const svc = new ProjectService()
  svc.reset([project])
  return svc
}

describe('项目状态机', () => {
  it('CONCEPT → PRE_PRODUCTION → PRODUCTION 正常推进', () => {
    const svc = serviceWith(makeProject({ phase: 'CONCEPT' }))
    expect(svc.advancePhaseGeneric('project-1', 1).success).toBe(true)
    expect(svc.getById('project-1')?.phase).toBe('PRE_PRODUCTION')

    expect(svc.advancePhaseGeneric('project-1', 2).success).toBe(true)
    const p = svc.getById('project-1')
    expect(p?.phase).toBe('PRODUCTION')
    expect(p?.actualStartDay).toBe(2)
  })

  it('制作完成度不足时拒绝进入 QA', () => {
    const svc = serviceWith(makeProject({
      phase: 'PRODUCTION',
      workRemainingByDiscipline: { design: 30, programming: 30, art: 30, qa: 0 },
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    }))
    const r = svc.advancePhaseGeneric('project-1', 3)
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('PRJ_QA_NOT_READY')
    expect(svc.getById('project-1')?.phase).toBe('PRODUCTION')
  })

  it('三项均达到阈值时可进入 QA，并注入 QA 工作量', () => {
    const svc = serviceWith(makeProject({
      phase: 'PRODUCTION',
      workRemainingByDiscipline: { design: 5, programming: 5, art: 5, qa: 0 },
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    }))
    const r = svc.advancePhaseGeneric('project-1', 3)
    expect(r.success).toBe(true)
    const p = svc.getById('project-1')
    expect(p?.phase).toBe('QA')
    expect(p?.workTotalByDiscipline.qa).toBeGreaterThan(0)
    expect(p?.initialDefectLevel).toBeGreaterThanOrEqual(0)
  })

  it('QA 未完成 100% 时拒绝进入上市准备', () => {
    const svc = serviceWith(makeProject({
      phase: 'QA',
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 10 },
    }))
    const r = svc.advancePhaseGeneric('project-1', 4)
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('PRJ_QA_INCOMPLETE')
    expect(svc.getById('project-1')?.phase).toBe('QA')
  })

  it('QA 完成 100% 时允许进入上市准备', () => {
    const svc = serviceWith(makeProject({
      phase: 'QA',
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
    }))
    const r = svc.advancePhaseGeneric('project-1', 4)
    expect(r.success).toBe(true)
    expect(svc.getById('project-1')?.phase).toBe('READY_TO_LAUNCH')
  })

  it('已上市项目不能取消，也不能暂停', () => {
    const svc = serviceWith(makeProject({ phase: 'LAUNCHED' }))
    expect(svc.cancel('project-1', 'player_decision').success).toBe(false)
    expect(svc.pause('project-1').success).toBe(false)
  })

  it('手动 cancel() 后进入 CANCELLED 终态且 isPaused=false、pauseReason 清除', () => {
    const svc = serviceWith(
      makeProject({ phase: 'PRODUCTION', isPaused: true, pauseReason: 'manual' }),
    )
    const r = svc.cancel('project-1', 'player_decision')
    expect(r.success).toBe(true)
    const p = svc.getById('project-1')
    expect(p?.phase).toBe('CANCELLED')
    expect(p?.isPaused).toBe(false)
    expect(p?.pauseReason).toBeNull()
    expect(p?.cancellationReason).toBe('player_decision')
  })

  it('手动 cancel() 清除预算耗尽过程态标记（终态清理口径 DESIGN-G05 §6.3）', () => {
    const svc = serviceWith(
      makeProject({
        phase: 'PRODUCTION',
        isPaused: true,
        pauseReason: 'budget_exhausted',
        budgetExhausted: true,
        pausedDays: 7,
        riskFlags: ['budget_exhausted', 'quality_risk'],
      }),
    )
    const r = svc.cancel('project-1', 'player_decision')
    expect(r.success).toBe(true)
    const p = svc.getById('project-1')
    expect(p?.phase).toBe('CANCELLED')
    expect(p?.isPaused).toBe(false)
    expect(p?.pauseReason).toBeNull()
    expect(p?.budgetExhausted).toBe(false)
    expect(p?.pausedDays).toBe(0)
    expect(p?.riskFlags).not.toContain('budget_exhausted')
    // 其他风险标记不受影响
    expect(p?.riskFlags).toContain('quality_risk')
    expect(p?.cancellationReason).toBe('player_decision')
  })

  it('cancel() 在 riskFlags 无 budget_exhausted 时移除操作无害', () => {
    const svc = serviceWith(
      makeProject({ phase: 'PRODUCTION', riskFlags: ['quality_risk'] }),
    )
    const r = svc.cancel('project-1', 'player_decision')
    expect(r.success).toBe(true)
    expect(svc.getById('project-1')?.riskFlags).toEqual(['quality_risk'])
  })

  it('不存在 PAUSED 主状态，暂停只设置 isPaused', () => {
    const svc = serviceWith(makeProject({ phase: 'PRODUCTION' }))
    svc.pause('project-1')
    const p = svc.getById('project-1')
    expect(p?.phase).toBe('PRODUCTION')
    expect(p?.isPaused).toBe(true)
  })

  it('超额分配被拒绝', () => {
    const svc = new ProjectService()
    const p = makeProject({ id: 'p2', teamAssignments: [] })
    const other = makeProject({
      id: 'p1',
      teamAssignments: [
        { employeeId: 'emp-1', projectId: 'p1', allocationRatio: 0.8, roleOnProject: 'generalist' },
      ],
    })
    svc.reset([p, other])
    const r = svc.reassignTeam({
      projectId: 'p2',
      assignments: [
        { employeeId: 'emp-1', projectId: 'p2', allocationRatio: 0.5, roleOnProject: 'generalist' },
      ],
      allAssignmentsInCompany: other.teamAssignments,
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('EMP_ALLOCATION_EXCEEDS_100_PERCENT')
  })

  it('生产阈值来自 TUNING', () => {
    expect(TUNING.project.productionCompletionThreshold).toBeGreaterThan(0)
    const svc = serviceWith(makeProject({
      phase: 'PRODUCTION',
      workRemainingByDiscipline: { design: 11, programming: 11, art: 11, qa: 0 },
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 0 },
    }))
    // 完成度 89% < 90%
    expect(svc.advancePhaseGeneric('project-1', 5).success).toBe(false)
  })
})
