import { describe, it, expect } from 'vitest'
import { ProjectService } from '@simulation/services/project-service'
import { makeProject } from '../../__tests__/helpers'

function serviceWith(project = makeProject()) {
  const svc = new ProjectService()
  svc.reset([project])
  return svc
}

describe('C-01 descope 验收 V1~V8', () => {
  it('V1：PRODUCTION 阶段 descope(0.3) → design/programming/art 各减 30%（取整），QA 按新总量派生', () => {
    const p = makeProject({
      phase: 'PRODUCTION',
      workTotalByDiscipline: { design: 100, programming: 150, art: 120, qa: 0 },
      workRemainingByDiscipline: { design: 90, programming: 140, art: 110, qa: 0 },
    })
    const svc = serviceWith(p)

    const r = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(r.success).toBe(true)
    const next = svc.getById('project-1')!

    // design: 100 × 0.7 = 70
    // programming: 150 × 0.7 = 105
    // art: 120 × 0.7 = 84
    expect(next.workTotalByDiscipline.design).toBe(70)
    expect(next.workTotalByDiscipline.programming).toBe(105)
    expect(next.workTotalByDiscipline.art).toBe(84)

    // remaining 也按 0.7 缩放
    expect(next.workRemainingByDiscipline.design).toBe(63)     // round(90 × 0.7)
    expect(next.workRemainingByDiscipline.programming).toBe(98) // round(140 × 0.7)
    expect(next.workRemainingByDiscipline.art).toBe(77)         // round(110 × 0.7)

    // QA 按新 totalProd × qaWorkRatio 派生
    // totalProd = 70 + 105 + 84 = 259
    // qaWorkRatio 默认 0.15 → round(259 × 0.15) = 39，但 minQaWorkPoints 保底 40
    expect(next.workTotalByDiscipline.qa).toBe(40)
    // PRODUCTION 阶段未进入 QA：remaining 和 total 同步
    expect(next.workRemainingByDiscipline.qa).toBe(40)

    expect(next.scopeCutRatio).toBe(0.3)
  })

  it('V2：连续 descope(0.3) + descope(0.3) → 累计 0.6 > 0.5，第二次被拒', () => {
    const svc = serviceWith(makeProject({ phase: 'PRODUCTION' }))

    const first = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(first.success).toBe(true)
    expect(svc.getById('project-1')!.scopeCutRatio).toBe(0.3)

    const second = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 2 })
    expect(second.success).toBe(false)
    expect(second.errorCode).toBe('PRJ_MAX_DESCIPE_REACHED')
    // 拒绝后 scopeCutRatio 仍为 0.3
    expect(svc.getById('project-1')!.scopeCutRatio).toBe(0.3)
  })

  it('V4：QA 阶段 descope → QA 进度重置为 0（remaining 设为新 total）', () => {
    const p = makeProject({
      phase: 'QA',
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 40 }, // 已完成 60%
    })
    const svc = serviceWith(p)

    const r = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(r.success).toBe(true)
    const next = svc.getById('project-1')!

    // QA 进度=0：remaining === total
    expect(next.workRemainingByDiscipline.qa).toBe(next.workTotalByDiscipline.qa)
    expect(next.workTotalByDiscipline.qa).toBeGreaterThan(0)
    // 生产三学科仍正常缩减
    expect(next.workTotalByDiscipline.design).toBe(70)
    expect(next.workTotalByDiscipline.programming).toBe(70)
    expect(next.workTotalByDiscipline.art).toBe(70)
  })

  it('V5：终态（LAUNCHED）descope 抛错', () => {
    const svc = serviceWith(makeProject({ phase: 'LAUNCHED' }))
    const r = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('PRJ_SCOPE_TERMINAL')
  })

  it('V5：终态（CANCELLED）descope 抛错', () => {
    const svc = serviceWith(makeProject({ phase: 'CANCELLED' }))
    const r = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('PRJ_SCOPE_TERMINAL')
  })

  it('V7：descope 后预算三字段（totalCap / spent / committed）不变', () => {
    const p = makeProject({
      phase: 'PRODUCTION',
      budgetTotalCapCents: 5_000_000,
      budgetSpentCents: 500_000,
      budgetCommittedCents: 1_000_000,
    })
    const svc = serviceWith(p)

    const before = svc.getById('project-1')!
    svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    const after = svc.getById('project-1')!

    expect(after.budgetTotalCapCents).toBe(before.budgetTotalCapCents)
    expect(after.budgetSpentCents).toBe(before.budgetSpentCents)
    expect(after.budgetCommittedCents).toBe(before.budgetCommittedCents)
  })

  it('V8：旧存档（无 scopeCutRatio 字段）加载后 descope 正常，scopeCutRatio 从 0 开始累计', () => {
    const legacy = makeProject({
      phase: 'PRODUCTION',
    })
    // 模拟旧存档：删除 scopeCutRatio 字段（Project 接口上是 optional）
    const oldShape = { ...legacy }
    delete (oldShape as any).scopeCutRatio

    // ProjectService 内部不会 undefined → 0 转换，descope 用 p.scopeCutRatio ?? 0
    const svc = new ProjectService()
    svc.reset([oldShape as any])

    const r = svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(r.success).toBe(true)
    expect(svc.getById('project-1')!.scopeCutRatio).toBe(0.3)
  })

  // —— 反证测试：riskFlags includes 去重 ——

  it('descope 两次同一项目 → riskFlags 只含一个 scope_descoped（includes 去重）', () => {
    const svc = serviceWith(makeProject({ phase: 'PRODUCTION' }))

    // 第一次 descope 0.3
    svc.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    const afterFirst = svc.getById('project-1')!
    expect(afterFirst.riskFlags.filter((f) => f === 'scope_descoped')).toHaveLength(1)

    // 由于 MAX_TOTAL_CUT=0.5，不能再 descope 了。手动改 scopeCutRatio 让第二次能过，然后看 riskFlags 去重
    // 改回 0，descope 一次 0.3 再 descope 一次 0.2（累计 0.5 刚好到上限）
    // 但 riskFlags 已经有 scope_descoped，第二次 should skip push
    const svc2 = serviceWith(makeProject({ phase: 'PRODUCTION' }))
    svc2.descope({ projectId: 'project-1', cutRatio: 0.3, dayIndex: 1 })
    expect(svc2.getById('project-1')!.riskFlags.filter((f) => f === 'scope_descoped')).toHaveLength(1)

    // 手动重置 scopeCutRatio 到 0（模拟老存档重复调用场景），但 riskFlags 保留 scope_descoped
    const p = svc2.getById('project-1')!
    svc2.reset([{ ...p, scopeCutRatio: 0 } as any])
    svc2.descope({ projectId: 'project-1', cutRatio: 0.2, dayIndex: 2 })

    const riskCount = svc2.getById('project-1')!.riskFlags.filter((f) => f === 'scope_descoped').length
    expect(riskCount).toBe(1)
  })
})
