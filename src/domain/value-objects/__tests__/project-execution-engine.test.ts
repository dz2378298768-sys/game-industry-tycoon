/**
 * Project 执行编排器集成测试。
 * 覆盖 TC-05（唯一快照反证）、TC-06/TC-22（追加预算承诺守恒，场景 A）、TC-07（返工闸门反证）、
 * TC-08（交付闸门 FAIL）、TC-13（成本双算反证）、TC-14（返工成本推进落实）、TC-15/TC-21（场景 B 全链）、
 * TC-17（读档恢复 active 会话）、TC-20（AI 项目无特权）、TC-23（延期持久化）。
 */
import { describe, it, expect } from 'vitest'
import {
  abandonProject,
  advanceProjectDay,
  beginRework,
  cancelProject,
  cancelRework,
  completeRework,
  createProjectExecution,
  delayLaunch,
  estimateCost,
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
import { ProjectError } from '@domain/entities/project-execution/errors'
import type { ExecutionProject, WorkPackage } from '@domain/entities/project-execution'
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

/** 完成到 READY_TO_DELIVER（不走日推进，直接置 DONE，供交付闸门测试）。 */
function readyToDeliver(state: ReturnType<typeof create>) {
  const s = {
    ...state,
    workPackages: state.workPackages.map((wp) => ({ ...wp, state: 'DONE' as const, remainingWorkUnits: 0 })),
  }
  s.project = { ...s.project, state: 'READY_TO_DELIVER' }
  return s
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

describe('场景 A：追加预算（TC-06 / TC-22 / C2）', () => {
  it('hrb 0.45→0.55：Budget_cap 上升、承诺 Σ 恒等新 Budget_cap、不改现金、W_d/baseline 不变', () => {
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
    // 承诺额：450_000 + 100_000 = 550_000 = 新 Budget_cap（不双算、不超上限）
    const total = commitmentsSum(s)
    expect(total).toBe(550_000)
    expect(total).toBe(s.project.budgetCapCents)
    expect(total).toBeLessThanOrEqual(s.project.budgetCapacityCents)
    // R-PROJ-2：W_d / baseline 不变
    expect(s.workPackages.map((w) => w.baselineWorkUnits)).toEqual(baselineBefore)
  })

  it('ratio 与 verdict 随 hrb 变化：0.45 时 ratio>1.2，0.55 时 ratio≈1.1 区域', () => {
    const team = [...scenarioATeam(), member('e-audio-1', { audio: 3 })]
    const s = create({ hrb: 0.45, budget: 1_000_000 })
    const low = estimateCost(s, team, 0, 0.2, 0.1, P)
    const up = topUpBudget(s, 0.55, { ledger: makeLedger(), day: 1 })
    const high = estimateCost(up, team, 0, 0.2, 0.1, P)
    expect(low.ratio).toBeGreaterThan(high.ratio)
    expect(low.ratio).toBeCloseTo(high.ratio * (0.55 / 0.45), 6)
    expect(high.verdict).toBe(high.ratio <= 1.2 ? (high.ratio <= 1.0 ? 'feasible' : 'need_more_budget_or_delay') : 'need_reduce_scope_or_lower_goal')
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
    const cost = estimateCost(s, scenarioATeam(), 0, 0, 0, P)
    expect(cost.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(cost.verdict).toBe('need_reduce_scope_or_lower_goal')
  })

  it('hrb 上调到超过 budgetCapacityCents 被拒（不超玩家分配上限）', () => {
    const s = create({ hrb: 0.9 })
    expect(() => topUpBudget(s, 1.2, { ledger: makeLedger(), day: 1 })).toThrow(ProjectError)
  })
})

function commitmentsSum(s: { project: ExecutionProject }): number {
  // 承诺 id 编码了金额（deterministicId 末段），用于守恒断言
  return s.project.commitmentIds.reduce((sum, id) => sum + Number(id.split(':').pop()), 0)
}

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

  it('全部 WP 完成 ⇒ READY_TO_DELIVER', () => {
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
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
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

describe('TC-07 反证：返工完成闸门 FAIL ⇒ 不切快照、会话 active、state ACTIVE', () => {
  function started() {
    const s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    return beginRework(s, plan, 3)
  }

  /** 推进到返工 WP 完成（用大产能 + 强制完成）。 */
  function finishTasks(s: ReturnType<typeof started>) {
    return markReworkTasksFromWorklogs({
      ...s,
      workPackages: s.workPackages.map((wp) =>
        wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const, remainingWorkUnits: 0 } : wp,
      ),
    })
  }

  it('RevalidationGate FAIL（E 级）⇒ switched=false、snapshotId 不变、会话 active', () => {
    const s = finishTasks(started())
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
  })

  it('gate.pass=true 但含 E 级 ⇒ 仍 fail-closed（不信任布尔，严格零 E）', () => {
    const s = finishTasks(started())
    const out = completeRework(s, { day: 10, gate: { pass: true, violations: [{ code: 'E10', severity: 'E' }] } }, P)
    expect(out.switched).toBe(false)
  })

  it('返工任务未全部完成 ⇒ 即使闸门 PASS 也不切（需全完成 ∧ 零 E）', () => {
    const out = completeRework(
      started(),
      { day: 10, gate: { pass: true, violations: [] }, newWorkload: workload({ code: 50 }) },
      P,
    )
    expect(out.switched).toBe(false)
  })

  it('闸门 PASS ⇒ 切快照 → 新、会话 completed、标签消失、state 仍 ACTIVE', () => {
    const s = finishTasks(started())
    const out = completeRework(
      s,
      {
        day: 10,
        gate: { pass: true, violations: [{ code: 'W04', severity: 'W' }] },
        newWorkload: workload({ code: 100, design: 30, art: 50, audio: 6, qa: 14 }),
      },
      P,
    )
    expect(out.switched).toBe(true)
    expect(out.state.project.snapshotId).toBe('SNAP-2')
    expect(out.state.reworkSessions[0]!.status).toBe('completed')
    expect(out.state.project.reworkSessionId).toBeNull()
    expect(isInReworkDisplay(out.state)).toBe(false)
    expect(out.state.project.state).toBe('ACTIVE')
    expect(out.state.project.reworkCount).toBe(1)
  })

  it('§4.5 撤销返工：旧快照继续生效，返工 WP 停用', () => {
    const s = cancelRework(started(), 6)
    expect(s.project.snapshotId).toBe('SNAP-1')
    expect(s.reworkSessions[0]!.status).toBe('cancelled')
    expect(s.workPackages.filter((w) => w.kind === 'REWORK').every((w) => w.state === 'DEACTIVATED')).toBe(true)
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

describe('TC-14 / TC-13：返工成本逐日落实且不双算', () => {
  it('提交返工不锁死 actual；逐日 REWORK DailyOutput 累加 actualCents，一次只计一次', () => {
    const ledger = ledgerWithCash('C1', 10_000_000)
    let s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    s = beginRework(s, plan, 3)
    expect(s.reworkSessions[0]!.costEstimate.actualCents).toBe(0) // 不锁死
    expect(s.reworkSessions[0]!.costEstimate.lowCents).toBeGreaterThan(0)

    const reworkWp = s.workPackages.find((w) => w.kind === 'REWORK')!
    expect(reworkWp.discipline).toBe('design')
    // 返工 WP 为 P0，先于 NORMAL WP 派工（同优先级时按 orderIndex 亦更晚者先，此处 P0 必胜）
    const advanced = advanceProjectDay(s, { day: 4, members: [member('d', { design: 5 })], params: P })
    s = advanced.state
    const reworkLogs = s.worklogs.filter((l) => l.reworkMode !== null)
    expect(reworkLogs.length).toBeGreaterThan(0)
    expect(reworkLogs.every((l) => l.workPackageId === reworkWp.workPackageId)).toBe(true)
    const actual = s.reworkSessions[0]!.costEstimate.actualCents
    expect(actual).toBe(reworkLogs.reduce((sum, l) => sum + l.capacityAppliedCents, 0))
    expect(actual).toBeGreaterThan(0)

    // 再推进一天：actual 单调累加，无重复计当日同一日志
    const again = advanceProjectDay(s, { day: 5, members: [member('d', { design: 5 }), member('d2', { design: 5 })], params: P }).state
    const day5 = again.worklogs.filter((l) => l.day === 5 && l.reworkMode !== null)
    expect(again.reworkSessions[0]!.costEstimate.actualCents).toBeCloseTo(
      actual + day5.reduce((sum, l) => sum + l.capacityAppliedCents, 0),
      6,
    )
    void ledger
  })

  it('返工推进逐日提交账本：REWORK_SUNK 语义（project_expense + reworkMode 日志），actualCents 与现金流出同口径', () => {
    const ledger = ledgerWithCash('C1', 10_000_000)
    let s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    s = beginRework(s, plan, 3)
    const cashBefore = ledger.getCashBalance('C1')
    s = advanceProjectDay(s, { day: 4, members: [member('d', { design: 5 })], ledger, params: P }).state
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

  it('TC-13 rebaseline：Σremaining = ΣW_d(new) − Σdelivered，返工 WP 不计入新 baseline', () => {
    let s = create()
    // 部分完成
    s.workPackages = s.workPackages.map((wp, i) => ({
      ...wp,
      deliveredWorkUnits: i === 0 ? wp.workUnits * 0.5 : 0,
      remainingWorkUnits: i === 0 ? wp.workUnits * 0.5 : wp.workUnits,
    }))
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    s = beginRework(s, plan, 3)
    s = markReworkTasksFromWorklogs({
      ...s,
      workPackages: s.workPackages.map((wp) => (wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const, remainingWorkUnits: 0 } : wp)),
    })
    const out = completeRework(
      s,
      { day: 10, gate: { pass: true, violations: [] }, newWorkload: workload({ code: 95, design: 28, art: 48, audio: 6, qa: 13 }) },
      P,
    )
    expect(out.switched).toBe(true)
    const live = out.state.workPackages.filter((wp) => wp.kind === 'NORMAL')
    const sumBaseline = live.reduce((sum, wp) => sum + wp.baselineWorkUnits, 0)
    const sumDelivered = live.reduce((sum, wp) => sum + Math.min(wp.deliveredWorkUnits, wp.baselineWorkUnits), 0)
    const sumRemaining = live.reduce((sum, wp) => sum + wp.remainingWorkUnits, 0)
    expect(sumBaseline).toBeCloseTo(190, 9) // ΣW_d(new)
    expect(sumRemaining).toBeCloseTo(sumBaseline - sumDelivered, 9)
    // 返工 WP 不再产出
    const rework = out.state.workPackages.filter((wp) => wp.kind === 'REWORK')
    expect(rework.every((w) => w.state === 'DONE' && w.remainingWorkUnits === 0)).toBe(true)
  })
})

describe('场景 B 全链（TC-21）', () => {
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
        affected: [{ instanceId: artWp.sourceRef.contentPackId ?? 'PACK-1', oldWorkUnits: 80, deliveredWorkUnits: 48, newWorkUnits: 50 }],
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
    s = markReworkTasksFromWorklogs({
      ...s,
      workPackages: s.workPackages.map((wp) => (wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const, remainingWorkUnits: 0 } : wp)),
    })
    const done = completeRework(s, { day: 9, gate: { pass: true, violations: [] }, newWorkload: workload({ code: 92, design: 24, art: 50, audio: 6, qa: 19 }) }, P)
    expect(done.switched).toBe(true)
    expect(done.state.project.snapshotId).toBe('SNAP-2')
    const ready = readyToDeliver(done.state)
    const delivered = submitDelivery(ready, {
      day: 12,
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

describe('TC-08 交付闸门 FAIL ⇒ 阻断 COMPLETED、不生成 Build、回路 ACTIVE', () => {
  it('E 级违规 ⇒ completed=false、builds 为空、state=ACTIVE', () => {
    const out = submitDelivery(readyToDeliver(create()), {
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
    expect(out.state.project.state).toBe('ACTIVE')
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

describe('TC-17 读档：active 返工会话恢复，snapshotId 仍指旧权威', () => {
  it('序列化 → 反序列化 → 可继续完成（同一闸门 PASS 后切快照）', () => {
    let s = create()
    const plan = planRework(
      s,
      {
        sessionId: 'RS-1',
        category: 'C',
        affected: [{ instanceId: 'PACK-1', oldWorkUnits: 20, deliveredWorkUnits: 12, newWorkUnits: 10 }],
        targetDraftVersionId: 'V2',
        targetSnapshotId: 'SNAP-2',
        changes: [{ changeId: 'CH-1', instanceIds: ['PACK-1'] }],
        day: 3,
        costPerUnit: [20_000],
      },
      P,
    )
    s = beginRework(s, plan, 3)
    const archived = JSON.parse(JSON.stringify(s)) as typeof s
    const restored = restoreProjectExecution(archived, 4, P)
    expect(restored.project.snapshotId).toBe('SNAP-1')
    expect(restored.reworkSessions[0]!.status).toBe('active')
    expect(restored.reworkSessions[0]!.targetDraftVersionId).toBe('V2')
    expect(restored.reworkSessions[0]!.changeIds).toEqual(['CH-1'])
    const finished = markReworkTasksFromWorklogs({
      ...restored,
      workPackages: restored.workPackages.map((wp) => (wp.kind === 'REWORK' ? { ...wp, state: 'DONE' as const, remainingWorkUnits: 0 } : wp)),
    })
    const out = completeRework(finished, { day: 5, gate: { pass: true, violations: [] }, newWorkload: workload({ code: 80, design: 20, art: 40, audio: 6, qa: 14 }) }, P)
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
    // 读档不丢
    expect(p2.plannedLaunchDay).toBe(125)
    const restored = restoreProjectExecution(JSON.parse(JSON.stringify({ ...s, project: p2 })), 200, P)
    expect(restored.project.launchDelayDays).toBe(25)
    expect(restored.project.plannedLaunchDay).toBe(125)
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
