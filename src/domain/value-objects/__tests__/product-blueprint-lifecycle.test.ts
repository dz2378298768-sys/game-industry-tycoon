/**
 * D-01 §4.9 / §7 BlueprintVersion 状态机与 §4.12 快照测试（R-09 / C2 / T3）。
 */
import { describe, it, expect } from 'vitest'
import {
  canTransition, transitionVersion, lockVersion, createReworkVersion,
  deactivateModule, abandonVersion, frozenPayloadHash,
} from '../product-blueprint-lifecycle'
import { InvalidBlueprintTransitionError, ImmutableBlueprintError } from '@domain/entities/product-blueprint'
import type { BlueprintVersion } from '@domain/entities/product-blueprint'
import { baseTemplate, baseSlot, baseInstance, basePositioning, baseContentPack } from './product-blueprint-fixtures'

const makeVersion = (overrides: Partial<BlueprintVersion> = {}): BlueprintVersion => ({
  versionId: 'V-1',
  blueprintId: 'BP-1',
  versionNo: 1,
  state: 'IN_REVIEW',
  positioning: basePositioning(),
  slots: [baseSlot()],
  instances: [baseInstance()],
  contentPacks: [],
  lockTargetReleaseForm: 'full',
  lockedAt: null,
  lockedBy: null,
  changeHistory: [],
  supersedesVersionId: null,
  birthState: 'LOCKED',
  ...overrides,
})

describe('§7.1 状态机（R-09 / C2：REWORK 非枚举态）', () => {
  it('合法转换：DRAFT→IN_REVIEW→LOCKED→EXECUTING→COMPLETED', () => {
    expect(canTransition('DRAFT', 'IN_REVIEW')).toBe(true)
    expect(canTransition('IN_REVIEW', 'LOCKED')).toBe(true)
    expect(canTransition('LOCKED', 'EXECUTING')).toBe(true)
    expect(canTransition('EXECUTING', 'COMPLETED')).toBe(true)
  })

  it('返工期间 state 保持 EXECUTING（EXECUTING→EXECUTING 合法）', () => {
    expect(canTransition('EXECUTING', 'EXECUTING')).toBe(true)
    const v = makeVersion({ state: 'EXECUTING' })
    expect(transitionVersion(v, 'EXECUTING').state).toBe('EXECUTING')
  })

  it('REWORK 不是状态：任何到 REWORK 的转换均不合法', () => {
    expect(canTransition('EXECUTING', 'REWORK' as never)).toBe(false)
    expect(canTransition('LOCKED', 'REWORK' as never)).toBe(false)
  })

  it('非法转换抛 DomainError（不静默）', () => {
    expect(() => transitionVersion(makeVersion({ state: 'DRAFT' }), 'COMPLETED'))
      .toThrow(InvalidBlueprintTransitionError)
    expect(() => transitionVersion(makeVersion({ state: 'COMPLETED' }), 'LOCKED'))
      .toThrow(InvalidBlueprintTransitionError)
  })
})

describe('§4.12 锁定与快照（S2 / R-12）', () => {
  it('IN_REVIEW→LOCKED：versionNo++、lockedAt/lockedBy 写入、birthState=LOCKED', () => {
    const v = makeVersion()
    const { version, snapshot } = lockVersion(v, 'SNAP-1', { 'TPL-COMBAT': baseTemplate() }, 1000, 'player')
    expect(version.state).toBe('LOCKED')
    expect(version.versionNo).toBe(2)
    expect(version.lockedAt).toBe(1000)
    expect(version.lockedBy).toBe('player')
    expect(version.birthState).toBe('LOCKED')
    expect(snapshot.snapshotId).toBe('SNAP-1')
    expect(snapshot.versionId).toBe('V-1')
  })

  it('S2：templateRevisionRefs 写入所有引用模板与内容包的 revision', () => {
    const v = makeVersion({ contentPacks: [baseContentPack()] })
    const { snapshot } = lockVersion(
      v, 'SNAP-1',
      { 'TPL-COMBAT': baseTemplate({ templateRevision: 7 }) }, 1000, 'player',
    )
    expect(snapshot.templateRevisionRefs).toEqual({ 'TPL-COMBAT': 7, 'PACK-1': 1 })
  })

  it('frozenBlueprint 为深拷贝，后续编辑不漂移（重放稳定）', () => {
    const v = makeVersion()
    const { snapshot } = lockVersion(v, 'SNAP-1', { 'TPL-COMBAT': baseTemplate() }, 1000, 'player')
    v.instances[0]!.intensity = 5
    expect(snapshot.frozenBlueprint.instances[0]!.intensity).toBe(3)
  })

  it('payloadHash 确定性且随结构变化（变更检测）', () => {
    const v = makeVersion()
    const h1 = frozenPayloadHash({ positioning: v.positioning, slots: v.slots, instances: v.instances, contentPacks: v.contentPacks })
    const h2 = frozenPayloadHash({ positioning: v.positioning, slots: v.slots, instances: v.instances, contentPacks: v.contentPacks })
    expect(h1).toBe(h2)
    const changed = frozenPayloadHash({
      positioning: v.positioning, slots: v.slots,
      instances: [baseInstance({ intensity: 4 })], contentPacks: [],
    })
    expect(changed).not.toBe(h1)
  })

  it('非 IN_REVIEW 不可锁定', () => {
    expect(() => lockVersion(makeVersion({ state: 'DRAFT' }), 'S', {}, 1, 'p'))
      .toThrow(InvalidBlueprintTransitionError)
  })
})

describe('§15.3 返工完成派生版本（C2 / R-09）', () => {
  it('出生即 EXECUTING，birthState=EXECUTING，versionNo++，supersedes 指向旧版本', () => {
    const old = makeVersion({ state: 'EXECUTING', versionNo: 3, lockedAt: 100 })
    const targetDraft = makeVersion({ versionId: 'V-2-DRAFT', state: 'DRAFT', versionNo: 4 })
    const { version, snapshot } = createReworkVersion(
      old, targetDraft, 'V-2', 'SNAP-2', { 'TPL-COMBAT': baseTemplate() }, 200,
    )
    expect(version.state).toBe('EXECUTING')
    expect(version.birthState).toBe('EXECUTING')
    expect(version.versionNo).toBe(4)
    expect(version.supersedesVersionId).toBe('V-1')
    expect(snapshot.versionId).toBe('V-2')
    expect(snapshot.takenAt).toBe(200)
  })
})

describe('T3 / §15.4 锁定后只停用不删除（E-13）', () => {
  it('active→deactivated 允许；已停用不可重新启用', () => {
    const v = makeVersion({ state: 'EXECUTING' })
    const deactivated = deactivateModule(v, 'INS-1')
    expect(deactivated.instances[0]?.state).toBe('deactivated')
    expect(() => deactivateModule(deactivated, 'INS-1')).toThrow(ImmutableBlueprintError)
  })

  it('ABANDONED 保留全部历史（不删除）', () => {
    const v = makeVersion({ state: 'LOCKED' })
    const abandoned = abandonVersion(v)
    expect(abandoned.state).toBe('ABANDONED')
    expect(abandoned.changeHistory).toEqual([])
    expect(abandoned.instances).toHaveLength(1)
  })
})
