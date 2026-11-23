/**
 * §5.2 拆解 / §6.1 关键路径测试。
 * 覆盖 TC-01（确定性）、TC-02（Σbaseline=W_total）、TC-03（依赖 DAG）、TC-16（依赖环）、TC-24（synergy 分摊守恒）。
 */
import { describe, it, expect } from 'vitest'
import type { RequireRule } from '@domain/value-objects/product-blueprint-composition'
import { decomposeWorkPackages, topologicalOrder } from '@domain/value-objects/project-execution-decomposition'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import { params, tc02Decomposition, workload } from './project-execution-fixtures'

function totalOf(wps: ReadonlyArray<{ baselineWorkUnits: number }>): number {
  return wps.reduce((s, w) => s + w.baselineWorkUnits, 0)
}

describe('TC-02 拆解：1 core×强度2 + 2 support + 1 content×tier3', () => {
  it('按 raw>0 生成对应学科 WP，且 ΣbaselineWorkUnits = W_total（严格守恒）', () => {
    const input = tc02Decomposition()
    const result = decomposeWorkPackages(input, params())
    const expectedTotal = Object.values(input.workload).reduce((a, b) => a + b, 0)
    expect(result.totalBaselineWorkUnits).toBeCloseTo(expectedTotal, 9)
    expect(totalOf(result.workPackages)).toBeCloseTo(expectedTotal, 9)
    // 每学科总和 = W_d
    for (const d of ['design', 'code', 'art', 'audio', 'qa'] as const) {
      const sum = result.workPackages.filter((w) => w.discipline === d).reduce((s, w) => s + w.baselineWorkUnits, 0)
      expect(sum).toBeCloseTo(input.workload[d], 9)
    }
    // 内容包对应 art/audio WP 存在且来源正确
    const packArt = result.workPackages.find((w) => w.sourceRef.contentPackId === 'PACK-1' && w.discipline === 'art')
    expect(packArt).toBeDefined()
  })

  it('raw=0 的学科不生成 WP（无 0 工作量 WP 混入）', () => {
    const result = decomposeWorkPackages(
      tc02Decomposition({
        instances: [{ instanceId: 'X', displayLabel: 'x', rawWorkload: workload({ design: 10 }) }],
        contentPacks: [],
        workload: workload({ design: 10 }),
      }),
      params(),
    )
    expect(result.workPackages).toHaveLength(1)
    expect(result.workPackages[0]!.discipline).toBe('design')
  })
})

describe('TC-24 synergy 分摊守恒（C4）', () => {
  it('协同后 W_d < Σraw 时仍满足 ΣWP baseline = W_total，且不二次扣减 synergy', () => {
    // 两模块 art raw 各 50；全学科 raw 合计 100；synergy 后 W_art = 80（折扣 20%）
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ art: 50 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ art: 50 }) },
      ],
      contentPacks: [],
      workload: workload({ art: 80 }),
    })
    const r = decomposeWorkPackages(input, params())
    const per = r.workPackages.map((w) => w.baselineWorkUnits).sort((a, b) => a - b)
    expect(per).toEqual([40, 40]) // 占比 50/50 分摊 80
    expect(r.totalBaselineWorkUnits).toBeCloseTo(80, 9)
    expect(r.totalBaselineWorkUnits).toBeCloseTo(input.workload.art, 9)
  })

  it('多学科按 W_d^raw 占比分摊，各学科合计等于 W_d', () => {
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 30, design: 10 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 60, design: 90 }) },
      ],
      contentPacks: [],
      workload: workload({ code: 72, design: 60 }),
    })
    const r = decomposeWorkPackages(input, params())
    const code = r.workPackages.filter((w) => w.discipline === 'code')
    expect(code.reduce((s, w) => s + w.baselineWorkUnits, 0)).toBeCloseTo(72, 9)
    expect(code.find((w) => w.sourceRef.instanceId === 'B')!.baselineWorkUnits).toBeCloseTo(48, 9)
  })
})

describe('TC-01 确定性：同快照两次拆解结果一致', () => {
  it('WP id / 顺序 / baseline / 依赖 / 关键路径完全一致', () => {
    const a = decomposeWorkPackages(tc02Decomposition(), params())
    const b = decomposeWorkPackages(tc02Decomposition(), params())
    expect(a.workPackages.map((w) => w.workPackageId)).toEqual(b.workPackages.map((w) => w.workPackageId))
    expect(a.workPackages.map((w) => w.orderIndex)).toEqual(b.workPackages.map((w) => w.orderIndex))
    expect(a.criticalPathIds).toEqual(b.criticalPathIds)
    expect(a.baselineDurationDays).toBeCloseTo(b.baselineDurationDays, 12)
  })
})

