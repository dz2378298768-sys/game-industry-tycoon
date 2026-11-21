/**
 * 存档迁移（DESIGN-M2-001-E）。
 *
 * 纯函数：只做对象到对象的改写，不读存储、不调服务、不改入参（INV-1/INV-2/N-2）。
 * 产物是否合法由调用方（parseSave）用 v2 schema 统一校验（INV-6）。
 */
import type { WorldState } from '@simulation/services/world-state'

/** 备份键前缀：`git_save_backup_v1:<saveSeed>`，不同 seed 各留一份（R1 P1-2） */
export const BACKUP_KEY_PREFIX = 'git_save_backup_v1'

export type MigrationResult =
  | { ok: true; state: WorldState; from: number; to: number }
  | { ok: false; errorCode: 'SAVE_VERSION_UNSUPPORTED' | 'SAVE_MIGRATION_FAILED' | 'SAVE_SCHEMA_INVALID'; errorMessage: string }

type MigrationStep = { from: number; to: number; migrate: (raw: Record<string, unknown>) => Record<string, unknown> }

/** v1 → v2：补 D 批三字段，不重算任何历史（INV-2）。 */
const v1ToV2: MigrationStep = {
  from: 1,
  to: 2,
  migrate: (raw) => {
    const products = Array.isArray(raw.products) ? raw.products : []
    const migratedProducts = products.map((entry) => {
      if (entry === null || typeof entry !== 'object') return entry
      const product = entry as Record<string, unknown>
      const launchPrice = product.launchPriceCents
      const next: Record<string, unknown> = { ...product }
      // 已定价产品：挂牌价 = 上市价（v1 时代不存在改价概念）
      if (typeof launchPrice === 'number' && Number.isInteger(launchPrice) && launchPrice > 0) {
        if (next.pricePerUnitCents === undefined) next.pricePerUnitCents = launchPrice
        // v1 无折扣；冷却视为早已走完（R1 P1-3，不得写 currentDayIndex）
        if (next.discountRatePercent === undefined) next.discountRatePercent = 0
        if (next.lastPriceChangeDay === undefined) next.lastPriceChangeDay = 0
      }
      return next
    })
    return { ...raw, schemaVersion: 2, products: migratedProducts }
  },
}

const TARGET_VERSION = 3

