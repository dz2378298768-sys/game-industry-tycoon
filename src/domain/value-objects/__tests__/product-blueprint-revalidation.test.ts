/**
 * D-01 §7.2.1 RevalidationGate 测试（TC-08a/08b、E-18、E-20、R-05 反证）。
 */
import { describe, it, expect } from 'vitest'
import {
  revalidationGate, decideSnapshotSwitch, undoRework,
} from '../product-blueprint-revalidation'
import { E20_RESOLUTION_CODES, E04 } from '@domain/entities/product-blueprint'
import type { ReworkSession, VocabularyCatalog } from '@domain/entities/product-blueprint'
import { createP1Catalog, SEED_SEGMENT_TAGS, SEED_ARCHETYPES, SEED_PLATFORMS } from '@content/d04-vocabulary'
import { withTuningOverrides } from '../product-blueprint-tuning'
import {
  baseTemplate, baseInstance, baseSlot, baseStructure, emptyRules, tuning,
} from './product-blueprint-fixtures'

const validInput = () => ({
  structure: baseStructure(),
  catalog: createP1Catalog(),
  templatesById: { 'TPL-COMBAT': baseTemplate({ uspIds: [] }) },
  rules: emptyRules(),
  tuning: tuning(),
})

const failingCatalog = (): VocabularyCatalog => {
  const catalog = createP1Catalog()
  return {
    vocabulary: {
      ...catalog.vocabulary,
      tags: [
        ...catalog.vocabulary.tags,
        { ...SEED_SEGMENT_TAGS[0]!, tagId: 'SEG-DEPRECATED', state: 'deprecated' as const },
      ],
    },
    archetypes: [
      ...catalog.archetypes,
      { ...SEED_ARCHETYPES[0]!, archetypeId: 'ARCH-PROVISIONAL', state: 'provisional' as const, isProvisional: true },
      { ...SEED_ARCHETYPES[1]!, archetypeId: 'ARCH-DEPRECATED', state: 'deprecated' as const },
    ],
    platforms: [
      ...catalog.platforms,
      ...SEED_PLATFORMS.slice(0, 1).map((p) => ({ ...p, platformId: 'PLT-DEPRECATED', state: 'deprecated' as const })),
    ],
  }
}

describe('§7.2.1 闸门基本行为', () => {
  it('合法结构 → PASS，可切快照', () => {
    const result = revalidationGate(validInput())
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(decideSnapshotSwitch(result)).toBe('switch')
  })

  it('E-级违规 → FAIL（fail-closed），不切快照/禁交付', () => {
    const input = validInput()
    input.structure = baseStructure({ slots: [baseSlot({ bindings: [] })], instances: [] })
    const result = revalidationGate(input)
    expect(result.pass).toBe(false)
    expect(result.violations.some((v) => v.severity === 'E')).toBe(true)
    expect(decideSnapshotSwitch(result)).toBe('block')
  })

  it('仅 W 级违规 → PASS（IN_REVIEW→LOCKED 审核项全为 W 级）', () => {
    const result = revalidationGate({
      ...validInput(),
      mode: 'draft',
      structure: baseStructure({
        positioning: { ...baseStructure().positioning, targetSegmentClaims: ['SEG-UNKNOWN'] },
      }),
    })
    expect(result.refViolations.every((v) => v.severity === 'W')).toBe(true)
    expect(result.pass).toBe(true)
  })

  it('§7.2.1 / C1：resolveRefs 是 RunHardRules 之前的独立前置，refViolations 单列', () => {
    const result = revalidationGate({
      ...validInput(),
      structure: baseStructure({
        positioning: { ...baseStructure().positioning, targetSegmentClaims: ['SEG-UNKNOWN'] },
      }),
    })
    expect(result.refViolations.map((v) => v.code)).toContain(E04.UNKNOWN_TAG)
    expect(result.hardRuleViolations).toHaveLength(0)
    expect(result.pass).toBe(false)
  })
})

