/** 测试夹具：仅用于 product-completeness 系列测试，非测试文件。 */
import type {
  DesignQuality,
  EvaluationContext,
  ImplementationQuality,
  ModuleContribution,
} from '@domain/entities/product-completeness'
import {
  buildP1ChecklistTemplates,
} from '@domain/value-objects/product-completeness-checklists'
import { DEFAULT_COMPLETENESS_TUNING, type CompletenessTuning } from '@domain/value-objects/product-completeness-tuning'
import { loadVocabulary, createP1Catalog } from '@content/d04-vocabulary'
import type {
  DesignVersionSnapshot,
  EstimateBundle,
  FrozenBlueprint,
  GameplaySlot,
  MarketFitChannel,
  TechRiskChannel,
  WorkUnitChannel,
} from '@domain/entities/product-blueprint'
import {
  baseContentPack,
  baseInstance,
  basePositioning,
  baseSlot,
  baseStructure,
  baseTemplate,
} from './product-blueprint-fixtures'

export const tuning = (): CompletenessTuning => DEFAULT_COMPLETENESS_TUNING

// 复用蓝图夹具（同一快照体系，防夹具漂移）
export { baseTemplate, baseInstance, baseSlot, basePositioning, baseContentPack }

/** 支撑槽夹具（slotId=SLOT-SUPPORT，非必选槽）。 */
export const baseSupportSlot = (overrides: Partial<GameplaySlot> = {}): GameplaySlot => ({
  slotId: 'SLOT-SUPPORT',
  slotKind: 'support',
  requiredForType: false,
  domainAcceptance: ['progression'],
  maxInstances: 2,
  bindings: ['INS-SUPPORT'],
  isContentSlot: false,
  outsourcingEligible: true,
  ...overrides,
})

export const p1Templates = () => buildP1ChecklistTemplates(tuning())

export const p1Platforms = () => loadVocabulary(createP1Catalog()).platforms

/** 零风险估算束（可覆盖 techRisk.rTech / marketFit）。 */
export function baseEstimates(overrides: {
  rTech?: number
  marketFit?: Partial<MarketFitChannel>
} = {}): EstimateBundle {
  const workUnits: WorkUnitChannel = {
    byDiscipline: { design: 10, code: 20, art: 15, audio: 5, qa: 8 },
    raw: { design: 10, code: 20, art: 15, audio: 5, qa: 8 },
    synergy: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
    total: 58,
    ranges: {
      design: { low: 7.5, mid: 10, high: 12.5 },
      code: { low: 15, mid: 20, high: 25 },
      art: { low: 11.25, mid: 15, high: 18.75 },
      audio: { low: 3.75, mid: 5, high: 6.25 },
      qa: { low: 6, mid: 8, high: 10 },
    },
    drivers: [],
  }
  const techRisk: TechRiskChannel = {
    gates: [],
    unsatisfied: [],
    rTech: overrides.rTech ?? 0,
    rSynergy: 0,
    rScope: 0,
    maxRisk: 0,
    riskLevel: 'LOW',
  }
  const marketFit: MarketFitChannel = {
    affinity: { 'SEG-HARDCORE': 0.8 },
    positioningFit: 0.8,
    positioningFitBand: 'high',
    genreFit: 0.7,
    uspSupported: {},
    noveltyNote: '',
    contentVolumeBand: 'medium',
    ...overrides.marketFit,
  }
  return { formulaVersion: 'D01-FORMULA-v0.1', workUnits, skillDemand: {
    byDiscipline: { design: 1, code: 1, art: 1, audio: 1, qa: 1 },
    total: 5,
    peakFraction: { design: 0.2, code: 0.2, art: 0.2, audio: 0.2, qa: 0.2 },
  }, techRisk, marketFit }
}

/** 含 content 槽 + 绑定内容包的标准结构（C-01/C-02/C-04/C-05 天然满足）。 */
export function completeStructure(overrides: Partial<FrozenBlueprint> = {}): FrozenBlueprint {
  const coreSlot = baseSlot({ slotId: 'SLOT-CORE', slotKind: 'core_loop', bindings: ['INS-1'] })
  const contentSlot = baseSlot({
    slotId: 'SLOT-CONTENT',
    slotKind: 'content',
    requiredForType: false,
    domainAcceptance: ['narrative'],
    bindings: ['INS-CONTENT'],
    isContentSlot: true,
  })
  const coreInstance = baseInstance({ instanceId: 'INS-1', slotId: 'SLOT-CORE' })
  const contentInstance = baseInstance({
    instanceId: 'INS-CONTENT',
    templateId: 'TPL-CONTENT',
    slotId: 'SLOT-CONTENT',
    domain: 'narrative',
    contentPackId: 'PACK-1',
  })
  return baseStructure({
    slots: [coreSlot, contentSlot],
    instances: [coreInstance, contentInstance],
    contentPacks: [baseContentPack()],
    ...overrides,
  })
}

export function baseSnapshot(overrides: {
  structure?: FrozenBlueprint
  estimates?: EstimateBundle | null
} = {}): DesignVersionSnapshot {
  const structure = overrides.structure ?? completeStructure()
  return {
    snapshotId: 'SNAP-1',
    versionId: 'VER-1',
    payloadHash: 'hash-snap-1',
    frozenBlueprint: structure,
    templateRevisionRefs: {},
    estimates: overrides.estimates !== undefined ? overrides.estimates : baseEstimates(),
    takenAt: 100,
  }
}

export function baseContext(overrides: Partial<EvaluationContext> & {
  snapshot?: DesignVersionSnapshot
} = {}): EvaluationContext {
  const snapshot = overrides.snapshot ?? baseSnapshot()
  return {
    snapshot,
    templatesById: {
      'TPL-COMBAT': baseTemplate(),
      'TPL-CONTENT': baseTemplate({ templateId: 'TPL-CONTENT', domain: 'narrative', audienceAffinity: { 'SEG-HARDCORE': 0.8 } }),
    },
    moduleContributions: [],
    defects: [],
    buildFacts: null,
    archiveSimilarity: 'unavailable_p1',
    marketProfile: null,
    platforms: p1Platforms(),
    capabilities: {},
    revalidation: { pass: true },
    hrbVerdict: null,
    productFields: { finalTitle: '像素物语' },
    disclosureProvided: true,
    archetypeClassOverride: null,
    assessedAt: 100,
    formulaVersion: 'D02-FORMULA-v0.1',
    ...overrides,
  }
}

export function baseContribution(overrides: Partial<ModuleContribution> = {}): ModuleContribution {
  return {
    contributionId: 'MC-1',
    instanceId: 'INS-1',
    templateId: 'TPL-COMBAT',
    slotId: 'SLOT-CORE',
    domain: 'combat',
    contributesTo: [],
    status: 'present',
    substitutableBy: [],
    signals: { uspSupported: {}, affinitySlice: {}, contentVolumeContribution: 0 },
    ...overrides,
  }
}

export const perfectDQ = (): DesignQuality => ({
  structure: 1,
  innovation: 'unavailable_p1',
  experiencePotential: 1,
  marketFit: 1,
})

export const perfectIQ = (): ImplementationQuality => ({
  stability: 1,
  contentFidelity: 1,
  defectLoad: 1,
  deliveryAdherence: 1,
})
