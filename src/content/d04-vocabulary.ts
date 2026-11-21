/**
 * D-04 前置词表包 P1 种子数据（V0.2 §6.1/§6.2/§6.3）与加载期校验。
 *
 * 数据随版本包发布，不随玩家存档复制（§8.2 A1）。
 * 已发布取值与语义永久不可变（ADJ-2026-11-21-02 裁定二）：
 *  跨版本仅允许「新增 tagId」或「state: active→deprecated」，禁止改 displayName 等语义字段。
 *
 * 加载期错误码：E04-NO-VOCAB / E04-DUP-ID —— 拒绝加载，不进入 RevalidationGate（§5.4 注）。
 * 引用解析错误码由 domain/value-objects/product-blueprint-resolve-refs.ts 产生。
 */
import {
  E04,
  VocabularyLoadError,
} from '@domain/entities/product-blueprint'
import type {
  GameplayArchetype,
  Platform,
  SegmentTag,
  SegmentTagVocabulary,
  VocabularyCatalog,
} from '@domain/entities/product-blueprint'

export type {
  GameplayArchetype,
  Platform,
  SegmentTag,
  SegmentTagVocabulary,
  VocabularyCatalog,
  VocabularyRefs,
  ResolveResult,
} from '@domain/entities/product-blueprint'
export { E04, E20_RESOLUTION_CODES } from '@domain/entities/product-blueprint'
export { resolveRefs, refsFromPositioning } from '@domain/value-objects/product-blueprint-resolve-refs'

/** P1 全局单版本（§4.1）。 */
export const P1_VOCABULARY_VERSION = 'D04-VOCAB-v0.1'

const globalScope = { kind: 'global' as const, regionIds: [] as string[] }
const p1Era = { fromYear: 1970, toYear: 2026 }
const northAmerica = ['north_america']

/**
 * §6.1 SegmentTag 种子集（10 个）。
 * displayName / dimension / granularity / regionScope / eraRange 已发布即永久不可变。
 */
