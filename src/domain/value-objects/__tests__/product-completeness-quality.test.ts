/**
 * D-02 §6.1/§6.2 三质量向量测试：DQ/IQ 独立公式、§6.7 边界、IND-1/IND-2。
 */
import { describe, expect, it } from 'vitest'
import {
  computeDesignQuality,
  computeImplementationQuality,
  derivePlannedTier,
} from '@domain/value-objects/product-completeness-quality'
import {
  evaluateCompleteness,
  evaluateDeliveryGate,
} from '@domain/value-objects/product-completeness-gate'
import { getActiveChecklist } from '@domain/value-objects/product-completeness-checklists'
import { DEFAULT_COMPLETENESS_TUNING } from '@domain/value-objects/product-completeness-tuning'
import type { EvaluationContext } from '@domain/entities/product-completeness'
import { baseContext, completeStructure, baseSnapshot, p1Templates, tuning } from './product-completeness-fixtures'

const ctx = (overrides: Partial<EvaluationContext> = {}) => baseContext(overrides)

describe('D02 §6.1 DesignQuality', () => {
  it('structure：必选槽全填 → 1；空设计（无 active 实例）→ 0（§6.7）', () => {
    expect(computeDesignQuality(ctx(), tuning()).structure).toBe(1)
    const structure = completeStructure({ instances: [] })
    expect(computeDesignQuality(ctx({ snapshot: baseSnapshot({ structure, estimates: null }) }), tuning()).structure).toBe(0)
  })

  it('innovation 恒 UNAVAILABLE_P1（OPEN-D02-O4）：不是 0、不是 1，闸门不要求该维', () => {
    const dq = computeDesignQuality(ctx(), tuning())
    expect(dq.innovation).toBe('unavailable_p1')
    expect(dq.innovation).not.toBe(0)
    expect(dq.innovation).not.toBe(1)
  })

  it('experiencePotential：Σ a_i·w_int·w_depth / (k_exp·|M_active|)；核心 a=1、内容 a=0.8 → (1+0.8)/2=0.9；|M_active|=0 → 0', () => {
    const dq = computeDesignQuality(ctx(), tuning())
    // 核心实例：TPL-COMBAT.audienceAffinity['SEG-HARDCORE']=1，w_int=affinityIntensity[3]=1，w_depth(standard)=1.0
    // 内容实例：TPL-CONTENT.audienceAffinity['SEG-HARDCORE']=0.8，w_int=1，w_depth=1.0
    // (1×1×1 + 0.8×1×1) / (1×2) = 0.9
    expect(dq.experiencePotential).toBeCloseTo(0.9, 5)
    const empty = ctx({ snapshot: baseSnapshot({ structure: completeStructure({ instances: [] }), estimates: null }) })
    expect(computeDesignQuality(empty, tuning()).experiencePotential).toBe(0)
  })

  it('marketFit = w₁·0.8 + w₂·0.7 + w₃·uspSupportRatio（无卖点 → ratio=0）', () => {
    const dq = computeDesignQuality(ctx(), tuning())
    const w = DEFAULT_COMPLETENESS_TUNING.marketFitWeights
    expect(dq.marketFit).toBeCloseTo(w.positioning * 0.8 + w.genre * 0.7 + w.usp * 0, 5)
  })

  it('|sellingPoints|=0 → uspSupportRatio=0（§6.7），marketFit 不含 usp 项且不产生 NaN', () => {
    const dq = computeDesignQuality(ctx(), tuning())
    expect(Number.isNaN(dq.marketFit)).toBe(false)
    expect(dq.marketFit).toBeLessThanOrEqual(1)
    expect(dq.marketFit).toBeGreaterThanOrEqual(0)
  })

  it('卖点全支撑 → uspSupportRatio=1；marketFit 相应提高（DQ 只由快照/画像导出）', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1', 'USP-2']
    const c = ctx({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: {},
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: { 'USP-1': true, 'USP-2': true },
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
    const dq = computeDesignQuality(c, tuning())
    const w = DEFAULT_COMPLETENESS_TUNING.marketFitWeights
    expect(dq.marketFit).toBeCloseTo(w.positioning * 0.8 + w.genre * 0.7 + w.usp * 1, 5)
  })

  it('marketFit 上界 clamp 到 1（§6.1 clamp(x,0,1)）', () => {
    const c = ctx({
      marketProfile: {
        affinity: {},
        positioningFit: 1,
        positioningFitBand: 'high',
        genreFit: 1,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
    expect(computeDesignQuality(c, tuning()).marketFit).toBeLessThanOrEqual(1)
  })
})

describe('D02 §6.2 ImplementationQuality', () => {
  it('stability = 1 − R_tech_delivery；T_unsat=∅（rTech=0）→ 1', () => {
    expect(computeImplementationQuality(ctx(), tuning()).stability).toBe(1)
    const c = ctx()
    c.snapshot.estimates!.techRisk.rTech = 0.3
    expect(computeImplementationQuality(c, tuning()).stability).toBeCloseTo(0.7, 5)
  })

  it('contentFidelity：plannedTier=0 → 1；delivered 2/planned 4 → 0.5；超出 → clamp 1', () => {
    const emptyContent = completeStructure({ contentPacks: [], slots: [completeStructure().slots[0]!] })
    const c0 = ctx({ snapshot: baseSnapshot({ structure: emptyContent, estimates: null }) })
    expect(computeImplementationQuality(c0, tuning()).contentFidelity).toBe(1)

    const c1 = ctx({ buildFacts: { deliveredTier: 2, costEst: null, actualCost: null } })
    // derivePlannedTier = 3（PACK-1 tier=3）
    expect(computeImplementationQuality(c1, tuning()).contentFidelity).toBeCloseTo(2 / 3, 5)

    const c2 = ctx({ buildFacts: { deliveredTier: 9, costEst: null, actualCost: null } })
    expect(computeImplementationQuality(c2, tuning()).contentFidelity).toBe(1)
  })

  it('deliveredTier 未知（buildFacts 缺失且 plannedTier>0）→ UNAVAILABLE_P1（不伪造 0）', () => {
    const iq = computeImplementationQuality(ctx(), tuning())
    expect(iq.contentFidelity).toBe('unavailable_p1')
  })

  it('defectLoad：1 个 E 缺陷、k_defectNorm=3 → 1 − 1/3；≥3 个 → 0；未知严重度权重按 0 → 1', () => {
    const one = computeImplementationQuality(ctx({ defects: [{ defectId: 'D1', severity: 'E' }] }), tuning())
    expect(one.defectLoad).toBeCloseTo(1 - 1 / 3, 5)
    const three = computeImplementationQuality(
      ctx({ defects: [{ defectId: 'D1', severity: 'E' }, { defectId: 'D2', severity: 'E' }, { defectId: 'D3', severity: 'E' }] }),
      tuning(),
    )
    expect(three.defectLoad).toBe(0)
    const unknownSev = computeImplementationQuality(ctx({ defects: [{ defectId: 'D1', severity: 'X-OPEN' }] }), tuning())
    expect(unknownSev.defectLoad).toBe(1)
  })

  it('deliveryAdherence：costEst=0 → UNAVAILABLE_P1（§6.7）；|a−e|/e=0.2 → 0.8；成本未知 → UNAVAILABLE_P1', () => {
    expect(computeImplementationQuality(ctx({ buildFacts: { deliveredTier: 3, costEst: 0, actualCost: 0 } }), tuning()).deliveryAdherence).toBe('unavailable_p1')
    expect(computeImplementationQuality(ctx({ buildFacts: { deliveredTier: 3, costEst: 100, actualCost: 80 } }), tuning()).deliveryAdherence).toBeCloseTo(0.8, 5)
    expect(computeImplementationQuality(ctx(), tuning()).deliveryAdherence).toBe('unavailable_p1')
  })

  it('derivePlannedTier：buildFacts.plannedTier 优先；否则按快照内容槽 Σ tier', () => {
    expect(derivePlannedTier(ctx())).toBe(3)
    expect(derivePlannedTier(ctx({ buildFacts: { deliveredTier: 1, plannedTier: 6, costEst: null, actualCost: null } }))).toBe(6)
  })
})

describe('D02 IND-1：三质量输入隔离（共享事实、用途隔离，无输入混合公式）', () => {
  it('DQ 专属输入（positioningFit/genreFit）变化 → IQ 与 C 的 byCategory 逐字段不变', () => {
    // IND-1 修订口径：DQ 与 C 共享只读快照/画像（affinity 为共享事实），但用途隔离。
    // 本用例只改 DQ 专属维（positioningFit/genreFit，C 的 segmentCovered 不读它们）。
    const c1 = ctx()
    const c2 = ctx({
      marketProfile: {
        affinity: { 'SEG-HARDCORE': 0.8 },
        positioningFit: 0.1,
        positioningFitBand: 'low',
        genreFit: 0.1,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'low',
      },
    })
    const checklist = getActiveChecklist(p1Templates(), 'broad', 'full')
    const iq1 = computeImplementationQuality(c1, tuning())
    const iq2 = computeImplementationQuality(c2, tuning())
    expect(iq2).toEqual(iq1)
    const cReport1 = evaluateCompleteness(c1, checklist)
    const cReport2 = evaluateCompleteness(c2, checklist)
    expect(cReport2.byCategory).toEqual(cReport1.byCategory)
    expect(computeDesignQuality(c1, tuning())).not.toEqual(computeDesignQuality(c2, tuning()))
  })

  it('共享事实（affinity）变化同时进入 DQ 与 C 的对应维——共享原始事实 ≠ 合成（§6.4 IND-1）', () => {
    const c1 = ctx()
    const c2 = ctx({
      marketProfile: {
        affinity: { 'SEG-HARDCORE': 0.1 },
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: {},
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
    const checklist = getActiveChecklist(p1Templates(), 'broad', 'full')
    // C：B-03 segmentCovered 读 affinity → 变化
    expect(evaluateCompleteness(c2, checklist).byCategory.core_loop)
      .not.toEqual(evaluateCompleteness(c1, checklist).byCategory.core_loop)
    // 无合成字段：变化只落在各自分量上，不产生跨质量的总分
    expect(computeImplementationQuality(c1, tuning())).toEqual(computeImplementationQuality(c2, tuning()))
  })

  it('IQ 输入（缺陷/buildFacts）变化 → DQ 逐字段不变（实现质量任何一维不反向影响 DQ）', () => {
    const c1 = ctx()
    const c2 = ctx({
      defects: [{ defectId: 'D1', severity: 'E' }, { defectId: 'D2', severity: 'E' }],
      buildFacts: { deliveredTier: 1, costEst: 100, actualCost: 50 },
    })
    const dq1 = computeDesignQuality(c1, tuning())
    const dq2 = computeDesignQuality(c2, tuning())
    expect(dq2).toEqual(dq1)
    expect(computeImplementationQuality(c1, tuning())).not.toEqual(computeImplementationQuality(c2, tuning()))
  })
})

describe('D02 IND-2：不存在合成字段（TC-01，结构级反证）', () => {
  it('完整度报告 / 资格 / 闸门结果 / 评估对象上不存在 overall/加权平均/百分比字段', () => {
    const FORBIDDEN = [
      'overall', 'overallQuality', 'overallScore', 'overallProgress', 'overallCompleteness',
      'qualityScore', 'completenessPercent', 'weightedScore', 'compositeScore', 'totalScore',
      'averageQuality', 'meanQuality', 'synthesisScore',
    ]
    const checklist = getActiveChecklist(p1Templates(), 'broad', 'full')
    const c = ctx()
    const report = evaluateCompleteness(c, checklist)
    const gate = evaluateDeliveryGate(c, p1Templates(), 'full', tuning())

    const walk = (obj: unknown, path: string): void => {
      if (obj === null || typeof obj !== 'object') return
      for (const [k, v] of Object.entries(obj)) {
        const next = `${path}.${k}`
        expect(FORBIDDEN).not.toContain(k)
        walk(v, next)
      }
    }
    walk(report, 'report')
    walk(gate, 'gate')
    walk(gate.formQualification, 'gate.formQualification')
    walk(computeDesignQuality(c, tuning()), 'dq')
    walk(computeImplementationQuality(c, tuning()), 'iq')
  })

  it('完整度 byCategory 恰好五个分量（core_loop/support/content/tech/delivery），无汇总键', () => {
    const checklist = getActiveChecklist(p1Templates(), 'broad', 'full')
    const report = evaluateCompleteness(ctx(), checklist)
    expect(Object.keys(report.byCategory).sort()).toEqual(
      ['content', 'core_loop', 'delivery', 'support', 'tech'].sort(),
    )
    expect(Object.keys(report).sort()).toEqual(['blockingUnmet', 'byCategory', 'gate'].sort())
  })
})
