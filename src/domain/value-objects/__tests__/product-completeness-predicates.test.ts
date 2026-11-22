/**
 * D-02 §3.3 谓词求值器测试：9 谓词语义、数据缺失边界、未知谓词 fail-closed。
 * 对应任务卡验收：未知谓词 fail-closed；风险提示「缺数据 ≠ 未知谓词」。
 */
import { describe, expect, it } from 'vitest'
import { evaluatePredicate } from '@domain/value-objects/product-completeness-predicates'
import { baseContribution, baseContext, baseInstance, baseSnapshot, baseSupportSlot, completeStructure } from './product-completeness-fixtures'
import { UnknownPredicateError } from '@domain/entities/product-completeness'

describe('D02 §3.3 谓词求值器：slotActive', () => {
  it('core_loop 有 1 个 active 绑定：minCount=1 通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'slotActive', slotKind: 'core_loop', minCount: 1 }, ctx)).toBe(true)
  })

  it('实例 deactivated 时 active 计数为 0：minCount=1 不通过（D-01 T3 状态）', () => {
    const structure = completeStructure()
    structure.instances[0]!.state = 'deactivated'
    const ctx = baseContext({ snapshot: baseSnapshot({ structure, estimates: null }) })
    expect(evaluatePredicate({ kind: 'slotActive', slotKind: 'core_loop', minCount: 1 }, ctx)).toBe(false)
  })

  it('快照无该槽种类（数据缺失）：minCount=0 ⇒ true（0≥0），不抛错', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'slotActive', slotKind: 'presentation', minCount: 0 }, ctx)).toBe(true)
  })

  it('快照无该槽种类（数据缺失）：minCount=1 ⇒ false，不抛错（任务卡 §6 风险提示口径）', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'slotActive', slotKind: 'presentation', minCount: 1 }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：contentTierAtLeast', () => {
  it('content 槽绑定 tier=3 内容包：minTier=2 通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'contentTierAtLeast', minTier: 2 }, ctx)).toBe(true)
  })

  it('内容包 tier 低于阈值：不通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'contentTierAtLeast', minTier: 4 }, ctx)).toBe(false)
  })

  it('content 槽无绑定：不通过（E-EMPTY-CONTENT 同义）', () => {
    const structure = completeStructure({ slots: [completeStructure().slots[0]!] })
    const ctx = baseContext({ snapshot: baseSnapshot({ structure, estimates: null }) })
    expect(evaluatePredicate({ kind: 'contentTierAtLeast', minTier: 1 }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：techGatesSatisfied', () => {
  it("domainSet='all' 且 T_unsat=∅：通过（T-01）", () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'techGatesSatisfied', domainSet: 'all' }, ctx)).toBe(true)
  })

  it('T_unsat 非空：domainSet=all 不通过（TC-04 技术型）', () => {
    const ctx = baseContext()
    ctx.snapshot.estimates!.techRisk.unsatisfied = [
      { gateId: 'g1', domainId: 'world_streaming', minCapabilityLevel: 2, note: '' },
    ]
    expect(evaluatePredicate({ kind: 'techGatesSatisfied', domainSet: 'all' }, ctx)).toBe(false)
  })

  it('domainSet 与 T_unsat 按域求交：交集为空则通过', () => {
    const ctx = baseContext()
    ctx.snapshot.estimates!.techRisk.unsatisfied = [
      { gateId: 'g1', domainId: 'world_streaming', minCapabilityLevel: 2, note: '' },
    ]
    expect(evaluatePredicate({ kind: 'techGatesSatisfied', domainSet: ['procedural_gen'] }, ctx)).toBe(true)
    expect(evaluatePredicate({ kind: 'techGatesSatisfied', domainSet: ['world_streaming'] }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：segmentCovered', () => {
  it('affinity[tag]=0.8 ≥ τ=0.5：通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'segmentCovered', tag: 'SEG-HARDCORE', threshold: 0.5 }, ctx)).toBe(true)
  })

  it('affinity 缺键取 0（D-01 §6.5）：低于阈值不通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'segmentCovered', tag: 'SEG-CASUAL', threshold: 0.5 }, ctx)).toBe(false)
  })

  it('tag 缺省 = B-03 全称量词：全部宣称达标通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'segmentCovered', threshold: 0.5 }, ctx)).toBe(true)
  })

  it('B-03：宣称中 1 个群体低于阈值 → 不通过（TC-02）', () => {
    const ctx = baseContext()
    ctx.snapshot.frozenBlueprint.positioning.targetSegmentClaims = ['SEG-HARDCORE', 'SEG-CASUAL']
    ctx.marketProfile = {
      affinity: { 'SEG-HARDCORE': 0.8, 'SEG-CASUAL': 0.2 },
      positioningFit: 0.8,
      positioningFitBand: 'high',
      genreFit: 0.7,
      uspSupported: {},
      noveltyNote: '',
      contentVolumeBand: 'medium',
    }
    expect(evaluatePredicate({ kind: 'segmentCovered', threshold: 0.5 }, ctx)).toBe(false)
  })

  it('空宣称集：全称量词 vacuous true（不误报）', () => {
    const structure = completeStructure()
    structure.positioning.targetSegmentClaims = []
    const ctx = baseContext({ snapshot: baseSnapshot({ structure }) })
    expect(evaluatePredicate({ kind: 'segmentCovered', threshold: 0.5 }, ctx)).toBe(true)
  })
})

