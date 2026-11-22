/**
 * §5.3 / §6.2 / §6.3 日推进引擎：产能 → 派工 → DailyOutput → 账本支出。
 *
 * 规则：
 *  1. 每学科按 `(priority, |dependents| desc, orderIndex)` 排序 READY WP，贪心分配当日 `Cap_d`（确定性）。
 *  2. `Cap_d = 0` ⇒ 该学科当日产出 0、WP 不变（§10 B-2），**不产生 0 额交易**（FIN 拒绝零额）。
 *  3. 产出落地为 append-only `Worklog`；成本 `capacityAppliedCents = out_wp × costPerUnit_d`，
 *     经唯一现金入口 `UnifiedLedger.postTransaction` 逐日提交 `project_expense`（R-PROJ-3）。
 *  4. 返工 WP（kind=REWORK）逐日累加 `ExecutionReworkSession.costEstimate.actualCents`（R-PROJ-5），
 *     幂等键带 `reworkMode` 标识，防重复归集（§10 B-5 / TC-13）。
 */
import type {
  Discipline,
  ExecutionReworkSession,
  WorkPackage,
  Worklog,
} from '@domain/entities/project-execution'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import type { UnifiedLedger } from '@domain/entities/finance'
import type { DisciplineWorkload } from './project-execution-cost-helpers'

const PRIORITY_RANK: Record<WorkPackage['priority'], number> = { P0: 0, P1: 1, P2: 2 }

export interface AdvanceDayInput {
  projectId: string
  companyId: string
  day: number
  workPackages: ReadonlyArray<WorkPackage>
  capacity: DisciplineWorkload
  costPerWorkUnit: DisciplineWorkload
  /** 返工会话（用于累加 actualCents）；无返工时为空数组。 */
  reworkSessions?: ReadonlyArray<ExecutionReworkSession>
  ledger?: UnifiedLedger
  /** 交易来源：日推进默认 system_auto；玩家授权的推进传 player_authorized（FIN §10.4 沙盒守卫）。 */
  source?: 'system_auto' | 'player_authorized'
}

export interface AdvanceDayResult {
  /** 新 WP 数组（原数组不被修改；纯数据更新）。 */
  workPackages: WorkPackage[]
  /** 本日 append 的日志（append-only）。 */
  logs: Worklog[]
  /** 各学科当日产出。 */
  producedByDiscipline: DisciplineWorkload
  /** 本日提交的账本交易 id（逐 WP 一笔；0 额不入账）。 */
  transactionIds: string[]
  /** 返工会话（actualCents 已累加）。 */
  reworkSessions: ExecutionReworkSession[]
  /** 本日实际支出合计（cents，用于 `capacityAppliedCents` 求和核对）。 */
  spentCents: number
}

function emptyWorkload(): DisciplineWorkload {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
}

/** §6.3 确定性派工序：priority asc, |dependents| desc, orderIndex asc。 */
export function dispatchOrder(wps: ReadonlyArray<WorkPackage>): WorkPackage[] {
  return [...wps].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (p !== 0) return p
    const d = b.dependents.length - a.dependents.length
    if (d !== 0) return d
    return a.orderIndex - b.orderIndex
  })
}

/**
 * 推进一天。WP 状态按 `blockedBy 全 DONE 且 remaining>0 ⇒ READY`（§5.3-3）在当日派工前统一刷新。
 */
export function advanceOneDay(input: AdvanceDayInput): AdvanceDayResult {
  const next = input.workPackages.map((wp) => ({ ...wp, blockedBy: [...wp.blockedBy], dependents: [...wp.dependents] }))
  const byId = new Map(next.map((wp) => [wp.workPackageId, wp]))
  refreshReadyStates(next, byId)

  const producedByDiscipline = emptyWorkload()
  const logs: Worklog[] = []
  const transactionIds: string[] = []
  const sessions = (input.reworkSessions ?? []).map((s) => ({
    ...s,
    costEstimate: { ...s.costEstimate },
  }))
  const sessionById = new Map(sessions.map((s) => [s.sessionId, s]))
  const source = input.source ?? 'system_auto'
  let spentCents = 0
  let logSeq = 0

  const disciplines = Object.keys(input.capacity) as Discipline[]
  for (const d of disciplines) {
    let remainingCap = input.capacity[d] ?? 0
    // §10 B-2：Cap_d=0 → 该学科当日产出 0（显式分支，不做除法/不产生 0 额交易）
    if (remainingCap <= 0) continue
    const costPerUnit = input.costPerWorkUnit[d] ?? Number.POSITIVE_INFINITY
    for (;;) {
      if (remainingCap <= 0) break
      const candidates = dispatchOrder(next.filter((wp) => wp.discipline === d && wp.state === 'READY' && wp.remainingWorkUnits > 0))
      const wp = candidates[0]
      if (wp === undefined) break
      const alloc = Math.min(remainingCap, wp.remainingWorkUnits)
      if (alloc <= 0) break
      wp.deliveredWorkUnits += alloc
      wp.remainingWorkUnits -= alloc
      remainingCap -= alloc
      wp.progress = Math.min(1, Math.max(0, wp.deliveredWorkUnits / Math.max(1e-9, wp.workUnits)))
      wp.state = wp.remainingWorkUnits <= 1e-12 ? 'DONE' : 'ACTIVE'
      producedByDiscipline[d] += alloc

      // §6.4：单位成本为 +∞ 时（无产能）此分支不可达（Cap_d=0 已跳过）；仍防御性跳过非有限值
      const costCents = Number.isFinite(costPerUnit) ? Math.round(alloc * costPerUnit) : 0
      logSeq += 1
      logs.push({
        logId: `${input.projectId}:log:${input.day}:${wp.workPackageId}:${logSeq}`,
        projectId: input.projectId,
        workPackageId: wp.workPackageId,
        day: input.day,
        discipline: d,
        outputWorkUnits: alloc,
        capacityAppliedCents: costCents,
        source,
        reworkMode: wp.reworkMode,
      })

      if (wp.kind === 'REWORK' && wp.reworkSessionId !== null) {
        const session = sessionById.get(wp.reworkSessionId)
        if (session !== undefined) session.costEstimate.actualCents += costCents
      }

      // §5.3-3：当日内完成 ⇒ 立即解锁 dependents，使同日批次可继续派工（不悬停到下一天）
      if (wp.state === 'DONE') refreshReadyStates(next, byId)

      // 账本：逐日兑现（$0 不提交，FIN AMOUNT_ZERO 拒收）
      if (costCents > 0 && input.ledger !== undefined) {
        const res = input.ledger.postTransaction({
          idempotencyKey: expenseKey(input.projectId, input.day, wp),
          companyId: input.companyId,
          day: input.day,
          category: 'project_expense',
          amountCents: -costCents,
          description: `项目 ${input.projectId} 日支出 ${input.day} ${wp.workPackageId}`,
          referenceId: wp.workPackageId,
          source,
        })
        if (!res.success) {
          throw new ProjectError(
            PROJ_ERROR.LEDGER_POST_FAILED,
            res.errorMessage ?? 'project expense post failed',
          )
        }
        transactionIds.push(res.result!.transaction.transactionId)
      }
      // 未接账本或幂等命中（重放同一天）时仍以日志口径计入当日支出
      if (costCents > 0) spentCents += costCents
    }
  }

  return { workPackages: next, logs, producedByDiscipline, transactionIds, reworkSessions: sessions, spentCents }
}