describe('E-20：闸门覆盖全部 7 个引用解析 E04 码（TC-21）', () => {
  it('7 个 E04 码逐一经 resolveRefs 前置并入 violations → 全部 FAIL', () => {
    const catalog = failingCatalog()
    const cases: Array<{ code: string; refs: Parameters<typeof revalidationGate>[0]['structure']['positioning'] }> = [
      { code: E04.DEPRECATED_TAG, refs: { ...baseStructure().positioning, targetSegmentClaims: ['SEG-DEPRECATED'] } },
      { code: E04.UNKNOWN_TAG, refs: { ...baseStructure().positioning, targetSegmentClaims: ['SEG-UNKNOWN'] } },
      { code: E04.DEPRECATED_PLATFORM, refs: { ...baseStructure().positioning, platformTargets: ['PLT-DEPRECATED'] } },
      { code: E04.UNKNOWN_PLATFORM, refs: { ...baseStructure().positioning, platformTargets: ['PLT-UNKNOWN'] } },
      { code: E04.UNKNOWN_ARCHETYPE, refs: { ...baseStructure().positioning, primaryTypeId: 'ARCH-UNKNOWN' } },
      { code: E04.NONACTIVE_ARCHETYPE, refs: { ...baseStructure().positioning, primaryTypeId: 'ARCH-PROVISIONAL' } },
      { code: E04.DEPRECATED_ARCHETYPE, refs: { ...baseStructure().positioning, secondaryTypeIds: ['ARCH-DEPRECATED'] } },
    ]
    expect(E20_RESOLUTION_CODES).toHaveLength(7)
    for (const c of cases) {
      const result = revalidationGate({ ...validInput(), catalog, structure: baseStructure({ positioning: c.refs }) })
      expect(result.refViolations.map((v) => v.code), `E-20 应含 ${c.code}`).toContain(c.code)
      expect(result.violations.some((v) => v.code === c.code && v.severity === 'E')).toBe(true)
      expect(result.pass, `${c.code} 应 fail-closed`).toBe(false)
      expect(decideSnapshotSwitch(result)).toBe('block')
    }
  })
})

describe('R-05 反证（TC-08a / TC-08b / E-18）', () => {
  it('停用唯一支撑模块 → E-EMPTY + E-USP，禁止切换快照', () => {
    const input = validInput()
    input.templatesById = { 'TPL-COMBAT': baseTemplate({ uspIds: ['USP-S'] }) }
    input.structure = baseStructure({
      instances: [baseInstance({ state: 'deactivated' })],
      positioning: { ...baseStructure().positioning, sellingPoints: ['USP-S'] },
    })
    const result = revalidationGate(input)
    const codes = result.hardRuleViolations.map((v) => v.code)
    expect(codes).toContain('E-EMPTY')
    expect(codes).toContain('E-USP')
    expect(result.pass).toBe(false)
    expect(decideSnapshotSwitch(result)).toBe('block')
  })

  it('交付闸门：D-06 E-TECH 外部违规注入 → 阻断 COMPLETED（不得带病上市）', () => {
    const result = revalidationGate({
      ...validInput(),
      externalViolations: [{
        code: 'E-TECH', severity: 'E', ruleId: 'E-TECH', subjectIds: ['g_struct_open'],
        message: '本时代技术不可能', suggestedAction: '改结构',
      }],
    })
    expect(result.pass).toBe(false)
    expect(decideSnapshotSwitch(result)).toBe('block')
  })

  it('§11 E-19：待处理不兼容模块 → 闸门 FAIL', () => {
    const result = revalidationGate({ ...validInput(), pendingIncompatibleInstanceIds: ['INS-X'] })
    expect(result.pass).toBe(false)
  })

  it('撤销返工：丢弃目标草稿，旧快照继续生效，state 保持 EXECUTING', () => {
    const session: ReworkSession = {
      sessionId: 'RS-1', projectId: 'PRJ-1', versionId: 'V-1',
      targetDraftVersionId: 'V-2-DRAFT', status: 'active',
      reworkTaskIds: [], changeIds: [], startedAt: 100,
    }
    const undone = undoRework(session, 'SNAP-OLD')
    expect(undone.session.status).toBe('cancelled')
    expect(undone.authoritativeSnapshotId).toBe('SNAP-OLD')
    expect(undone.session.targetDraftVersionId).toBe('V-2-DRAFT')
  })

  it('τ_high 注入影响外部风险判级但不改变闸门硬规则口径', () => {
    const withStrict = revalidationGate({ ...validInput(), tuning: withTuningOverrides({ tauHigh: 0.2 }) })
    expect(withStrict.pass).toBe(true)
  })
})