describe('D02 §3.3 谓词求值器：uspBackedBy', () => {
  it('|sellingPoints|=0 ⇒ 通过（§6.7 不误报，C-02）', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(true)
  })

  it('产品级回退（无贡献记录）：全部卖点被支撑 → 通过', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1', 'USP-2']
    const ctx = baseContext({
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
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(true)
  })

  it('产品级回退：1 条卖点无支撑 → 不通过（D-01 E-USP 同义，TC-05）', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1', 'USP-2']
    const ctx = baseContext({
      snapshot: baseSnapshot({ structure }),
      marketProfile: {
        affinity: {},
        positioningFit: 0.8,
        positioningFitBand: 'high',
        genreFit: 0.7,
        uspSupported: { 'USP-1': true, 'USP-2': false },
        noveltyNote: '',
        contentVolumeBand: 'medium',
      },
    })
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(false)
  })

  it('贡献路径：卖点由 core_loop 槽 present 实例支撑 → uspBackedBy(core_loop) 通过（N-02）', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1']
    const ctx = baseContext({
      snapshot: baseSnapshot({ structure }),
      moduleContributions: [
        baseContribution({ signals: { uspSupported: { 'USP-1': true }, affinitySlice: {}, contentVolumeContribution: 0 } }),
      ],
    })
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'core_loop' }, ctx)).toBe(true)
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(true)
  })

  it('贡献路径：卖点仅由 support 槽支撑 → uspBackedBy(core_loop) 不通过，any 通过（§6.6-4 外层 ∃）', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1']
    const supportSlot = baseSupportSlot()
    structure.slots = [completeStructure().slots[0]!, supportSlot]
    structure.instances.push({
      ...baseInstance(),
      instanceId: 'INS-SUPPORT',
      slotId: 'SLOT-SUPPORT',
      domain: 'progression',
    })
    const ctx = baseContext({
      snapshot: baseSnapshot({ structure }),
      moduleContributions: [
        baseContribution({
          instanceId: 'INS-SUPPORT',
          slotId: 'SLOT-SUPPORT',
          domain: 'progression',
          signals: { uspSupported: { 'USP-1': true }, affinitySlice: {}, contentVolumeContribution: 0 },
        }),
      ],
    })
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'core_loop' }, ctx)).toBe(false)
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'support' }, ctx)).toBe(true)
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(true)
  })

  it('贡献路径：deactivated 实例不支撑（status ≠ present）', () => {
    const structure = completeStructure()
    structure.positioning.sellingPoints = ['USP-1']
    const ctx = baseContext({
      snapshot: baseSnapshot({ structure }),
      moduleContributions: [
        baseContribution({ status: 'deactivated', signals: { uspSupported: { 'USP-1': true }, affinitySlice: {}, contentVolumeContribution: 0 } }),
      ],
    })
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'core_loop' }, ctx)).toBe(false)
    expect(evaluatePredicate({ kind: 'uspBackedBy', slotKind: 'any' }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：defectFree', () => {
  it('无缺陷：通过', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'defectFree', severitySet: ['E'] }, ctx)).toBe(true)
  })

  it('存在 E 级缺陷：不通过（C-06 / D02-E-DEFECT，TC-11）', () => {
    const ctx = baseContext({ defects: [{ defectId: 'DEF-1', severity: 'E' }] })
    expect(evaluatePredicate({ kind: 'defectFree', severitySet: ['E'] }, ctx)).toBe(false)
  })

  it('只有非集合内严重度：通过（P1 仅执行 E，D02-12）', () => {
    const ctx = baseContext({ defects: [{ defectId: 'DEF-1', severity: 'D' }] })
    expect(evaluatePredicate({ kind: 'defectFree', severitySet: ['E'] }, ctx)).toBe(true)
  })
})

