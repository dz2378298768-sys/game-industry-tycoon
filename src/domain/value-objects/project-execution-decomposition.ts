/**
 * §5.2 WorkPackage 拆解算法 + §6.1 关键路径（确定性，纯函数）。
 *
 * 输入为 D-01 冻结快照的只读投影（`W_d^raw(i)` / `W_d^raw(c)` / `W_d` / 依赖规则），
 * **不读取、不修改** `ProductBlueprint` / `BlueprintVersion` / `DesignVersionSnapshot`（R-PROJ-1）。
 *
 * 守恒（C4）：`baselineWorkUnits(wp) = W_d × W_d^raw(wp) / max(ε, Σ W_d^raw)`，
 * 故 `Σ_{wp∈d} baseline = W_d`，全学科求和 = `W_total`。折扣已在 `W_d` 内，**不二次扣减 synergy**。
 */
import type {
  DecompositionResult,
  Discipline,
  WorkPackage,
  WorkPackagePriority,
} from '@domain/entities/project-execution'
import type { RequireRule, RuleSelector } from './product-blueprint-composition'
import type { DisciplineWorkload } from './project-execution-cost-helpers'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import { DISCIPLINE_ORDER, type ProjectFormulaParams } from './project-execution-tuning'

// ===== 输入（D-01 只读投影） =====

/** 模块实例原始工作量 `W_d^raw(i)`（D-01 §6.2 公式输出，只读）。 */
export interface DecompositionInstance {
  instanceId: string
  displayLabel: string
  rawWorkload: DisciplineWorkload
}

/** 内容包原始工作量 `W_d^raw(c)`（D-01 §6.2，只读）。 */
export interface DecompositionContentPack {
  packId: string
  rawWorkload: DisciplineWorkload
}

export interface DecompositionInput {
  projectId: string
  snapshotId: string
  /** D-01 `WorkloadEstimate.W_d`（学科合计，已含 synergy）。 */
  workload: DisciplineWorkload
  instances: ReadonlyArray<DecompositionInstance>
  contentPacks: ReadonlyArray<DecompositionContentPack>
  /** §5.2-4 快照依赖规则（仅 hard 生成依赖边）。 */
  requireRules: ReadonlyArray<RequireRule>
  /** 领域技能映射 d → SkillProfile 引用（D-03 输入，缺省 null）。 */
  skillMap?: Partial<Record<Discipline, string>>
  /** 各学科当日产能（§6.1 duration 用）；缺省取 1（仅用于对比关键路径）。 */
  capacity?: DisciplineWorkload
}

function emptyWorkload(): DisciplineWorkload {
  return { design: 0, code: 0, art: 0, audio: 0, qa: 0 }
}

/**
 * §5.2-4 规则选择器匹配 `sourceRef.instanceId` / `contentPackId`。
 * 模板/标签/卖点级选择器在本层不展开（依赖已在实例级由 D-01 判定），返回 false 而非猜测。
 */
function selectorMatches(rule: RequireRule, selector: RuleSelector, sourceId: string): boolean {
  if (selector.kind === 'template' || selector.kind === 'tag' || selector.kind === 'usp') return false
  // 'option' 选择器：value 直接比较来源 id（快照中 option 选择在实例级由 D-01 展开）。
  void rule
  return selector.value === sourceId
}

/**
 * §5.2 步骤 1–3：生成 WP 并按 `W_d^raw` 占比分摊学科合计。
 * `orderIndex` 按 `(discipline 枚举序, 来源 id, d)` 字典序稳定生成（步骤 5）。
 */
