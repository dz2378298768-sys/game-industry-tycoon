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
import type { DisciplineWorkload } from './project-execution-cost-helpers'

export interface RebaselineResult {
  workPackages: WorkPackage[]
  /** 归档的 WP id（DONE 或 W_d(new) ≤ delivered）。 */
  archivedIds: string[]
  /** Σ remaining 与 Σ newBaseline（守恒：Σremaining = ΣW_d(new) − Σdelivered_new）。 */
  totalRemainingWorkUnits: number
  totalBaselineWorkUnits: number
  totalDeliveredWorkUnits: number
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

  // 学科层：未完成 WP 的旧 baseline 合计（分摊分母）
  const openByDiscipline: Record<string, number> = {}
  for (const wp of wps) {
    if (wp.state === 'DONE') continue
    openByDiscipline[wp.discipline] = (openByDiscipline[wp.discipline] ?? 0) + wp.baselineWorkUnits
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
  }
}

/** TC-13 不变量：`Σ remaining + Σ delivered(未归档) = Σ baseline`。 */
export function checkRemainingInvariant(result: RebaselineResult): boolean {
  const live = result.workPackages.filter((wp) => wp.state !== 'DEACTIVATED')
  const sum = live.reduce((s, wp) => s + wp.remainingWorkUnits + Math.min(wp.deliveredWorkUnits, wp.baselineWorkUnits), 0)
  return Math.abs(sum - result.totalBaselineWorkUnits) < 1e-6
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
