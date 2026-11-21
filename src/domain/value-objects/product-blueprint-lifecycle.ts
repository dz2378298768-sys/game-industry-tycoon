/**
 * D-01 §4.9 / §7 BlueprintVersion 状态机与 §4.12 快照生成。
 *
 * 裁定（关闭 R-09 / C2）：REWORK 不是状态枚举值，只是 EXECUTING + ReworkSession 的呈现标签；
 * BlueprintVersion.state 永不被赋值为 'REWORK'。返工完成派生版本出生即 EXECUTING（birthState）。
 * 锁定后只停用不删除（T3 / §15.4 / E-13）；已停用模块不可重新启用。
 */
import {
  ImmutableBlueprintError,
  InvalidBlueprintTransitionError,
} from '@domain/entities/product-blueprint'
import type {
  BlueprintBirthState,
  BlueprintVersion,
  BlueprintVersionState,
  DesignVersionSnapshot,
  EstimateBundle,
  FrozenBlueprint,
  ModuleTemplate,
} from '@domain/entities/product-blueprint'

/** §7.2 转换表。EXECUTING→EXECUTING 用于启动/完成返工会话（state 不变）。 */
const ALLOWED: ReadonlyArray<[BlueprintVersionState, BlueprintVersionState]> = [
  ['DRAFT', 'DRAFT'],
  ['DRAFT', 'IN_REVIEW'],
  ['IN_REVIEW', 'LOCKED'],
  ['IN_REVIEW', 'DRAFT'],
  ['LOCKED', 'EXECUTING'],
  ['LOCKED', 'ABANDONED'],
  ['EXECUTING', 'EXECUTING'],
  ['EXECUTING', 'COMPLETED'],
  ['COMPLETED', 'ABANDONED'],
  ['EXECUTING', 'ABANDONED'],
  ['DRAFT', 'ABANDONED'],
  ['IN_REVIEW', 'ABANDONED'],
]

export function canTransition(from: BlueprintVersionState, to: BlueprintVersionState): boolean {
  return ALLOWED.some(([a, b]) => a === from && b === to)
}

/** 通用状态转换；非法转换抛 DomainError（不静默）。 */
export function transitionVersion(
  version: BlueprintVersion,
  to: BlueprintVersionState,
): BlueprintVersion {
  if (!canTransition(version.state, to)) {
    throw new InvalidBlueprintTransitionError(version.state, to)
  }
  return { ...version, state: to }
}

/** §4.12 payloadHash：确定性 FNV-1a，无随机、无 Date.now（S5）。 */
export function frozenPayloadHash(frozen: FrozenBlueprint): string {
  const text = JSON.stringify(frozen)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function freeze(version: BlueprintVersion): FrozenBlueprint {
  return {
    positioning: JSON.parse(JSON.stringify(version.positioning)) as FrozenBlueprint['positioning'],
    slots: JSON.parse(JSON.stringify(version.slots)) as FrozenBlueprint['slots'],
    instances: JSON.parse(JSON.stringify(version.instances)) as FrozenBlueprint['instances'],
    contentPacks: JSON.parse(JSON.stringify(version.contentPacks)) as FrozenBlueprint['contentPacks'],
  }
}

/**
 * §7.2 IN_REVIEW→LOCKED：生成 DesignVersionSnapshot，versionNo++，写入 templateRevisionRefs（§12 S2）。
 */
export function lockVersion(
  version: BlueprintVersion,
  snapshotId: string,
  templatesById: Record<string, ModuleTemplate>,
  takenAt: number,
  lockedBy: string,
  estimates: EstimateBundle | null = null,
): { version: BlueprintVersion; snapshot: DesignVersionSnapshot } {
  if (version.state !== 'IN_REVIEW') {
    throw new InvalidBlueprintTransitionError(version.state, 'LOCKED')
  }
  const frozen = freeze(version)
  const templateRevisionRefs: Record<string, number> = {}
  for (const instance of frozen.instances) {
    const template = templatesById[instance.templateId]
    if (template !== undefined) templateRevisionRefs[instance.templateId] = template.templateRevision
  }
  for (const pack of frozen.contentPacks) templateRevisionRefs[pack.packId] = pack.templateRevision

  return {
    version: {
      ...version,
      state: 'LOCKED',
      versionNo: version.versionNo + 1,
      lockedAt: takenAt,
      lockedBy,
      birthState: 'LOCKED',
    },
    snapshot: {
      snapshotId,
      versionId: version.versionId,
      payloadHash: frozenPayloadHash(frozen),
      frozenBlueprint: frozen,
      templateRevisionRefs,
      estimates,
      takenAt,
    },
  }
}

/**
 * §7.2 / §15.3 返工完成：新版本出生即 EXECUTING（不回 DRAFT/IN_REVIEW/LOCKED），
 * supersedes 指向旧版本，versionNo++，旧快照保留为历史（由调用方持有）。
 */
export function createReworkVersion(
  oldVersion: BlueprintVersion,
  targetDraft: BlueprintVersion,
  newVersionId: string,
  snapshotId: string,
  templatesById: Record<string, ModuleTemplate>,
  takenAt: number,
  estimates: EstimateBundle | null = null,
): { version: BlueprintVersion; snapshot: DesignVersionSnapshot } {
  const frozen = freeze(targetDraft)
  const templateRevisionRefs: Record<string, number> = {}
  for (const instance of frozen.instances) {
    const template = templatesById[instance.templateId]
    if (template !== undefined) templateRevisionRefs[instance.templateId] = template.templateRevision
  }
  for (const pack of frozen.contentPacks) templateRevisionRefs[pack.packId] = pack.templateRevision

  const birthState: BlueprintBirthState = 'EXECUTING'
  return {
    version: {
      ...targetDraft,
      versionId: newVersionId,
      blueprintId: oldVersion.blueprintId,
      versionNo: oldVersion.versionNo + 1,
      state: birthState,
      birthState,
      supersedesVersionId: oldVersion.versionId,
      lockedAt: takenAt,
    },
    snapshot: {
      snapshotId,
      versionId: newVersionId,
      payloadHash: frozenPayloadHash(frozen),
      frozenBlueprint: frozen,
      templateRevisionRefs,
      estimates,
      takenAt,
    },
  }
}

/** T3 / §15.4：锁定后模块只可 active→deactivated；已停用不可重新启用（无痕修改禁止）。 */
export function deactivateModule(version: BlueprintVersion, instanceId: string): BlueprintVersion {
  const target = version.instances.find((i) => i.instanceId === instanceId)
  if (target === undefined) {
    throw new ImmutableBlueprintError(`实例 ${instanceId} 不存在`)
  }
  if (target.state === 'deactivated') {
    throw new ImmutableBlueprintError(`实例 ${instanceId} 已停用，不可重新启用（§15.4）`)
  }
  return {
    ...version,
    instances: version.instances.map((i) => (
      i.instanceId === instanceId ? { ...i, state: 'deactivated' as const } : i
    )),
  }
}

/** E-13：已有锁定版本的蓝图不可删除，只允许 ABANDONED / archived。 */
export function abandonVersion(version: BlueprintVersion): BlueprintVersion {
  return transitionVersion(version, 'ABANDONED')
}
