import { describe, it, expect } from 'vitest'
import { ProjectService } from '@simulation/services/project-service'
import { makeProject } from '../../__tests__/helpers'
import { GameWorld } from '@application/mediators/game-world'

function serviceWith(project = makeProject()) {
  const svc = new ProjectService()
  svc.reset([project])
  return svc
}

describe('C-02 delayLaunch 验收 V1~V8', () => {
  it('V1：delayLaunch(30) → plannedLaunchDay +30，brandPenalty = 1', () => {
    const p = makeProject({ phase: 'PRODUCTION', plannedLaunchDay: 150 })
    const svc = serviceWith(p)

    const r = svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 1 })
    expect(r.success).toBe(true)
    expect(r.result!.brandPenalty).toBe(1)
    expect(r.result!.project.plannedLaunchDay).toBe(180)
    expect(r.result!.project.originalPlannedLaunchDay).toBe(150)
    expect(r.result!.project.launchDelayDays).toBe(30)
  })

  it('V1 GameWorld 层：brand 从 10 降到 9', () => {
    const gw = new GameWorld(11)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const proj = gw.createProject({
      name: 'Game',
      genreId: 'action',
      budgetTotalCapCents: 1_000_000,
      plannedLaunchDay: 150,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    }).result!
    expect(gw.getPlayerCompany()!.brand).toBe(10)

    const r = gw.delayLaunch(proj.id, 30)
    expect(r.success).toBe(true)
    expect(gw.getPlayerCompany()!.brand).toBe(9) // brandPenalty=1
  })

  it('V2：先 delayLaunch(90) 再 delayLaunch(90) → 300×0.5=150 上限，第二次超 450 被拒', () => {
    // plannedLaunchDay=300 → original=300, max=round(300×1.5)=450
    // first: 300+90=390 ≤ 450 ✓
    // second: 390+90=480 > 450 ✗
    const p = makeProject({ phase: 'PRODUCTION', plannedLaunchDay: 300 })
    const svc = serviceWith(p)

    const first = svc.delayLaunch({ projectId: 'project-1', extraDays: 90, dayIndex: 1 })
    expect(first.success).toBe(true)
    expect(first.result!.project.plannedLaunchDay).toBe(390)
    expect(first.result!.project.originalPlannedLaunchDay).toBe(300)

    const second = svc.delayLaunch({ projectId: 'project-1', extraDays: 90, dayIndex: 2 })
    expect(second.success).toBe(false)
    expect(second.errorCode).toBe('PRJ_LAUNCH_DELAY_EXCEEDS_MAX')
    // 拒绝后不变
    expect(svc.getById('project-1')!.plannedLaunchDay).toBe(390)
  })

  it('V4：riskFlags 包含 launch_delayed，includes 去重（第二次 delay 不 push 重复项）', () => {
    const p = makeProject({ phase: 'PRODUCTION', plannedLaunchDay: 100 })
    const svc = serviceWith(p)

    svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 1 })
    const afterFirst = svc.getById('project-1')!
    expect(afterFirst.riskFlags).toContain('launch_delayed')
    expect(afterFirst.riskFlags.filter((f) => f === 'launch_delayed')).toHaveLength(1)

    // 手动重置 launchDelayDays 和 plannedLaunchDay 但保留 riskFlags 里的 'launch_delayed'
    // 模拟：delay 已经触发过 riskFlag，再次 delay 时应 includes 去重
    const resetP = { ...afterFirst, plannedLaunchDay: 100, launchDelayDays: 0, originalPlannedLaunchDay: null }
    svc.reset([resetP])
    svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 2 })

    const riskCount = svc.getById('project-1')!.riskFlags.filter((f) => f === 'launch_delayed').length
    expect(riskCount).toBe(1)
  })

  it('V5：READY_TO_LAUNCH 阶段 delayLaunch 被拒', () => {
    const svc = serviceWith(makeProject({ phase: 'READY_TO_LAUNCH', plannedLaunchDay: 150 }))
    const r = svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 1 })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('PRJ_LAUNCH_DELAY_TERMINAL')
  })

  it('V6：delay 后 workTotal / workRemaining 不变', () => {
    const totals = { design: 100, programming: 150, art: 120, qa: 0 }
    const remaining = { design: 70, programming: 100, art: 80, qa: 0 }
    const p = makeProject({
      phase: 'PRODUCTION',
      plannedLaunchDay: 150,
      workTotalByDiscipline: { ...totals },
      workRemainingByDiscipline: { ...remaining },
    })
    const svc = serviceWith(p)

    svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 1 })
    const after = svc.getById('project-1')!

    expect(after.workTotalByDiscipline).toEqual(totals)
    expect(after.workRemainingByDiscipline).toEqual(remaining)
  })

  it('V8：旧存档（无 originalPlannedLaunchDay）加载后 delayLaunch 正常，首次延期时自动设置', () => {
    const legacy = makeProject({
      phase: 'PRODUCTION',
      plannedLaunchDay: 200,
    })
    // 模拟旧存档：删除 originalPlannedLaunchDay / launchDelayDays 字段
    const oldShape = { ...legacy }
    delete (oldShape as any).originalPlannedLaunchDay
    delete (oldShape as any).launchDelayDays

    const svc = new ProjectService()
    svc.reset([oldShape as any])

    const r = svc.delayLaunch({ projectId: 'project-1', extraDays: 30, dayIndex: 1 })
    expect(r.success).toBe(true)
    expect(r.result!.project.plannedLaunchDay).toBe(230)
    expect(r.result!.project.originalPlannedLaunchDay).toBe(200) // 首次从当前 plannedLaunchDay 复制
    expect(r.result!.project.launchDelayDays).toBe(30)
  })
})
