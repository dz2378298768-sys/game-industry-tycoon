/**
 * 产品完整度（D-02）实体与类型导出。
 * 独立目录，不覆盖 product.ts / project.ts / product-blueprint。
 */
export * from './types'
export { D02_ERROR, D02_IMPL_ERROR } from './errors'
export {
  CompletenessDomainError,
  UnknownPredicateError,
  QcbConsumptionError,
} from './errors'
