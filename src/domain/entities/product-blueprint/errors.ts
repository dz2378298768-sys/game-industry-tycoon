/**
 * 产品蓝图领域错误码与 DomainError 子类。
 * 复用 src/domain/errors/index.ts 的 DomainError 体系（任务卡 §4）。
 *
 * 关键分层（D-04 §5.4 注 / N-2 / ADJ-2026-11-21-02）：
 *  - 加载期错误 E04-NO-VOCAB / E04-DUP-ID：加载期即拒绝加载，不进入 RevalidationGate。
 *  - 引用解析错误（7 个 E04-*）：由 resolveRefs 产生，按 E 级硬违规并入闸门。
 *  - 草稿期 W04-*：W 级软提示，不入闸门。
 */

import { DomainError } from '@domain/errors'

/** §5.4：本包 E04-/W04- 码表。 */
export const E04 = {
  // 加载期（拒绝加载，不入闸门）
  NO_VOCAB: 'E04-NO-VOCAB',
  DUP_ID: 'E04-DUP-ID',
  // 引用解析期（并入 RevalidationGate，E 级硬违规）
  UNKNOWN_TAG: 'E04-UNKNOWN-TAG',
  DEPRECATED_TAG: 'E04-DEPRECATED-TAG',
  UNKNOWN_PLATFORM: 'E04-UNKNOWN-PLATFORM',
  DEPRECATED_PLATFORM: 'E04-DEPRECATED-PLATFORM',
  UNKNOWN_ARCHETYPE: 'E04-UNKNOWN-ARCHETYPE',
  NONACTIVE_ARCHETYPE: 'E04-NONACTIVE-ARCHETYPE',
  DEPRECATED_ARCHETYPE: 'E04-DEPRECATED-ARCHETYPE',
  // 草稿期软提示（W 级，不入闸门）
  W_UNKNOWN_TAG: 'W04-UNKNOWN-TAG',
  W_UNKNOWN_PLATFORM: 'W04-UNKNOWN-PLATFORM',
} as const

/**
 * §11 E-20 覆盖的全部 7 个引用解析 E04 码。
 * 测试须逐一覆盖（不穷举加载期码）。
 */
export const E20_RESOLUTION_CODES: readonly string[] = [
  E04.DEPRECATED_TAG,
  E04.UNKNOWN_TAG,
  E04.DEPRECATED_PLATFORM,
  E04.UNKNOWN_PLATFORM,
  E04.UNKNOWN_ARCHETYPE,
  E04.NONACTIVE_ARCHETYPE,
  E04.DEPRECATED_ARCHETYPE,
]

/** 加载期错误（X-1）：词表包加载失败或为空。 */
export class VocabularyLoadError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'VocabularyLoadError'
  }
}

/** §7.1 状态机非法转换。 */
export class InvalidBlueprintTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('BP_INVALID_TRANSITION', `Cannot transition blueprint version from ${from} to ${to}`)
    this.name = 'InvalidBlueprintTransitionError'
  }
}

/** §15.4 锁定版本不可编辑、已停用模块不可重新启用。 */
export class ImmutableBlueprintError extends DomainError {
  constructor(message: string) {
    super('BP_IMMUTABLE', message)
    this.name = 'ImmutableBlueprintError'
  }
}
