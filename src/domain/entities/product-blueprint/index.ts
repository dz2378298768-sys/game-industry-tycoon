/**
 * 产品蓝图领域内核（D-01）实体与类型导出。
 * 不含 application / UI / 存档迁移；不覆盖现有 product.ts / project.ts。
 */
export * from './types'
export { E04, E20_RESOLUTION_CODES } from './errors'
export {
  VocabularyLoadError,
  InvalidBlueprintTransitionError,
  ImmutableBlueprintError,
} from './errors'
