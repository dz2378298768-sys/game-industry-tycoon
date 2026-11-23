import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, unknown>())

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { mem.set(key, value) }),
  del: vi.fn(async (key: string) => { mem.delete(key) }),
}))

import { saveGame, loadGame } from '@infrastructure/storage/save-service'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'
import { GameWorld } from '@application/mediators/game-world'

function sampleWorld() {
  const gw = new GameWorld(9)
  gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
  const emp = gw.hireEmployee({ name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000 }).result
  const project = gw.createProject({
    name: 'Saved Game',
    genreId: 'action',
    budgetTotalCapCents: 3_000_000,
    plannedLaunchDay: 200,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  }).result
  if (emp && project) gw.assignEmployeeToProject(emp.id, project.id, 1, 'generalist')
  return gw.serialize()
}

describe('存档安全 (G10/G21)', () => {
  beforeEach(() => { mem.clear() })

  it('正常保存与读取，状态一致', async () => {
    const world = sampleWorld()
    await saveGame(world)

    const result = await loadGame()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION)
    expect(result.state.currentDayIndex).toBe(world.currentDayIndex)
    expect(result.state.employees).toHaveLength(world.employees.length)
    expect(result.state.companies[0]?.cashBalanceCents).toBe(
      world.companies[0]?.cashBalanceCents,
    )
  })

  it('损坏存档拒绝加载', async () => {
    mem.set('git_save_v1', 'this-is-not-valid-lz-string')
    const result = await loadGame()
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errorCode).toBe('SAVE_CORRUPTED')
  })

  it('不支持的 schemaVersion 拒绝加载', () => {
    const world = { ...sampleWorld(), schemaVersion: 99 }
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_VERSION_UNSUPPORTED')
  })

  it('现金与流水不一致时拒绝加载', () => {
    const world = sampleWorld()
    const broken = structuredClone(world)
    // CODE-08 后 Company.cashBalanceCents 类型层只读；篡改存档用 cast（反证 SAVE_CASH_MISMATCH）。
    if (broken.companies[0])
      (broken.companies[0] as { cashBalanceCents: number }).cashBalanceCents = 1
    const r = parseSave(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_CASH_MISMATCH')
  })

  it('引用不存在的员工时拒绝加载', () => {
    const world = sampleWorld()
    const broken = structuredClone(world)
    broken.employees = []
    const r = parseSave(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('读档后 FinanceService 余额与公司现金一致', async () => {
    const world = sampleWorld()
    await saveGame(world)
    const result = await loadGame()
    if (result.status !== 'ok') throw new Error('load failed')

    const gw = new GameWorld(9)
    gw.restore(result.state)
    const company = gw.getPlayerCompany()
    expect(company).toBeDefined()
    if (!company) return
    expect(gw.finance.getCashBalance(company.id)).toBe(company.cashBalanceCents)
  })

  it('读档后日期、项目和流水保持一致', async () => {
    const gw = new GameWorld(9)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    gw.advanceSimulation(40)
    const project = gw.createProject({
      name: 'Saved Game',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(project.success).toBe(true)

    await saveGame(gw.serialize())
    const loaded = await loadGame()
    if (loaded.status !== 'ok') throw new Error('load failed')

    const restored = new GameWorld(9)
    restored.restore(loaded.state)
    expect(restored.calendar.currentDayIndex).toBe(40)
    expect(restored.world.projects).toHaveLength(1)
    expect(restored.finance.getTransactionsByCompany(company.id).length).toBe(
      gw.finance.getTransactionsByCompany(company.id).length,
    )
  })

  it('预算公式不符拒绝读档，且不覆盖当前运行状态', async () => {
    const gw = new GameWorld(9)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    gw.createProject({
      name: 'Saved Game',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const original = gw.serialize()

    const tampered = structuredClone(original)
    const p = tampered.projects[0]!
    p.remainingCapCents = p.budgetTotalCapCents - p.budgetCommittedCents - p.budgetSpentCents + 1
    await saveGame(tampered)

    const result = await loadGame()
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.errorCode).toBe('SAVE_BUDGET_FORMULA_MISMATCH')
    // 当前运行状态未被无效存档覆盖
    expect(gw.serialize()).toEqual(original)
  })

  it('成本分摊引用完整性校验：引用不存在的现金交易拒绝加载', () => {
    const world = sampleWorld()
    const company = world.companies[0]!
    const project = world.projects[0]!
    const emp = world.employees[0]!
    const allocation = {
      id: 'COST-1',
      companyId: company.id,
      projectId: project.id,
      sourceType: 'salary' as const,
      sourceRefId: emp.id,
      cashTransactionId: 'missing-tx',
      amountCents: 1_000,
      allocationRatio: 1,
      periodKey: 'm1970-1',
      idempotencyKey: `costalloc:salary:${company.id}:${emp.id}:m1970-1:${project.id}`,
      day: 0,
      description: 'test allocation',
      status: 'spent' as const,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
    }

    const broken = structuredClone(world)
    broken.projects[0]!.costAllocations = [{ ...allocation }]
    const r = parseSave(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')

    // 引用真实存在的交易则通过
    const valid = structuredClone(world)
    const tx = valid.transactions[0]!
    valid.projects[0]!.costAllocations = [{ ...allocation, cashTransactionId: tx.id }]
    expect(parseSave(valid).ok).toBe(true)
  })

  it('旧存档缺少新增字段时按缺省值兼容', () => {
    const world = sampleWorld()
    const legacy = structuredClone(world)
    const p = legacy.projects[0]!
    delete p.remainingCapCents
    delete p.budgetExhausted
    delete p.resumeSeq
    delete p.costAllocations

    const r = parseSave(legacy)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const saved = r.state.projects[0]!
      expect(saved.budgetExhausted).toBe(false)
      expect(saved.resumeSeq).toBe(0)
      expect(saved.costAllocations).toEqual([])
    }
  })

  it('M1.2 新字段兼容：旧存档缺 scopeCutRatio / originalPlannedLaunchDay / launchDelayDays 时填充 zod default', () => {
    const world = sampleWorld()
    const legacy = structuredClone(world)
    const p = legacy.projects[0]!
    delete p.scopeCutRatio
    delete p.originalPlannedLaunchDay
    delete p.launchDelayDays

    const r = parseSave(legacy)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const saved = r.state.projects[0]!
      expect(saved.scopeCutRatio).toBe(0)
      expect(saved.originalPlannedLaunchDay).toBeNull()
      expect(saved.launchDelayDays).toBe(0)
    }
  })
})

/**
 * CODE-04 D 段：承诺集合随档持久化并在读档时随 replay 重建（FIN §3.3 / §10.5）。
 */
describe('CODE-04：账本承诺集合的存档往返', () => {
  it('serialize 带上账本承诺；restore 后承诺逐字段相等且余额不变', () => {
    const gw = new GameWorld(9)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const ledger = gw.finance.getLedger()
    const registered = ledger.registerCommitment({
      commitmentId: 'commit:prj-1:budget:0:2000000', companyId: company.id,
      sourceType: 'project_budget', sourceRef: 'prj-1', amountCents: 2_000_000,
      period: 'one_off', startAt: 0, endAt: 0,
    })
    expect(registered.success).toBe(true)

    const world = gw.serialize()
    expect(world.commitments).toHaveLength(1)
    expect(world.commitments?.[0]?.commitmentId).toBe('commit:prj-1:budget:0:2000000')

    const restored = new GameWorld(9)
    restored.restore(world)
    expect(restored.finance.getLedger().getCommitments(company.id)).toEqual(
      ledger.getCommitments(company.id),
    )
    expect(restored.getPlayerCompany()?.cashBalanceCents).toBe(company.cashBalanceCents)
  })

  it('旧档缺 commitments 字段：缺省为空集合，读档正常（不升版本、不破坏余额）', () => {
    const gw = new GameWorld(9)
    gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const world = structuredClone(gw.serialize())
    delete world.commitments
    const r = parseSave(world)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const restored = new GameWorld(9)
    restored.restore(r.state)
    expect(restored.getPlayerCompany()?.cashBalanceCents).toBe(gw.getPlayerCompany()?.cashBalanceCents)
  })

  it('CODE-08 / P2-02：冲销场景存档往返——现金由账本重建、冲销对 status/reversedBy 双向一致', () => {
    const gw = new GameWorld(9)
    const company = gw.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    const ledger = gw.finance.getLedger()
    const posted = gw.finance.postTransaction({
      idempotencyKey: 'sale:prj-1', companyId: company.id, day: 5,
      category: 'sales_revenue', amountCents: 800_000, description: '销售入账',
    })
    expect(posted.success).toBe(true)
    const saleTxId = ledger.getTransactionByKeyInCompany(company.id, 'sale:prj-1')!.transactionId
    const reversed = ledger.reverseTransaction(saleTxId, '全额退款', 'refund:prj-1')
    expect(reversed.success).toBe(true)
    // 冲销后账本净额回到开局注资基线 12_000_000；Company 展示字段由 syncCash
    // 回写为账本派生值（CODE-08 唯一写入口）。
    expect(ledger.getCashBalance(company.id)).toBe(12_000_000)
    gw.finance.syncCash(company)
    expect(company.cashBalanceCents).toBe(12_000_000)

    const world = gw.serialize()
    const salePersisted = world.transactions.find((t) => t.id === saleTxId)
    expect(salePersisted?.status).toBe('reversed')
    expect(salePersisted?.reversedBy).toBeTruthy()

    const restored = new GameWorld(9)
    restored.restore(structuredClone(world))
    const restoredLedger = restored.finance.getLedger()
    // INV-1：status 不参与求和，冲销对两侧均入账 → 余额保持 12_000_000；现金字段从账本重建且一致。
    expect(restoredLedger.getCashBalance(company.id)).toBe(12_000_000)
    expect(restored.getPlayerCompany()?.cashBalanceCents).toBe(12_000_000)
    expect(() => restored.finance.assertCashConsistent(restored.getPlayerCompany()!)).not.toThrow()
    // P2-02 回归：冲销对经 status + reversedBy 双向一致（reversalOf 审计链不入档为既定形状）。
    const restoredSale = restoredLedger.getTransactionById(saleTxId)
    expect(restoredSale?.status).toBe('reversed')
    expect(restoredSale?.reversedBy).toBe(salePersisted?.reversedBy)
    const restoredReversal = restoredLedger.getTransactionById(salePersisted!.reversedBy!)
    expect(restoredReversal?.amountCents).toBe(-800_000)
    // P2-02 现状确认：reversalOf 审计链不入 v3 存档形状（读档 replay 后为 null），
    // 冲销对以 status + reversedBy 往返保持一致；是否入档属 P2-02 设计裁定，不在 CODE-08 范围。
    expect(restoredReversal?.reversalOf).toBeNull()
  })
})
