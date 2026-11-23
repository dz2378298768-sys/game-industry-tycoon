/**
 * Project 执行编排器集成测试。
 * 覆盖 TC-05（唯一快照反证）、TC-06/TC-22（追加预算承诺守恒，场景 A）、TC-07（返工闸门反证）、
 * TC-08（交付闸门 FAIL，R14 保持 READY_TO_DELIVER）、TC-13（成本双算反证）、TC-14（返工成本推进落实）、
 * TC-15/TC-21（场景 B 全链）、TC-17（读档恢复 active 会话）、TC-20（AI 项目无特权）、TC-23（延期持久化）。
 *
 * CODE-03 整改（TASK-P1-CODE-03-REWORK）新增反证：
 *  - R1：闸门单一入参 `{ pass, violations }`，返工/交付各 3 组；矛盾输入输出 PROJ_GATE_INCONSISTENT 诊断；
 *  - R2：newWorkload 必填、学科残缺拒绝、切快照原子（逐 WP snapshotId 断言 + fail-closed 逐字段干净）；
 *  - R3：rebaseline 守恒对传入 W_d(new) 断言；已 DONE 学科新增工作量拒绝；delivered > baseline 单独失败；
 *  - R5：承诺经 ledger.registerCommitment 落注册表；TC-15/TC-22 从账本承诺集合求和；cancelProject 显式释放；
 *  - R9：删除 finishTasks 强制 DONE 捷径，返工链路全部真实日推进（WP 完成点同步置任务 DONE）；
 *  - R10：Cost_est 不含返工 WP（beginRework 前后 Cost_est 不变）；
 *  - R11：返工 WP 按受影响学科生成，未知学科抛 PROJ_REWORK_SCOPE_UNKNOWN，0 分摊学科不生成；
 *  - R13：存档固化 formulaParams，读档强制用存档参数，缺参拒绝；
 *  - R14：交付 FAIL 保持 READY_TO_DELIVER + deliveryFailures/lastDeliveryFailure 审计，不自动建 ReworkSession。
 */
import { describe, it, expect } from 'vitest'
import {
  abandonProject,
  advanceProjectDay,
  archiveProjectExecution,
  beginRework,
  cancelProject,
  cancelRework,
  completeRework,
  createProjectExecution,
  delayLaunch,
  estimateCost,
  evaluateGate,
  isInReworkDisplay,
  markReworkTasksFromWorklogs,
  pauseProject,
  planRework,
  restoreProjectExecution,
  setupBudgetCommitment,
  submitDelivery,
  summarizeProjectExecution,
  topUpBudget,
} from '@domain/value-objects/project-execution-engine'
import {
  checkRemainingInvariant,
  rebaselineWorkPackages,
} from '@domain/value-objects/project-execution-rebaseline'
import { PROJ_ERROR, ProjectError } from '@domain/entities/project-execution/errors'
import type { ExecutionProject, WorkPackage } from '@domain/entities/project-execution'
import type { DisciplineWorkload } from '@domain/value-objects/project-execution-cost-helpers'
import {
  ledgerWithCash,
  makeLedger,
  member,
  params,
  scenarioATeam,
  tc02Decomposition,
  workload,
} from './project-execution-fixtures'

const P = params()

function create(opts: { day?: number; hrb?: number; budget?: number; snapshot?: string } = {}) {
  return createProjectExecution(
    {
      projectId: 'P1',
      companyId: 'C1',
      studioId: 'ST1',
      versionId: 'V1',
      snapshotId: opts.snapshot ?? 'SNAP-1',
      formulaVersion: 'D01-FORMULA-v0.1',
      day: opts.day ?? 0,
      hrb: opts.hrb ?? 0.5,
      budgetCapacityCents: opts.budget ?? 1_000_000,
      availableCashCents: 2_000_000,
      teamRefs: ['e-code-1', 'e-code-2', 'e-art-1', 'e-design-1', 'e-qa-1'],
      decomposition: tc02Decomposition(),
    },
    P,
  )
}

/** 完成到 READY_TO_DELIVER（不走日推进，直接置 DONE，供交付闸门的状态机级测试）。 */
function readyToDeliver(state: ReturnType<typeof create>) {
  const s = {
    ...state,
    workPackages: state.workPackages.map((wp) => ({ ...wp, state: 'DONE' as const, remainingWorkUnits: 0 })),
  }
  s.project = { ...s.project, state: 'READY_TO_DELIVER' }
  return s
}

/** TC-15 / TC-22（R5）：承诺 Σ 从账本承诺注册表求和（禁止再靠 id 末段反解金额自证）。 */
function ledgerCommitmentsSum(
  ledger: ReturnType<typeof makeLedger>,
  s: { project: ExecutionProject },
): number {
  return ledger
    .getCommitments(s.project.companyId, { sourceRef: s.project.projectId })
    .filter((c) => c.state !== 'cancelled')
    .reduce((sum, c) => sum + c.amountCents, 0)
}

describe('立项（SETUP→ACTIVE）', () => {
  it('绑定唯一快照；BudgetCapacity > AvailableCash ⇒ 拒绝（§5.4-1）', () => {
    const s = create()
    expect(s.project.state).toBe('ACTIVE')
    expect(s.project.snapshotId).toBe('SNAP-1')
    expect(() =>
      createProjectExecution(
        {
          projectId: 'P2',
          companyId: 'C1',
          studioId: 'ST1',
          versionId: 'V2',
          snapshotId: 'SNAP-2',
          formulaVersion: 'D01-FORMULA-v0.1',
          day: 0,
          budgetCapacityCents: 3_000_000,
          availableCashCents: 2_000_000,
          decomposition: tc02Decomposition(),
        },
        P,
      ),
    ).toThrow(ProjectError)
  })

  it('Budget_cap = hrb × BudgetCapacity（整数美分），Cost_est 由 W_d 导出', () => {
    const s = create({ hrb: 0.45, budget: 1_000_000 })
    expect(s.project.budgetCapCents).toBe(450_000)
    // tc02 全学科都有工作量：需覆盖全部 5 学科技能的团队才不出现 +∞
    const team = [...scenarioATeam(), member('e-audio-1', { audio: 3 })]
    const cost = estimateCost(s, team, 0, 0.2, 0.1, P)
    expect(Number.isFinite(cost.costEstCents)).toBe(true)
    expect(cost.budgetCapCents).toBe(450_000)
  })

  it('TC-20 AI 企业项目走同一状态机/拆解/成本（无特权、无 qcb 字段）', () => {
    const ai = createProjectExecution(
      {
        projectId: 'AI-P1',
        companyId: 'AI-CO',
        studioId: 'AI-ST',
        versionId: 'V1',
        snapshotId: 'SNAP-AI',
        formulaVersion: 'D01-FORMULA-v0.1',
        day: 3,
        budgetCapacityCents: 800_000,
        availableCashCents: 800_000,
        decomposition: tc02Decomposition({ projectId: 'AI-P1' }),
      },
      P,
    )
    expect(ai.project.state).toBe('ACTIVE')
    expect(ai.workPackages.length).toBeGreaterThan(0)
    const cost = estimateCost(ai, [], 3, 0, 0, P)
    expect(cost.costEstCents).toBe(Number.POSITIVE_INFINITY)
    expect(cost).not.toHaveProperty('qualityCeilingBand')
  })
})