describe('TC-03 依赖：A 需 B ⇒ A.blockedBy 含 B；B DONE 前 A=BLOCKED', () => {
  it('同 discipline 优先映射依赖边，并派生 dependents / priority / 可拓扑', () => {
    const rule: RequireRule = {
      ruleId: 'R1',
      subject: { kind: 'option', value: 'A' },
      requires: [{ kind: 'option', value: 'B' }],
      severity: 'hard',
      penalty: 0,
    }
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 40 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 60 }) },
      ],
      contentPacks: [],
      requireRules: [rule],
      workload: workload({ code: 100 }),
    })
    const r = decomposeWorkPackages(input, params())
    const aCode = r.workPackages.find((w) => w.sourceRef.instanceId === 'A')!
    const bCode = r.workPackages.find((w) => w.sourceRef.instanceId === 'B')!
    expect(aCode.blockedBy).toEqual([bCode.workPackageId])
    expect(bCode.dependents).toEqual([aCode.workPackageId])
    expect(aCode.state).toBe('BLOCKED')
    expect(bCode.state).toBe('READY')
    expect(aCode.priority).toBe('P1')
    expect(bCode.priority).toBe('P0')
    expect(topologicalOrder(r.workPackages)).not.toBeNull()
  })

  it('TC-16（R4/CR-03-02）：A→B→A 依赖环 ⇒ 抛 PROJ_DEPENDENCY_CYCLE（fail-closed，不再静默丢边）', () => {
    const mk = (id: string, val: string): RequireRule => ({
      ruleId: `R-${i++}`,
      subject: { kind: 'option', value: id },
      requires: [{ kind: 'option', value: val }],
      severity: 'hard',
      penalty: 0,
    })
    let i = 0
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 10 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 10 }) },
      ],
      contentPacks: [],
      requireRules: [mk('A', 'B'), mk('B', 'A')],
      workload: workload({ code: 20 }),
    })
    // R4：成环边不再回滚丢弃（静默降级会把 DAG 吞成森林、工期失真），直接拒绝拆解
    expect(() => decomposeWorkPackages(input, params())).toThrow(ProjectError)
    try {
      decomposeWorkPackages(input, params())
    } catch (e) {
      expect((e as ProjectError).code).toBe(PROJ_ERROR.DEPENDENCY_CYCLE)
    }
  })

  it('TC-16（R4）：依赖缺失型环 A→B→GHOST→A ⇒ 抛 PROJ_DEPENDENCY_CYCLE（dangling required source 不静默跳过）', () => {
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 10 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 10 }) },
      ],
      contentPacks: [],
      requireRules: [
        { ruleId: 'R1', subject: { kind: 'option', value: 'A' }, requires: [{ kind: 'option', value: 'B' }], severity: 'hard', penalty: 0 },
        // GHOST 不存在于任何实例/内容包：A→B→(缺失) 构成依赖缺失型环的入口
        { ruleId: 'R2', subject: { kind: 'option', value: 'B' }, requires: [{ kind: 'option', value: 'GHOST' }], severity: 'hard', penalty: 0 },
        { ruleId: 'R3', subject: { kind: 'option', value: 'GHOST' }, requires: [{ kind: 'option', value: 'A' }], severity: 'hard', penalty: 0 },
      ],
      workload: workload({ code: 20 }),
    })
    expect(() => decomposeWorkPackages(input, params())).toThrow(ProjectError)
    try {
      decomposeWorkPackages(input, params())
    } catch (e) {
      expect((e as ProjectError).code).toBe(PROJ_ERROR.DEPENDENCY_CYCLE)
    }
  })

  it('TC-16（R4）：跨学科依赖 A.art 必须被 B.code 阻塞（按 sourceRef 落到同源全部 WP）', () => {
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ art: 30 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 40 }) },
      ],
      contentPacks: [],
      requireRules: [
        { ruleId: 'R1', subject: { kind: 'option', value: 'A' }, requires: [{ kind: 'option', value: 'B' }], severity: 'hard', penalty: 0 },
      ],
      workload: workload({ art: 30, code: 40 }),
    })
    const r = decomposeWorkPackages(input, params())
    const aArt = r.workPackages.find((w) => w.sourceRef.instanceId === 'A' && w.discipline === 'art')!
    const bCode = r.workPackages.find((w) => w.sourceRef.instanceId === 'B' && w.discipline === 'code')!
    // A 无 code 学科 WP ⇒ 跨学科按 sourceRef 落边：A.art.blockedBy 含 B.code（删除空回退）
    expect(aArt.blockedBy).toContain(bCode.workPackageId)
    expect(bCode.dependents).toContain(aArt.workPackageId)
    expect(aArt.state).toBe('BLOCKED')
    expect(topologicalOrder(r.workPackages)).not.toBeNull()
  })

  it('soft RequireRule 不生成依赖边（§5.2-4 仅 hard）', () => {
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 10 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 10 }) },
      ],
      contentPacks: [],
      requireRules: [
        { ruleId: 'R', subject: { kind: 'option', value: 'A' }, requires: [{ kind: 'option', value: 'B' }], severity: 'soft', penalty: 0.1 },
      ],
      workload: workload({ code: 20 }),
    })
    const r = decomposeWorkPackages(input, params())
    expect(r.workPackages.every((w) => w.blockedBy.length === 0)).toBe(true)
  })
})

describe('§6.1 关键路径', () => {
  it('关键路径按 duration = baseline / max(ε, Cap_d) 加权取最长链', () => {
    const input = tc02Decomposition({
      instances: [
        { instanceId: 'A', displayLabel: 'a', rawWorkload: workload({ code: 100 }) },
        { instanceId: 'B', displayLabel: 'b', rawWorkload: workload({ code: 20 }) },
      ],
      contentPacks: [],
      workload: workload({ code: 120 }),
      capacity: workload({ code: 10 }),
      requireRules: [
        { ruleId: 'R', subject: { kind: 'option', value: 'A' }, requires: [{ kind: 'option', value: 'B' }], severity: 'hard', penalty: 0 },
      ],
    })
    const r = decomposeWorkPackages(input, params())
    // B(20/10=2d) → A(100/10=10d) = 12d（同实例跨学科边已在增量加边中判环）
    expect(r.baselineDurationDays).toBeCloseTo(12, 9)
    expect(r.criticalPathIds).toHaveLength(2)
  })
})
