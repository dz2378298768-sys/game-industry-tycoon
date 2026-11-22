/**
 * D-02 §6.3/§3.8/§3.9/§3.10/§4 测试：覆盖向量、闸门（IND-3/IND-4）、资格状态机、
 * 异常码五码、形式转换（TC-12/13/15）、qcb 契约（TC-07/08/18）、决策记录。
 */
import { describe, expect, it } from 'vitest'
import {
  buildDeliveryDecisionRecord,
  canTransitionDeliveryForm,
  evaluateCompleteness,
  evaluateDeliveryFormQualification,
  evaluateDeliveryGate,
  expectationPolicyForOutcome,
  migrateQcbState,
  readQualityCeilingBandState,
  readQualityCeilingBandValue,
  supersedeForUpgrade,
  transitionQualityAssessment,
} from '@domain/value-objects/product-completeness-gate'
import { getActiveChecklist, buildP1ChecklistTemplates } from '@domain/value-objects/product-completeness-checklists'
import { withCompletenessTuningOverrides } from '@domain/value-objects/product-completeness-tuning'
import {
  baseContribution,
  baseContentPack,
  baseInstance,
  baseSupportSlot,
  baseTemplate,
} from './product-completeness-fixtures'
import {
  computeDesignQuality,
  computeImplementationQuality,
} from '@domain/value-objects/product-completeness-quality'
import { deriveArchetypeClass, resolveArchetypeClass } from '@domain/value-objects/product-completeness-classification'
import { CompletenessDomainError } from '@domain/entities/product-completeness'
import type { EvaluationContext, QualityAssessment } from '@domain/entities/product-completeness'
import {
  baseContext,
  baseSnapshot,
  completeStructure,
  p1Templates,
  tuning,
} from './product-completeness-fixtures'

const c = (overrides: Partial<EvaluationContext> = {}) => baseContext(overrides)

describe('D02 §5.2 archetypeClass 派生', () => {
  it('technical：T_unsat ≠ ∅（TC-04 技术型）', () => {
    const ctx = c()
    ctx.snapshot.estimates!.techRisk.unsatisfied = [
      { gateId: 'g1', domainId: 'world_streaming', minCapabilityLevel: 2, note: '' },
    ]
    expect(deriveArchetypeClass(ctx, tuning())).toBe('technical')
  })

  it('technical：first_person 视角 / open_zone 结构（分类顺序固定）', () => {
    const structure = completeStructure()
    structure.positioning.perspectiveId = 'first_person'
    expect(deriveArchetypeClass(c({ snapshot: baseSnapshot({ structure }) }), tuning())).toBe('technical')
    const s2 = completeStructure()
    s2.positioning.structureId = 'sandbox'
    expect(deriveArchetypeClass(c({ snapshot: baseSnapshot({ structure: s2 }) }), tuning())).toBe('technical')
  })

  it('niche：|claims|=1 且 core intensity 2 ≥ τ_niche=2；broad：claims ≥ 2；generic：空草稿', () => {
    expect(deriveArchetypeClass(c(), tuning())).toBe('niche') // 1 claim + intensity 3
    const broad = completeStructure()
    broad.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B']
    expect(deriveArchetypeClass(c({ snapshot: baseSnapshot({ structure: broad }) }), tuning())).toBe('broad')
    const empty = completeStructure({ instances: [] })
    expect(deriveArchetypeClass(c({ snapshot: baseSnapshot({ structure: empty, estimates: null }) }), tuning())).toBe('generic')
  })

  it('X-2 玩家覆盖（P1 CONFIRMED）：override 生效；无理由 fail-closed 抛错', () => {
    const ctx = c({
      archetypeClassOverride: { archetypeClass: 'broad', reason: 'QA 调试：按广谱标准评估' },
    })
    expect(resolveArchetypeClass(ctx, tuning())).toEqual({ archetypeClass: 'broad', overridden: true })
    const noReason = c({ archetypeClassOverride: { archetypeClass: 'broad', reason: '  ' } })
    expect(() => resolveArchetypeClass(noReason, tuning())).toThrowError(/reason/)
  })
})