/** 项目支出幂等键：`proj-expense:<projectId>:<day>:<wpId>:<reworkMode|work>`（同日报价重放不双算）。 */
export function expenseKey(projectId: string, day: number, wp: WorkPackage): string {
  return `proj-expense:${projectId}:${day}:${wp.workPackageId}:${wp.reworkMode ?? 'work'}`
}

/** §5.3-3 就绪判定：blockedBy 全 DONE 且 remaining>0 ⇒ READY；否则 BLOCKED；DONE/DEACTIVATED 不变。 */
export function refreshReadyStates(
  wps: ReadonlyArray<WorkPackage>,
  byId: Map<string, WorkPackage> = new Map(wps.map((w) => [w.workPackageId, w])),
): void {
  for (const wp of wps) {
    if (wp.state === 'DONE' || wp.state === 'DEACTIVATED') continue
    if (wp.remainingWorkUnits <= 0) {
      wp.state = 'DONE'
      continue
    }
    const blocked = wp.blockedBy.some((id) => {
      const dep = byId.get(id)
      return dep !== undefined && dep.state !== 'DONE' && dep.state !== 'DEACTIVATED'
    })
    wp.state = blocked ? 'BLOCKED' : 'READY'
  }
}

/** 全部 WP 是否完成（非 DEACTIVATED 的 WP 均 DONE）→ ACTIVE → READY_TO_DELIVER。 */
export function allWorkPackagesDone(wps: ReadonlyArray<WorkPackage>): boolean {
  return wps.length > 0 && wps.every((wp) => wp.state === 'DONE' || wp.state === 'DEACTIVATED')
}

/** §5.3-2 瓶颈：`burden_d = remaining_d / max(ε, Cap_d)`，取最大者（并列取学科枚举序先者）。 */
export function computeBottleneck(
  wps: ReadonlyArray<WorkPackage>,
  capacity: DisciplineWorkload,
  epsilon: number,
): { discipline: Discipline | null; burden: Record<Discipline, number> } {
  const remaining = emptyWorkload()
  for (const wp of wps) {
    if (wp.state === 'DEACTIVATED') continue
    remaining[wp.discipline] += wp.remainingWorkUnits
  }
  const burden = emptyWorkload()
  let best: Discipline | null = null
  let bestVal = 0
  for (const d of Object.keys(remaining) as Discipline[]) {
    const cap = capacity[d] ?? 0
    burden[d] = cap <= epsilon ? (remaining[d] > 0 ? Number.POSITIVE_INFINITY : 0) : remaining[d] / cap
    if (burden[d] > bestVal) {
      bestVal = burden[d]
      best = d
    }
  }
  return { discipline: best, burden }
}

/** §6.3 分学科进度向量（禁止合成为单一百分比）：`Σ delivered_d / max(ε, Σ baseline_d)`；无要求视为 1。 */
export function progressVector(wps: ReadonlyArray<WorkPackage>): DisciplineWorkload {
  const delivered = emptyWorkload()
  const baseline = emptyWorkload()
  for (const wp of wps) {
    if (wp.state === 'DEACTIVATED') continue
    delivered[wp.discipline] += wp.deliveredWorkUnits
    baseline[wp.discipline] += wp.baselineWorkUnits
  }
  const out = emptyWorkload()
  for (const d of Object.keys(baseline) as Discipline[]) {
    out[d] = baseline[d] > 0 ? Math.min(1, delivered[d] / baseline[d]) : 1
  }
  return out
}