describe('D02 §3.3 谓词求值器：platformStdMet', () => {
  it('目标平台存在且 P1 techStandards=[] → 恒满足（C-04）', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'PLT-ARCADE' }, ctx)).toBe(true)
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'any' }, ctx)).toBe(true)
  })

  it('平台门槛存在且能力达标：通过（能力缺键取 0）', () => {
    const ctx = baseContext()
    ctx.platforms = ctx.platforms.map((p) =>
      p.platformId === 'PLT-ARCADE'
        ? { ...p, techStandards: [{ gateId: 'g1', domainId: 'rendering_2d', minCapabilityLevel: 1, note: '' }] }
        : p,
    )
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'PLT-ARCADE' }, ctx)).toBe(false)
    ctx.capabilities = { rendering_2d: 1 }
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'PLT-ARCADE' }, ctx)).toBe(true)
  })

  it("platformId='any'：目标平台全不达标 → 不通过", () => {
    const structure = completeStructure()
    structure.positioning.platformTargets = ['PLT-NOT-IN-CATALOG']
    const ctx = baseContext({ snapshot: baseSnapshot({ structure }) })
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'any' }, ctx)).toBe(false)
  })

  it('平台不在目录（数据缺失）⇒ false，不抛错', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'platformStdMet', platformId: 'PLT-NOT-IN-CATALOG' }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：fieldNonEmpty', () => {
  it('finalTitle 非空：通过（C-03）', () => {
    const ctx = baseContext()
    expect(evaluatePredicate({ kind: 'fieldNonEmpty', field: 'finalTitle' }, ctx)).toBe(true)
  })

  it('finalTitle=null：不通过（上市前必须有正式名）', () => {
    const ctx = baseContext({ productFields: { finalTitle: null } })
    expect(evaluatePredicate({ kind: 'fieldNonEmpty', field: 'finalTitle' }, ctx)).toBe(false)
  })

  it('字段缺失（数据缺失）⇒ false，不抛错；空白串视为空', () => {
    const ctx = baseContext({ productFields: { finalTitle: '   ' } })
    expect(evaluatePredicate({ kind: 'fieldNonEmpty', field: 'finalTitle' }, ctx)).toBe(false)
    expect(evaluatePredicate({ kind: 'fieldNonEmpty', field: 'noSuchField' }, ctx)).toBe(false)
  })
})

describe('D02 §3.3 谓词求值器：depthAtLeast', () => {
  it('核心实例 depth=deep：level=deep 通过（N-01 主分支）', () => {
    const ctx = baseContext()
    ctx.snapshot.frozenBlueprint.instances[0]!.depthSelection = 'deep'
    expect(evaluatePredicate({ kind: 'depthAtLeast', level: 'deep' }, ctx)).toBe(true)
  })

  it('depth=standard + intensity=3 ≥ τ_niche_deep=3：「或」分支通过', () => {
    const ctx = baseContext()
    ctx.snapshot.frozenBlueprint.instances[0]!.intensity = 3
    expect(evaluatePredicate({ kind: 'depthAtLeast', level: 'deep', alternativeMinIntensity: 3 }, ctx)).toBe(true)
  })

  it('depth=standard + intensity=2 < 3：不通过（TC-03 niche）', () => {
    const ctx = baseContext()
    ctx.snapshot.frozenBlueprint.instances[0]!.intensity = 2
    ctx.snapshot.frozenBlueprint.instances[0]!.depthSelection = 'standard'
    expect(evaluatePredicate({ kind: 'depthAtLeast', level: 'deep', alternativeMinIntensity: 3 }, ctx)).toBe(false)
  })

  it('无核心实例：不通过（两个分支都不满足）', () => {
    const structure = completeStructure()
    structure.instances = [completeStructure().instances[1]!]
    structure.slots = [completeStructure().slots[1]!]
    const ctx = baseContext({ snapshot: baseSnapshot({ structure, estimates: null }) })
    expect(evaluatePredicate({ kind: 'depthAtLeast', level: 'deep', alternativeMinIntensity: 1 }, ctx)).toBe(false)
  })
})

describe('D02 谓词求值器：fail-closed 与确定性', () => {
  it('词表外谓词必须抛 UnknownPredicateError（fail-closed，不返回布尔）', () => {
    const ctx = baseContext()
    expect(() =>
      evaluatePredicate({ kind: 'magicScore' } as never, ctx),
    ).toThrowError(UnknownPredicateError)
    try {
      evaluatePredicate({ kind: 'magicScore' } as never, ctx)
    } catch (e) {
      expect((e as UnknownPredicateError).code).toBe('D02-UNKNOWN-PREDICATE')
    }
  })

  it('同一上下文重复求值结果逐字段一致（G1 确定性 / S6 纯函数）', () => {
    const ctx = baseContext()
    const p1 = evaluatePredicate({ kind: 'slotActive', slotKind: 'core_loop', minCount: 1 }, ctx)
    const p2 = evaluatePredicate({ kind: 'slotActive', slotKind: 'core_loop', minCount: 1 }, ctx)
    expect(p1).toBe(p2)
    // 求值不改变上下文（只读）
    expect(ctx.snapshot.frozenBlueprint.instances[0]!.state).toBe('active')
  })
})
