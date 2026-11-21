import cities from './cities.json'
import genres from './genres.json'
import platforms from './platforms.json'
import marketRegions from './market_regions.json'
import consumerSegments from './consumer_segments.json'
import { TUNING } from './tuning'

export { cities, genres, platforms, marketRegions, consumerSegments, TUNING }

export const content = { cities, genres, platforms, marketRegions, consumerSegments, tuning: TUNING }

// ===== P1 D-04 前置词表包（与既有 platforms.json 市场平台数据分离，不冲突） =====
export {
  P1_VOCABULARY_VERSION,
  SEED_SEGMENT_TAGS,
  SEED_ARCHETYPES,
  SEED_PLATFORMS,
  createP1Vocabulary,
  createP1Catalog,
  loadVocabulary,
  getVocabulary,
  getArchetypes,
  getPlatforms,
  resolveRefs,
  refsFromPositioning,
  E04,
  E20_RESOLUTION_CODES,
} from './d04-vocabulary'
export type {
  SegmentTag,
  GameplayArchetype,
  Platform,
  SegmentTagVocabulary,
  VocabularyCatalog,
  VocabularyRefs,
  ResolveResult,
} from './d04-vocabulary'
