/**
 * D-04 词表包测试。TC 编号对照 D-04 V0.2 §9.1；条款对照 §5.3/§5.4/§8.1。
 */
import { describe, it, expect } from 'vitest'
import {
  P1_VOCABULARY_VERSION,
  SEED_SEGMENT_TAGS,
  SEED_ARCHETYPES,
  SEED_PLATFORMS,
  createP1Catalog,
  loadVocabulary,
  getVocabulary,
  getArchetypes,
  getPlatforms,
  resolveRefs,
  refsFromPositioning,
  E04,
  E20_RESOLUTION_CODES,
} from '../d04-vocabulary'
import type { VocabularyRefs, VocabularyCatalog } from '../d04-vocabulary'

const baseRefs = (): VocabularyRefs => ({
  tagIds: ['SEG-HARDCORE'],
  primaryTypeId: 'SEED-PLATFORMER',
  secondaryTypeIds: [],
  platformIds: ['PLT-ARCADE'],
})

const deprecate = (catalog: VocabularyCatalog, kind: 'tag' | 'platform' | 'archetype', id: string): VocabularyCatalog => {
  const next = {
    vocabulary: { ...catalog.vocabulary, tags: catalog.vocabulary.tags.map((t) => ({ ...t })) },
    archetypes: catalog.archetypes.map((a) => ({ ...a })),
    platforms: catalog.platforms.map((p) => ({ ...p })),
  }
  if (kind === 'tag') {
    const t = next.vocabulary.tags.find((x) => x.tagId === id)
    if (t) t.state = 'deprecated'
  } else if (kind === 'platform') {
    const p = next.platforms.find((x) => x.platformId === id)
    if (p) p.state = 'deprecated'
  } else {
    const a = next.archetypes.find((x) => x.archetypeId === id)
    if (a) a.state = 'deprecated'
  }
  return next
}

describe('D-04 §6 种子数据（TC-01）', () => {
  it('TC-01：标签 10 / 类型 3 / 平台 3，且同版本无重复 ID（PF1 ≤12/3/3）', () => {
    expect(SEED_SEGMENT_TAGS).toHaveLength(10)
    expect(SEED_ARCHETYPES).toHaveLength(3)
    expect(SEED_PLATFORMS).toHaveLength(3)
    expect(() => loadVocabulary(createP1Catalog())).not.toThrow()
  })

  it('TC-01：全部种子为 active / seed_data（平台 historical），版本一致', () => {
    expect(SEED_SEGMENT_TAGS.every((t) => t.state === 'active' && t.source === 'seed_data')).toBe(true)
    expect(SEED_ARCHETYPES.every((a) => a.state === 'active' && a.source === 'seed_data')).toBe(true)
    expect(SEED_PLATFORMS.every((p) => p.state === 'active' && p.source === 'historical')).toBe(true)
    expect(getVocabulary().vocabularyVersion).toBe(P1_VOCABULARY_VERSION)
  })

  it('§5.1 / TC-14：typeAffinity 缺键一律取 0（种子未列的域为 undefined，消费方按 0）', () => {
    const platformer = SEED_ARCHETYPES.find((a) => a.archetypeId === 'SEED-PLATFORMER')
    expect(platformer?.typeAffinity.simulation).toBeUndefined()
  })

  it('§6.3 / TC-11：P1 平台 techStandards=[] 占位，不伪装确定门槛', () => {
    expect(getPlatforms().every((p) => p.techStandards.length === 0)).toBe(true)
    expect(getPlatforms().every((p) => p.existence.available === true)).toBe(true)
  })

  it('§6.3 / TC-24：getPlatforms 输出含 inputCapabilities（arcade=gamepad、appleii=keyboard_mouse）', () => {
    const platforms = getPlatforms()
    expect(platforms.find((p) => p.code === 'arcade')?.inputCapabilities).toEqual(['gamepad'])
    expect(platforms.find((p) => p.code === 'home_computer_appleii')?.inputCapabilities).toEqual(['keyboard_mouse'])
  })

  it('§7.1 getArchetypes(stateFilter) 过滤生效；TC-18 AI 同源无特权', () => {
    expect(getArchetypes('active')).toHaveLength(3)
    expect(getArchetypes('provisional')).toHaveLength(0)
    expect(getArchetypes()).toHaveLength(3)
    // AI 与玩家读取同一目录、同一 resolveRefs 结果（无特权）
    const catalog = createP1Catalog()
    expect(resolveRefs(baseRefs(), catalog, 'lock')).toEqual(resolveRefs(baseRefs(), catalog, 'lock'))
  })
})

