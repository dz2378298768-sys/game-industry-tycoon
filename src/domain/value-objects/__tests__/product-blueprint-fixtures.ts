/** 测试夹具：仅用于 product-blueprint 系列测试，非测试文件。 */
import type {
  ContentPack,
  FrozenBlueprint,
  GameplaySlot,
  ModuleInstance,
  ModuleTemplate,
  PositioningProfile,
} from '@domain/entities/product-blueprint'
import type { EstimationInput } from '@domain/value-objects/product-blueprint-estimation'
import type { CompositionRules } from '@domain/value-objects/product-blueprint-composition'
import { createP1Catalog } from '@content/d04-vocabulary'
import { DEFAULT_BLUEPRINT_TUNING } from '@domain/value-objects/product-blueprint-tuning'

export const baseTemplate = (overrides: Partial<ModuleTemplate> = {}): ModuleTemplate => ({
  templateId: 'TPL-COMBAT',
  templateRevision: 1,
  name: '战斗模板',
  description: '',
  domain: 'combat',
  allowedSlotKinds: ['core_loop', 'support'],
  era: { fromYear: 1970, toYear: 2026 },
  techGates: [],
  baseWorkUnits: { design: 10, code: 20, art: 15, audio: 5, qa: 8 },
  intensityCurve: { 1: 0.6, 2: 0.8, 3: 1, 4: 1.3, 5: 1.6 },
  affinityIntensity: { 1: 0.6, 2: 0.8, 3: 1, 4: 1.2, 5: 1.4 },
  skillLoad: { design: 1, code: 1, art: 1, audio: 1, qa: 1 },
  optionGroups: [],
  combineTags: ['real_time'],
  audienceAffinity: { 'SEG-HARDCORE': 1 },
  uspIds: [],
  contentType: 'none',
  ...overrides,
})

export const baseInstance = (overrides: Partial<ModuleInstance> = {}): ModuleInstance => ({
  instanceId: 'INS-1',
  templateId: 'TPL-COMBAT',
  slotId: 'SLOT-CORE',
  displayLabel: '战斗',
  domain: 'combat',
  intensity: 3,
  depthSelection: 'standard',
  optionSelections: {},
  contentPackId: null,
  state: 'active',
  sourceOrigin: 'player',
  ...overrides,
})

export const baseSlot = (overrides: Partial<GameplaySlot> = {}): GameplaySlot => ({
  slotId: 'SLOT-CORE',
  slotKind: 'core_loop',
  requiredForType: true,
  domainAcceptance: ['combat'],
  maxInstances: 1,
  bindings: ['INS-1'],
  isContentSlot: false,
  outsourcingEligible: false,
  ...overrides,
})

export const basePositioning = (overrides: Partial<PositioningProfile> = {}): PositioningProfile => ({
  primaryTypeId: 'SEED-PLATFORMER',
  secondaryTypeIds: [],
  settingIds: ['SET-1'],
  perspectiveId: 'side_scroll',
  structureId: 'linear',
  targetSegmentClaims: ['SEG-HARDCORE'],
  sellingPoints: [],
  platformTargets: ['PLT-ARCADE'],
  commercialPositioning: 'premium',
  presetId: null,
  ...overrides,
})

export const baseContentPack = (overrides: Partial<ContentPack> = {}): ContentPack => ({
  packId: 'PACK-1',
  templateRevision: 1,
  compatibleDomains: ['narrative'],
  tier: 3,
  workUnitsPerTier: { design: 4, code: 2, art: 6, audio: 1, qa: 2 },
  audienceVolumeWeight: 1,
  ...overrides,
})

export const baseStructure = (overrides: Partial<FrozenBlueprint> = {}): FrozenBlueprint => ({
  positioning: basePositioning(),
  slots: [baseSlot()],
  instances: [baseInstance()],
  contentPacks: [],
  ...overrides,
})

export const baseEstimationInput = (overrides: Partial<EstimationInput> = {}): EstimationInput => ({
  structure: baseStructure(),
  templatesById: { 'TPL-COMBAT': baseTemplate() },
  archetype: createP1Catalog().archetypes.find((a) => a.archetypeId === 'SEED-PLATFORMER') ?? null,
  capabilities: {},
  platformTechStandards: [],
  synergyPenaltySum: 0,
  ...overrides,
})

export const emptyRules = (): CompositionRules => ({ combineRules: [], requireRules: [], conflictRules: [] })

export const tuning = () => DEFAULT_BLUEPRINT_TUNING
