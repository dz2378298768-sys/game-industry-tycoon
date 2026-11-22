/**
 * 产品完整度（D-02）领域错误码与 DomainError 子类。
 *
 * §3.10 五个规格码由闸门结果以 errorCodes 表达（不抛错）；抛错路径用于
 * 契约错误（D02-QCB-UNDEFINED，下游按已交付接口消费 qualityCeilingBand）
 * 与实现级 fail-closed（未知谓词 / 模板缺失等）。
 */
import { DomainError } from '@domain/errors'

/** §3.10 D-02 新增码登记（不自造 D-01 已有编号）。 */
export const D02_ERROR = {
  MISSING_CORE: 'D02-MISSING-CORE',
  DISCLOSURE_REQUIRED: 'D02-DISCLOSURE-REQUIRED',
  FORM_INELIGIBLE: 'D02-FORM-INELIGIBLE',
  E_DEFECT: 'D02-E-DEFECT',
  QCB_UNDEFINED: 'D02-QCB-UNDEFINED',
} as const

/**
 * 实现级错误码（非 §3.6 规格码；见 CODE-05 实施报告「实现级登记」）：
 * fail-closed 场景使用，抛错即缺陷，不静默返回布尔。
 */
export const D02_IMPL_ERROR = {
  UNKNOWN_PREDICATE: 'D02-UNKNOWN-PREDICATE',
  TEMPLATE_MISSING: 'D02-TEMPLATE-MISSING',
  TEMPLATE_INVALID: 'D02-TEMPLATE-INVALID',
  INVALID_ASSESSMENT_TRANSITION: 'D02-INVALID-ASSESSMENT-TRANSITION',
  OVERRIDE_REASON_REQUIRED: 'D02-OVERRIDE-REASON-REQUIRED',
  TUNING_INVARIANT: 'D02-TUNING-INVARIANT',
} as const

export class CompletenessDomainError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'CompletenessDomainError'
  }
}

/** 未知谓词 fail-closed（任务卡 §2-2 / 验收「未知谓词 fail-closed」）。 */
export class UnknownPredicateError extends CompletenessDomainError {
  constructor(kind: string) {
    super(
      D02_IMPL_ERROR.UNKNOWN_PREDICATE,
      `Unknown checklist predicate kind: "${kind}". P1 fixed word list has exactly 9 kinds; ` +
        'new predicates require design review and a formulaVersion bump (D-02 §3.3).',
    )
    this.name = 'UnknownPredicateError'
  }
}

/** 下游按已交付接口消费 qualityCeilingBand ⇒ 契约错误（§3.10 / §6.5 / X-4）。 */
export class QcbConsumptionError extends CompletenessDomainError {
  constructor(where: string) {
    super(
      D02_ERROR.QCB_UNDEFINED,
      `${D02_ERROR.QCB_UNDEFINED}: contract error — qualityCeilingBand consumed as a delivered ` +
        `interface at ${where}. P1 value is ABSENT_P1 (OPEN-O5 / ADJ-2026-11-21-01 #5); ` +
        'downstream must treat it as absent, not as a number or band.',
    )
    this.name = 'QcbConsumptionError'
  }
}
