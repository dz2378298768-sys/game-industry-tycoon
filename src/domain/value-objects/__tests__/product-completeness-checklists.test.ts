/**
 * D-02 §5 清单模板测试：模板结构、demo 子集、三形式标准、阈值烘焙、结构校验 fail-closed。
 */
import { describe, expect, it } from 'vitest'
import {
  DELIVERY_FORM_STANDARDS,
  buildP1ChecklistTemplates,
  getActiveChecklist,
  requiredCriticalitiesFor,
  validateChecklistTemplates,
} from '@domain/value-objects/product-completeness-checklists'
import {
  DEFAULT_COMPLETENESS_TUNING,
  withCompletenessTuningOverrides,
} from '@domain/value-objects/product-completeness-tuning'
import {
  GATE_BRIDGE_ITEM_IDS,
  CompletenessDomainError,
} from '@domain/entities/product-completeness'
import { ARCHETYPE_CLASSES } from '@domain/entities/product-completeness'
import { DELIVERY_FORMS } from '@domain/entities/product-completeness'

const templates = () => buildP1ChecklistTemplates(DEFAULT_COMPLETENESS_TUNING)

describe('D02 §5 清单模板：结构完整性', () => {
  it('4 类 × 3 形式 = 12 份模板，checklistId 唯一，state=active', () => {
    const ts = templates()
    expect(ts.length).toBe(12)
    expect(new Set(ts.map((t) => t.checklistId)).size).toBe(12)
    expect(ts.every((t) => t.state === 'active')).toBe(true)
    expect(new Set(ts.map((t) => `${t.archetypeClass}|${t.deliveryForm}`)).size).toBe(12)
  })

  it('每份模板至少含 1 条 blocking 项（任务卡 §2-5）', () => {
    for (const t of templates()) {
      expect(t.items.filter((it) => it.criticality === 'blocking').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('每个清单项 gapActionIds 至少 1 个（不得为空自动补齐，R-D02-3）', () => {
    for (const t of templates()) {
      for (const it of t.items) {
        expect(it.gapActionIds.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('闸门桥接条件 C-06/C-07 不写入任何清单项集（C3 口径：由 gate 恒执行，不入 c_k）', () => {
    for (const t of templates()) {
      for (const it of t.items) {
        expect(GATE_BRIDGE_ITEM_IDS).not.toContain(it.itemId)
      }
    }
    expect(GATE_BRIDGE_ITEM_IDS).toEqual(['C-06', 'C-07'])
  })

  it('公共项 C-01–C-05 在 full/EA 模板全部存在', () => {
    for (const t of templates()) {
      if (t.deliveryForm === 'demo') continue
      const ids = t.items.map((it) => it.itemId)
      for (const c of ['C-01', 'C-02', 'C-03', 'C-04', 'C-05']) {
        expect(ids).toContain(c)
      }
    }
  })
})

describe('D02 §5.3 demo 子集', () => {
  it('demo 只套 C-01/C-02/C-04/C-05（不含 C-03，§5.3 子集口径；§5.1 张力登记待追认）', () => {
    const demo = getActiveChecklist(templates(), 'broad', 'demo')
    const ids = demo.items.map((it) => it.itemId)
    expect(ids).toContain('C-01')
    expect(ids).toContain('C-02')
    expect(ids).toContain('C-04')
    expect(ids).toContain('C-05')
    expect(ids).not.toContain('C-03')
  })

  it('broad demo：B-01/B-02/B-03 为 optional 演示片段项', () => {
    const demo = getActiveChecklist(templates(), 'broad', 'demo')
    for (const id of ['B-01', 'B-02', 'B-03']) {
      const it = demo.items.find((x) => x.itemId === id)
      expect(it?.criticality).toBe('optional')
    }
  })

  it('technical demo：T-01 例外仍为 blocking；T-02/T-03 optional（§5.3 例外）', () => {
    const demo = getActiveChecklist(templates(), 'technical', 'demo')
    expect(demo.items.find((x) => x.itemId === 'T-01')?.criticality).toBe('blocking')
    expect(demo.items.find((x) => x.itemId === 'T-02')?.criticality).toBe('optional')
    expect(demo.items.find((x) => x.itemId === 'T-03')?.criticality).toBe('optional')
  })

  it('demo 不继承 full/EA 的 expected 项（子集内无 expected）', () => {
    for (const cls of ARCHETYPE_CLASSES) {
      const demo = getActiveChecklist(templates(), cls, 'demo')
      expect(demo.items.some((it) => it.criticality === 'expected')).toBe(false)
    }
  })
})

describe('D02 §5.3 类别专属项 criticality（full / EA / demo 三列）', () => {
  it('broad full：B-01/B-02 blocking、B-03 expected；EA：B-02 expected', () => {
    const full = getActiveChecklist(templates(), 'broad', 'full')
    expect(full.items.find((x) => x.itemId === 'B-01')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'B-02')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'B-03')?.criticality).toBe('expected')
    const ea = getActiveChecklist(templates(), 'broad', 'early_access')
    expect(ea.items.find((x) => x.itemId === 'B-02')?.criticality).toBe('expected')
  })

  it('niche full：N-01/N-02 blocking、N-03 expected', () => {
    const full = getActiveChecklist(templates(), 'niche', 'full')
    expect(full.items.find((x) => x.itemId === 'N-01')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'N-02')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'N-03')?.criticality).toBe('expected')
  })

  it('technical full：T-01/T-02 blocking、T-03 expected', () => {
    const full = getActiveChecklist(templates(), 'technical', 'full')
    expect(full.items.find((x) => x.itemId === 'T-01')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'T-02')?.criticality).toBe('blocking')
    expect(full.items.find((x) => x.itemId === 'T-03')?.criticality).toBe('expected')
  })

  it('generic：只有公共项（无类别专属项）', () => {
    const full = getActiveChecklist(templates(), 'generic', 'full')
    expect(full.items.map((it) => it.itemId).sort()).toEqual(['C-01', 'C-02', 'C-03', 'C-04', 'C-05'])
  })
})

describe('D02 §6.6 requiredFor(form) 与 TUNING 阈值烘焙', () => {
  it('full={blocking,expected}；EA={blocking}；demo=清单标注 criticality', () => {
    expect(requiredCriticalitiesFor('full')).toEqual(['blocking', 'expected'])
    expect(requiredCriticalitiesFor('early_access')).toEqual(['blocking'])
    const demo = getActiveChecklist(templates(), 'broad', 'demo')
    expect([...requiredCriticalitiesFor('demo', demo)].sort()).toEqual(['blocking', 'optional'].sort())
  })

  it('阈值随注入 tuning 烘焙进谓词参数（B-01=tBroadContent、N-01=τ_niche_deep、B-03=τ_cover_broad）', () => {
    const t2 = withCompletenessTuningOverrides({
      tBroadContent: 5,
      tauNicheDeep: 4,
      tauCoverBroad: 0.7,
    })
    const ts = buildP1ChecklistTemplates(t2)
    const broadFull = ts.find((x) => x.archetypeClass === 'broad' && x.deliveryForm === 'full')!
    expect(broadFull.items.find((x) => x.itemId === 'B-01')?.predicate).toEqual({
      kind: 'contentTierAtLeast', minTier: 5,
    })
    expect(broadFull.items.find((x) => x.itemId === 'B-03')?.predicate).toEqual({
      kind: 'segmentCovered', threshold: 0.7,
    })
    const nicheFull = ts.find((x) => x.archetypeClass === 'niche' && x.deliveryForm === 'full')!
    expect(nicheFull.items.find((x) => x.itemId === 'N-01')?.predicate).toEqual({
      kind: 'depthAtLeast', level: 'deep', alternativeMinIntensity: 4,
    })
  })

  it('强制阈值顺序 τ_niche ≤ τ_niche_deep：违反抛 D02-TUNING-INVARIANT（§6.6 约束 3）', () => {
    expect(() => withCompletenessTuningOverrides({ tauNiche: 4, tauNicheDeep: 3 })).toThrowError(
      CompletenessDomainError,
    )
  })

  it('marketFitWeights 和为 1：违反抛 D02-TUNING-INVARIANT（§6.1）', () => {
    expect(() =>
      withCompletenessTuningOverrides({ marketFitWeights: { positioning: 0.5, genre: 0.5, usp: 0.5 } }),
    ).toThrowError(CompletenessDomainError)
  })
})

describe('D02 §3.4 DeliveryForm 标准', () => {
  it('三形式（不新增枚举值）；disclosurePolicy 三形式均 required', () => {
    expect(DELIVERY_FORM_STANDARDS.map((s) => s.form).sort()).toEqual([...DELIVERY_FORMS].sort())
    expect(DELIVERY_FORM_STANDARDS.every((s) => s.disclosurePolicy === 'required')).toBe(true)
  })

  it('allowsUpgradeTo：仅 EA→full；demo/full 不可直转（§4.3）', () => {
    const ea = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'early_access')!
    const demo = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'demo')!
    const full = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'full')!
    expect(ea.allowsUpgradeTo).toBe('full')
    expect(demo.allowsUpgradeTo).toBeNull()
    expect(full.allowsUpgradeTo).toBeNull()
  })

  it('requiredCriticality：full={blocking,expected}；EA={blocking}；demo=demo_subset', () => {
    const full = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'full')!
    const ea = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'early_access')!
    const demo = DELIVERY_FORM_STANDARDS.find((s) => s.form === 'demo')!
    expect(full.requiredCriticality).toEqual(['blocking', 'expected'])
    expect(ea.requiredCriticality).toEqual(['blocking'])
    expect(demo.requiredCriticality).toBe('demo_subset')
  })
})

