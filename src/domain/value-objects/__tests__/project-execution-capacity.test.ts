/**
 * §6.2 产能 / §6.3 日推进 / §6.4 成本测试。
 * 覆盖 TC-06（追加预算不改 W_d）、TC-09（code 有产能 art=0 ⇒ art 瓶颈）、TC-10（团队=0 ⇒ Cap=0/Cost=+∞）、
 * TC-11（hrb=0 ⇒ ratio=+∞）、N-01/P1（W_d=0 不入求和，无 0×+∞）、§10 B-2。
 */
import { describe, it, expect } from 'vitest'
import {
  computeCapacity,
  computeCapacityVector,
  computeCostPerUnit,
  estimateProjectCost,
} from '@domain/value-objects/project-execution-capacity'
import {
  advanceOneDay,
  computeBottleneck,
  progressVector,
  refreshReadyStates,
  allWorkPackagesDone,
} from '@domain/value-objects/project-execution-daily'
import { member, params, scenarioATeam, workload } from './project-execution-fixtures'

describe('§6.2 Cap_d 与 §6.4 costPerUnit_d 的显式除零分支（C3）', () => {
  it('skillLevel=0 的成员不计入 team_d ⇒ Cap_d=0（§10 B-9 不伪造产能）', () => {
    const team = [member('a', { code: 0 }), member('b', { art: 3 })]
    expect(computeCapacity(team, 'code', 0, params())).toBe(0)
    expect(computeCapacity(team, 'art', 0, params())).toBeCloseTo(1.0, 9) // f_skill(3)=1.0 × k_output 1
  })

  it('Cap_d = k_output × Σ f_skill：level 1..5 映射', () => {
    const p = params()
    const team = [member('a', { code: 1 }), member('b', { code: 5 })]
    expect(computeCapacity(team, 'code', 0, p)).toBeCloseTo(0.6 + 1.4, 9)
    expect(computeCapacityVector(team, 0, p).art).toBe(0)
  })

  it('Cap_d=0 ⇒ costPerUnit_d = +∞（不是 0/ε=0）', () => {
    expect(computeCostPerUnit(1000, 0, params())).toBe(Number.POSITIVE_INFINITY)
    expect(computeCostPerUnit(1000, 2, params())).toBe(500)
  })

  it('available(e,day)=false 的成员被排除（§6.2 available 语义，D-03 输入）', () => {
    const team = [member('a', { code: 3 })].map((m) => ({ ...m, available: (d: number) => d < 10 }))
    expect(computeCapacity(team, 'code', 5, params())).toBe(1)
    expect(computeCapacity(team, 'code', 10, params())).toBe(0)
  })
})

