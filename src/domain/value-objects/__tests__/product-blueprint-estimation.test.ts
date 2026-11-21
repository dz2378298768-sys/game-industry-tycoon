/**
 * D-01 §6 四通道估算测试。TC 编号对照 D-01 §17.1。
 */
import { describe, it, expect } from 'vitest'
import {
  estimateWorkUnits,
  estimateSkillDemand,
  estimateTechRisk,
  estimateMarketFit,
  estimateFourChannels,
  activeInstances,
  selectedOptions,
} from '../product-blueprint-estimation'
import { withTuningOverrides } from '../product-blueprint-tuning'
import {
  baseEstimationInput, baseTemplate, baseInstance, baseSlot, baseStructure, baseContentPack, tuning,
} from './product-blueprint-fixtures'

describe('§6.2 ① 工作量（TC-05 / R-08）', () => {
  it('W_d = baseWorkUnits × intensityCurve × depthMultiplier + Σ option.costDelta', () => {
    const template = baseTemplate({
      optionGroups: [{
        optionGroupId: 'G1', name: '强度选项', required: false,
        options: [{
          optionId: 'O1', costDelta: { code: 5 }, skillLoadDelta: {}, audienceAffinityDelta: {},
          riskDelta: 0, techGates: [], supportedUspIds: [],
        }],
      }],
    })
    const instance = baseInstance({ optionSelections: { G1: 'O1' } })
    const work = estimateWorkUnits({
      ...baseEstimationInput({ templatesById: { 'TPL-COMBAT': template }, structure: baseStructure({ instances: [instance] }) }),
    }, tuning())
    // code: 20 × 1(intensity3) × 1(standard) + 5 = 25
    expect(work.byDiscipline.code).toBe(25)
    expect(work.raw.code).toBe(25)
  })

  it('depthMultiplier 三档生效（shallow 0.8 / standard 1.0 / deep 1.3）', () => {
    const mk = (depth: 'shallow' | 'standard' | 'deep') => estimateWorkUnits(
      baseEstimationInput({ structure: baseStructure({ instances: [baseInstance({ depthSelection: depth })] }) }),
      tuning(),
    ).byDiscipline.code
    expect(mk('shallow')).toBeCloseTo(16)
    expect(mk('standard')).toBe(20)
    expect(mk('deep')).toBeCloseTo(26)
  })

  it('§6.2：deactivated 模块贡献 0（其工作量已沉没，§15.2）', () => {
    const work = estimateWorkUnits(
      baseEstimationInput({ structure: baseStructure({ instances: [baseInstance({ state: 'deactivated' })] }) }),
      tuning(),
    )
    expect(work.total).toBe(0)
    expect(activeInstances(baseStructure({ instances: [baseInstance({ state: 'deactivated' })] }))).toHaveLength(0)
  })

  it('内容包：W_d(c) = workUnitsPerTier[d] × tier^α（边际递减）', () => {
    const pack = baseContentPack()
    const work = estimateWorkUnits(
      baseEstimationInput({ structure: baseStructure({ contentPacks: [pack] }) }),
      tuning(),
    )
    // code: 模块基准 20 + 内容包 2 × 3^0.85 ≈ 25.09
    expect(work.raw.code).toBeCloseTo(20 + 2 * Math.pow(3, 0.85), 6)
    expect(work.total).toBeGreaterThan(58)
  })

  it('§6.2 synergy：total=0 ⇒ 0；重复标签使 synergy = 1 − distinct/total', () => {
    const none = estimateWorkUnits(
      baseEstimationInput({ templatesById: { 'TPL-COMBAT': baseTemplate({ combineTags: [] }) } }),
      tuning(),
    )
    expect(none.synergy.code).toBe(0)

    const template = baseTemplate()
    const input = baseEstimationInput({
      templatesById: { 'TPL-COMBAT': template },
      structure: baseStructure({
        slots: [baseSlot({ maxInstances: 3, bindings: ['INS-1', 'INS-2'] })],
        instances: [baseInstance(), baseInstance({ instanceId: 'INS-2' })],
      }),
    })
    const w = estimateWorkUnits(input, tuning())
    expect(w.synergy.code).toBeCloseTo(0.5) // total=2, distinct=1
    expect(w.byDiscipline.code).toBeCloseTo(40 * (1 - 0.5 * 0.22)) // raw=40, k_syn[code]=0.22
  })

  it('TC-05 / ADJ-01：HRB 不是乘子——估算函数无 HRB 输入，W_d 不随预算承诺变化', () => {
    const t = tuning()
    const base = estimateWorkUnits(baseEstimationInput(), t)
    // HRB 完全不在输入契约中；构造任何 HRB 值都不改变工作量
    const withHrbA = estimateWorkUnits(baseEstimationInput(), withTuningOverrides({ hrbDefault: 0 }))
    const withHrbB = estimateWorkUnits(baseEstimationInput(), withTuningOverrides({ hrbDefault: 1 }))
    expect(withHrbA.byDiscipline).toEqual(base.byDiscipline)
    expect(withHrbB.byDiscipline).toEqual(base.byDiscipline)
    expect(Object.keys(base).join(',')).not.toContain('hrb')
  })

  it('§6.7 OPEN/TUNING 注入：kSyn / depthMultiplier / Δ 改变结果（非硬编码）', () => {
    // 两个同标签实例才产生 synergy（单实例 total=1, distinct=1 ⇒ synergy=0）
    const duplicated = () => baseEstimationInput({
      structure: baseStructure({
        slots: [baseSlot({ maxInstances: 2, bindings: ['INS-1', 'INS-2'] })],
        instances: [baseInstance(), baseInstance({ instanceId: 'INS-2' })],
      }),
    })
    const base = estimateWorkUnits(duplicated(), tuning())
    const changedSyn = estimateWorkUnits(duplicated(), withTuningOverrides({ kSyn: { code: 0.25 } }))
    expect(changedSyn.byDiscipline.code).not.toBe(base.byDiscipline.code)
    const changedDepth = estimateWorkUnits(
      baseEstimationInput(),
      withTuningOverrides({ depthMultiplier: { standard: 2 } }),
    )
    expect(changedDepth.byDiscipline.code).toBe(40) // 20 × 1 × 2
    expect(base.ranges.code.mid).toBe(base.byDiscipline.code)
    // Δ 注入改变区间宽度
    expect(estimateWorkUnits(duplicated(), withTuningOverrides({ uncertaintyDelta: 0.5 })).ranges.code.high)
      .toBeCloseTo(base.byDiscipline.code * 1.5)
    expect(base.ranges.code.low).toBeCloseTo(base.byDiscipline.code * 0.75)
    expect(base.ranges.code.high).toBeCloseTo(base.byDiscipline.code * 1.25)
  })

  it('§9.4 drivers 仅前 3 个成本驱动', () => {
    const instances = Array.from({ length: 5 }, (_, i) => baseInstance({ instanceId: `INS-${i}` }))
    const work = estimateWorkUnits(
      baseEstimationInput({ structure: baseStructure({ slots: [baseSlot({ maxInstances: 5, bindings: instances.map((i) => i.instanceId) })], instances }) }),
      tuning(),
    )
    expect(work.drivers).toHaveLength(3)
  })
})