describe('D02 结构校验 fail-closed', () => {
  it('缺 (class, form) 模板：getActiveChecklist 抛 D02-TEMPLATE-MISSING', () => {
    const ts = templates().filter((t) => t.deliveryForm !== 'demo')
    expect(() => getActiveChecklist(ts, 'broad', 'demo')).toThrowError(CompletenessDomainError)
    try {
      getActiveChecklist(ts, 'broad', 'demo')
    } catch (e) {
      expect((e as CompletenessDomainError).code).toBe('D02-TEMPLATE-MISSING')
    }
  })

  it('重复 (class, form) 模板：validateChecklistTemplates 抛 D02-TEMPLATE-INVALID（active 至多一份，§4.4）', () => {
    const ts = templates()
    expect(() => validateChecklistTemplates([...ts, ts[0]!])).toThrowError(CompletenessDomainError)
  })

  it('无 blocking 项的模板：抛 D02-TEMPLATE-INVALID（任务卡 §2-5）', () => {
    const ts = templates().map((t) =>
      t.checklistId === 'D02-CL-generic-demo'
        ? { ...t, items: t.items.map((it) => ({ ...it, criticality: 'optional' as const })) }
        : t,
    )
    expect(() => validateChecklistTemplates(ts)).toThrowError(CompletenessDomainError)
  })

  it('gapActionIds 为空的清单项：抛 D02-TEMPLATE-INVALID（R-D02-3）', () => {
    const ts = templates().map((t) =>
      t.checklistId === 'D02-CL-generic-demo'
        ? { ...t, items: [{ ...t.items[0]!, gapActionIds: [] }, ...t.items.slice(1)] }
        : t,
    )
    expect(() => validateChecklistTemplates(ts)).toThrowError(CompletenessDomainError)
  })
})
