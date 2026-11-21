/**
 * D-04 §5.2 / §5.4 / §7.1 resolveRefs —— RevalidationGate 的独立强制前置。
 *
 * 纯函数：只读 catalog 与 refs，无全局单例、无随机。三次调用同输入必得同输出。
 *
 * 模式（D-04 §5.3）：
 *  - 'lock'：锁定 / 返工完成闸门 / 交付闸门。命中 E04-* 按 E 级硬违规。
 *  - 'draft'：草稿期。未知 tag/platform 仅 W04-* 软提示；deprecated 只读不阻断。
 *  - 'read'：读档降级。未知引用拒绝该引用（rejected）、不报 E、存档仍可打开；
 *            deprecated 旧引用按原语义只读保留（resolved），不漂移。
 *
 * 语义不可变公理（ADJ-2026-11-21-02）：本函数按 tagId 只读解析，不改写任何词条取值。
 */
import type {
  BlueprintViolation,
  RevalidationMode,
  ResolveResult,
  SegmentTag,
  VocabularyCatalog,
  VocabularyRefs,
} from '@domain/entities/product-blueprint'
import { E04 } from '@domain/entities/product-blueprint'
import { makeViolation } from './product-blueprint-violation'

function emptyViolation(): BlueprintViolation[] {
  return []
}

/**
 * §7.1 resolveRefs(refs, catalog, mode) → ResolveResult
 */
export function resolveRefs(
  refs: VocabularyRefs,
  catalog: VocabularyCatalog,
  mode: RevalidationMode = 'lock',
): ResolveResult {
  const result: ResolveResult = {
    resolved: { tags: [], archetypes: [], platforms: [] },
    violations: emptyViolation(),
    rejected: [],
  }
  const hard = mode === 'lock'

  // ---- SegmentTag（§5.3 标签四态） ----
  const tagById = new Map<string, SegmentTag>()
  for (const tag of catalog.vocabulary.tags) tagById.set(tag.tagId, tag)
  for (const tagId of refs.tagIds) {
    const tag = tagById.get(tagId)
    if (tag === undefined) {
      if (hard) {
        result.violations.push(makeViolation(
          E04.UNKNOWN_TAG, 'E', 'E04', [tagId],
          `标签引用 ${tagId} 在全版本未知`, '改选 active 标签',
        ))
      } else if (mode === 'draft') {
        result.violations.push(makeViolation(
          E04.W_UNKNOWN_TAG, 'W', 'W04', [tagId],
          `标签引用 ${tagId} 未知（草稿提示）`, '改选 active 标签',
        ))
      } else {
        // read：拒绝该引用但存档仍可打开，不报阻断 E（§5.3 读档栏）
        result.rejected.push(tagId)
      }
      continue
    }
    if (tag.state === 'deprecated') {
      if (hard) {
        result.violations.push(makeViolation(
          E04.DEPRECATED_TAG, 'E', 'E04', [tagId],
          `标签引用 ${tagId} 已 deprecated，不可用于新版本`, '改选 active 标签',
        ))
        continue
      }
      // draft / read：旧引用按原语义只读保留，不报 E（语义不可变）
    }
    result.resolved.tags.push(tagId)
  }

  // ---- GameplayArchetype（§4.13：主类型须 active；次类型可 active/provisional） ----
  const archetypeById = new Map(catalog.archetypes.map((a) => [a.archetypeId, a]))
  // 主类型为空由 D-01 E-10 处理，不由 E04 处理；此处只解析非空引用。
  if (refs.primaryTypeId !== '') {
    const primary = archetypeById.get(refs.primaryTypeId)
    if (primary === undefined) {
      if (hard) {
        result.violations.push(makeViolation(
          E04.UNKNOWN_ARCHETYPE, 'E', 'E04', [refs.primaryTypeId],
          `主类型 ${refs.primaryTypeId} 在全版本未知`, '改选类型库条目',
        ))
      } else if (mode === 'read') {
        result.rejected.push(refs.primaryTypeId)
      }
    } else if (primary.state !== 'active') {
      if (hard) {
        result.violations.push(makeViolation(
          E04.NONACTIVE_ARCHETYPE, 'E', 'E04', [refs.primaryTypeId],
          `主类型 ${refs.primaryTypeId} 的 state=${primary.state}，D-01 §4.13 要求 active`,
          '改选 active 类型',
        ))
      } else {
        // draft / read：只读保留，不报 E
        result.resolved.archetypes.push(refs.primaryTypeId)
      }
    } else {
      result.resolved.archetypes.push(refs.primaryTypeId)
    }
  }

  for (const secondaryId of refs.secondaryTypeIds) {
    const secondary = archetypeById.get(secondaryId)
    if (secondary === undefined) {
      if (hard) {
        result.violations.push(makeViolation(
          E04.UNKNOWN_ARCHETYPE, 'E', 'E04', [secondaryId],
          `次类型 ${secondaryId} 在全版本未知`, '改选类型库条目',
        ))
      } else if (mode === 'read') {
        result.rejected.push(secondaryId)
      }
      continue
    }
    if (secondary.state === 'deprecated') {
      if (hard) {
        result.violations.push(makeViolation(
          E04.DEPRECATED_ARCHETYPE, 'E', 'E04', [secondaryId],
          `次类型 ${secondaryId} 已 deprecated`, '改选 active/provisional 类型',
        ))
        continue
      }
      // draft / read：只读保留
    }
    result.resolved.archetypes.push(secondaryId)
  }

  // ---- Platform（§5.3 平台三态） ----
  const platformById = new Map(catalog.platforms.map((p) => [p.platformId, p]))
  for (const platformId of refs.platformIds) {
    const platform = platformById.get(platformId)
    if (platform === undefined) {
      if (hard) {
        result.violations.push(makeViolation(
          E04.UNKNOWN_PLATFORM, 'E', 'E04', [platformId],
          `平台引用 ${platformId} 在全版本未知`, '改选 active 平台',
        ))
      } else if (mode === 'draft') {
        result.violations.push(makeViolation(
          E04.W_UNKNOWN_PLATFORM, 'W', 'W04', [platformId],
          `平台引用 ${platformId} 未知（草稿提示）`, '改选 active 平台',
        ))
      } else {
        result.rejected.push(platformId)
      }
      continue
    }
    if (platform.state === 'deprecated') {
      if (hard) {
        result.violations.push(makeViolation(
          E04.DEPRECATED_PLATFORM, 'E', 'E04', [platformId],
          `平台引用 ${platformId} 已 deprecated，不可用于新版本`, '改选 active 平台',
        ))
        continue
      }
      // draft / read：旧引用按原语义只读保留
    }
    result.resolved.platforms.push(platformId)
  }

  return result
}

/**
 * 从结构定位层直接抽取引用，便于 RevalidationGate 前置调用。
 */
export function refsFromPositioning(positioning: {
  primaryTypeId: string
  secondaryTypeIds: string[]
  targetSegmentClaims: string[]
  platformTargets: string[]
}): VocabularyRefs {
  return {
    tagIds: [...positioning.targetSegmentClaims],
    primaryTypeId: positioning.primaryTypeId,
    secondaryTypeIds: [...positioning.secondaryTypeIds],
    platformIds: [...positioning.platformTargets],
  }
}
