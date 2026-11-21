/**
 * D-01 §5 组合规则测试。TC 编号对照 D-01 §17.1。
 */
import { describe, it, expect } from 'vitest'
import { checkCompositionRules } from '../product-blueprint-composition'
import type { ConflictRule, RequireRule } from '../product-blueprint-composition'
import { withTuningOverrides } from '../product-blueprint-tuning'
import {
  baseTemplate, baseInstance, baseSlot, baseStructure, emptyRules, tuning,
} from './product-blueprint-fixtures'

const run = (
  structure = baseStructure(),
  rules = emptyRules(),
  overrides: Record<string, unknown> = {},
  pending: string[] = [],
) => checkCompositionRules(
  structure,
  { 'TPL-COMBAT': baseTemplate(), 'TPL-A': baseTemplate({ templateId: 'TPL-A', domain: 'exploration' }), 'TPL-B': baseTemplate({ templateId: 'TPL-B', domain: 'progression' }) },
  rules,
  overrides.kBatchLimit !== undefined ? withTuningOverrides({ kBatchLimit: overrides.kBatchLimit as number }) : tuning(),
  pending,
)

describe('§5.3 / §11 E-EMPTY / E-EMPTY-CONTENT（TC-15）', () => {
  it('E-1：必选槽为空 → E-EMPTY（草稿可保存，锁定阻断）', () => {
    const s = baseStructure({ slots: [baseSlot({ bindings: [] })], instances: [] })
    expect(run(s).violations.map((v) => v.code)).toContain('E-EMPTY')
  })

  it('E-15：content 槽未绑定 ContentPack → E-EMPTY-CONTENT', () => {
    const s = baseStructure({
      slots: [baseSlot({ isContentSlot: true, requiredForType: false })],
    })
    expect(run(s).violations.map((v) => v.code)).toContain('E-EMPTY-CONTENT')
  })

  it('§5.3-1 槽位容量：绑定数 > maxInstances → 硬违规', () => {
    const s = baseStructure({
      slots: [baseSlot({ maxInstances: 1, bindings: ['INS-1', 'INS-2'] })],
      instances: [baseInstance(), baseInstance({ instanceId: 'INS-2' })],
    })
    expect(run(s).violations.some((v) => v.code === 'E-CONFLICT' && v.ruleId === 'R-MOD-1')).toBe(true)
  })

  it('§5.3-2 域接受：域不在 slot.domainAcceptance → 硬违规（R-MOD-1）', () => {
    const s = baseStructure({
      slots: [baseSlot({ domainAcceptance: ['narrative'] })],
    })
    expect(run(s).violations.some((v) => v.code === 'E-CONFLICT' && v.ruleId === 'R-MOD-1')).toBe(true)
  })
})