export function decomposeWorkPackages(
  input: DecompositionInput,
  params: ProjectFormulaParams,
): DecompositionResult {
  // ① 收集候选 (source, d, raw)，只保留 raw>0（步骤 1/2）
  interface Candidate {
    sourceKind: 'instance' | 'contentPack'
    sourceId: string
    discipline: Discipline
    raw: number
  }
  const candidates: Candidate[] = []
  for (const inst of input.instances) {
    for (const d of DISCIPLINE_ORDER) {
      const raw = inst.rawWorkload[d] ?? 0
      if (raw > 0) candidates.push({ sourceKind: 'instance', sourceId: inst.instanceId, discipline: d, raw })
    }
  }
  for (const pack of input.contentPacks) {
    for (const d of DISCIPLINE_ORDER) {
      const raw = pack.rawWorkload[d] ?? 0
      if (raw > 0) candidates.push({ sourceKind: 'contentPack', sourceId: pack.packId, discipline: d, raw })
    }
  }

  // ② synergy 占比分摊（步骤 3）
  const rawSumByDiscipline = emptyWorkload()
  for (const c of candidates) rawSumByDiscipline[c.discipline] += c.raw

  const sorted = [...candidates].sort((a, b) => {
    const di = DISCIPLINE_ORDER.indexOf(a.discipline) - DISCIPLINE_ORDER.indexOf(b.discipline)
    if (di !== 0) return di
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1
    return a.sourceKind < b.sourceKind ? -1 : a.sourceKind > b.sourceKind ? 1 : 0
  })

  const workPackages: WorkPackage[] = sorted.map((c, index) => {
    const wTotal = input.workload[c.discipline] ?? 0
    const denom = Math.max(params.epsilon, rawSumByDiscipline[c.discipline])
    const baseline = wTotal * (c.raw / denom)
    const id = wpId(input.projectId, c.sourceKind, c.sourceId, c.discipline)
    return {
      workPackageId: id,
      projectId: input.projectId,
      snapshotId: input.snapshotId,
      sourceRef: c.sourceKind === 'instance' ? { instanceId: c.sourceId } : { contentPackId: c.sourceId },
      discipline: c.discipline,
      workUnits: baseline,
      baselineWorkUnits: baseline,
      remainingWorkUnits: baseline,
      deliveredWorkUnits: 0,
      progress: 0,
      skillRef: input.skillMap?.[c.discipline] ?? null,
      requiredSkillLevel: 0,
      blockedBy: [],
      dependents: [],
      priority: 'P1',
      state: baseline > 0 ? 'READY' : 'DONE',
      kind: 'NORMAL',
      orderIndex: index,
      reworkSessionId: null,
      reworkMode: null,
    }
  })

  // ③ 依赖边（步骤 4）：对每条 hard RequireRule(A 需 B)，A 的同学科 WP blockedBy += B 的同学科 WP；
  //    跨学科（A 无 B 学科 WP）时回退到 B 的任一 WP（instanceId 关联）。
  const bySource = new Map<string, WorkPackage[]>()
  for (const wp of workPackages) {
    const key = wp.sourceRef.instanceId ?? wp.sourceRef.contentPackId ?? ''
    const list = bySource.get(key) ?? []
    list.push(wp)
    bySource.set(key, list)
  }
  const wpById = new Map(workPackages.map((wp) => [wp.workPackageId, wp]))

  /** from 是否已能经由 blockedBy 到达 to（加边前判定，防止互为前置）。 */
  const hasPath = (from: string, to: string): boolean => {
    const seen = new Set<string>()
    const stack = [from]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (cur === to) return true
      if (seen.has(cur)) continue
      seen.add(cur)
      const wp = wpById.get(cur)
      if (wp !== undefined) stack.push(...wp.blockedBy)
    }
    return false
  }

  const pendingEdges: Array<[string, string]> = []
  for (const rule of input.requireRules) {
    if (rule.severity !== 'hard') continue
    const pairs: Array<[string, string]> = []
    for (const subjectId of bySource.keys()) {
      if (!selectorMatches(rule, rule.subject, subjectId)) continue
      // Requires 必须**全部**满足才成边（D-01 §5.4 语义：A 需 B ∧ C ⇒ B、C 均须先完成）
      const allRequired = rule.requires.every((r) => [...bySource.keys()].some((id) => selectorMatches(rule, r, id)))
      if (!allRequired) continue
      for (const requiredId of bySource.keys()) {
        if (!rule.requires.some((r) => selectorMatches(rule, r, requiredId))) continue
        if (subjectId === requiredId) continue
        pairs.push([subjectId, requiredId])
      }
    }
    for (const [subjectId, requiredId] of pairs) {
      const subjectWps = bySource.get(subjectId) ?? []
      const requiredWps = bySource.get(requiredId) ?? []
      for (const swp of subjectWps) {
        // 同 discipline 优先；跨 discipline（subject 该学科无对应 WP）时用来源 id 关联。
        // 反向边已存在时不加反向边——依赖方向由 RequireRule 的 subject→requires 唯一决定，避免自造环。
        const same = requiredWps.filter((r) => r.discipline === swp.discipline)
        // 跨学科回退：only 当任意学科都无同源 WP 时（同一来源的跨学科 WP 相互指依赖会成环，
        // 由 D-01 E-CYCLE 拦截，执行层不制造死锁，§10 B-3）
        const targets = same.length > 0 ? same : []
        // 依赖的是"另一模块"：来源相同时（同实例跨学科）只取同来源的**其他学科** WP，
        // 不接受"该 WP 依赖自己"（自依赖既无意义又会与同实例多学科互指成环）。
        for (const rwp of targets) {
          if (rwp.workPackageId === swp.workPackageId) continue
          const swpSource = swp.sourceRef.instanceId ?? swp.sourceRef.contentPackId
          const rwpSource = rwp.sourceRef.instanceId ?? rwp.sourceRef.contentPackId
          if (swpSource === rwpSource) continue
          pendingEdges.push([swp.workPackageId, rwp.workPackageId])
        }
      }
    }
  }

  // ④ 落地依赖边：按规则顺序逐条加入，**会导致环的边不加入**（自相矛盾快照本身已被 D-01 E-CYCLE 拦截；
  //    此处只保留可拓扑部分，§10 B-3），随后仍做整体拓扑断言。
  for (const [from, to] of pendingEdges) {
    const swp = wpById.get(from)
    if (swp === undefined || swp.blockedBy.includes(to)) continue
    swp.blockedBy.push(to)
    // 加入后若可从 to 回到 from ⇒ 成环，回滚该边（D-01 E-CYCLE 在蓝图层阻断）
    if (hasPath(to, from)) {
      // 出现环：回滚该边，交由 E-CYCLE 在蓝图层阻断；执行层不制造死锁
      swp.blockedBy = swp.blockedBy.filter((id) => id !== to)
    }
  }

  // ④ 拓扑校验（步骤 6）：成环则该快照本应已被 D-01 E-CYCLE 拦截，此处为边界断言（§10 B-3）
  const topo = topologicalOrder(workPackages)
  if (topo === null) {
    throw new ProjectError(PROJ_ERROR.DEPENDENCY_CYCLE, 'WorkPackage dependency graph has a cycle')
  }

  // ⑤ dependents（派生）与 priority（按依赖深度派生，§8.2）
  for (const wp of workPackages) {
    for (const blockerId of wp.blockedBy) {
      const blocker = wpById.get(blockerId)
      if (blocker !== undefined && !blocker.dependents.includes(wp.workPackageId)) {
        blocker.dependents.push(wp.workPackageId)
      }
    }
  }
  const depth = dependencyDepth(workPackages, topo)
  for (const wp of workPackages) {
    wp.priority = depthOf(wp, depth)
    // 有未完成前置 → BLOCKED；无前置 → READY
    wp.state = wp.blockedBy.length > 0 ? 'BLOCKED' : wp.state === 'DONE' ? 'DONE' : 'READY'
  }

  // ⑥ 关键路径（步骤 7 / §6.1）
  const capacity = input.capacity ?? { design: 1, code: 1, art: 1, audio: 1, qa: 1 }
  const critical = criticalPath(workPackages, topo, capacity, params)
  const total = workPackages.reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)

  return {
    workPackages,
    totalBaselineWorkUnits: total,
    criticalPathIds: critical.path,
    baselineDurationDays: critical.duration,
  }
}