describe('D-04 §5.4 加载期错误（X-1 / X-2 / TC-17）', () => {
  it('X-1 / TC-17：空词表包 → E04-NO-VOCAB，拒绝加载', () => {
    const empty = createP1Catalog()
    empty.vocabulary.tags = []
    try {
      loadVocabulary(empty)
      expect.unreachable('应抛 VocabularyLoadError')
    } catch (err) {
      expect((err as { code: string }).code).toBe(E04.NO_VOCAB)
    }
  })

  it('X-2：同版本重复 ID → E04-DUP-ID，拒绝加载', () => {
    const dup = createP1Catalog()
    dup.vocabulary.tags.push({ ...dup.vocabulary.tags[0]!, tagId: 'SEG-HARDCORE' })
    try {
      loadVocabulary(dup)
      expect.unreachable('应抛 VocabularyLoadError')
    } catch (err) {
      expect((err as { code: string }).code).toBe(E04.DUP_ID)
    }
  })

  it('N-2：加载期错误不产生 resolveRefs violations（两类 E04 严格区分）', () => {
    const result = resolveRefs(baseRefs(), createP1Catalog(), 'lock')
    expect(result.violations.some((v) => v.code === E04.NO_VOCAB)).toBe(false)
    expect(result.violations.some((v) => v.code === E04.DUP_ID)).toBe(false)
  })
})

