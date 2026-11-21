/**
 * §11 通用错误输出构造器。所有 E 级 / W 级违规统一走此出口。
 */
import type {
  BlueprintViolation,
  ViolationSeverity,
} from '@domain/entities/product-blueprint'

export function makeViolation(
  code: string,
  severity: ViolationSeverity,
  ruleId: string,
  subjectIds: string[],
  message: string,
  suggestedAction: string,
): BlueprintViolation {
  return { code, severity, ruleId, subjectIds, message, suggestedAction }
}