/** 确定性 WP id（同快照同输入 ⇒ 同 id；TC-01）。 */
export function wpId(
  projectId: string,
  sourceKind: 'instance' | 'contentPack' | 'rework',
  sourceId: string,
  discipline: Discipline | string,
): string {
  return `wp:${projectId}:${sourceKind}:${sourceId}:${String(discipline)}`
}

/** Kahn 拓扑排序；有环返回 null。并列时按 orderIndex 稳定排序（确定性）。 */
export function topologicalOrder(wps: ReadonlyArray<WorkPackage>): string[] | null {
  const indegree = new Map<string, number>()
  const ids = new Set(wps.map((w) => w.workPackageId))
  for (const wp of wps) indegree.set(wp.workPackageId, wp.blockedBy.filter((id) => ids.has(id)).length)
  const order = [...wps].sort((a, b) => a.orderIndex - b.orderIndex)
  const ready = order.filter((w) => (indegree.get(w.workPackageId) ?? 0) === 0).map((w) => w.workPackageId)
  const result: string[] = []
  const byId = new Map(wps.map((w) => [w.workPackageId, w]))
  // 后继由 blockedBy 现算：拆解中步骤 6（拓扑校验）早于 dependents 派生（步骤 5 的派生量）
  const successors = new Map<string, string[]>()
  for (const wp of wps) {
    for (const b of wp.blockedBy) {
      if (!ids.has(b)) continue
      const list = successors.get(b) ?? []
      list.push(wp.workPackageId)
      successors.set(b, list)
    }
  }
  while (ready.length > 0) {
    const id = ready.shift()!
    result.push(id)
    for (const depId of successors.get(id) ?? []) {
      const n = (indegree.get(depId) ?? 0) - 1
      indegree.set(depId, n)
      if (n === 0) ready.push(depId)
    }
    ready.sort((a, b) => (byId.get(a)!.orderIndex - byId.get(b)!.orderIndex))
  }
  return result.length === wps.length ? result : null
}