describe('TC-10 团队=0：Cap_d=0、Cost_est=+∞、进度停滞但承诺照常', () => {
  it('有工作量但无团队 ⇒ Cost_est=+∞，ratio=+∞，verdict 需缩减范围', () => {
    const r = estimateProjectCost(
      {
        workload: workload({ code: 100 }),
        members: [],
        day: 0,
        budgetCapacityCents: 1_000_000,
        hrb: 0.5,
        rTech: 0,
        rScope: 0,
      },
      params(),
    )
    expect(r.costEstCents).toBe(Number.POSITIVE_INFINITY)
    expect(r.costPerWorkUnit.code).toBe(Number.POSITIVE_INFINITY)
    expect(r.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(r.verdict).toBe('need_reduce_scope_or_lower_goal')
  })
})

describe('N-01/P1：W_d=0 的学科不进入求和（消除 0×+∞ = NaN）', () => {
  it('art 无团队（costPerUnit=+∞）但 W_art=0 ⇒ Cost_est 有限且非 NaN', () => {
    const team = [member('c', { code: 3 })]
    const r = estimateProjectCost(
      {
        workload: workload({ code: 100, art: 0 }),
        members: team,
        day: 0,
        budgetCapacityCents: 1_000_000,
        hrb: 0.5,
        rTech: 0.2,
        rScope: 0.1,
      },
      params(),
    )
    expect(r.costPerWorkUnit.art).toBe(Number.POSITIVE_INFINITY) // art 无团队
    expect(Number.isFinite(r.costEstCents)).toBe(true) // 但 art 不参与求和
    expect(Number.isNaN(r.costEstCents)).toBe(false)
    // salaryDaily = 420000 / 21 = 20000；costPerUnit = 20000 / 1.0 = 20000；100×20000×(1+0.2×0.2)
    expect(r.costEstCents).toBe(Math.ceil(100 * 20_000 * (1 + 0.2 * 0.2)))
  })
})

describe('TC-09 日推进：code 2 人 / art 0 人 ⇒ art 产出 0，art 为瓶颈', () => {
  function baseWps() {
    return [
      mkWp('code', 10, 0),
      mkWp('code', 10, 1),
      mkWp('art', 20, 2),
    ]
  }
  it('code WP 产出 > 0；art WP 产出 = 0；burden_art=+∞ 为瓶颈', () => {
    const wps = baseWps()
    refreshReadyStates(wps)
    const r = advanceOneDay({
      projectId: 'P1',
      companyId: 'C1',
      day: 1,
      workPackages: wps,
      capacity: workload({ code: 1, art: 0 }),
      costPerWorkUnit: workload({ code: 100, art: Number.POSITIVE_INFINITY }),
    })
    expect(r.producedByDiscipline.code).toBeCloseTo(1, 9)
    expect(r.producedByDiscipline.art).toBe(0)
    const b = computeBottleneck(r.workPackages, workload({ code: 1, art: 0 }), params().epsilon)
    expect(b.discipline).toBe('art')
  })

  it('进度向量分学科（无综合百分比字段）', () => {
    const pv = progressVector([{ ...mkWp('code', 10, 0), deliveredWorkUnits: 5 }, mkWp('art', 10, 1)])
    expect(pv.code).toBeCloseTo(0.5, 9)
    expect(pv.art).toBe(0)
    expect(pv.audio).toBe(1) // 无要求视为完成（§6.7）
  })
})

describe('§6.3 派工顺序与依赖解锁', () => {
  it('P0 先于 P1；同优先级按 |dependents| 降序再 orderIndex', () => {
    const wps = [
      { ...mkWp('code', 10, 0), priority: 'P1' as const },
      { ...mkWp('code', 10, 1), priority: 'P0' as const },
      { ...mkWp('code', 10, 2), priority: 'P1' as const, dependents: ['x', 'y'] },
    ]
    const r = advanceOneDay({
      projectId: 'P1',
      companyId: 'C1',
      day: 1,
      workPackages: wps,
      capacity: workload({ code: 1 }),
      costPerWorkUnit: workload({ code: 0 }),
    })
    // 仅 1 单位产能：P0 先拿，其余 0
    expect(r.logs).toHaveLength(1)
    expect(r.logs[0]!.workPackageId).toBe(wps[1]!.workPackageId)
  })

  it('B DONE 后 A 解锁为 READY（§5.3-3）', () => {
    const a = { ...mkWp('code', 5, 0), blockedBy: ['wp-B'] }
    const b = { ...mkWp('code', 1, 1), workPackageId: 'wp-B' }
    const wps = [a, b]
    refreshReadyStates(wps)
    expect(wps[0]!.state).toBe('BLOCKED')
    const r = advanceOneDay({
      projectId: 'P1',
      companyId: 'C1',
      day: 1,
      workPackages: wps,
      capacity: workload({ code: 10 }),
      costPerWorkUnit: workload({ code: 0 }),
    })
    expect(r.workPackages.find((w) => w.workPackageId === 'wp-B')!.state).toBe('DONE')
    // 当日批次内：B 完成后 A 同日解锁并完成（依赖无环 ⇒ 无死锁）
    expect(r.workPackages.find((w) => w.workPackageId === a.workPackageId)!.state).toBe('DONE')
    expect(allWorkPackagesDone(r.workPackages)).toBe(true)
  })

  it('同日释放的依赖链：下一日刷新为 READY 后可推进（不悬停 BLOCKED）', () => {
    const b = { ...mkWp('code', 1, 0), workPackageId: 'wp-B' }
    const a = { ...mkWp('code', 5, 1), blockedBy: ['wp-B'] }
    const day1 = advanceOneDay({
      projectId: 'P1',
      companyId: 'C1',
      day: 1,
      workPackages: [a, b],
      capacity: workload({ code: 10 }),
      costPerWorkUnit: workload({ code: 0 }),
    })
    expect(day1.workPackages.find((w) => w.workPackageId === a.workPackageId)!.state).toBe('DONE')
  })
})

function mkWp(d: 'design' | 'code' | 'art', units: number, order: number) {
  return {
    workPackageId: `wp-${d}-${order}`,
    projectId: 'P1',
    snapshotId: 'S1',
    sourceRef: { instanceId: `I-${order}` },
    discipline: d,
    workUnits: units,
    baselineWorkUnits: units,
    remainingWorkUnits: units,
    deliveredWorkUnits: 0,
    progress: 0,
    skillRef: null,
    requiredSkillLevel: 0,
    blockedBy: [] as string[],
    dependents: [] as string[],
    priority: 'P0' as const,
    state: 'READY' as const,
    kind: 'NORMAL' as const,
    orderIndex: order,
    reworkSessionId: null,
    reworkMode: null,
  }
}

describe('场景 A 团队产能可解释', () => {
  it('5 人团队：code 产能 > design/art，qa 有独立产能（学科不可转移）', () => {
    const cap = computeCapacityVector(scenarioATeam(), 0, params())
    // code: f(4)+f(3) = 1.2 + 1.0
    expect(cap.code).toBeCloseTo(2.2, 9)
    expect(cap.art).toBeCloseTo(1.0, 9)
    expect(cap.design).toBeCloseTo(1.0, 9)
    expect(cap.qa).toBeCloseTo(1.0, 9)
    expect(cap.code).toBeGreaterThan(cap.art)
  })
})