describe('场景 A：追加预算（TC-06 / TC-22 / C2 / R5）', () => {
  it('hrb 0.45→0.55：Budget_cap 上升、账本承诺 Σ 恒等新 Budget_cap、不改现金、W_d/baseline 不变', () => {
    const ledger = ledgerWithCash('C1', 2_000_000)
    let s = create({ hrb: 0.45, budget: 1_000_000 })
    s = setupBudgetCommitment(s, { ledger, day: 0 })
    expect(s.project.commitmentIds).toHaveLength(1)

    const cashBefore = ledger.getCashBalance('C1')
    const baselineBefore = s.workPackages.map((w) => w.baselineWorkUnits)

    s = topUpBudget(s, 0.55, { ledger, day: 5 })
    expect(s.project.budgetCapCents).toBe(550_000)
    expect(s.project.commitmentIds).toHaveLength(2)
    // 承诺不改现金（BR-3）
    expect(ledger.getCashBalance('C1')).toBe(cashBefore)
    // R5：承诺额从账本承诺集合求和：450_000 + 100_000 = 550_000 = 新 Budget_cap（不双算、不超上限）
    const total = ledgerCommitmentsSum(ledger, s)
    expect(total).toBe(550_000)
    expect(total).toBe(s.project.budgetCapCents)
    expect(total).toBeLessThanOrEqual(s.project.budgetCapacityCents)
    // R-PROJ-2：W_d / baseline 不变
    expect(s.workPackages.map((w) => w.baselineWorkUnits)).toEqual(baselineBefore)
  })

  it('R5：setupBudgetCommitment 经 ledger.registerCommitment 落注册表（承诺可查询、amountCents=Budget_cap）', () => {
    const ledger = ledgerWithCash('C1', 2_000_000)
    const s = setupBudgetCommitment(create({ hrb: 0.5, budget: 1_000_000 }), { ledger, day: 0 })
    const cs = ledger.getCommitments('C1', { sourceRef: 'P1' })
    expect(cs).toHaveLength(1)
    expect(cs[0]!.commitmentId).toBe(s.project.commitmentIds[0])
    expect(cs[0]!.amountCents).toBe(500_000)
    expect(cs[0]!.sourceType).toBe('project_budget')
    expect(cs[0]!.state).toBe('committed')
  })

  it('ratio 与 verdict 随 hrb 变化（机制验证；数值对齐规格 §15 见报告 NUMERIC_PENDING_P2）', () => {
    const team = [...scenarioATeam(), member('e-audio-1', { audio: 3 })]
    const s = create({ hrb: 0.45, budget: 1_000_000 })
    const low = estimateCost(s, team, 0, 0.2, 0.1, P)
    const up = topUpBudget(s, 0.55, { ledger: ledgerWithCash('C1', 2_000_000), day: 1 })
    const high = estimateCost(up, team, 0, 0.2, 0.1, P)
    // 交叉比较（非恒真）：hrb 上调 ⇒ Budget_cap 上升 ⇒ ratio 严格下降
    expect(low.ratio).toBeGreaterThan(high.ratio)
    // ratio 与 Budget_cap 成反比的跨字段不变式（期望含外部常量 0.55/0.45，非被测函数内部值）
    expect(low.ratio).toBeCloseTo(high.ratio * (0.55 / 0.45), 6)
    // R12：删除原 `expect(high.verdict).toBe(high.ratio <= 1.2 ? ...)` 恒真断言
    //（期望值由被测函数同一 ratio/阈值推导，等于自证；verdict 数值对齐标 NUMERIC_PENDING_P2）
  })

  it('hrb 只能上调（追加），下调须走缩减范围', () => {
    const s = create({ hrb: 0.6 })
    expect(() => topUpBudget(s, 0.5, { ledger: makeLedger(), day: 1 })).toThrow(ProjectError)
  })

  it('hrb=0（TC-11）：Budget_cap=0，不建零额承诺，ratio=+∞', () => {
    const ledger = ledgerWithCash('C1', 2_000_000)
    let s = create({ hrb: 0, budget: 1_000_000 })
    s = setupBudgetCommitment(s, { ledger, day: 0 })
    expect(s.project.budgetCapCents).toBe(0)
    expect(s.project.commitmentIds).toHaveLength(0)
    expect(ledgerCommitmentsSum(ledger, s)).toBe(0)
    const cost = estimateCost(s, scenarioATeam(), 0, 0, 0, P)
    expect(cost.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(cost.verdict).toBe('need_reduce_scope_or_lower_goal')
  })

  it('hrb 上调到超过 budgetCapacityCents 被拒（不超玩家分配上限）', () => {
    const s = create({ hrb: 0.9 })
    expect(() => topUpBudget(s, 1.2, { ledger: makeLedger(), day: 1 })).toThrow(ProjectError)
  })

  it('R5：cancelProject 显式释放承诺（账本承诺转 cancelled、releasedCents = 全额），状态才转 CANCELLED', () => {
    const ledger = ledgerWithCash('C1', 2_000_000)
    let s = create({ hrb: 0.5, budget: 1_000_000 })
    s = setupBudgetCommitment(s, { ledger, day: 0 })
    s = cancelProject(s, 5, { ledger })
    expect(s.project.state).toBe('CANCELLED')
    const cs = ledger.getCommitments('C1', { sourceRef: 'P1' })
    expect(cs).toHaveLength(1)
    expect(cs[0]!.state).toBe('cancelled')
    expect(cs[0]!.releasedCents).toBe(500_000)
    expect(cs[0]!.realizedCents).toBe(0)
  })
})

describe('日推进与账本（§5.3 / §6.4 / R-PROJ-3）', () => {
  it('逐日提交 project_expense；余额下降 = Σ capacityAppliedCents', () => {
    const ledger = ledgerWithCash('C1', 5_000_000)
    let s = create()
    const before = ledger.getCashBalance('C1')
    const r = advanceProjectDay(s, { day: 1, members: scenarioATeam(), ledger, params: P })
    s = r.state
    expect(r.advance!.logs.length).toBeGreaterThan(0)
    const spent = r.advance!.logs.reduce((sum, l) => sum + l.capacityAppliedCents, 0)
    expect(spent).toBeGreaterThan(0)
    expect(before - ledger.getCashBalance('C1')).toBe(spent)
    expect(s.expenseTxIds).toHaveLength(r.advance!.transactionIds.length)
  })

  it('无团队：推进不产生交易、不抛错、进度停滞（§10 B-2）', () => {
    const ledger = ledgerWithCash('C1', 1_000_000)
    const before = ledger.getCashBalance('C1')
    const r = advanceProjectDay(create(), { day: 1, members: [], ledger, params: P })
    expect(r.advance!.transactionIds).toHaveLength(0)
    expect(ledger.getCashBalance('C1')).toBe(before)
    expect(r.state.project.state).toBe('ACTIVE')
  })

  it('全部 WP 完成 ⇒ READY_TO_DELIVER（真实日推进）', () => {
    const members = [member('c', { code: 5 }), member('d', { design: 5 }), member('a', { art: 5 }), member('u', { audio: 5 }), member('q', { qa: 5 })]
    let s = create()
    for (let day = 1; day <= 200 && s.project.state === 'ACTIVE'; day += 1) {
      s = advanceProjectDay(s, { day, members, params: P }).state
    }
    expect(s.project.state).toBe('READY_TO_DELIVER')
  })

  it('暂停期间不推进；预算耗尽原因可写入', () => {
    const s = pauseProject(create(), 1, 'budget_exhausted')
    const r = advanceProjectDay(s, { day: 2, members: scenarioATeam(), params: P })
    expect(r.advance).toBeNull()
    expect(r.state.worklogs).toHaveLength(0)
    expect(r.state.project.pauseReason).toBe('budget_exhausted')
  })
})

describe('TC-05 反证：唯一快照不被绕过', () => {
  it('执行期 project.snapshotId 恒为立项快照；返工未过闸门时不切换', () => {
    let s = create()
    expect(s.project.snapshotId).toBe('SNAP-1')
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', discipline: 'art', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    s = beginRework(s, plan, 3)
    expect(s.project.snapshotId).toBe('SNAP-1') // 旧快照仍权威
    expect(s.project.state).toBe('ACTIVE') // 无 REWORKING
    expect(isInReworkDisplay(s)).toBe(true) // 呈现标签
    // 返工 WP 指向旧快照
    expect(s.workPackages.filter((w) => w.kind === 'REWORK').every((w) => w.snapshotId === 'SNAP-1')).toBe(true)
    // 推进期间不消费目标草稿
    s = advanceProjectDay(s, { day: 4, members: scenarioATeam(), params: P }).state
    expect(s.project.snapshotId).toBe('SNAP-1')
  })
})

// ===== 返工链路公共夹具（R9：全部真实日推进，无强制 DONE 捷径） =====

const REWORK_INPUT = {
  sessionId: 'RS-1',
  category: 'C' as const,
  affected: [{ instanceId: 'PACK-1', discipline: 'art' as const, oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
  targetDraftVersionId: 'V2',
  targetSnapshotId: 'SNAP-2',
  changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
  day: 3,
  costPerUnit: [20_000],
}

function startRework(s: ReturnType<typeof create>) {
  return beginRework(s, planRework(s, REWORK_INPUT, P), 3)
}

/** 真实日推进到返工 WP 全部 DONE（art 团队产能；上限 120 天防死循环）。 */
function advanceReworkDone(s: ReturnType<typeof startRework>) {
  let cur = s
  for (let day = 4; day <= 124; day += 1) {
    cur = advanceProjectDay(cur, { day, members: [member('a', { art: 5 })], params: P }).state
    const reworkWps = cur.workPackages.filter((wp) => wp.kind === 'REWORK' && wp.state !== 'DEACTIVATED')
    if (reworkWps.length > 0 && reworkWps.every((wp) => wp.state === 'DONE')) return cur
  }
  throw new Error('rework WPs did not complete within 120 days of real advancement')
}

/** completeRework 可守恒通过的 W_d(new)：取当时仍开工的 NORMAL WP 分学科 Σbaseline（每 WP remaining ≥ 0）。 */
function openNormalWorkload(s: { workPackages: ReadonlyArray<WorkPackage> }): DisciplineWorkload {
  const w = workload()
  for (const wp of s.workPackages) {
    if (wp.kind !== 'NORMAL' || wp.state === 'DONE' || wp.state === 'DEACTIVATED') continue
    w[wp.discipline] += wp.baselineWorkUnits
  }
  return w
}

describe('TC-07 反证：返工完成闸门 FAIL ⇒ 不切快照、会话 active、state ACTIVE', () => {
  it('RevalidationGate FAIL（E 级）⇒ switched=false、snapshotId 不变、会话 active', () => {
    const s = advanceReworkDone(startRework(create()))
    const out = completeRework(
      s,
      { day: 10, gate: { pass: false, violations: [{ code: 'E-SLOT', severity: 'E' }] }, newWorkload: workload({ code: 50 }) },
      P,
    )
    expect(out.switched).toBe(false)
    expect(out.state.project.snapshotId).toBe('SNAP-1')
    expect(out.state.project.state).toBe('ACTIVE')
    expect(out.state.reworkSessions[0]!.status).toBe('active')
    expect(out.state.project.reworkSessionId).toBe('RS-1')
    expect(out.gate.pass).toBe(false)
    expect(out.gate.diagnostics).toHaveLength(0)
  })

  it('R1 反证（返工侧②）：pass=false 且 violations 为空 ⇒ 仍不切快照（布尔不可信，独立于违规列表）', () => {
    const s = advanceReworkDone(startRework(create()))
    const out = completeRework(s, { day: 10, gate: { pass: false, violations: [] }, newWorkload: workload({ code: 50 }) }, P)
    expect(out.switched).toBe(false)
    expect(out.gate.pass).toBe(false)
    expect(out.gate.diagnostics).toHaveLength(0)
  })

  it('R1 反证（返工侧③）：gate.pass=true 但 violations 含 E ⇒ fail-closed + PROJ_GATE_INCONSISTENT 诊断', () => {
    const s = advanceReworkDone(startRework(create()))
    const out = completeRework(
      s,
      { day: 10, gate: { pass: true, violations: [{ code: 'E10', severity: 'E' }] }, newWorkload: workload({ code: 50 }) },
      P,
    )
    expect(out.switched).toBe(false)
    expect(out.gate.pass).toBe(false)
    expect(out.gate.diagnostics).toContain(PROJ_ERROR.GATE_INCONSISTENT)
  })

  it('R1 反证（返工侧④）：E 与 W 混合、pass=true ⇒ 仅 E 阻断（W 不阻断）+ 诊断', () => {
    const s = advanceReworkDone(startRework(create()))
    const out = completeRework(
      s,
      {
        day: 10,
        gate: { pass: true, violations: [{ code: 'W04', severity: 'W' }, { code: 'E10', severity: 'E' }] },
        newWorkload: workload({ code: 50 }),
      },
      P,
    )
    expect(out.switched).toBe(false)
    expect(out.gate.violationCodes).toEqual(['W04', 'E10'])
    expect(out.gate.diagnostics).toContain(PROJ_ERROR.GATE_INCONSISTENT)
  })

  it('R9 反证：返工 WP 未完成（任务 PENDING）⇒ 即使闸门 PASS 也不切（需全完成 ∧ 零 E）', () => {
    const out = completeRework(
      startRework(create()),
      { day: 10, gate: { pass: true, violations: [] }, newWorkload: openNormalWorkload(startRework(create())) },
      P,
    )
    expect(out.switched).toBe(false)
    expect(out.state.project.reworkSessionId).toBe('RS-1')
  })

  it('R9 全链：真实日推进完成返工 WP ⇒ ReworkTask 同步 DONE（无手动补丁）；闸门 PASS ⇒ 切快照、逐 WP snapshotId === project.snapshotId（R2 ③）', () => {
    const s = advanceReworkDone(startRework(create()))
    // R9：日推进完成点同步置任务 DONE——从未调用 markReworkTasksFromWorklogs
    expect(s.reworkTasks.every((t) => t.state === 'DONE')).toBe(true)
    expect(s.workPackages.filter((wp) => wp.kind === 'REWORK').every((wp) => wp.state === 'DONE')).toBe(true)
    const newWorkload = openNormalWorkload(s)
    const out = completeRework(s, { day: 10, gate: { pass: true, violations: [{ code: 'W04', severity: 'W' }] }, newWorkload }, P)
    expect(out.switched).toBe(true)
    expect(out.state.project.snapshotId).toBe('SNAP-2')
    expect(out.state.reworkSessions[0]!.status).toBe('completed')
    expect(out.state.project.reworkSessionId).toBeNull()
    expect(isInReworkDisplay(out.state)).toBe(false)
    expect(out.state.project.state).toBe('ACTIVE')
    expect(out.state.project.reworkCount).toBe(1)
    // R2 原子条件②：开工 NORMAL WP 全部指向新快照（不允许半新半旧）
    const openNormal = out.state.workPackages.filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
    expect(openNormal.every((wp) => wp.snapshotId === out.state.project.snapshotId)).toBe(true)
    // R2 原子条件③：Σ 开工 NORMAL baseline == Σ W_d(new)
    const openBaseline = openNormal.filter((wp) => wp.state !== 'DONE').reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
    const targetTotal = (Object.keys(newWorkload) as Array<keyof DisciplineWorkload>).reduce((sum, d) => sum + newWorkload[d], 0)
    expect(openBaseline).toBeCloseTo(targetTotal, 6)
  })

  it('§4.5 撤销返工：旧快照继续生效，返工 WP 停用', () => {
    const s = cancelRework(startRework(create()), 6)
    expect(s.project.snapshotId).toBe('SNAP-1')
    expect(s.reworkSessions[0]!.status).toBe('cancelled')
    expect(s.workPackages.filter((w) => w.kind === 'REWORK').every((w) => w.state === 'DEACTIVATED')).toBe(true)
  })

  it('撤销返工后可再次返工并完成（DEACTIVATED WP 不进入 rebaseline 分摊分母）', () => {
    const cancelled = cancelRework(startRework(create()), 6)
    const s = beginRework(
      cancelled,
      planRework(cancelled, { ...REWORK_INPUT, sessionId: 'RS-2' }, P),
      7,
    )
    const advanced = advanceReworkDone(s)
    const out = completeRework(advanced, { day: 40, gate: { pass: true, violations: [] }, newWorkload: openNormalWorkload(advanced) }, P)
    expect(out.switched).toBe(true)
    expect(out.state.project.snapshotId).toBe('SNAP-2')
  })

  it('A 类不返工（planRework 拒绝）', () => {
    expect(() =>
      planRework(
        create(),
        {
          sessionId: 'RS-A',
          category: 'A',
          affected: [],
          targetDraftVersionId: 'V2',
          targetSnapshotId: 'SNAP-2',
          changes: [{ changeId: 'CH-A', instanceIds: [] }],
          day: 1,
          costPerUnit: [1],
        },
        P,
      ),
    ).toThrow(ProjectError)
  })
})

describe('R11（ADJ-08 §2）：返工 WP 按受影响学科生成，未知学科 fail-closed', () => {
  it('两个受影响学科 ⇒ 生成两个 kind=REWORK WP，各自 baseline = 该学科分摊，Σ = reworkWorkUnits', () => {
    const s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-M',
        category: 'C',
        affected: [
          { instanceId: 'PACK-1', discipline: 'art', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 },
          { instanceId: 'CORE', discipline: 'code', oldWorkUnits: 60, deliveredWorkUnits: 30, newWorkUnits: 40 },
        ],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [
          { changeId: 'CH-ART', instanceIds: ['PACK-1'] },
          { changeId: 'CH-CODE', instanceIds: ['CORE'] },
        ],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    expect(plan.reworkWorkPackages.map((wp) => wp.discipline).sort()).toEqual(['art', 'code'])
    expect(plan.reworkWorkPackages.every((wp) => wp.kind === 'REWORK')).toBe(true)
    const sum = plan.reworkWorkPackages.reduce((acc, wp) => acc + wp.baselineWorkUnits, 0)
    expect(sum).toBeCloseTo(plan.breakdown.reworkWorkUnits, 9)
    expect(plan.tasks).toHaveLength(2)
    // 任务与 WP 一一对应，PENDING 待真实推进
    expect(plan.tasks.every((t) => t.state === 'PENDING' && t.workPackageId !== null)).toBe(true)
    // 每个返工 WP 学科与对应 affected item 一致（不再默认 design）
    for (const item of [{ discipline: 'art' as const }, { discipline: 'code' as const }]) {
      expect(plan.reworkWorkPackages.some((wp) => wp.discipline === item.discipline)).toBe(true)
    }
  })

  it('affected 为空 ⇒ 抛 PROJ_REWORK_SCOPE_UNKNOWN（不静默、不默认 design）', () => {
    expect(() =>
      planRework(
        create(),
        { ...REWORK_INPUT, sessionId: 'RS-E', affected: [] },
        P,
      ),
    ).toThrow(ProjectError)
  })

  it('affected 携带未知学科 ⇒ 抛 PROJ_REWORK_SCOPE_UNKNOWN（禁止默认 design）', () => {
    expect(() =>
      planRework(
        create(),
        {
          ...REWORK_INPUT,
          sessionId: 'RS-U',
          affected: [{ instanceId: 'PACK-1', discipline: 'music' as never, oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        },
        P,
      ),
    ).toThrow(ProjectError)
  })

  it('P3-2：变更量为 0 的学科不生成返工 WP（无 0 baseline WP）', () => {
    const s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-Z',
        category: 'C',
        // design 项 old == new 且已全交付 ⇒ 变更量 0；art 项正常
        affected: [
          { instanceId: 'PACK-1', discipline: 'art', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 },
          { instanceId: 'SUP-A', discipline: 'design', oldWorkUnits: 5, deliveredWorkUnits: 5, newWorkUnits: 5 },
        ],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1', 'SUP-A'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    expect(plan.reworkWorkPackages.map((wp) => wp.discipline)).toEqual(['art'])
    expect(plan.reworkWorkPackages.every((wp) => wp.baselineWorkUnits > 0)).toBe(true)
  })
})

describe('R10（P2-4）：Cost_est 的 W_d 不含返工 WP', () => {
  it('beginRework 前后 Cost_est 不变（返工 WP 不重复计入分母）', () => {
    const team = [...scenarioATeam(), member('e-audio-1', { audio: 3 })]
    const s0 = create()
    const before = estimateCost(s0, team, 0, 0.2, 0.1, P)
    const s1 = startRework(s0)
    expect(s1.workPackages.some((wp) => wp.kind === 'REWORK' && wp.baselineWorkUnits > 0)).toBe(true)
    const after = estimateCost(s1, team, 0, 0.2, 0.1, P)
    expect(after.costEstCents).toBe(before.costEstCents)
    expect(after.ratio).toBe(before.ratio)
  })

  it('返工推进数日后 Cost_est 仍不变（返工 WP 日产出不改写分母）', () => {
    const team = [...scenarioATeam(), member('e-audio-1', { audio: 3 })]
    const s0 = create()
    const before = estimateCost(s0, team, 0, 0.2, 0.1, P)
    const s1 = advanceReworkDone(startRework(s0))
    const after = estimateCost(s1, team, 0, 0.2, 0.1, P)
    expect(after.costEstCents).toBe(before.costEstCents)
  })
})

describe('R3（ADJ-06 §3）：rebaseline 守恒缺口 fail-closed', () => {
  it('反证①：已 DONE 学科新增工作量 ⇒ 抛 PROJ_REBASELINE_UNBALANCED（含学科与缺口量）', () => {
    const doneWp: WorkPackage = {
      workPackageId: 'wp-art-done', projectId: 'P1', snapshotId: 'SNAP-1', sourceRef: {},
      discipline: 'art', workUnits: 50, baselineWorkUnits: 50, remainingWorkUnits: 0, deliveredWorkUnits: 50,
      progress: 1, skillRef: null, requiredSkillLevel: 0, blockedBy: [], dependents: [],
      priority: 'P0', state: 'DONE', kind: 'NORMAL', orderIndex: 0, reworkSessionId: null, reworkMode: null,
    }
    expect(() =>
      rebaselineWorkPackages([doneWp], workload({ art: 80 }), 'SNAP-2'),
    ).toThrow(ProjectError)
    try {
      rebaselineWorkPackages([doneWp], workload({ art: 80 }), 'SNAP-2')
    } catch (e) {
      expect((e as ProjectError).code).toBe(PROJ_ERROR.REBASELINE_UNBALANCED)
      expect((e as Error).message).toContain('art')
      expect((e as Error).message).toContain('80')
    }
  })

  it('反证②：部分完成学科 ⇒ 守恒成立（Σremaining = ΣW_d(new) − Σdelivered，对传入 W_d 断言）', () => {
    const wp: WorkPackage = {
      workPackageId: 'wp-art', projectId: 'P1', snapshotId: 'SNAP-1', sourceRef: {},
      discipline: 'art', workUnits: 80, baselineWorkUnits: 80, remainingWorkUnits: 32, deliveredWorkUnits: 48,
      progress: 0.6, skillRef: null, requiredSkillLevel: 0, blockedBy: [], dependents: [],
      priority: 'P0', state: 'READY', kind: 'NORMAL', orderIndex: 0, reworkSessionId: null, reworkMode: null,
    }
    const reb = rebaselineWorkPackages([wp], workload({ art: 50 }), 'SNAP-2')
    const rebWp = reb.workPackages[0]!
    expect(rebWp.baselineWorkUnits).toBeCloseTo(50, 9)
    expect(rebWp.remainingWorkUnits).toBeCloseTo(2, 9)
    expect(checkRemainingInvariant(reb, workload({ art: 50 }))).toBe(true)
  })

  it('P3-4 反证：delivered > baseline ⇒ checkRemainingInvariant 单独失败（不得用 min 掩盖）', () => {
    const overDelivered: WorkPackage = {
      workPackageId: 'wp-over', projectId: 'P1', snapshotId: 'SNAP-1', sourceRef: {},
      discipline: 'code', workUnits: 10, baselineWorkUnits: 10, remainingWorkUnits: 0, deliveredWorkUnits: 15,
      progress: 1.5, skillRef: null, requiredSkillLevel: 0, blockedBy: [], dependents: [],
      priority: 'P0', state: 'READY', kind: 'NORMAL', orderIndex: 0, reworkSessionId: null, reworkMode: null,
    }
    const reb = rebaselineWorkPackages([overDelivered], workload({ code: 10 }), 'SNAP-2')
    expect(checkRemainingInvariant(reb, workload({ code: 10 }))).toBe(false)
  })

  it('TC-13：Σremaining = ΣW_d(new) − Σdelivered，返工 WP 不计入新 baseline（多学科守恒）', () => {
    const mkWp = (id: string, d: WorkPackage['discipline'], baseline: number, delivered: number): WorkPackage => ({
      workPackageId: id, projectId: 'P1', snapshotId: 'SNAP-1', sourceRef: {},
      discipline: d, workUnits: baseline, baselineWorkUnits: baseline,
      remainingWorkUnits: baseline - delivered, deliveredWorkUnits: delivered,
      progress: baseline > 0 ? delivered / baseline : 0, skillRef: null, requiredSkillLevel: 0,
      blockedBy: [], dependents: [], priority: 'P0', state: 'READY', kind: 'NORMAL', orderIndex: 0, reworkSessionId: null, reworkMode: null,
    })
    // completeRework 时返工 WP 已由真实日推进置 DONE（R9 前置），此处同口径
    const reworkWp: WorkPackage = {
      ...mkWp('wp-rework', 'art', 9, 9),
      kind: 'REWORK',
      state: 'DONE',
      remainingWorkUnits: 0,
      reworkSessionId: 'RS-1',
    }
    const wps = [
      mkWp('wp-a', 'art', 80, 48),
      mkWp('wp-b', 'code', 92, 0),
      mkWp('wp-c', 'design', 24, 0),
      mkWp('wp-d', 'audio', 6, 0),
      mkWp('wp-e', 'qa', 19, 0),
      reworkWp,
    ]
    const newWorkload = workload({ code: 92, design: 24, art: 50, audio: 6, qa: 19 })
    const reb = rebaselineWorkPackages(wps, newWorkload, 'SNAP-2')
    // 守恒成立：Σremaining(开工 WP) == ΣW_d(new) − Σdelivered(承载 WP)；返工 WP（已 DONE）不计入
    expect(checkRemainingInvariant(reb, newWorkload)).toBe(true)
    const liveNormal = reb.workPackages.filter((wp) => wp.kind === 'NORMAL' && wp.state !== 'DEACTIVATED')
    const sumBaseline = liveNormal.filter((wp) => wp.state !== 'DONE').reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
    expect(sumBaseline).toBeCloseTo(191, 9) // ΣW_d(new) = 92+24+50+6+19
    // 返工 WP 归档、不再产出
    const rework = reb.workPackages.filter((wp) => wp.kind === 'REWORK')
    expect(rework.every((w) => w.state === 'DONE' && w.remainingWorkUnits === 0)).toBe(true)
    // 返工 WP 保留旧快照引用（其成本属旧快照口径，不指认新快照）
    expect(rework.every((w) => w.snapshotId === 'SNAP-1')).toBe(true)
  })
})

describe('R2（P1-1）：切快照必填参数与原子性', () => {
  it('反证①：newWorkload 缺参 ⇒ 抛 PROJ_SNAPSHOT_SWITCH_BLOCKED（类型必填之外的运行时兜底）', () => {
    const s = advanceReworkDone(startRework(create()))
    expect(() =>
      completeRework(
        s,
        { day: 10, gate: { pass: true, violations: [] }, newWorkload: undefined as unknown as DisciplineWorkload },
        P,
      ),
    ).toThrow(ProjectError)
    try {
      completeRework(s, { day: 10, gate: { pass: true, violations: [] }, newWorkload: undefined as unknown as DisciplineWorkload }, P)
    } catch (e) {
      expect((e as ProjectError).code).toBe(PROJ_ERROR.SNAPSHOT_SWITCH_BLOCKED)
    }
  })

  it('反证②：newWorkload 学科残缺（缺一个学科）⇒ 抛 PROJ_SNAPSHOT_SWITCH_BLOCKED（拒绝半新半旧）', () => {
    const s = advanceReworkDone(startRework(create()))
    const partial = workload({ code: 82, design: 34, art: 30, audio: 6 }) as DisciplineWorkload
    delete (partial as Partial<DisciplineWorkload>).qa
    expect(() =>
      completeRework(s, { day: 10, gate: { pass: true, violations: [] }, newWorkload: partial }, P),
    ).toThrow(ProjectError)
  })

  it('fail-closed 干净性：REBASELINE_UNBALANCED 抛出后，project 与全部 WP 与调用前逐字段深比较相等', () => {
    const s = advanceReworkDone(startRework(create()))
    const before = JSON.parse(JSON.stringify(s)) as typeof s
    // art 目标压到 1 ⇒ 开工 art WP 的 newBaseline(≈0.33) < 已交付 ⇒ 守恒失败 ⇒ 整体回滚
    const badWorkload = workload({ code: 82, design: 34, art: 1, audio: 6, qa: 14 })
    expect(() =>
      completeRework(s, { day: 10, gate: { pass: true, violations: [] }, newWorkload: badWorkload }, P),
    ).toThrow(ProjectError)
    const after = JSON.parse(JSON.stringify(s)) as typeof s
    expect(after).toEqual(before)
  })
})

describe('TC-14：返工成本逐日落实（真实日推进）', () => {
  it('提交返工不锁死 actual；逐日 REWORK DailyOutput 累加 actualCents，一次只计一次', () => {
    const ledger = ledgerWithCash('C1', 10_000_000)
    let s = startRework(create())
    expect(s.reworkSessions[0]!.costEstimate.actualCents).toBe(0) // 不锁死
    expect(s.reworkSessions[0]!.costEstimate.lowCents).toBeGreaterThan(0)

    // R11：返工 WP 学科 = 受影响学科（art），不再默认 design
    const reworkWp = s.workPackages.find((w) => w.kind === 'REWORK')!
    expect(reworkWp.discipline).toBe('art')
    // 返工 WP 为 P0，先于 NORMAL WP 派工（同优先级时按 orderIndex 亦更晚者先，此处 P0 必胜）
    const advanced = advanceProjectDay(s, { day: 4, members: [member('a', { art: 5 })], params: P })
    s = advanced.state
    const reworkLogs = s.worklogs.filter((l) => l.reworkMode !== null)
    expect(reworkLogs.length).toBeGreaterThan(0)
    expect(reworkLogs.every((l) => l.workPackageId === reworkWp.workPackageId)).toBe(true)
    const actual = s.reworkSessions[0]!.costEstimate.actualCents
    expect(actual).toBe(reworkLogs.reduce((sum, l) => sum + l.capacityAppliedCents, 0))
    expect(actual).toBeGreaterThan(0)

    // 再推进一天：actual 单调累加，无重复计当日同一日志
    const again = advanceProjectDay(s, { day: 5, members: [member('a', { art: 5 }), member('a2', { art: 5 })], params: P }).state
    const day5 = again.worklogs.filter((l) => l.day === 5 && l.reworkMode !== null)
    expect(again.reworkSessions[0]!.costEstimate.actualCents).toBeCloseTo(
      actual + day5.reduce((sum, l) => sum + l.capacityAppliedCents, 0),
      6,
    )
    void ledger
  })

  it('返工推进逐日提交账本：REWORK_SUNK 语义（project_expense + reworkMode 日志），actualCents 与现金流出同口径', () => {
    const ledger = ledgerWithCash('C1', 10_000_000)
    let s = startRework(create())
    const cashBefore = ledger.getCashBalance('C1')
    s = advanceProjectDay(s, { day: 4, members: [member('a', { art: 5 })], ledger, params: P }).state
    const reworkLogs = s.worklogs.filter((l) => l.reworkMode !== null)
    const spent = reworkLogs.reduce((sum, l) => sum + l.capacityAppliedCents, 0)
    expect(spent).toBeGreaterThan(0)
    expect(s.reworkSessions[0]!.costEstimate.actualCents).toBe(spent)
    expect(cashBefore - ledger.getCashBalance('C1')).toBe(spent)
    // 交易类别为 project_expense、referenceId 指向返工 WP、来源 system_auto
    const tx = ledger.getAllTransactions().find((t) => t.referenceId === reworkLogs[0]!.workPackageId)
    expect(tx).toBeDefined()
    expect(tx!.category).toBe('project_expense')
    expect(tx!.amountCents).toBe(-spent)
    expect(tx!.source).toBe('system_auto')
  })

  it('markReworkTasksFromWorklogs：WP DONE ⇒ 任务 DONE（公开补偿同步，供读档路径），未完成的不动', () => {
    const s = startRework(create())
    expect(s.reworkTasks.every((t) => t.state === 'PENDING')).toBe(true)
    const synced = markReworkTasksFromWorklogs(s)
    expect(synced.reworkTasks.every((t) => t.state === 'PENDING')).toBe(true) // WP 未完成 ⇒ 不派生
    const done = markReworkTasksFromWorklogs({
      ...s,
      workPackages: s.workPackages.map((wp) => (wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const } : wp)),
    })
    expect(done.reworkTasks.every((t) => t.state === 'DONE')).toBe(true)
  })
})

describe('TC-08 交付闸门 FAIL ⇒ 保持 READY_TO_DELIVER、审计失败、不生成 Build（R14 / ADJ-08 §1.3）', () => {
  it('反证（交付侧①）：E 级违规 ⇒ completed=false、builds 空、state 仍 READY_TO_DELIVER、deliveryFailures/lastDeliveryFailure 落账、不自动建 ReworkSession', () => {
    const s0 = readyToDeliver(create())
    const out = submitDelivery(s0, {
      day: 20,
      gate: { pass: false, violations: [{ code: 'E-DEFECT', severity: 'E' }] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(out.completed).toBe(false)
    expect(out.build).toBeNull()
    expect(out.state.builds).toHaveLength(0)
    // R14：不再退回 ACTIVE（研发工作已做完，退回会误导日推进产能分配）
    expect(out.state.project.state).toBe('READY_TO_DELIVER')
    expect(out.state.project.deliveryFailures).toBe(1)
    expect(out.state.project.lastDeliveryFailure).toEqual({
      day: 20,
      reasonCodes: ['E-DEFECT'],
      eViolations: [{ code: 'E-DEFECT', severity: 'E' }],
    })
    // 不自动建 ReworkSession（返工是玩家决策）
    expect(out.state.reworkSessions).toHaveLength(0)
    expect(out.state.project.reworkSessionId).toBeNull()
    // 权威快照不变
    expect(out.state.project.snapshotId).toBe('SNAP-1')
  })

  it('反证（交付侧②）：pass=false 且无违规 ⇒ 同样阻断 + 失败审计（eViolations 为空数组）', () => {
    const out = submitDelivery(readyToDeliver(create()), {
      day: 20,
      gate: { pass: false, violations: [] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(out.completed).toBe(false)
    expect(out.state.project.state).toBe('READY_TO_DELIVER')
    expect(out.state.project.deliveryFailures).toBe(1)
    expect(out.state.project.lastDeliveryFailure!.eViolations).toEqual([])
    expect(out.diagnostics).toHaveLength(0)
  })

  it('反证（交付侧③）：矛盾输入 pass=true + E 级 ⇒ 拒绝交付 + PROJ_GATE_INCONSISTENT 诊断（不改变 fail-closed）', () => {
    const out = submitDelivery(readyToDeliver(create()), {
      day: 20,
      gate: { pass: true, violations: [{ code: 'E10', severity: 'E' }] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(out.completed).toBe(false)
    expect(out.state.project.state).toBe('READY_TO_DELIVER')
    expect(out.diagnostics).toContain(PROJ_ERROR.GATE_INCONSISTENT)
  })

  it('连续 FAIL ⇒ deliveryFailures 累加；FAIL 后再次提交 PASS ⇒ COMPLETED（无次数上限）', () => {
    const s0 = readyToDeliver(create())
    const fail1 = submitDelivery(s0, {
      day: 20,
      gate: { pass: false, violations: [{ code: 'E-DEFECT', severity: 'E' }] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    const fail2 = submitDelivery(fail1.state, {
      day: 21,
      gate: { pass: false, violations: [{ code: 'E-REGRESS', severity: 'E' }] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(fail2.state.project.deliveryFailures).toBe(2)
    expect(fail2.state.project.lastDeliveryFailure!.reasonCodes).toEqual(['E-REGRESS'])
    const pass = submitDelivery(fail2.state, {
      day: 22,
      gate: { pass: true, violations: [] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 0,
      deliveredTier: 1,
    })
    expect(pass.completed).toBe(true)
    expect(pass.state.project.state).toBe('COMPLETED')
    expect(pass.state.builds).toHaveLength(1)
  })

  it('非 READY_TO_DELIVER 提交交付被拒', () => {
    expect(() =>
      submitDelivery(create(), {
        day: 1,
        gate: { pass: true, violations: [] },
        versionLabel: '1.0',
        deliveryForm: 'full',
        actualCostCents: 0,
        deliveredTier: 1,
      }),
    ).toThrow(ProjectError)
  })
})

describe('TC-17 读档：active 返工会话恢复，snapshotId 仍指旧权威（R13 存档含参数快照）', () => {
  it('存档（含 formulaParams）→ 反序列化 → 读档 → 真实日推进 → 闸门 PASS 后切快照', () => {
    const s = startRework(create())
    const archived = archiveProjectExecution(s, P)
    expect(archived.formulaParams.projectFormulaVersion).toBe(P.projectFormulaVersion)
    const round = JSON.parse(JSON.stringify(archived)) as typeof archived
    const restored = restoreProjectExecution(round, 4)
    expect(restored.project.snapshotId).toBe('SNAP-1')
    expect(restored.reworkSessions[0]!.status).toBe('active')
    expect(restored.reworkSessions[0]!.targetDraftVersionId).toBe('V2')
    expect(restored.reworkSessions[0]!.changeIds).toEqual(['CH-1'])
    const advanced = advanceReworkDone(restored)
    const out = completeRework(advanced, { day: 40, gate: { pass: true, violations: [] }, newWorkload: openNormalWorkload(advanced) }, P)
    expect(out.state.project.snapshotId).toBe('SNAP-2')
  })
})

describe('TC-23 延期持久化：只改排期不改 W_d；读档后延期不丢失', () => {
  it('launchDelayDays 累加并受上限约束；baseline 不变', () => {
    const s = create({ day: 0 })
    const baseline = s.workPackages.map((w: WorkPackage) => w.baselineWorkUnits)
    const p1 = delayLaunch({ ...s, project: { ...s.project, plannedLaunchDay: 100 } }, 115, P)
    expect(p1.launchDelayDays).toBe(15)
    expect(p1.plannedLaunchDay).toBe(115)
    const p2 = delayLaunch({ ...s, project: p1 }, p1.plannedLaunchDay! + 10, P)
    expect(p2.launchDelayDays).toBe(25)
    expect(s.workPackages.map((w) => w.baselineWorkUnits)).toEqual(baseline)
    // 上限
    const cap = delayLaunch({ ...s, project: { ...p1, plannedLaunchDay: 115 } }, 115 + 10_000, P)
    expect(cap.launchDelayDays).toBe(P.launchDelayMaxDays)
    // R13：读档走存档投影（含 formulaParams），延期字段不丢
    const restored = restoreProjectExecution(
      JSON.parse(JSON.stringify(archiveProjectExecution({ ...s, project: p2 }, P))),
      200,
    )
    expect(restored.project.launchDelayDays).toBe(25)
    expect(restored.project.plannedLaunchDay).toBe(125)
  })
})

describe('场景 B 全链（TC-21）：真实日推进 → 闸门 PASS → 切快照 → Build', () => {
  it('缩减 tier 3→2：C 类返工 18 units / 9 rework units / 正沉没 → 闸门 PASS → 切快照 → Build', () => {
    // 与 §6.5 复现同口径：art 旧 80、新 50、progress=0.6、W_total=100
    const s0 = create({ hrb: 0.45 })
    // §6.5 复现口径：单内容包 art 80（W_total=100），已交付 48（progress=0.6），新 W_art=50
    const artWp = s0.workPackages.find((w) => w.discipline === 'art')!
    let s = {
      ...s0,
      workPackages: s0.workPackages.map((wp) =>
        wp.workPackageId === artWp.workPackageId
          ? { ...wp, workUnits: 80, baselineWorkUnits: 80, deliveredWorkUnits: 48, remainingWorkUnits: 32 }
          : { ...wp, workUnits: wp.workUnits === 0 ? 0 : (wp.baselineWorkUnits / s0.workPackages.reduce((x, w) => x + w.baselineWorkUnits, 0)) * 20 },
      ),
    }
    // 归一到 W_total = 100（80 + 20）
    s = { ...s, workPackages: s.workPackages.map((wp) =>
      wp.workPackageId === artWp.workPackageId
        ? wp
        : { ...wp, workUnits: wp.workUnits, baselineWorkUnits: wp.workUnits, remainingWorkUnits: wp.workUnits, deliveredWorkUnits: 0 },
    ) }
    const plan = planRework(
      s,
      {
        sessionId: 'RS-B',
        category: 'C',
        affected: [{ instanceId: artWp.sourceRef.contentPackId ?? 'PACK-1', discipline: 'art', oldWorkUnits: 80, deliveredWorkUnits: 48, newWorkUnits: 50 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-CUT', instanceIds: ['PACK-1'] }],
        day: 6,
        costPerUnit: [20_000],
      },
      P,
    )
    expect(plan.breakdown.changeWorkUnits).toBeCloseTo(18, 9)
    expect(plan.breakdown.mode).toBe('partial')
    expect(plan.breakdown.reworkWorkUnits).toBeCloseTo(9, 9)
    expect(plan.breakdown.sunkWorkUnits).toBeGreaterThan(0)
    expect(plan.session.costEstimate.lowCents).toBeGreaterThan(0)
    s = beginRework(s, plan, 6)
    expect(s.project.reworkCount).toBe(1)
    // R9：真实日推进完成返工 WP（art 产能；重任务 9 units）
    let cur = s
    for (let day = 7; day <= 126; day += 1) {
      cur = advanceProjectDay(cur, { day, members: [member('a', { art: 5 })], params: P }).state
      const reworkWps = cur.workPackages.filter((wp) => wp.kind === 'REWORK' && wp.state !== 'DEACTIVATED')
      if (reworkWps.every((wp) => wp.state === 'DONE')) break
    }
    expect(cur.reworkTasks.every((t) => t.state === 'DONE')).toBe(true)
    const done = completeRework(cur, { day: 40, gate: { pass: true, violations: [] }, newWorkload: openNormalWorkload(cur) }, P)
    expect(done.switched).toBe(true)
    expect(done.state.project.snapshotId).toBe('SNAP-2')
    const ready = readyToDeliver(done.state)
    const delivered = submitDelivery(ready, {
      day: 42,
      gate: { pass: true, violations: [] },
      versionLabel: '1.0',
      deliveryForm: 'full',
      actualCostCents: 123_456,
      deliveredTier: 2,
    })
    expect(delivered.completed).toBe(true)
    expect(delivered.build!.snapshotId).toBe('SNAP-2')
    expect(delivered.state.project.state).toBe('COMPLETED')
  })
})

describe('R1：evaluateGate 唯一判定（单测，返工/交付共用）', () => {
  it('pass=true 且零 E ⇒ gatePass=true；W 级不阻断', () => {
    const g = evaluateGate({ pass: true, violations: [{ code: 'W04', severity: 'W' }] })
    expect(g.gatePass).toBe(true)
    expect(g.diagnostics).toHaveLength(0)
    expect(g.violationCodes).toEqual(['W04'])
  })
  it('pass=true 但含 E ⇒ gatePass=false + PROJ_GATE_INCONSISTENT 诊断（矛盾输入告警）', () => {
    const g = evaluateGate({ pass: true, violations: [{ code: 'E10', severity: 'E' }, { code: 'W1', severity: 'W' }] })
    expect(g.gatePass).toBe(false)
    expect(g.diagnostics).toEqual([PROJ_ERROR.GATE_INCONSISTENT])
    expect(g.violationCodes).toEqual(['E10', 'W1'])
  })
  it('pass=false ⇒ gatePass=false（无论违规列表），无矛盾诊断', () => {
    const g = evaluateGate({ pass: false, violations: [{ code: 'W1', severity: 'W' }] })
    expect(g.gatePass).toBe(false)
    expect(g.diagnostics).toHaveLength(0)
  })
})

describe('汇总视图（§8.4 玩家可见解释）', () => {
  it('分学科进度向量、瓶颈、返工标签，无综合百分比字段', () => {
    const v = summarizeProjectExecution(create(), scenarioATeam(), 0, P)
    expect(v.state).toBe('ACTIVE')
    expect(v.reworkLabel).toBe(false)
    expect(v.bottleneck).not.toBeNull()
    expect(v).not.toHaveProperty('overallProgress')
    expect(Object.keys(v.progressVector).sort()).toEqual(['art', 'audio', 'code', 'design', 'qa'])
  })
})

describe('取消/放弃后不再推进', () => {
  it('CANCELLED 项目推进无效果；ABANDONED 后 cancel 抛错', () => {
    const c = cancelProject(create(), 5)
    const r = advanceProjectDay(c, { day: 6, members: scenarioATeam(), params: P })
    expect(r.advance).toBeNull()
    const ab = abandonProject(create(), 5)
    expect(() => cancelProject(ab, 6)).toThrow(ProjectError)
  })
})