/** v2 → v3：认知度拆 scope、破产档回填阶段、合同补 rateProfile；不重算历史。 */
const v2ToV3: MigrationStep = {
  from: 2,
  to: 3,
  migrate: (raw) => {
    const currentDayIndex =
      typeof raw.currentDayIndex === 'number' && Number.isInteger(raw.currentDayIndex)
        ? raw.currentDayIndex
        : 0

    const companies = Array.isArray(raw.companies)
      ? raw.companies.map((entry) => {
          if (entry === null || typeof entry !== 'object') return entry
          const company = entry as Record<string, unknown>
          if (company.status !== 'bankrupt') return company
          const next: Record<string, unknown> = { ...company }
          if (next.bankruptcyPhase === 'restructuring' || next.bankruptcyPhase === 'winddown') {
            return next
          }
          const rawStart = next.bankruptSinceDay
          const start =
            typeof rawStart === 'number' && Number.isInteger(rawStart) && rawStart >= 0
              ? rawStart
              : currentDayIndex
          const elapsed = Math.max(0, currentDayIndex - start)
          next.bankruptSinceDay = start
          next.restructuringStartedDay = start
          if (elapsed <= 90) {
            next.bankruptcyPhase = 'restructuring'
            next.restructuringDeadlineDay = start + 90
            next.restructuringExtended = false
          } else if (elapsed <= 180) {
            next.bankruptcyPhase = 'restructuring'
            next.restructuringDeadlineDay = start + 180
            next.restructuringExtended = true
          } else if (elapsed < 360) {
            next.bankruptcyPhase = 'winddown'
            next.restructuringDeadlineDay = start + 360
            next.restructuringExtended = true
          } else {
            // 旧档已超过 360 天：给 30 天宽限，不立即解散
            next.bankruptcyPhase = 'winddown'
            next.restructuringDeadlineDay = currentDayIndex + 30
            next.restructuringExtended = true
          }
          if (!Array.isArray(next.assetSales)) next.assetSales = []
          return next
        })
      : raw.companies

    const products = Array.isArray(raw.products)
      ? raw.products.map((entry) => {
          if (entry === null || typeof entry !== 'object') return entry
          const product = entry as Record<string, unknown>
          if (product.awarenessByScope !== undefined && product.awarenessByScope !== null) {
            return product
          }
          const byMarket = product.awarenessByMarket
          if (byMarket === null || typeof byMarket !== 'object' || Array.isArray(byMarket)) {
            return product
          }
          const platformIds = Array.isArray(product.supportedPlatformIds)
            ? product.supportedPlatformIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : []
          const segmentIds = Array.isArray(product.audienceSegmentIds)
            ? product.audienceSegmentIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : []
          const scopeCount = platformIds.length * segmentIds.length
          if (scopeCount === 0) return product
          const byScope: Record<string, number> = {}
          for (const [marketId, value] of Object.entries(byMarket as Record<string, unknown>)) {
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
            const share = value / scopeCount
            for (const platformId of platformIds) {
              for (const segmentId of segmentIds) {
                byScope[`${marketId}:${platformId}:${segmentId}`] = share
              }
            }
          }
          return { ...product, awarenessByScope: byScope }
        })
      : raw.products

    const publishingContracts = Array.isArray(raw.publishingContracts)
      ? raw.publishingContracts.map((entry) => {
          if (entry === null || typeof entry !== 'object') return entry
          const contract = entry as Record<string, unknown>
          if (contract.rateProfile === 'legacy' || contract.rateProfile === 'realistic') return contract
          return { ...contract, rateProfile: 'legacy' }
        })
      : raw.publishingContracts

    return {
      ...raw,
      schemaVersion: 3,
      companies,
      products,
      publishingContracts,
    }
  },
}

const MIGRATION_STEPS: MigrationStep[] = [v1ToV2, v2ToV3]

/** 是否存在从 `from` 到 `to` 的迁移路径（同版本视为可迁移）。 */
export function canMigrate(from: number, to: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  if (from === to) return true
  if (to < from) return false
  let cursor = from
  while (cursor < to) {
    const step = MIGRATION_STEPS.find((s) => s.from === cursor)
    if (step === undefined || step.to > to) return false
    cursor = step.to
  }
  return cursor === to
}

/** 迁移入口：非对象输入一律 SAVE_SCHEMA_INVALID（R2 N-3）。 */
export function migrateSave(raw: unknown): MigrationResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errorCode: 'SAVE_SCHEMA_INVALID',
      errorMessage: '存档迁移失败：输入不是对象。',
    }
  }
  const input = raw as Record<string, unknown>
  const from = input.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from)) {
    return {
      ok: false,
      errorCode: 'SAVE_SCHEMA_INVALID',
      errorMessage: '存档迁移失败：schemaVersion 缺失或非法。',
    }
  }
  if (!canMigrate(from, TARGET_VERSION)) {
    return {
      ok: false,
      errorCode: 'SAVE_VERSION_UNSUPPORTED',
      errorMessage: `不支持的存档版本 ${from}，当前仅支持 1、2 或 3。`,
    }
  }
  try {
    let current: Record<string, unknown> = input
    for (const step of MIGRATION_STEPS) {
      if (step.from >= TARGET_VERSION) continue
      if (step.from !== current.schemaVersion) continue
      current = step.migrate(current)
    }
    return { ok: true, state: current as unknown as WorldState, from, to: TARGET_VERSION }
  } catch (error) {
    return {
      ok: false,
      errorCode: 'SAVE_MIGRATION_FAILED',
      errorMessage: `存档迁移失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** 备份键（含 seed，防第二份旧档无备份）。 */
export function backupKeyFor(saveSeed: number): string {
  return `${BACKUP_KEY_PREFIX}:${saveSeed}`
}
