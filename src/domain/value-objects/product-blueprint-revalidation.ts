/**
 * D-01 §7.2.1 RevalidationGate（关闭 R-05 / C1；ADJ-2026-11-21-02 裁定一）。
 *
 * 返回 EXECUTING 之前（返工完成切快照）与 EXECUTING→COMPLETED 交付之前必须执行。
 * 关键口径：
 *  1. resolveRefs 是 RunHardRules(S) **之前**的独立强制前置（不是"复用全部 E 码"）。
 *  2. 复用 §11 全部 E 级硬规则及 §5.3/§5.4 硬规则；E04-* 按 E 级硬违规并入 violations。
 *  3. fail-closed：任一 E 级违规 → FAIL，禁止切换权威快照 / 禁止交付。
 *  4. E-20 覆盖全部 7 个引用解析 E04 码（由 resolveRefs 产出，见 E20_RESOLUTION_CODES）。
 *  5. §11 E-10（断言空值：primaryTypeId 为空）/ E-11（平台缺失：platformTargets 为空）
 *     为闸门兜底硬规则；resolveRefs 对二者刻意不产 E04（避免重复展示），由本模块单独生成。
 *  6. 提供撤销路径：撤销返工 → 丢弃目标草稿，旧快照继续生效，state 保持 EXECUTING。
 *
 * D-06 尚未定义的 E-TECH/E-ERA 及平台输入兼容检查以 externalViolations 注入（下游输入），
 * 本模块不自造 D-06 档位语义。
 */
import type {
  BlueprintViolation,
  FrozenBlueprint,
  ModuleTemplate,
  RevalidationMode,
  RevalidationResult,
  ReworkSession,
  VocabularyCatalog,
} from '@domain/entities/product-blueprint'
import { BP_E } from '@domain/entities/product-blueprint'
import { makeViolation } from './product-blueprint-violation'
import { resolveRefs, refsFromPositioning } from './product-blueprint-resolve-refs'
import { checkCompositionRules } from './product-blueprint-composition'
import type { CompositionRules } from './product-blueprint-composition'
import type { BlueprintTuning } from './product-blueprint-tuning'

export interface RevalidationInput {
  /** 即将成为权威的新结构（返工目标草稿 / 当前权威快照）。
   *  FrozenBlueprint 只含定位/槽位/实例/内容包；模板由 templatesById 只读注入。 */
  structure: FrozenBlueprint
  catalog: VocabularyCatalog
  templatesById: Record<string, ModuleTemplate>
  rules: CompositionRules
  tuning: BlueprintTuning
  /** 缺省 'lock'（闸门/锁定）；读档传 'read'。 */
  mode?: RevalidationMode
  /** D-06 技术不可能（E-TECH）、时代越界（E-ERA）、平台输入硬不兼容等下游输入。 */
  externalViolations?: BlueprintViolation[]
  /** §11 E-19 待处理不兼容实例。 */
  pendingIncompatibleInstanceIds?: string[]
}

/** §7.2.1 闸门总入口。返回 pass=false 即 fail-closed。 */
export function revalidationGate(input: RevalidationInput): RevalidationResult {
  const mode: RevalidationMode = input.mode ?? 'lock'
  const external = input.externalViolations ?? []
  const pending = input.pendingIncompatibleInstanceIds ?? []

  // ① 独立强制前置：resolveRefs(S)
  const refResult = resolveRefs(refsFromPositioning(input.structure.positioning), input.catalog, mode)

  // ② RunHardRules(S)：§11 全部 E 级硬规则及 §5.3/§5.4 硬规则
  const composition = checkCompositionRules(
    input.structure,
    input.templatesById,
    input.rules,
    input.tuning,
    pending,
  )
  const hardRuleViolations: BlueprintViolation[] = [
    ...composition.violations,
    ...external,
  ]

  // ②b §11 E-10 / E-11：必填空值与平台缺失（闸门兜底）。
  //  resolveRefs 对空 primaryTypeId / 空 platformIds 刻意不产 E04（resolve-refs.ts §5.2），
  //  故此处按 code 去重展示，不与 E04 引用码重复。
  const positioning = input.structure.positioning
  if (positioning.primaryTypeId === '') {
    hardRuleViolations.push(makeViolation(
      BP_E.E10_EMPTY_PRIMARY_TYPE, 'E', 'E-10', [],
      '主类型 primaryTypeId 为空：必填未填（§11 E-10，IN_REVIEW 前阻断）',
      '选择 active 主类型',
    ))
  }
  if (positioning.platformTargets.length === 0) {
    hardRuleViolations.push(makeViolation(
      BP_E.E11_EMPTY_PLATFORM, 'E', 'E-11', [],
      '平台目标 platformTargets 为空：至少 1 个平台（§11 E-11，阻断）',
      '选择至少一个目标平台',
    ))
  }

  // ③ refViolations 的 E 级并入 violations；W04 草稿提示也保留但不阻断
  const violations: BlueprintViolation[] = [...hardRuleViolations, ...refResult.violations]
  const hasE = violations.some((v) => v.severity === 'E')

  return { pass: !hasE, violations, refViolations: refResult.violations, hardRuleViolations }
}

/** §7.2.1 失败行为 1：不切快照 / 禁交付。 */
export function decideSnapshotSwitch(result: RevalidationResult): 'switch' | 'block' {
  return result.pass ? 'switch' : 'block'
}

/** §7.2.1 失败行为 3：撤销返工。旧快照继续生效，丢弃目标草稿，state 保持 EXECUTING。 */
export function undoRework(
  session: ReworkSession,
  authoritativeSnapshotId: string,
): { session: ReworkSession; authoritativeSnapshotId: string } {
  return {
    session: { ...session, status: 'cancelled' },
    authoritativeSnapshotId,
  }
}