describe('D02 §6.3 完整度求值与除零边界', () => {
  /** 广度类全满足上下文：3 群体宣称 + 支撑槽已填（B-02/B-03 可满足）。 */
  function broadSatisfiedCtx(): EvaluationContext {
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B']
    structure.slots = [...structure.slots, baseSupportSlot()]
    structure.instances.push({
      ...baseInstance(),
      instanceId: 'INS-SUPPORT',
      slotId: 'SLOT-SUPPORT',
      domain: 'progression',
    })
    return c({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: { 'SEG-A': 0.9, 'SEG-B': 0.9 },
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
  }

  it('broad full 全满足：byCategory 全 1、blockingUnmet 空、gate=PASS（G1 同输入同输出）', () => {
    const checklist = getActiveChecklist(p1Templates(), 'broad', 'full')
    const report = evaluateCompleteness(broadSatisfiedCtx(), checklist)
    expect(report.byCategory).toEqual({ core_loop: 1, support: 1, content: 1, tech: 1, delivery: 1 })
    expect(report.blockingUnmet).toEqual([])
    expect(report.gate).toBe('PASS')
    // 确定性：重复求值结果逐字段可复现
    expect(evaluateCompleteness(broadSatisfiedCtx(), checklist)).toEqual(report)
  })

  it('除零边界：generic 模板无 tech/support 项 ⇒ c_tech=1、c_support=1（不是 0、不是 NaN）', () => {
    const checklist = getActiveChecklist(p1Templates(), 'generic', 'full')
    const report = evaluateCompleteness(c(), checklist)
    expect(report.byCategory.tech).toBe(1)
    expect(report.byCategory.support).toBe(1)
    expect(Number.isNaN(report.byCategory.tech)).toBe(false)
  })

  it('TC-02：broad 3 群体中 1 个 affinity 低于阈值 → B-03 未满足；c_core_loop=3/4 下降但 c_content 不变', () => {
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B', 'SEG-C']
    structure.slots = [...structure.slots, baseSupportSlot()]
    structure.instances.push({
      ...baseInstance(),
      instanceId: 'INS-SUPPORT',
      slotId: 'SLOT-SUPPORT',
      domain: 'progression',
    })
    const ctx = c({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: { 'SEG-A': 0.9, 'SEG-B': 0.9, 'SEG-C': 0.1 },
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
    const report = evaluateCompleteness(ctx, getActiveChecklist(p1Templates(), 'broad', 'full'))
    // core_loop 分项：C-01/C-02/B-02 满足，B-03 未满足 → 3/4
    expect(report.byCategory.core_loop).toBeCloseTo(3 / 4, 5)
    expect(report.byCategory.content).toBe(1)
    expect(report.gate).toBe('PASS') // B-03 是 expected，不入 blockingUnmet
  })

  it('TC-16：空设计存档读档 → C-01/C-05 阻断，gate=FAIL，除零分量仍为 1，不崩溃', () => {
    const structure = completeStructure({ instances: [] })
    const ctx = c({ snapshot: baseSnapshot({ structure, estimates: null }), productFields: { finalTitle: '名' } })
    const report = evaluateCompleteness(ctx, getActiveChecklist(p1Templates(), 'generic', 'full'))
    expect(report.blockingUnmet.map((it) => it.itemId)).toEqual(['C-01', 'C-05'])
    expect(report.gate).toBe('FAIL')
    expect(report.byCategory.content).toBe(0) // C-05 未满足（R_content=1）
    expect(report.byCategory.support).toBe(1) // 除零边界：generic 无 support 要求项
    expect(report.byCategory.tech).toBe(1) // 除零边界：generic 无 tech 要求项
  })

  it('C-06/C-07 不入覆盖：E 级缺陷存在 → gate FAIL 但 c_tech 仍为 1（broad 无 tech 项；闸门层恒执行）', () => {
    const ctx = c({ defects: [{ defectId: 'D1', severity: 'E' }] })
    const report = evaluateCompleteness(ctx, getActiveChecklist(p1Templates(), 'broad', 'full'))
    expect(report.byCategory.tech).toBe(1)
    expect(report.gate).toBe('FAIL')
  })

  it('RevalidationGate 结果缺失 → fail-closed FAIL（§12 P3 / §9.5 错状态）', () => {
    const ctx = c({ revalidation: null })
    const report = evaluateCompleteness(ctx, getActiveChecklist(p1Templates(), 'broad', 'full'))
    expect(report.gate).toBe('FAIL')
  })

  it('RevalidationGate=FAIL → 闸门 FAIL（C-07 桥接，TC-10）', () => {
    const ctx = c({ revalidation: { pass: false } })
    const report = evaluateCompleteness(ctx, getActiveChecklist(p1Templates(), 'broad', 'full'))
    expect(report.gate).toBe('FAIL')
  })
})

describe('D02 验收：c_k 与 gate 解耦（blocking 全满足 + optional 全不满足）', () => {
  it('niche demo：4/4 blocking 满足、0/3 optional（N-01/N-02/N-03）未满足 ⇒ gate=PASS 且 c_content=0.5（两者同时成立）', () => {
    // 核心 intensity=2、depth=standard（N-01 两分支都不满足）；卖点仅由 support 槽支撑
    // （N-02 core_loop 不满足、C-02 any 经 support 槽满足）；t_niche_content 提到 2（tier1 < 2，N-03 不满足）
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1']
    structure.instances[0]!.intensity = 2
    structure.instances[0]!.depthSelection = 'standard'
    structure.contentPacks = [baseContentPack({ tier: 1 })] // N-03 minTier=2 不满足（C-05 仅要求绑定）
    const supportSlot = baseSupportSlot()
    structure.slots = [...structure.slots, supportSlot]
    structure.instances.push({
      ...baseInstance(),
      instanceId: 'INS-SUPPORT',
      templateId: 'TPL-COMBAT',
      slotId: 'SLOT-SUPPORT',
      domain: 'progression',
    })
    const templates = buildP1ChecklistTemplates(
      withCompletenessTuningOverrides({ tNicheContent: 2 }),
    )
    const ctx = c({
      snapshot: baseSnapshot({ structure }),
      moduleContributions: [
        // 核心实例不支撑卖点（signals 空）；支撑槽实例支撑全部卖点
        baseContribution({ instanceId: 'INS-1', slotId: 'SLOT-CORE' }),
        baseContribution({
          instanceId: 'INS-SUPPORT',
          slotId: 'SLOT-SUPPORT',
          domain: 'progression',
          signals: { uspSupported: { 'USP-1': true }, affinitySlice: {}, contentVolumeContribution: 0 },
        }),
      ],
    })
    const demo = getActiveChecklist(templates, 'niche', 'demo')
    const report = evaluateCompleteness(ctx, demo)
    const gate = evaluateDeliveryGate(ctx, templates, 'demo', tuning())
    // 4/4 blocking 满足（C-01/C-02/C-04/C-05）→ 闸门 PASS
    expect(report.blockingUnmet).toEqual([])
    expect(gate.gate).toBe('PASS')
    // 0/3 optional 满足 → 分项覆盖不受闸门保护
    const n01 = demo.items.find((it) => it.itemId === 'N-01')!
    const n02 = demo.items.find((it) => it.itemId === 'N-02')!
    const n03 = demo.items.find((it) => it.itemId === 'N-03')!
    expect(n01.criticality).toBe('optional')
    expect(n02.criticality).toBe('optional')
    expect(n03.criticality).toBe('optional')
    expect(report.byCategory.core_loop).toBeCloseTo(0.5, 5) // C-01/C-02 满足，N-01/N-02 不满足
    expect(report.byCategory.content).toBeCloseTo(0.5, 5) // C-05 满足，N-03 不满足
    expect(report.byCategory.content).toBeLessThan(1)
  })
})

describe('D02 验收：IND-3 / IND-4（三质量可矛盾，闸门不看 DQ/IQ）', () => {
  it('IND-4：DQ/IQ 满分但 blockingUnmet ≠ ∅ ⇒ gate=FAIL（防带病上市，TC-04）', () => {
    // DQ 满分：structure=1、experiencePotential=1（两实例 a=1、w_int(3)=1、w_depth(standard)=1）、marketFit=1
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1']
    const ctx = c({
      snapshot: baseSnapshot({
        structure,
        estimates: {
          formulaVersion: 'D01-FORMULA-v0.1',
          workUnits: { byDiscipline: { design: 1, code: 1, art: 1, audio: 1, qa: 1 }, raw: { design: 1, code: 1, art: 1, audio: 1, qa: 1 }, synergy: { design: 0, code: 0, art: 0, audio: 0, qa: 0 }, total: 5, ranges: { design: { low: 0, mid: 0, high: 0 }, code: { low: 0, mid: 0, high: 0 }, art: { low: 0, mid: 0, high: 0 }, audio: { low: 0, mid: 0, high: 0 }, qa: { low: 0, mid: 0, high: 0 } }, drivers: [] },
          skillDemand: { byDiscipline: { design: 0, code: 0, art: 0, audio: 0, qa: 0 }, total: 0, peakFraction: { design: 0, code: 0, art: 0, audio: 0, qa: 0 } },
          techRisk: { gates: [], unsatisfied: [], rTech: 0, rSynergy: 0, rScope: 0, maxRisk: 0, riskLevel: 'LOW' },
          marketFit: { affinity: { 'SEG-HARDCORE': 1 }, positioningFit: 1, positioningFitBand: 'high', genreFit: 1, uspSupported: { 'USP-1': true }, noveltyNote: '', contentVolumeBand: 'high' },
        },
      }),
      templatesById: {
        'TPL-COMBAT': { ...baseTemplate(), audienceAffinity: { 'SEG-HARDCORE': 1 } },
        'TPL-CONTENT': { ...baseTemplate({ templateId: 'TPL-CONTENT', domain: 'narrative' }), audienceAffinity: { 'SEG-HARDCORE': 1 } },
      },
      buildFacts: { deliveredTier: 3, costEst: 100, actualCost: 100 },
      productFields: { finalTitle: null }, // 唯一缺口：C-03（交付件缺失，DQ/IQ 不受影响）
    })
    const dq = computeDesignQuality(ctx, tuning())
    const iq = computeImplementationQuality(ctx, tuning())
    expect(dq.structure).toBe(1)
    expect(dq.marketFit).toBe(1)
    expect(dq.experiencePotential).toBe(1)
    expect(iq.stability).toBe(1)
    expect(iq.defectLoad).toBe(1)
    expect(iq.contentFidelity).toBe(1)
    expect(iq.deliveryAdherence).toBe(1)

    const gate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(gate.gate).toBe('FAIL')
    expect(gate.blockingUnmet).toEqual(['C-03'])
    expect(gate.errorCodes).toContain('D02-MISSING-CORE')
    // IND-2 断言：不存在"平均后通过"——gate 只由 blocking/闸门条件决定
    expect(Object.keys(dq)).not.toContain('overall')
  })

  it('IND-3：高 DQ + 低 IQ（多缺陷）照常表达为 FAIL，且不出现"平均后通过"（反证 C）', () => {
    const defects = Array.from({ length: 6 }, (_, i) => ({ defectId: `D${i}`, severity: 'E' }))
    const ctx = c({
      marketProfile: {
        affinity: { 'SEG-HARDCORE': 1 },
        positioningFit: 1,
        positioningFitBand: 'high',
        genreFit: 1,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'high',
      },
      defects,
    })
    const dq = computeDesignQuality(ctx, tuning())
    const iq = computeImplementationQuality(ctx, tuning())
    expect(dq.structure).toBe(1)
    expect(dq.marketFit).toBeCloseTo(0.4 + 0.3, 5) // 0.7（卖点为空 → usp 项为 0，但仍是高 DQ）
    expect(iq.defectLoad).toBe(0) // 低 IQ：缺陷负载满格
    const gate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(gate.gate).toBe('FAIL')
    expect(gate.errorCodes).toContain('D02-E-DEFECT')
    // 若存在合成（如 mean(高DQ, 低IQ) 落中档"不错"），闸门会错误放行；这里必须 FAIL
  })

  it('IND-3 反向：低 DQ + 高 IQ 也可表达（烂设计做精，反证 D）——两向量独立不合成', () => {
    const structure = completeStructure({ instances: [] }) // 空设计 → DQ 低
    const ctx = c({
      snapshot: baseSnapshot({ structure, estimates: null }),
      buildFacts: { deliveredTier: 0, costEst: 100, actualCost: 100 },
      productFields: { finalTitle: '名' },
    })
    const dq = computeDesignQuality(ctx, tuning())
    const iq = computeImplementationQuality(ctx, tuning())
    expect(dq.structure).toBe(0)
    expect(dq.experiencePotential).toBe(0)
    expect(iq.defectLoad).toBe(1)
    expect(iq.deliveryAdherence).toBe(1)
    // 完整度闸门仍 FAIL（C-01/C-05 空核心），不因 IQ 高放行
    const gate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(gate.gate).toBe('FAIL')
  })
})

describe('D02 §3.8 形式资格状态机（§4.2）', () => {
  it('全满足 → qualified', () => {
    const q = evaluateDeliveryFormQualification(c(), p1Templates(), 'full', tuning())
    expect(q.status).toBe('qualified')
    expect(q.requiredDisclosures).toEqual([])
  })

  it('TC-02：full 下缺 1 个 expected（B-03）且已披露 → qualified_with_disclosure；EA 同', () => {
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B', 'SEG-C']
    structure.slots = [...structure.slots, baseSupportSlot()]
    structure.instances.push({
      ...baseInstance(),
      instanceId: 'INS-SUPPORT',
      slotId: 'SLOT-SUPPORT',
      domain: 'progression',
    })
    const ctx = c({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: { 'SEG-A': 0.9, 'SEG-B': 0.9, 'SEG-C': 0.1 },
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
      disclosureProvided: true,
    })
    const full = evaluateDeliveryFormQualification(ctx, p1Templates(), 'full', tuning())
    expect(full.status).toBe('qualified_with_disclosure')
    expect(full.requiredDisclosures).toEqual(['B-03'])
    const ea = evaluateDeliveryFormQualification(ctx, p1Templates(), 'early_access', tuning())
    expect(ea.status).toBe('qualified_with_disclosure')
    expect(ea.requiredDisclosures).toEqual(['B-03'])
  })

  it('缺 expected 且未附披露 → not_qualified（D02-DISCLOSURE-REQUIRED，§4.2 注）', () => {
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B', 'SEG-C']
    const ctx = c({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: { 'SEG-A': 0.9, 'SEG-B': 0.9, 'SEG-C': 0.1 },
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
      disclosureProvided: false,
    })
    const q = evaluateDeliveryFormQualification(ctx, p1Templates(), 'full', tuning())
    expect(q.status).toBe('not_qualified')
    const gate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(gate.errorCodes).toContain('D02-DISCLOSURE-REQUIRED')
    expect(gate.errorCodes).toContain('D02-FORM-INELIGIBLE')
  })

  it('blocking 未满足 → not_qualified + D02-MISSING-CORE（§4.2 / §10.1）', () => {
    const ctx = c({ productFields: { finalTitle: null } })
    const q = evaluateDeliveryFormQualification(ctx, p1Templates(), 'full', tuning())
    expect(q.status).toBe('not_qualified')
    expect(q.blockingUnmet).toEqual(['C-03'])
    const gate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(gate.errorCodes).toContain('D02-MISSING-CORE')
  })

  it('D02-11：demo 资格带 forcedDisclosureLabel「非完整产品」；requiredDisclosures 为空', () => {
    const q = evaluateDeliveryFormQualification(c(), p1Templates(), 'demo', tuning())
    expect(q.forcedDisclosureLabel).not.toBeNull()
    expect(q.requiredDisclosures).toEqual([])
    const full = evaluateDeliveryFormQualification(c(), p1Templates(), 'full', tuning())
    expect(full.forcedDisclosureLabel).toBeNull()
  })
})

describe('D02 §3.10 五个异常码', () => {
  it('全通过 → errorCodes 空', () => {
    const gate = evaluateDeliveryGate(c(), p1Templates(), 'full', tuning())
    expect(gate.errorCodes).toEqual([])
  })

  it('E 级缺陷 → D02-E-DEFECT（TC-11：不得带病上市）', () => {
    const gate = evaluateDeliveryGate(c({ defects: [{ defectId: 'D1', severity: 'E' }] }), p1Templates(), 'demo', tuning())
    expect(gate.gate).toBe('FAIL')
    expect(gate.errorCodes).toContain('D02-E-DEFECT')
  })

  it('demo→full 不可直转 / full→EA 不可倒退 / EA→demo 不可（§4.3 / TC-15）', () => {
    expect(canTransitionDeliveryForm('demo', 'full')).toBe(false)
    expect(canTransitionDeliveryForm('full', 'early_access')).toBe(false)
    expect(canTransitionDeliveryForm('early_access', 'demo')).toBe(false)
    expect(canTransitionDeliveryForm('early_access', 'full')).toBe(true)
  })
})

describe('D02 §10.2 EA→full 升级（TC-12/TC-13，S4）', () => {
  const mkAssessment = (state: QualityAssessment['state']): QualityAssessment => ({
    assessmentId: 'A-1',
    buildId: 'BUILD-1',
    snapshotId: 'SNAP-1',
    checklistRevision: 1,
    designQuality: { structure: 1, innovation: 'unavailable_p1', experiencePotential: 1, marketFit: 1 },
    implementationQuality: { stability: 1, contentFidelity: 1, defectLoad: 1, deliveryAdherence: 1 },
    completeness: { byCategory: { core_loop: 1, support: 1, content: 1, tech: 1, delivery: 1 }, blockingUnmet: [], gate: 'PASS' },
    deliveryFormQualificationId: 'D02-Q-SNAP-1-early_access',
    qualityCeilingBand: 'ABSENT_P1',
    state,
    assessedAt: 100,
    formulaVersion: 'D02-FORMULA-v0.1',
  })

  it('TC-12：EA→full 重评估产生新评估（provisional），旧评估 SUPERSEDED 保留（不原地覆盖）', () => {
    const oldFinal = mkAssessment('final')
    const nextDraft = { ...mkAssessment('final'), assessmentId: 'A-2', buildId: 'BUILD-2' }
    const { superseded, next } = supersedeForUpgrade(oldFinal, nextDraft)
    expect(superseded.state).toBe('superseded')
    expect(superseded.assessmentId).toBe('A-1') // 旧记录保留
    expect(next.state).toBe('provisional')
    expect(next.buildId).toBe('BUILD-2')
    expect(oldFinal.state).toBe('final') // 原对象不被原地修改（纯函数）
  })

  it('TC-13：EA 全满足但 full 清单更严（B-02 expected→blocking）→ 新 full 闸门 FAIL，旧评估不被覆盖', () => {
    // 广度类（3 群体宣称）；支撑槽缺失：EA 的 B-02 是 expected（不阻断），full 的 B-02 是 blocking（阻断）
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = ['SEG-A', 'SEG-B', 'SEG-C']
    const ctx = c({ snapshot: baseSnapshot({ structure }) })
    const eaGate = evaluateDeliveryGate(ctx, p1Templates(), 'early_access', tuning())
    const fullGate = evaluateDeliveryGate(ctx, p1Templates(), 'full', tuning())
    expect(eaGate.gate).toBe('PASS')
    expect(fullGate.gate).toBe('FAIL')
    expect(fullGate.blockingUnmet).toContain('B-02')
  })
})

describe('D02 §4.1 QualityAssessment 生命周期', () => {
  const a = (): QualityAssessment => ({
    assessmentId: 'A-1',
    buildId: 'B-1',
    snapshotId: 'SNAP-1',
    checklistRevision: 1,
    designQuality: { structure: 1, innovation: 'unavailable_p1', experiencePotential: 1, marketFit: 1 },
    implementationQuality: { stability: 1, contentFidelity: 1, defectLoad: 1, deliveryAdherence: 'unavailable_p1' },
    completeness: { byCategory: { core_loop: 1, support: 1, content: 1, tech: 1, delivery: 1 }, blockingUnmet: [], gate: 'PASS' },
    deliveryFormQualificationId: 'Q-1',
    qualityCeilingBand: 'ABSENT_P1',
    state: 'pending',
    assessedAt: 100,
    formulaVersion: 'D02-FORMULA-v0.1',
  })

  it('合法链路：pending→provisional→final→superseded / final→archived；闸门 FAIL 回路 provisional→pending', () => {
    let x = a()
    x = transitionQualityAssessment(x, 'provisional')
    x = transitionQualityAssessment(x, 'pending') // FAIL 回路
    x = transitionQualityAssessment(x, 'provisional')
    x = transitionQualityAssessment(x, 'final')
    const sup = transitionQualityAssessment(x, 'superseded')
    expect(sup.state).toBe('superseded')
    const arch = transitionQualityAssessment(x, 'archived')
    expect(arch.state).toBe('archived')
    expect(x.state).toBe('final') // 不可变：转换返回新对象
  })

  it('非法转换 fail-closed：pending→final / superseded→任何状态 抛错（FINAL/SUPERSEDED 不可变）', () => {
    expect(() => transitionQualityAssessment(a(), 'final')).toThrowError(CompletenessDomainError)
    const sup = transitionQualityAssessment(
      transitionQualityAssessment(
        transitionQualityAssessment(a(), 'provisional'),
        'final',
      ),
      'superseded',
    )
    expect(() => transitionQualityAssessment(sup, 'final')).toThrowError(CompletenessDomainError)
    try {
      transitionQualityAssessment(a(), 'final')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('D02-INVALID-ASSESSMENT-TRANSITION')
    }
  })

  it('S5 / TC-07：HRB verdict 变化不改变三质量向量，qcbState 恒 ABSENT_P1', () => {
    const ctxFeasible = c({ hrbVerdict: 'feasible' })
    const ctxLower = c({ hrbVerdict: 'need_reduce_scope_or_lower_goal' })
    const templates = p1Templates()
    expect(evaluateDeliveryGate(ctxFeasible, templates, 'full', tuning()).qcbState).toBe('ABSENT_P1')
    expect(evaluateDeliveryGate(ctxLower, templates, 'full', tuning()).qcbState).toBe('ABSENT_P1')
    expect(computeDesignQuality(ctxFeasible, tuning())).toEqual(computeDesignQuality(ctxLower, tuning()))
  })
})

describe('D02 §6.5 / §3.10 qcb 契约（TC-08 / TC-18 / X-4）', () => {
  const a: QualityAssessment = {
    assessmentId: 'A-QCB',
    buildId: 'B',
    snapshotId: 'S',
    checklistRevision: 1,
    designQuality: { structure: 1, innovation: 'unavailable_p1', experiencePotential: 1, marketFit: 1 },
    implementationQuality: { stability: 1, contentFidelity: 1, defectLoad: 1, deliveryAdherence: 'unavailable_p1' },
    completeness: { byCategory: { core_loop: 1, support: 1, content: 1, tech: 1, delivery: 1 }, blockingUnmet: [], gate: 'PASS' },
    deliveryFormQualificationId: 'Q',
    qualityCeilingBand: 'ABSENT_P1',
    state: 'final',
    assessedAt: 0,
    formulaVersion: 'D02-FORMULA-v0.1',
  }

  it('TC-08：下游按已交付接口读取 qcb 数值 → 抛 D02-QCB-UNDEFINED（契约错误，非数值错误）', () => {
    expect(() => readQualityCeilingBandValue(a)).toThrowError(/D02-QCB-UNDEFINED/)
    try {
      readQualityCeilingBandValue(a)
    } catch (e) {
      expect((e as { code?: string }).code).toBe('D02-QCB-UNDEFINED')
    }
  })

  it('qcbState 唯一合法读取：只确认 ABSENT_P1 状态（不产出数值）', () => {
    expect(readQualityCeilingBandState(a)).toBe('ABSENT_P1')
  })

  it('TC-18 / S4：读档 qcbState 缺失 → 按 ABSENT_P1 处理并标记迁移（防穿越赋值）', () => {
    const m = migrateQcbState(undefined)
    expect(m.qcbState).toBe('ABSENT_P1')
    expect(m.migrated).toBe(true)
    expect(migrateQcbState(null).migrated).toBe(true)
  })
})

describe('D02 §3.9 DeliveryDecisionRecord（D-07 归档，不可变）', () => {
  it('记录冻结不可变；disclosedGaps 含 requiredDisclosures + demo 强制标签；reasonNote 记 verdict 文本', () => {
    const ctx = c({
      hrbVerdict: 'need_reduce_scope_or_lower_goal',
      archetypeClassOverride: { archetypeClass: 'broad', reason: '按广谱标准交付' },
    })
    const rec = buildDeliveryDecisionRecord(ctx, p1Templates(), 'demo', tuning())
    expect(Object.isFrozen(rec)).toBe(true)
    expect(rec.form).toBe('demo')
    expect(rec.disclosedGaps).toContain('非完整产品（demo，强制披露）')
    expect(rec.qcbState).toBe('ABSENT_P1')
    expect(rec.reasonNote).toContain('需降低质量目标')
    // 不携带数值带宽：reasonNote 不是数字
    expect(Number.isNaN(Number(rec.reasonNote))).toBe(true)
    expect(Object.keys(rec.completenessVector).sort()).toEqual(
      ['content', 'core_loop', 'delivery', 'support', 'tech'].sort(),
    )
  })
})

describe('D02 §5.4 影响档位方向（TC-06，C6 裁定方向）', () => {
  it('full 缺 1 个 expected 且带披露：refundRiskBand 上调一档、brandImpactBand 下调一档', () => {
    const policy = expectationPolicyForOutcome('full', 1, true)
    expect(policy.refundRiskBand).toBe('medium') // low → medium（上调一档）
    expect(policy.brandImpactBand).toBe('medium') // high → medium（下调一档）
    expect(policy.expectationBand).toBe('medium') // high → medium（期望下调）
  })

  it('未披露路径（被闸门阻断，仅方向登记）：退款风险上调两档', () => {
    const policy = expectationPolicyForOutcome('full', 1, false)
    expect(policy.refundRiskBand).toBe('high') // low → high（上调两档）
    expect(policy.brandImpactBand).toBe('low')
  })

  it('无 expected 缺口 → 基准档位', () => {
    const policy = expectationPolicyForOutcome('full', 0, true)
    expect(policy).toEqual({ expectationBand: 'high', refundRiskBand: 'low', brandImpactBand: 'high' })
  })
})