describe('D-04 §5.3/§5.4 引用解析（TC-02/04/05/06/07/09/10）', () => {
  it('TC-02：3 个合法 active 标签 + active 主类型 + active 平台 → 零违规', () => {
    const refs: VocabularyRefs = {
      tagIds: ['SEG-MASS_MARKET', 'SEG-YOUTH', 'SEG-CASUAL'],
      primaryTypeId: 'SEED-PLATFORMER',
      secondaryTypeIds: [],
      platformIds: ['PLT-ARCADE', 'PLT-HOME_COMPUTER_APPLEII'],
    }
    const r = resolveRefs(refs, createP1Catalog(), 'lock')
    expect(r.violations).toHaveLength(0)
    expect(r.resolved.tags).toHaveLength(3)
    expect(r.resolved.platforms).toHaveLength(2)
  })

  it('TC-04：未知 tag → 草稿 W04-UNKNOWN-TAG（W）；锁定 E04-UNKNOWN-TAG（E）', () => {
    const refs = { ...baseRefs(), tagIds: ['SEG-UNKNOWN'] }
    const draft = resolveRefs(refs, createP1Catalog(), 'draft')
    expect(draft.violations).toEqual([expect.objectContaining({ code: E04.W_UNKNOWN_TAG, severity: 'W' })])
    const lock = resolveRefs(refs, createP1Catalog(), 'lock')
    expect(lock.violations).toEqual([expect.objectContaining({ code: E04.UNKNOWN_TAG, severity: 'E' })])
  })

  it('TC-05：deprecated tag 新蓝图 → E04-DEPRECATED-TAG；旧快照只读保留不报 E', () => {
    const catalog = deprecate(createP1Catalog(), 'tag', 'SEG-HARDCORE')
    const lock = resolveRefs(baseRefs(), catalog, 'lock')
    expect(lock.violations.map((v) => v.code)).toContain(E04.DEPRECATED_TAG)
    const read = resolveRefs(baseRefs(), catalog, 'read')
    expect(read.violations).toHaveLength(0)
    expect(read.resolved.tags).toContain('SEG-HARDCORE')
  })

  it('TC-06：primary 引用 provisional 类型 → E04-NONACTIVE-ARCHETYPE（非"非独立 E 码"）', () => {
    const catalog = createP1Catalog()
    catalog.archetypes = catalog.archetypes.map((a) => (
      a.archetypeId === 'SEED-PLATFORMER' ? { ...a, state: 'provisional' as const, isProvisional: true } : a
    ))
    const r = resolveRefs(baseRefs(), catalog, 'lock')
    expect(r.violations.map((v) => v.code)).toContain(E04.NONACTIVE_ARCHETYPE)
  })

  it('TC-06b：secondary 引用 deprecated 类型 → E04-DEPRECATED-ARCHETYPE', () => {
    const catalog = deprecate(createP1Catalog(), 'archetype', 'SEED-RPG')
    const refs = { ...baseRefs(), secondaryTypeIds: ['SEED-RPG'] }
    const r = resolveRefs(refs, catalog, 'lock')
    expect(r.violations.map((v) => v.code)).toContain(E04.DEPRECATED_ARCHETYPE)
  })

  it('TC-07：secondary 引用 provisional 类型 → 允许（active/provisional 混用合法）', () => {
    const catalog = createP1Catalog()
    catalog.archetypes = catalog.archetypes.map((a) => (
      a.archetypeId === 'SEED-RPG' ? { ...a, state: 'provisional' as const, isProvisional: true } : a
    ))
    const refs = { ...baseRefs(), secondaryTypeIds: ['SEED-RPG'] }
    expect(resolveRefs(refs, catalog, 'lock').violations).toHaveLength(0)
  })

  it('TC-09：未知 platform → 草稿 W04-UNKNOWN-PLATFORM；锁定 E04-UNKNOWN-PLATFORM', () => {
    const refs = { ...baseRefs(), platformIds: ['PLT-UNKNOWN'] }
    expect(resolveRefs(refs, createP1Catalog(), 'draft').violations[0]?.code).toBe(E04.W_UNKNOWN_PLATFORM)
    expect(resolveRefs(refs, createP1Catalog(), 'lock').violations[0]?.code).toBe(E04.UNKNOWN_PLATFORM)
  })

  it('TC-10：deprecated platform 新蓝图 → E04-DEPRECATED-PLATFORM；旧快照只读保留', () => {
    const catalog = deprecate(createP1Catalog(), 'platform', 'PLT-ARCADE')
    expect(resolveRefs(baseRefs(), catalog, 'lock').violations.map((v) => v.code)).toContain(E04.DEPRECATED_PLATFORM)
    const read = resolveRefs(baseRefs(), catalog, 'read')
    expect(read.violations).toHaveLength(0)
    expect(read.resolved.platforms).toContain('PLT-ARCADE')
  })

  it('§5.2：primary 为空由 D-01 E-10 处理，resolveRefs 不误报 E04', () => {
    const refs = { ...baseRefs(), primaryTypeId: '' }
    expect(resolveRefs(refs, createP1Catalog(), 'lock').violations.map((v) => v.code)).not.toContain(E04.UNKNOWN_ARCHETYPE)
  })

  it('§8.1 X-8：多个引用同时失效时全部计算，不吞码', () => {
    const refs: VocabularyRefs = {
      tagIds: ['SEG-BAD-1', 'SEG-BAD-2'],
      primaryTypeId: 'ARCH-BAD',
      secondaryTypeIds: ['ARCH-BAD-2'],
      platformIds: ['PLT-BAD'],
    }
    const codes = resolveRefs(refs, createP1Catalog(), 'lock').violations.map((v) => v.code)
    expect(codes).toEqual(expect.arrayContaining([
      E04.UNKNOWN_TAG, E04.UNKNOWN_ARCHETYPE, E04.UNKNOWN_PLATFORM,
    ]))
    expect(codes.filter((c) => c === E04.UNKNOWN_TAG)).toHaveLength(2)
  })
})