export const SEED_SEGMENT_TAGS: readonly SegmentTag[] = [
  { tagId: 'SEG-MASS_MARKET', code: 'mass_market', displayName: '大众', dimension: 'preference', granularity: 'broad', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-YOUTH', code: 'youth', displayName: '青少年', dimension: 'demographic', granularity: 'broad', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-CASUAL', code: 'casual', displayName: '休闲', dimension: 'preference', granularity: 'broad', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-HARDCORE', code: 'hardcore', displayName: '硬核', dimension: 'preference', granularity: 'niche', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-ENTHUSIAST_PRO', code: 'enthusiast_pro', displayName: '专业玩家', dimension: 'preference', granularity: 'niche', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-FAMILY', code: 'family', displayName: '家庭', dimension: 'demographic', granularity: 'broad', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-FEMALE', code: 'female', displayName: '女性玩家', dimension: 'demographic', granularity: 'broad', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-COMPETITIVE', code: 'competitive', displayName: '竞技向', dimension: 'preference', granularity: 'niche', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-STRATEGY_FAN', code: 'strategy_fan', displayName: '策略偏好', dimension: 'preference', granularity: 'niche', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
  { tagId: 'SEG-NOSTALGIA', code: 'nostalgia', displayName: '怀旧', dimension: 'preference', granularity: 'niche', regionScope: globalScope, eraRange: p1Era, state: 'active', source: 'seed_data', vocabularyVersion: P1_VOCABULARY_VERSION },
]

/**
 * §6.2 GameplayArchetype 种子集（3 个）。字段严格对齐 D-01 §4.13。
 * typeAffinity 数值为 TUNING；缺键一律取 0（D-01 §6.5）。
 */
export const SEED_ARCHETYPES: readonly GameplayArchetype[] = [
  {
    archetypeId: 'SEED-PLATFORMER', name: '平台动作',
    coreSlotDomains: ['combat', 'exploration'],
    typeAffinity: { combat: 0.7, exploration: 0.9, progression: 0.3, narrative: 0.2 },
    subtypeTableId: null, isProvisional: false, state: 'active', successCount: 0,
    source: 'seed_data', createdAt: null, promotedAt: null,
  },
  {
    archetypeId: 'SEED-RPG', name: '角色扮演',
    coreSlotDomains: ['progression', 'narrative', 'combat'],
    typeAffinity: { combat: 0.7, exploration: 0.6, progression: 0.95, narrative: 0.8 },
    subtypeTableId: null, isProvisional: false, state: 'active', successCount: 0,
    source: 'seed_data', createdAt: null, promotedAt: null,
  },
  {
    archetypeId: 'SEED-MGMT_SIM', name: '模拟经营',
    coreSlotDomains: ['management', 'simulation'],
    typeAffinity: { management: 0.95, simulation: 0.9, building: 0.5 },
    subtypeTableId: null, isProvisional: false, state: 'active', successCount: 0,
    source: 'seed_data', createdAt: null, promotedAt: null,
  },
]

/**
 * §6.3 Platform 种子集（3 个）。techStandards=[] 为 CONFIRMED 占位，档位待 D-06（不伪装确定门槛）。
 * P1 三平台成本/市场侧无差异；即时可观察差异仅 inputCapabilities（DEFERRED-1）。
 */
export const SEED_PLATFORMS: readonly Platform[] = [
  {
    platformId: 'PLT-ARCADE', code: 'arcade', displayName: '街机',
    existence: { available: true, eraRange: { fromYear: 1970, toYear: 2026 }, regionCoverage: northAmerica },
    inputCapabilities: ['gamepad'], techStandards: [], state: 'active', source: 'historical',
  },
  {
    platformId: 'PLT-HOME_CONSOLE_ATARI2600', code: 'home_console_atari2600', displayName: '家用主机（Atari 2600 类）',
    existence: { available: true, eraRange: { fromYear: 1977, toYear: 2026 }, regionCoverage: northAmerica },
    inputCapabilities: ['gamepad'], techStandards: [], state: 'active', source: 'historical',
  },
  {
    platformId: 'PLT-HOME_COMPUTER_APPLEII', code: 'home_computer_appleii', displayName: '家用电脑（Apple II 类）',
    existence: { available: true, eraRange: { fromYear: 1977, toYear: 2026 }, regionCoverage: northAmerica },
    inputCapabilities: ['keyboard_mouse'], techStandards: [], state: 'active', source: 'historical',
  },
]

/** 构造 P1 词表版本对象（不改种子取值）。 */
export function createP1Vocabulary(): SegmentTagVocabulary {
  return {
    vocabularyVersion: P1_VOCABULARY_VERSION,
    effectiveFrom: 1978,
    changelog: ['D04-VOCAB-v0.1: P1 初始种子集（10 标签 / 3 类型 / 3 平台）'],
    tags: SEED_SEGMENT_TAGS.map((t) => ({ ...t })),
    sealed: true,
  }
}

/** 构造 P1 词表总目录。 */
export function createP1Catalog(): VocabularyCatalog {
  return {
    vocabulary: createP1Vocabulary(),
    archetypes: SEED_ARCHETYPES.map((a) => ({ ...a })),
    platforms: SEED_PLATFORMS.map((p) => ({ ...p })),
  }
}

/**
 * §8.1 X-1/X-2 加载期校验：加载失败/为空 → E04-NO-VOCAB；同版本 ID 重复 → E04-DUP-ID。
 * 两类错误均拒绝加载，不进入 RevalidationGate（D-04 §5.4 注 / N-2）。
 */
export function loadVocabulary(catalog: VocabularyCatalog): VocabularyCatalog {
  const tags = catalog.vocabulary.tags
  if (tags.length === 0 || catalog.archetypes.length === 0 || catalog.platforms.length === 0) {
    throw new VocabularyLoadError(E04.NO_VOCAB, '词表包为空或加载失败，拒绝加载（X-1）')
  }
  const ids: string[] = []
  for (const t of tags) ids.push(t.tagId, `code:${t.code}`)
  for (const a of catalog.archetypes) ids.push(a.archetypeId)
  for (const p of catalog.platforms) ids.push(p.platformId, `code:${p.code}`)
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      throw new VocabularyLoadError(E04.DUP_ID, `同版本内 ID 重复：${id}（X-2）`)
    }
    seen.add(id)
  }
  return catalog
}

/** §7.1 getVocabulary(version?)；P1 仅单版本，version 不匹配则抛加载期错误。 */
export function getVocabulary(version: string = P1_VOCABULARY_VERSION): SegmentTagVocabulary {
  const catalog = loadVocabulary(createP1Catalog())
  if (catalog.vocabulary.vocabularyVersion !== version) {
    throw new VocabularyLoadError(E04.NO_VOCAB, `未知词表版本：${version}`)
  }
  return catalog.vocabulary
}

/** §7.1 getArchetypes(stateFilter?)；缺省 all。 */
export function getArchetypes(
  stateFilter: 'active' | 'provisional' | 'all' = 'all',
): GameplayArchetype[] {
  const all = loadVocabulary(createP1Catalog()).archetypes
  return stateFilter === 'all' ? all : all.filter((a) => a.state === stateFilter)
}

/** §7.1 getPlatforms()；输出含 inputCapabilities 供 §5.2 硬兼容判定。 */
export function getPlatforms(): Platform[] {
  return loadVocabulary(createP1Catalog()).platforms
}
