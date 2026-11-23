/**
 * §5.5 rebaseline（防双算，§10 B-5 / TC-13）与 §4.3 转换前置校验。
 *
 * rebaseline 口径：
 *  - 已 DONE 的 WP 归档（保留旧 snapshotId 与 deliveredWorkUnits，不再产出）。
 *  - 未完成 WP 从新快照重算 `remaining = max(0, W_d(new) − delivered)`；
 *    `W_d(new) < delivered` 时剩余置 0 并归档，**不产生负剩余**。
 *  - 返工已计入的 `reworkWorkUnits` 不得再次计入（新 WP 的 baseline 取 `W_d(new)` 本身，
 *    返工 WP 只计入成本、不进入新 baseline 分母）。
 */
import type { WorkPackage } from '@domain/entities/project-execution'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import type { DisciplineWorkload } from './project-execution-cost-helpers'

export interface RebaselineResult {
  workPackages: WorkPackage[]
  /** 归档的 WP id（DONE 或 W_d(new) ≤ delivered）。 */
  archivedIds: string[]
  /** Σ remaining 与 Σ newBaseline（守恒：Σremaining = ΣW_d(new) − Σdelivered_new）。 */
  totalRemainingWorkUnits: number
  totalBaselineWorkUnits: number
  totalDeliveredWorkUnits: number
  /**
   * rebaseline 入参时仍承载新快照（非 DONE / 非 DEACTIVATED）WP 的 Σdelivered。
   * 守恒断言只对这批 WP 减 delivered：入参时已 DONE 的 WP（含已完成的返工 WP）
   * 其 delivered 属于旧快照口径，不参与 W_d(new) 的守恒式（否则正常切换必然误判失衡）。
   */
  carriedDeliveredWorkUnits: number
}

/**
 * §5.5-5 rebaseline。
 * `newWorkload` 为新快照分学科 W_d；按学科在未完成 WP 间按旧 baseline 占比分配，
 * 保证 `Σ baseline = W_d(new)`（C4 同构守恒）。返工完成后新返工 WP 亦随快照拆解另行生成。
 */
export function rebaselineWorkPackages(
  wps: ReadonlyArray<WorkPackage>,
  newWorkload: DisciplineWorkload,
  newSnapshotId: string,
): RebaselineResult {
  const archivedIds: string[] = []
  const out: WorkPackage[] = []

  // 学科层：未完成 WP 的旧 baseline 合计（分摊分母）。
  // DONE 与 DEACTIVATED（如已撤销的返工 WP）均不承载新快照，不入分母（否则新 baseline
  // 会被死 WP 稀释，守恒式随之失真）。
  const openByDiscipline: Record<string, number> = {}
  let carriedDelivered = 0
  for (const wp of wps) {
    if (wp.state === 'DONE' || wp.state === 'DEACTIVATED') continue
    openByDiscipline[wp.discipline] = (openByDiscipline[wp.discipline] ?? 0) + wp.baselineWorkUnits
    carriedDelivered += wp.deliveredWorkUnits
  }

  // R3（ADJ-06 §3）fail-closed：某学科已无未完成 WP 可承载，但新快照 W_d(new)>0
  // ⇒ 拒绝切快照（差异量进错误详情），禁止静默丢弃。
  for (const d of Object.keys(newWorkload) as Array<keyof DisciplineWorkload>) {
    const target = newWorkload[d] ?? 0
    const open = openByDiscipline[d] ?? 0
    if (target > 0 && open <= 0) {
      throw new ProjectError(
        PROJ_ERROR.REBASELINE_UNBALANCED,
        `discipline ${d} has no open WorkPackage to carry W_d(new)=${target}; rebaseline rejected (fail-closed)`,
      )
    }
  }

  for (const wp of wps) {
    if (wp.state === 'DONE') {
      archivedIds.push(wp.workPackageId)
      out.push({ ...wp })
      continue
    }
    const oldSum = openByDiscipline[wp.discipline] ?? 0
    const target = newWorkload[wp.discipline] ?? 0
    const newBaseline = oldSum > 0 ? (target * wp.baselineWorkUnits) / oldSum : 0
    const delivered = wp.deliveredWorkUnits
    const remaining = Math.max(0, newBaseline - delivered)
    // 剩余为 0 ⇒ 视为完成；返工 WP 仍须继续推进（不在 rebaseline 时归档）
    const archived = remaining <= 0
    if (archived) archivedIds.push(wp.workPackageId)
    out.push({
      ...wp,
      snapshotId: wp.reworkSessionId !== null ? wp.snapshotId : newSnapshotId,
      workUnits: newBaseline,
      baselineWorkUnits: newBaseline,
      remainingWorkUnits: archived ? 0 : remaining,
      progress: Math.min(1, Math.max(0, delivered / Math.max(1e-9, newBaseline))),
      state: archived ? 'DONE' : wp.kind === 'REWORK' ? wp.state : 'READY',
    })
  }

  const live = out.filter((wp) => wp.state !== 'DEACTIVATED')
  return {
    workPackages: out,
    archivedIds,
    totalRemainingWorkUnits: live.reduce((s, wp) => s + wp.remainingWorkUnits, 0),
    totalBaselineWorkUnits: live.reduce((s, wp) => s + wp.baselineWorkUnits, 0),
    totalDeliveredWorkUnits: live.reduce((s, wp) => s + wp.deliveredWorkUnits, 0),
    carriedDeliveredWorkUnits: carriedDelivered,
  }
}

/**
 * TC-13 不变量（ADJ-06 §3）：
 *  - 对**传入的 `W_d(new)`** 断言 `Σ remaining == Σ W_d(new) − Σ delivered`（禁止内部自算 totalBaseline 自证）；
 *  - `delivered > baseline` 必须单独失败（P3-4），不得用 `min(delivered, baseline)` 掩盖超交付。
 */
export function checkRemainingInvariant(
  result: RebaselineResult,
  newWorkload: DisciplineWorkload,
): boolean {
  const live = result.workPackages.filter((wp) => wp.state !== 'DEACTIVATED')
  for (const wp of live) {
    if (wp.deliveredWorkUnits > wp.baselineWorkUnits + 1e-6) return false
  }
  const sumRemaining = live.reduce((s, wp) => s + wp.remainingWorkUnits, 0)
  // Σdelivered 只取入参时仍承载新快照的 WP（见 RebaselineResult.carriedDeliveredWorkUnits 注）；
  // 入参时已 DONE 的 WP 不参与 W_d(new) 守恒式。
  return Math.abs(sumRemaining - (targetTotal(newWorkload) - result.carriedDeliveredWorkUnits)) < 1e-6
}

function targetTotal(newWorkload: DisciplineWorkload): number {
  return (Object.keys(newWorkload) as Array<keyof DisciplineWorkload>).reduce(
    (s, d) => s + (newWorkload[d] ?? 0),
    0,
  )
}

/**
 * §4.4 交付/完成动作的前置：WP 是否被依赖阻塞（用于暴露阻塞链，不伪造进度，§6.7）。
 */
export function blockedChain(wps: ReadonlyArray<WorkPackage>, workPackageId: string): string[] {
  const byId = new Map(wps.map((wp) => [wp.workPackageId, wp]))
  const chain: string[] = []
  const visit = (id: string): void => {
    const wp = byId.get(id)
    if (wp === undefined) return
    for (const b of wp.blockedBy) {
      const dep = byId.get(b)
      if (dep !== undefined && dep.state !== 'DONE' && dep.state !== 'DEACTIVATED') {
        chain.push(b)
        visit(b)
      }
    }
  }
  visit(workPackageId)
  return chain
}
