/**
 * D-02 §5.2 archetypeClass 确定性派生 + §3.7 ModuleContribution 派生。
 *
 * 分类顺序固定（先判 technical，再判 niche，余为 broad）：
 *   technical  if T_unsat ≠ ∅ OR perspectiveId ∈ {first_person, isometric}
 *              OR structureId ∈ {open_zone, sandbox, roguelike}
 *   niche      else if |targetSegmentClaims| == 1 AND core intensity ≥ τ_niche (TUNING)
 *   broad      else if |targetSegmentClaims| ≥ τ_broad_tags (TUNING)
 *   generic    otherwise（如空草稿：只套公共项）
 *
 * core intensity = max{ i.intensity : active ∧ slot=core_loop }（§6.6 约束 1；非均值；无核心实例为 0）。
 * archetypeClass 是从快照确定性派生的标签，不是新的玩家字段；P1 开放显式覆盖（X-2，必须附理由留痕）。
 */
import type {
  ArchetypeClass,
  EvaluationContext,
  ModuleContribution,
} from '@domain/entities/product-completeness'
import { CompletenessDomainError, D02_IMPL_ERROR } from '@domain/entities/product-completeness'
import type { DesignVersionSnapshot, MarketFitChannel, ModuleInstance, SlotKind } from '@domain/entities/product-blueprint'
import type { CompletenessTuning } from './product-completeness-tuning'

/** 快照中 state=active 的实例。 */
export function activeSnapshotInstances(ctx: EvaluationContext): ModuleInstance[] {
  return ctx.snapshot.frozenBlueprint.instances.filter((i) => i.state === 'active')
}

function slotsOfKind(ctx: EvaluationContext, slotKind: SlotKind) {
  return ctx.snapshot.frozenBlueprint.slots.filter((s) => s.slotKind === slotKind)
}

/** 某 slotId 的槽种类（找不到返回 null；缺数据 ≠ 未知谓词，调用方按缺数据处理）。 */
export function slotKindOf(ctx: EvaluationContext, slotId: string): SlotKind | null {
  return ctx.snapshot.frozenBlueprint.slots.find((s) => s.slotId === slotId)?.slotKind ?? null
}

function instanceById(ctx: EvaluationContext, instanceId: string): ModuleInstance | null {
  return ctx.snapshot.frozenBlueprint.instances.find((i) => i.instanceId === instanceId) ?? null
}

/** 槽种类内的 active 实例数（快照无该槽 ⇒ 0；§6.7 数据缺失不抛错）。 */
export function activeInstanceCountInSlotKind(ctx: EvaluationContext, slotKind: SlotKind): number {
  let count = 0
  for (const slot of slotsOfKind(ctx, slotKind)) {
    for (const bindingId of slot.bindings) {
      const inst = instanceById(ctx, bindingId)
      if (inst !== null && inst.state === 'active') count += 1
    }
  }
  return count
}

/** §6.6 约束 1：core intensity = max（非均值），无核心实例为 0。 */
export function coreIntensity(ctx: EvaluationContext): number {
  let max = 0
  for (const inst of activeSnapshotInstances(ctx)) {
    const kind = slotKindOf(ctx, inst.slotId)
    if (kind === 'core_loop' && inst.intensity > max) max = inst.intensity
  }
  return max
}

/** 核心（core_loop）实例的 active 集合。 */
export function activeCoreLoopInstances(ctx: EvaluationContext): ModuleInstance[] {
  return activeSnapshotInstances(ctx).filter((i) => slotKindOf(ctx, i.slotId) === 'core_loop')
}

/** 画像解析：优先 ctx.marketProfile，回退 snapshot.estimates?.marketFit（只读，不重算）。 */
export function resolveMarketProfile(ctx: EvaluationContext): MarketFitChannel | null {
  if (ctx.marketProfile !== null) return ctx.marketProfile
  return ctx.snapshot.estimates?.marketFit ?? null
}

/** T_unsat（D-01 §6.4）：estimates 缺失按空集处理（空设计由 C-01 阻断，不在此抛错）。 */
export function unsatisfiedTechGates(ctx: EvaluationContext) {
  return ctx.snapshot.estimates?.techRisk.unsatisfied ?? []
}

const TECHNICAL_PERSPECTIVES: readonly string[] = ['first_person', 'isometric']
const TECHNICAL_STRUCTURES: readonly string[] = ['open_zone', 'sandbox', 'roguelike']

/** §5.2 分类（固定顺序：technical → niche → broad → generic）。 */
export function deriveArchetypeClass(ctx: EvaluationContext, tuning: CompletenessTuning): ArchetypeClass {
  const positioning = ctx.snapshot.frozenBlueprint.positioning

  if (
    unsatisfiedTechGates(ctx).length > 0 ||
    TECHNICAL_PERSPECTIVES.includes(positioning.perspectiveId) ||
    TECHNICAL_STRUCTURES.includes(positioning.structureId)
  ) {
    return 'technical'
  }

  const claims = positioning.targetSegmentClaims
  if (claims.length === 1 && coreIntensity(ctx) >= tuning.tauNiche) return 'niche'
  if (claims.length >= tuning.tauBroadTags) return 'broad'
  return 'generic'
}

/**
 * §5.2 / §10.4 X-2：P1 开放玩家/QA 显式覆盖 archetypeClass（CONFIRMED），必须附理由并留痕。
 * 覆盖触发：清单 templateRevision 更新 + 原 DeliveryFormQualification 作废 → not_evaluated → 重算。
 * 覆盖无理由视为实现缺陷，fail-closed 抛错（不得静默放行）。
 */
export function resolveArchetypeClass(
  ctx: EvaluationContext,
  tuning: CompletenessTuning,
): { archetypeClass: ArchetypeClass; overridden: boolean } {
  const override = ctx.archetypeClassOverride
  if (override !== null) {
    if (override.reason.trim() === '') {
      throw new CompletenessDomainError(
        D02_IMPL_ERROR.OVERRIDE_REASON_REQUIRED,
        'archetypeClass override requires a non-empty reason (D-02 §5.2 / §10.4 X-2: 全程留痕).',
      )
    }
    return { archetypeClass: override.archetypeClass, overridden: true }
  }
  return { archetypeClass: deriveArchetypeClass(ctx, tuning), overridden: false }
}

/**
 * §3.7 ModuleContribution 派生（present / deactivated 两态；missing / substituted 由
 * 游戏逻辑显式标记，本函数不臆造）。contributesTo / substitutableBy / signals 由调用方填充。
 */
export function deriveModuleContributions(snapshot: DesignVersionSnapshot): ModuleContribution[] {
  return snapshot.frozenBlueprint.instances.map((inst, index) => ({
    contributionId: `MC-${snapshot.snapshotId}-${inst.instanceId}-${index}`,
    instanceId: inst.instanceId,
    templateId: inst.templateId,
    slotId: inst.slotId,
    domain: inst.domain,
    contributesTo: [],
    status: inst.state === 'active' ? 'present' : 'deactivated',
    substitutableBy: [],
    signals: { uspSupported: {}, affinitySlice: {}, contentVolumeContribution: 0 },
  }))
}