describe('§5.4 依赖 / 冲突 / 环（TC-02 / TC-03）', () => {
  const conflict = (severity: 'hard' | 'soft'): ConflictRule => ({
    ruleId: 'RC-TEST', a: { kind: 'template', value: 'TPL-A' },
    b: { kind: 'template', value: 'TPL-B' }, severity, reason: '互斥标签', penalty: 0.4,
  })

  const twoInstances = () => baseStructure({
    slots: [baseSlot({ maxInstances: 2, bindings: ['INS-A', 'INS-B'] })],
    instances: [
      baseInstance({ instanceId: 'INS-A', templateId: 'TPL-A', domain: 'exploration' }),
      baseInstance({ instanceId: 'INS-B', templateId: 'TPL-B', domain: 'progression' }),
    ],
  })

  it('TC-02：hard 互斥 → E-CONFLICT，阻断锁定', () => {
    const r = run(twoInstances(), { ...emptyRules(), conflictRules: [conflict('hard')] })
    expect(r.violations.some((v) => v.code === 'E-CONFLICT' && v.ruleId === 'RC-TEST')).toBe(true)
  })

  it('§5.4 第2步：soft 冲突 → W-CONFLICT 且计入 penalty_sum（§6.4）', () => {
    const r = run(twoInstances(), { ...emptyRules(), conflictRules: [conflict('soft')] })
    expect(r.violations.some((v) => v.code === 'W-CONFLICT')).toBe(true)
    expect(r.penaltySum).toBeCloseTo(0.4)
  })

  it('§5.4 第3步：hard RequireRule 未满足 → E-DEP（只检查不自动补全）', () => {
    const rule: RequireRule = {
      ruleId: 'RD-TEST', subject: { kind: 'template', value: 'TPL-COMBAT' },
      requires: [{ kind: 'template', value: 'TPL-SUPPORT' }], severity: 'hard', penalty: 0.2,
    }
    const s = baseStructure()
    const r = run(s, { ...emptyRules(), requireRules: [rule] })
    expect(r.violations.some((v) => v.code === 'E-DEP')).toBe(true)
    // 依赖未被自动补全
    expect(s.instances.some((i) => i.templateId === 'TPL-SUPPORT')).toBe(false)
  })

  it('§5.4 第3步：soft RequireRule 未满足 → W-DEP + penalty', () => {
    const rule: RequireRule = {
      ruleId: 'RD-SOFT', subject: { kind: 'template', value: 'TPL-COMBAT' },
      requires: [{ kind: 'tag', value: 'procedural' }], severity: 'soft', penalty: 0.15,
    }
    const r = run(baseStructure(), { ...emptyRules(), requireRules: [rule] })
    expect(r.violations.some((v) => v.code === 'W-DEP')).toBe(true)
    expect(r.penaltySum).toBeCloseTo(0.15)
  })

  it('TC-03：A 需 B、B 需 A → E-CYCLE，列出环路径，不自动打破', () => {
    const s = baseStructure({
      slots: [baseSlot({ maxInstances: 2, bindings: ['INS-A', 'INS-B'] })],
      instances: [
        baseInstance({ instanceId: 'INS-A', templateId: 'TPL-A', domain: 'exploration' }),
        baseInstance({ instanceId: 'INS-B', templateId: 'TPL-B', domain: 'progression' }),
      ],
    })
    const rules = [
      { ruleId: 'R1', subject: { kind: 'template' as const, value: 'TPL-A' }, requires: [{ kind: 'template' as const, value: 'TPL-B' }], severity: 'hard' as const, penalty: 0 },
      { ruleId: 'R2', subject: { kind: 'template' as const, value: 'TPL-B' }, requires: [{ kind: 'template' as const, value: 'TPL-A' }], severity: 'hard' as const, penalty: 0 },
    ]
    const r = run(s, { ...emptyRules(), requireRules: rules })
    const cycle = r.violations.find((v) => v.code === 'E-CYCLE')
    expect(cycle).toBeDefined()
    expect(cycle?.subjectIds.join('→')).toContain('template:TPL-A')
    expect(cycle?.subjectIds.join('→')).toContain('template:TPL-B')
  })

  it('C5 / CODE01-R03 反证：环中依赖缺失（无 active 支撑）仍报 E-CYCLE，E-DEP 不回退', () => {
    // 结构仅 TPL-COMBAT active；TPL-SUPPORT 无 active 实例 → 旧实现 supports() 过滤掉边，环漏报
    const rules: RequireRule[] = [
      {
        ruleId: 'R1', subject: { kind: 'template', value: 'TPL-COMBAT' },
        requires: [{ kind: 'template', value: 'TPL-SUPPORT' }], severity: 'hard', penalty: 0,
      },
      {
        ruleId: 'R2', subject: { kind: 'template', value: 'TPL-SUPPORT' },
        requires: [{ kind: 'template', value: 'TPL-COMBAT' }], severity: 'hard', penalty: 0,
      },
    ]
    const r = run(baseStructure(), { ...emptyRules(), requireRules: rules })
    expect(r.violations.some((v) => v.code === 'E-CYCLE')).toBe(true)
    // 缺失依赖的 E-DEP 兜底仍在（安全性不因环检测放宽而下降）
    expect(r.violations.some((v) => v.code === 'E-DEP')).toBe(true)
  })

  it('依赖满足时不报 E-DEP（传递闭包正例）', () => {
    const rule: RequireRule = {
      ruleId: 'RD-OK', subject: { kind: 'template', value: 'TPL-COMBAT' },
      requires: [{ kind: 'tag', value: 'real_time' }], severity: 'hard', penalty: 0,
    }
    const r = run(baseStructure(), { ...emptyRules(), requireRules: [rule] })
    expect(r.violations.some((v) => v.code === 'E-DEP')).toBe(false)
  })
})

describe('§4.10 / §11 E-OPT / R-COM-7 / E-19', () => {
  it('E-16：required 选项组未选 → E-OPT', () => {
    const template = baseTemplate({
      optionGroups: [{ optionGroupId: 'G-REQ', name: '', required: true, options: [] }],
    })
    const r = checkCompositionRules(
      baseStructure(), { 'TPL-COMBAT': template }, emptyRules(), tuning(),
    )
    expect(r.violations.some((v) => v.code === 'E-OPT')).toBe(true)
  })

  it('R-COM-7：卖点被 active 模块的 template.uspIds 支撑 → 无 E-USP', () => {
    const template = baseTemplate({ uspIds: ['USP-OK'] })
    const s = baseStructure({
      positioning: { ...baseStructure().positioning, sellingPoints: ['USP-OK'] },
    })
    const r = checkCompositionRules(baseStructure({ ...s, instances: [baseInstance()] }), { 'TPL-COMBAT': template }, emptyRules(), tuning())
    expect(r.violations.some((v) => v.code === 'E-USP')).toBe(false)
  })

  it('TC-04：3 条卖点中 1 条无支撑 → E-USP（草稿警告 / 锁定阻断）', () => {
    const template = baseTemplate({ uspIds: ['USP-1', 'USP-2'] }) // 前两条被支撑，第三条无支撑
    const s = baseStructure({
      positioning: { ...baseStructure().positioning, sellingPoints: ['USP-1', 'USP-2', 'USP-BAD'] },
    })
    const r = checkCompositionRules(s, { 'TPL-COMBAT': template }, emptyRules(), tuning())
    const usp = r.violations.filter((v) => v.code === 'E-USP')
    expect(usp).toHaveLength(1)
    expect(usp[0]?.subjectIds).toEqual(['USP-BAD'])
    expect(usp[0]?.ruleId).toBe('R-COM-7')
  })

  it('§11 E-19 / TC-24：待处理不兼容模块非空 → E-INCOMPAT；k_batch_limit 可注入', () => {
    const s = baseStructure()
    expect(run(s, emptyRules(), {}, ['INS-X']).violations.some((v) => v.code === 'E-INCOMPAT')).toBe(true)
    const big = Array.from({ length: 12 }, (_, i) => `INS-${i}`)
    const r = run(s, emptyRules(), { kBatchLimit: 8 }, big)
    const incompat = r.violations.find((v) => v.code === 'E-INCOMPAT')
    expect(incompat?.subjectIds).toHaveLength(8)
  })
})