function dependencyDepth(wps: ReadonlyArray<WorkPackage>, topo: readonly string[]): Map<string, number> {
  const byId = new Map(wps.map((w) => [w.workPackageId, w]))
  const depth = new Map<string, number>()
  for (const id of topo) {
    const wp = byId.get(id)!
    let d = 0
    for (const b of wp.blockedBy) d = Math.max(d, (depth.get(b) ?? 0) + 1)
    depth.set(id, d)
  }
  return depth
}

function depthOf(wp: WorkPackage, depth: Map<string, number>): WorkPackagePriority {
  const d = depth.get(wp.workPackageId) ?? 0
  if (d === 0) return 'P0'
  if (d === 1) return 'P1'
  return 'P2'
}

/**
 * §6.1 关键路径：DAG 上 `duration_wp = baseline / max(ε, Cap_d)` 权重和最大的路径。
 * 并列时按 (orderIndex 字典序) 稳定取先者（确定性）。返回路径与总工期。
 */
export function criticalPath(
  wps: ReadonlyArray<WorkPackage>,
  topo: readonly string[],
  capacity: DisciplineWorkload,
  params: ProjectFormulaParams,
): { path: string[]; duration: number } {
  const byId = new Map(wps.map((w) => [w.workPackageId, w]))
  const dur = new Map<string, number>()
  const best = new Map<string, number>()
  const prev = new Map<string, string | null>()
  for (const id of topo) {
    const wp = byId.get(id)!
    const d = wp.baselineWorkUnits / Math.max(params.epsilon, capacity[wp.discipline] ?? 0)
    dur.set(id, d)
    let bestParent: string | null = null
    let bestVal = 0
    for (const b of wp.blockedBy) {
      const v = best.get(b) ?? 0
      if (v > bestVal || (v === bestVal && bestParent !== null && (byId.get(b)!.orderIndex < byId.get(bestParent)!.orderIndex))) {
        bestVal = v
        bestParent = b
      }
    }
    best.set(id, bestVal + d)
    prev.set(id, bestParent)
  }
  let endId: string | null = null
  let maxVal = -1
  for (const id of topo) {
    const v = best.get(id) ?? 0
    if (v > maxVal) {
      maxVal = v
      endId = id
    }
  }
  const path: string[] = []
  let cursor = endId
  while (cursor !== null) {
    path.push(cursor)
    cursor = prev.get(cursor) ?? null
  }
  path.reverse()
  return { path, duration: maxVal < 0 ? 0 : maxVal }
}