describe('§6.3 ② 技能负载（除零边界）', () => {
  it('S_d = W_d / k_peakEfficiency[d]，peakFraction 之和为 1', () => {
    const work = estimateWorkUnits(baseEstimationInput(), tuning())
    const skill = estimateSkillDemand(work, tuning())
    expect(skill.byDiscipline.code).toBe(work.byDiscipline.code)
    const sum = Object.values(skill.peakFraction).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1)
  })

  it('ΣS=0 时 peakFraction 全为 0（空设计）', () => {
    const work = estimateWorkUnits(
      baseEstimationInput({ structure: baseStructure({ instances: [] }) }),
      tuning(),
    )
    const skill = estimateSkillDemand(work, tuning())
    expect(skill.total).toBe(0)
    expect(Object.values(skill.peakFraction).every((v) => v === 0)).toBe(true)
  })

  it('k_peakEfficiency 可注入：改变后 S_d 变化', () => {
    const work = estimateWorkUnits(baseEstimationInput(), tuning())
    const skill = estimateSkillDemand(work, withTuningOverrides({ kPeakEfficiency: { code: 2 } }))
    expect(skill.byDiscipline.code).toBeCloseTo(work.byDiscipline.code / 2)
  })
})

describe('§6.4 ③ 技术门槛与风险（TC-13/14）', () => {
  it('T 集合含 PERSPECTIVE_GATE / STRUCTURE_GATE / 模板 techGates / 选项 techGates / 平台门槛', () => {
    const input = baseEstimationInput({
      structure: baseStructure({
        positioning: baseStructure().positioning,
        instances: [baseInstance()],
      }),
      capabilities: { rendering_2d: 1 },
      platformTechStandards: [{ gateId: 'g_platform', domainId: 'custom_domain', minCapabilityLevel: 1, note: '' }],
    })
    const risk = estimateTechRisk(input, estimateWorkUnits(input, tuning()), tuning())
    expect(risk.gates.map((g) => g.gateId)).toEqual(expect.arrayContaining([
      'g_pers_side', 'g_platform',
    ]))
  })

  it('min=0 恒满足，不入 T_unsat', () => {
    const input = baseEstimationInput({
      structure: baseStructure({ positioning: { ...baseStructure().positioning, perspectiveId: 'text' } }),
    })
    const risk = estimateTechRisk(input, estimateWorkUnits(input, tuning()), tuning())
    expect(risk.unsatisfied.some((g) => g.gateId === 'g_pers_text')).toBe(false)
  })

  it('R_tech = 1 − exp(−Σ k_tech×(1−cap/min))；风险可突破时允许但标风险', () => {
    const input = baseEstimationInput({ capabilities: { rendering_2d: 0 } })
    const risk = estimateTechRisk(input, estimateWorkUnits(input, tuning()), tuning())
    expect(risk.rTech).toBeCloseTo(1 - Math.exp(-0.7), 6)
    expect(risk.unsatisfied.map((g) => g.gateId)).toContain('g_pers_side')
    expect(risk.riskLevel).toBe('MEDIUM')
  })

  it('riskLevel 用 max 分级，阈值 τ_high/τ_med 可注入（非合成单一分）', () => {
    const input = baseEstimationInput({ capabilities: { rendering_2d: 0 } })
    const strict = estimateTechRisk(input, estimateWorkUnits(input, tuning()), withTuningOverrides({ tauHigh: 0.4 }))
    expect(strict.riskLevel).toBe('HIGH')
    // 三个子风险仍分别输出，riskLevel 只是展示分类
    expect(typeof strict.rTech).toBe('number')
    expect(typeof strict.rSynergy).toBe('number')
    expect(typeof strict.rScope).toBe('number')
  })

  it('R_synergy = 1 − exp(−penalty_sum)（软冲突/W-DEP penalty 注入）', () => {
    const input = baseEstimationInput({ synergyPenaltySum: 0.5 })
    const risk = estimateTechRisk(input, estimateWorkUnits(input, tuning()), tuning())
    expect(risk.rSynergy).toBeCloseTo(1 - Math.exp(-0.5), 6)
  })
})