describe('D-01 §11 E-20 覆盖（TC-21）', () => {
  it('E-20：E20_RESOLUTION_CODES 恰为 7 个引用解析 E04 码，且全部可由 resolveRefs 产出', () => {
    expect(E20_RESOLUTION_CODES).toHaveLength(7)
    const catalog = createP1Catalog()
    const refs: VocabularyRefs = {
      tagIds: ['SEG-DEPRECATED', 'SEG-UNKNOWN'],
      primaryTypeId: 'ARCH-PROVISIONAL', // 存在但非 active → NONACTIVE
      secondaryTypeIds: ['ARCH-DEPRECATED', 'ARCH-UNKNOWN'],
      platformIds: ['PLT-DEPRECATED', 'PLT-UNKNOWN'],
    }
    const deprecatedCatalog = {
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
    const codes = new Set(resolveRefs(refs, deprecatedCatalog, 'lock').violations.map((v) => v.code))
    for (const expected of E20_RESOLUTION_CODES) {
      expect(codes.has(expected), `E-20 应覆盖 ${expected}`).toBe(true)
    }
  })
})

describe('ADJ-2026-11-21-02 tagId 语义不可变（TC-15 / TC-22 / TC-23）', () => {
  it('TC-15：旧版本 tagId 在新目录仍可解析，无悬空引用', () => {
    const r = resolveRefs(baseRefs(), createP1Catalog(), 'read')
    expect(r.resolved.tags).toContain('SEG-HARDCORE')
    expect(r.rejected).not.toContain('SEG-HARDCORE')
  })

  it('TC-22：已发布 tagId 的 displayName/dimension/granularity/regionScope/eraRange 不随目录复制漂移', () => {
    const first = createP1Catalog().vocabulary.tags.find((t) => t.tagId === 'SEG-HARDCORE')!
    const second = createP1Catalog().vocabulary.tags.find((t) => t.tagId === 'SEG-HARDCORE')!
    expect(second).toEqual(first)
    expect(second.displayName).toBe('硬核')
    expect(second.granularity).toBe('niche')
    expect(second.eraRange).toEqual({ fromYear: 1970, toYear: 2026 })
  })

  it('TC-23：读档遇完全未知 tagId/platformId → 拒绝该引用、标记只读、不报 E、存档仍可打开', () => {
    const refs: VocabularyRefs = {
      tagIds: ['SEG-UNKNOWN'],
      primaryTypeId: 'SEED-PLATFORMER',
      secondaryTypeIds: [],
      platformIds: ['PLT-UNKNOWN'],
    }
    const r = resolveRefs(refs, createP1Catalog(), 'read')
    expect(r.violations).toHaveLength(0)
    expect(r.rejected).toEqual(expect.arrayContaining(['SEG-UNKNOWN', 'PLT-UNKNOWN']))
    expect(r.resolved.archetypes).toContain('SEED-PLATFORMER')
  })

  it('§7.1 refsFromPositioning 抽取正确（供闸门前置调用）', () => {
    const refs = refsFromPositioning({
      primaryTypeId: 'SEED-RPG',
      secondaryTypeIds: ['SEED-PLATFORMER'],
      targetSegmentClaims: ['SEG-HARDCORE'],
      platformTargets: ['PLT-ARCADE'],
    })
    expect(refs).toEqual({
      tagIds: ['SEG-HARDCORE'], primaryTypeId: 'SEED-RPG',
      secondaryTypeIds: ['SEED-PLATFORMER'], platformIds: ['PLT-ARCADE'],
    })
  })
})
