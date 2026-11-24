import type { ContentPack, ModuleTemplate, BlueprintDiscipline, SlotKind } from '@domain/entities/product-blueprint'
import { SEED_SEGMENT_TAGS } from './d04-vocabulary'

export const REC03_FORMULA_VERSION = 'REC03-MODULES-v0.1'
export const REC03_SLOTS = [
  { slotId: 'REC03-SLOT-CORE', slotKind: 'core_loop' as SlotKind, requiredForType: true, maxInstances: 1, domainAcceptance: ['combat', 'simulation'] as const, isContentSlot: false },
  { slotId: 'REC03-SLOT-SUPPORT', slotKind: 'support' as SlotKind, requiredForType: false, maxInstances: 2, domainAcceptance: ['progression', 'social_sp'] as const, isContentSlot: false },
  { slotId: 'REC03-SLOT-CONTENT', slotKind: 'content' as SlotKind, requiredForType: true, maxInstances: 1, domainAcceptance: ['narrative'] as const, isContentSlot: true },
] as const

const zero = (): Record<BlueprintDiscipline, number> => ({ design: 0, code: 0, art: 0, audio: 0, qa: 0 })
const load = (v: Partial<Record<BlueprintDiscipline, number>>): Record<BlueprintDiscipline, number> => ({ ...zero(), ...v })
const curve = { 1: 0.8, 2: 0.9, 3: 1, 4: 1.15, 5: 1.3 }
const affinity = { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2, 5: 1.4 }

export const REC03_MODULES: readonly ModuleTemplate[] = [
  { templateId: 'MOD-CORE-ACTION', templateRevision: 1, name: '核心操作', description: '以直接操作为核心循环。', domain: 'combat', allowedSlotKinds: ['core_loop'], era: { fromYear: 1970, toYear: 2026 }, techGates: [], baseWorkUnits: load({ design: 30, code: 90, art: 70, audio: 10, qa: 35 }), intensityCurve: curve, affinityIntensity: affinity, skillLoad: load({ design: 2, code: 4, art: 3, audio: 1, qa: 2 }), optionGroups: [], combineTags: ['combat', 'action'], audienceAffinity: { 'SEG-HARDCORE': 0.7, 'SEG-COMPETITIVE': 0.5 }, uspIds: [], contentType: 'none' },
  { templateId: 'MOD-CORE-SIM', templateRevision: 1, name: '核心经营', description: '以系统经营和决策为核心循环。', domain: 'simulation', allowedSlotKinds: ['core_loop'], era: { fromYear: 1970, toYear: 2026 }, techGates: [], baseWorkUnits: load({ design: 70, code: 80, art: 35, audio: 10, qa: 30 }), intensityCurve: curve, affinityIntensity: affinity, skillLoad: load({ design: 4, code: 3, art: 1, audio: 1, qa: 2 }), optionGroups: [], combineTags: ['simulation', 'management'], audienceAffinity: { 'SEG-STRATEGY_FAN': 0.8, 'SEG-MASS_MARKET': 0.3 }, uspIds: [], contentType: 'none' },
  { templateId: 'MOD-SYSTEM-PROGRESSION', templateRevision: 1, name: '成长系统', description: '让玩家通过成长和解锁获得长期目标。', domain: 'progression', allowedSlotKinds: ['support'], era: { fromYear: 1970, toYear: 2026 }, techGates: [], baseWorkUnits: load({ design: 45, code: 55, art: 20, audio: 5, qa: 30 }), intensityCurve: { ...curve, 5: 1.25 }, affinityIntensity: affinity, skillLoad: load({ design: 3, code: 3, art: 1, qa: 2 }), optionGroups: [], combineTags: ['progression'], audienceAffinity: { 'SEG-HARDCORE': 0.4, 'SEG-STRATEGY_FAN': 0.5 }, uspIds: [], contentType: 'none' },
  { templateId: 'MOD-SOCIAL-COOP', templateRevision: 1, name: '合作互动', description: '以合作互动强化重复游玩。', domain: 'social_sp', allowedSlotKinds: ['support'], era: { fromYear: 1970, toYear: 2026 }, techGates: [], baseWorkUnits: load({ design: 25, code: 70, art: 25, audio: 15, qa: 40 }), intensityCurve: curve, affinityIntensity: affinity, skillLoad: load({ design: 1, code: 4, art: 1, audio: 2, qa: 3 }), optionGroups: [], combineTags: ['social'], audienceAffinity: { 'SEG-COMPETITIVE': 0.5, 'SEG-YOUTH': 0.4 }, uspIds: [], contentType: 'none' },
  { templateId: 'MOD-CONTENT-EPISODES', templateRevision: 1, name: '章节内容', description: '提供可交付的章节内容。', domain: 'narrative', allowedSlotKinds: ['content'], era: { fromYear: 1970, toYear: 2026 }, techGates: [], baseWorkUnits: load({ design: 35, code: 20, art: 55, audio: 35, qa: 25 }), intensityCurve: curve, affinityIntensity: affinity, skillLoad: load({ design: 2, code: 1, art: 3, audio: 3, qa: 2 }), optionGroups: [], combineTags: ['content'], audienceAffinity: { 'SEG-MASS_MARKET': 0.3, 'SEG-YOUTH': 0.3 }, uspIds: [], contentType: 'narrative_arc' },
]

export const REC03_CONTENT_PACKS: readonly ContentPack[] = [{
  packId: 'PACK-EPISODES-P1', templateRevision: 1, compatibleDomains: ['narrative'], tier: 2,
  workUnitsPerTier: load({ design: 20, code: 8, art: 35, audio: 20, qa: 12 }), audienceVolumeWeight: 1,
  era: { fromYear: 1970, toYear: 2026 },
}]

export const REC03_SEGMENT_MAP: Readonly<Record<string, string>> = {
  'SEG-HARDCORE': 'pc_gamers', 'SEG-COMPETITIVE': 'online_gamers', 'SEG-STRATEGY_FAN': 'pc_gamers',
  'SEG-MASS_MARKET': 'home_players', 'SEG-YOUTH': 'arcade_enthusiasts',
}
export const REC03_DEFAULT_CONSUMER_TO_TAG: Readonly<Record<string, string>> = { arcade_enthusiasts: 'SEG-YOUTH' }

export function validateRec03Catalog(): void {
  const tags = new Set(SEED_SEGMENT_TAGS.map((x) => x.tagId))
  const ids = new Set<string>()
  for (const t of REC03_MODULES) {
    if (ids.has(t.templateId) || !t.templateId || !t.allowedSlotKinds.length) throw new Error('REC03_TEMPLATE_UNKNOWN')
    ids.add(t.templateId)
    for (const tag of Object.keys(t.audienceAffinity)) if (!tags.has(tag)) throw new Error('REC03_SEGMENT_MAPPING_MISSING')
  }
  for (const p of REC03_CONTENT_PACKS) {
    if (ids.has(p.packId) || p.tier < 1 || p.compatibleDomains.length === 0 || Object.values(p.workUnitsPerTier).every((x) => x === 0) || p.era === undefined || p.era.fromYear > p.era.toYear) throw new Error('REC03_CONTENT_PACK_INVALID')
    ids.add(p.packId)
  }
  for (const [tag, consumer] of Object.entries(REC03_SEGMENT_MAP)) if (!tags.has(tag) || !consumer) throw new Error('REC03_SEGMENT_MAPPING_MISSING')
}

validateRec03Catalog()