describe('§6.5 ④ 市场吸引力画像（红线）', () => {
  it('affinity / positioningFit（Jaccard）：缺键按 0；C=S 时为 1', () => {
    const fit = estimateMarketFit(baseEstimationInput(), tuning())
    expect(fit.affinity['SEG-HARDCORE']).toBeCloseTo(1)
    expect(fit.positioningFit).toBe(1)
    expect(fit.positioningFitBand).toBe('high')
  })

  it('宣称一个无支撑标签时 Jaccard = 1/2', () => {
    const input = baseEstimationInput({
      structure: baseStructure({
        positioning: {
          ...baseStructure().positioning,
          targetSegmentClaims: ['SEG-HARDCORE', 'SEG-MASS_MARKET'],
        },
      }),
    })
    const fit = estimateMarketFit(input, tuning())
    expect(fit.affinity['SEG-MASS_MARKET']).toBe(0)
    expect(fit.positioningFit).toBeCloseTo(0.5)
  })

  it('genreFit 为余弦；零向量取 0', () => {
    const normal = estimateMarketFit(baseEstimationInput(), tuning())
    expect(normal.genreFit).toBeGreaterThan(0)
    expect(normal.genreFit).toBeLessThanOrEqual(1)

    const noArchetype = estimateMarketFit(baseEstimationInput({ archetype: null }), tuning())
    expect(noArchetype.genreFit).toBe(0)
    const empty = estimateMarketFit(
      baseEstimationInput({ structure: baseStructure({ instances: [] }) }),
      tuning(),
    )
    expect(empty.genreFit).toBe(0)
  })

  it('uspSupported 为 R-COM-7 布尔结果；不含 uspCredibility 数值（OPEN-O1）', () => {
    const template = baseTemplate({ uspIds: ['USP-FAST'] })
    const fit = estimateMarketFit(
      baseEstimationInput({
        templatesById: { 'TPL-COMBAT': template },
        structure: baseStructure({
          positioning: { ...baseStructure().positioning, sellingPoints: ['USP-FAST', 'USP-EMPTY'] },
        }),
      }),
      tuning(),
    )
    expect(fit.uspSupported['USP-FAST']).toBe(true)
    expect(fit.uspSupported['USP-EMPTY']).toBe(false)
    expect(Object.keys(fit).join(',')).not.toContain('uspCredibility')
  })

  it('§6.5/§8.2 四通道集合无合成分、无销量/质量上限字段', () => {
    const bundle = estimateFourChannels(baseEstimationInput(), tuning())
    const keys = Object.keys(bundle)
    expect(keys).toEqual(expect.arrayContaining(['workUnits', 'skillDemand', 'techRisk', 'marketFit']))
    for (const forbidden of ['compositeScore', 'designValue', 'salesEstimate', 'qualityCeilingBand']) {
      expect(keys.join(',')).not.toContain(forbidden)
      expect(Object.keys(bundle.marketFit).join(',')).not.toContain(forbidden)
    }
  })

  it('selectedOptions 按 groupId→optionId 解析；无效 optionId 忽略', () => {
    const template = baseTemplate({
      optionGroups: [{
        optionGroupId: 'G1', name: '', required: false,
        options: [{
          optionId: 'O1', costDelta: {}, skillLoadDelta: {}, audienceAffinityDelta: {},
          riskDelta: 0, techGates: [], supportedUspIds: [],
        }],
      }],
    })
    expect(selectedOptions(baseInstance({ optionSelections: { G1: 'O1', G2: 'X' } }), template)).toHaveLength(1)
  })
})
