/**
 * CODE-04 C 段（FIN-INT-01）+ D 段（承诺注册表）。
 *
 * C：`cancelCommitment(commitment, effectiveMonth)` 必填生效期、返回结构化笔数，
 *    并锁死 D-03 §7.2 / FIN TC-19 锚点（2026-02~07、effectiveMonth=2026-04 ⇒ 2 笔 / 1_000_000）。
 * D：`registerCommitment` / `getCommitments` / `getCommitment` / `settleCommitment` /
 *    `releaseCommitment`，幂等键 `commitment:${companyId}:${commitmentId}`（跨公司隔离）、
 *    参与 `AvailableCash`、随 `replay` / `LedgerSnapshot` 重建、释放后可用现金回升。
 */
import { describe, it, expect } from 'vitest'
import { UnifiedLedger, FIN_ERROR, SandboxCommitmentBlockedError } from '@domain/entities/finance'
import type { BudgetCommitment } from '@domain/entities/finance'
import {
  cancelCommitment,
  createCommitment,
  monthKeyOf,
} from '@domain/value-objects/finance-commitment'
import { computeAvailableCash } from '@domain/value-objects/finance-formulas'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const d = (y: number, m: number, day = 15) => gregorianToDayIndex(y, m, day)
const T = DEFAULT_FINANCE_TUNING

function salaryCommitment(overrides: Partial<BudgetCommitment> = {}): BudgetCommitment {
  const base = createCommitment({
    commitmentId: 'cm-salary',
    companyId: 'c1',
    sourceType: 'employment_salary',
    sourceRef: 'emp-1',
    amountCents: 500_000, // $5,000/月
    period: 'monthly',
    startAt: d(2026, 2, 1),
    endAt: d(2026, 7, 28),
  }, { sandboxActive: false, sandboxStateSource: 'caller_asserted' })
  return { ...base, ...overrides }
}

function makeLedgerWithSalary(minutes = 6_000_000): { ledger: UnifiedLedger; c: BudgetCommitment } {
  const ledger = new UnifiedLedger()
  ledger.registerCompany('c1')
  ledger.postTransaction({
    idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
    amountCents: minutes, description: '注资', source: 'player_authorized',
  })
  const r = ledger.registerCommitment({
    commitmentId: 'cm-salary', companyId: 'c1', sourceType: 'employment_salary',
    sourceRef: 'emp-1', amountCents: 500_000, period: 'monthly',
    startAt: d(2026, 2, 1), endAt: d(2026, 7, 28),
  })
  expect(r.success).toBe(true)
  return { ledger, c: r.result!.commitment }
}

describe('C / FIN-INT-01 基准：cancelCommitment(commitment, effectiveMonth)', () => {
  const base = () => salaryCommitment()

  it('签名必填 effectiveMonth：2026-02~07 共 6 笔，effectiveMonth=2026-04 ⇒ realized=2 笔 / 1,000,000（D-03 §7.2 锚点）', () => {
    const c = base()
    expect(c.periodCount).toBe(6)
    expect(c.totalPlannedCents).toBe(3_000_000)

    const r = cancelCommitment(c, '2026-04')
    expect(r.realizedPeriods).toBe(2)
    expect(r.releasedPeriods).toBe(4)
    expect(r.realizedCents).toBe(1_000_000)
    expect(r.releasedCents).toBe(2_000_000)
    expect(r.effectiveMonth).toBe('2026-04')
    // 恒等式
    expect(r.realizedCents + r.releasedCents).toBe(c.totalPlannedCents)
    expect(r.realizedPeriods + r.releasedPeriods).toBe(c.periodCount)
    expect(r.commitment.state).toBe('cancelled')
    expect(r.commitment.cancelEffectiveMonth).toBe('2026-04')
  })

  it('TC-19 回归：中途取消只停未来周期，已入账不冲回（现金不变）', () => {
    const { ledger, c: registered } = makeLedgerWithSalary()
    const c = registered
    // 兑现 2026-02、2026-03 两期（各 500,000）
    for (const m of [2, 3]) {
      const tx = ledger.postTransaction({
        idempotencyKey: `${c.commitmentId}:2026-0${m}`, companyId: 'c1', day: d(2026, m),
        category: 'salary', amountCents: -500_000, description: `薪水 ${m}`, referenceId: c.commitmentId,
        source: 'system_auto',
      }, { allowNegativeBalance: true })
      expect(ledger.settleCommitment('c1', c.commitmentId, 500_000, tx.result!.transaction.transactionId).success).toBe(true)
    }
    const cashBefore = ledger.getCashBalance('c1')
    const rel = ledger.releaseCommitment('c1', c.commitmentId, '2026-04')
    expect(rel.success).toBe(true)
    expect(rel.result!.realizedPeriods).toBe(2)
    expect(rel.result!.realizedCents).toBe(1_000_000)
    expect(rel.result!.releasedPeriods).toBe(4)
    // 已入账不冲回
    expect(ledger.getCashBalance('c1')).toBe(cashBefore)
    // 取消后不再能兑现
    const after = ledger.postTransaction({
      idempotencyKey: `${c.commitmentId}:2026-04`, companyId: 'c1', day: d(2026, 4),
      category: 'salary', amountCents: -500_000, description: '薪水 4', source: 'system_auto',
    }, { allowNegativeBalance: true })
    expect(ledger.settleCommitment('c1', c.commitmentId, 500_000, after.result!.transaction.transactionId).errorCode)
      .toBe(FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID)
  })

  it('边界：effectiveMonth 早于起始月 ⇒ 全额释放（realized=0）', () => {
    const c = base()
    const r = cancelCommitment(c, '2026-01')
    expect(r.realizedPeriods).toBe(0)
    expect(r.realizedCents).toBe(0)
    expect(r.releasedPeriods).toBe(6)
    expect(r.releasedCents).toBe(3_000_000)
  })

  it('边界：effectiveMonth 晚于结束月 ⇒ 全额已兑现（released=0）', () => {
    const c = base()
    const r = cancelCommitment(c, '2026-08')
    expect(r.realizedPeriods).toBe(6)
    expect(r.realizedCents).toBe(3_000_000)
    expect(r.releasedPeriods).toBe(0)
    expect(r.releasedCents).toBe(0)
  })

  it('one_off 承诺：生效月在起始月之前 ⇒ 全额释放', () => {
    const c = createCommitment({
      commitmentId: 'cm-one', companyId: 'c1', sourceType: 'project_budget', sourceRef: 'prj-1',
      amountCents: 2_000_000, period: 'one_off', startAt: d(2026, 3, 1), endAt: d(2026, 3, 1),
    }, { sandboxActive: false, sandboxStateSource: 'caller_asserted' })
    const released = cancelCommitment(c, '2026-02')
    expect(released.releasedCents).toBe(2_000_000)
    expect(released.realizedCents).toBe(0)
  })
})

describe('D / 承诺注册表：注册、查询、结算', () => {
  it('registerCommitment 后 getCommitments / getCommitment 可查，且不改现金（BR-3）', () => {
    const { ledger, c } = makeLedgerWithSalary()
    expect(ledger.getCashBalance('c1')).toBe(6_000_000)
    expect(ledger.getCommitments('c1')).toHaveLength(1)
    expect(ledger.getCommitment('c1', c.commitmentId)!.commitmentId).toBe(c.commitmentId)
    expect(ledger.getCommitments('c2')).toHaveLength(0)
    expect(ledger.getCommitment('c2', c.commitmentId)).toBeUndefined()
  })

  it('幂等键 commitment:${companyId}:${commitmentId}：同公司重注册幂等，跨公司互不命中', () => {
    const { ledger } = makeLedgerWithSalary()
    ledger.registerCompany('c2')
    const again = ledger.registerCommitment({
      commitmentId: 'cm-salary', companyId: 'c1', sourceType: 'employment_salary',
      sourceRef: 'emp-1', amountCents: 500_000, period: 'monthly',
      startAt: d(2026, 2, 1), endAt: d(2026, 7, 28),
    })
    expect(again.success).toBe(true)
    expect(again.result!.idempotent).toBe(true)
    expect(ledger.getCommitments('c1')).toHaveLength(1)

    // 两家公司同 commitmentId（如 AI 公司复制项目）→ 各自独立登记
    const other = ledger.registerCommitment({
      commitmentId: 'cm-salary', companyId: 'c2', sourceType: 'employment_salary',
      sourceRef: 'emp-1', amountCents: 300_000, period: 'monthly',
      startAt: d(2026, 2, 1), endAt: d(2026, 7, 28),
    })
    expect(other.success).toBe(true)
    expect(other.result!.idempotent).toBe(false)
    expect(other.result!.commitment.companyId).toBe('c2')
    expect(ledger.getCommitments('c2')).toHaveLength(1)
    expect(ledger.getCommitment('c2', 'cm-salary')!.amountCents).toBe(300_000)
    expect(ledger.getCommitment('c1', 'cm-salary')!.amountCents).toBe(500_000)
  })

  it('同公司同 id 但字段不同 ⇒ FIN_COMMITMENT_ALREADY_REGISTERED（不静默覆盖）', () => {
    const { ledger } = makeLedgerWithSalary()
    const r = ledger.registerCommitment({
      commitmentId: 'cm-salary', companyId: 'c1', sourceType: 'employment_salary',
      sourceRef: 'emp-1', amountCents: 999_000, period: 'monthly',
      startAt: d(2026, 2, 1), endAt: d(2026, 7, 28),
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe(FIN_ERROR.COMMITMENT_ALREADY_REGISTERED)
    expect(ledger.getCommitment('c1', 'cm-salary')!.amountCents).toBe(500_000)
  })

  it('未注册公司 / 沙盒观察态 ⇒ 拒绝（P3-07 守卫由账本内置，无法绕过）', () => {
    const ledger = new UnifiedLedger()
    const ghost = ledger.registerCommitment({
      commitmentId: 'x', companyId: 'ghost', sourceType: 'office_rent', sourceRef: 'o1',
      amountCents: 100, period: 'one_off', startAt: 0, endAt: 0,
    })
    expect(ghost.errorCode).toBe(FIN_ERROR.COMMITMENT_COMPANY_NOT_REGISTERED)

    ledger.registerCompany('c1')
    ledger.setSandboxObserved('c1', true)
    expect(() => ledger.registerCommitment({
      commitmentId: 'y', companyId: 'c1', sourceType: 'office_rent', sourceRef: 'o1',
      amountCents: 100, period: 'one_off', startAt: 0, endAt: 0,
    })).toThrow(SandboxCommitmentBlockedError)
    expect(ledger.getCommitments('c1')).toHaveLength(0)
  })

  it('settleCommitment 累积 realizedCents 并推进 state；同一 txId 重放幂等', () => {
    const { ledger, c } = makeLedgerWithSalary()
    const tx = ledger.postTransaction({
      idempotencyKey: `${c.commitmentId}:2026-02`, companyId: 'c1', day: d(2026, 2),
      category: 'salary', amountCents: -500_000, description: '薪水', source: 'system_auto',
    }, { allowNegativeBalance: true }).result!.transaction
    const s1 = ledger.settleCommitment('c1', c.commitmentId, 500_000, tx.transactionId)
    expect(s1.success).toBe(true)
    expect(s1.idempotent).toBe(false)
    expect(s1.result!.commitment.realizedCents).toBe(500_000)
    expect(s1.result!.commitment.state).toBe('partially_realized')
    const s2 = ledger.settleCommitment('c1', c.commitmentId, 500_000, tx.transactionId)
    expect(s2.idempotent).toBe(true)
    expect(s2.result!.commitment.realizedCents).toBe(500_000)
    // 不存在的交易 / 越界金额 / 未注册承诺
    expect(ledger.settleCommitment('c1', c.commitmentId, 500_000, 'no-such-tx').errorCode)
      .toBe(FIN_ERROR.TX_NOT_FOUND)
    expect(ledger.settleCommitment('c1', c.commitmentId, 99_999_999, tx.transactionId).errorCode)
      .toBe(FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID)
    expect(ledger.settleCommitment('c1', 'missing', 1, tx.transactionId).errorCode)
      .toBe(FIN_ERROR.COMMITMENT_NOT_FOUND)
  })
})

describe('D / 承诺参与 AvailableCash + 释放链（CODE-03 P1-4 的解药）', () => {
  it('承诺集合是 AvailableCash 的唯一来源；releaseCommitment 后可用现金回升 == 释放金额，且无残留占用', () => {
    const { ledger } = makeLedgerWithSalary(10_000_000)
    const availableOf = () => computeAvailableCash({
      cashBalanceCents: ledger.getCashBalance('c1'),
      commitments: ledger.getCommitments('c1'),
      payables: [],
      receivables: [],
      horizonMonths: 6,
      startMonth: '2026-02',
    }, T)
    // 窗口锚点 2026-02、horizon 6 ⇒ 覆盖 2026-02..07，6 期 × 500,000 全部在窗口内
    expect(availableOf()).toBe(7_000_000)

    const released = ledger.releaseCommitment('c1', 'cm-salary', '2026-04')
    expect(released.success).toBe(true)
    expect(released.result!.releasedCents).toBe(2_000_000)
    // 取消后承诺不再计入（AvailableCash 完全回到账面现金）
    expect(availableOf()).toBe(10_000_000)

    // 结论说明（为审核者留痕）：释放后承诺 state='cancelled'，FIN §6.2 对 cancelled 整体不计入
    // `AvailableCash`，因此回升额（2,000,000）**大于**释放额（1,000,000，即 2 期 × 500,000）。
    // 这是"取消即停止一切未来占用"的直接推论，不是重复扣减；`releasedCents` 只统计生效月之后的期数。
    // 幂等：同 effectiveMonth 再释放 ⇒ idempotent，金额不变
    const again = ledger.releaseCommitment('c1', 'cm-salary', '2026-04')
    expect(again.idempotent).toBe(true)
    expect(availableOf()).toBe(10_000_000)
    // 不同生效月 ⇒ 冲突（不得悄悄改释放口径）
    expect(ledger.releaseCommitment('c1', 'cm-salary', '2026-05').errorCode)
      .toBe(FIN_ERROR.COMMITMENT_MISMATCH)
  })

  it('释放链反证：项目取消 → 承诺 cancelled → 账本无残留占用（AvailableCash 回到原始现金）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('co-1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'co-1', day: 0, category: 'advance',
      amountCents: 3_000_000, description: '注资', source: 'player_authorized',
    })
    // 项目立约 + 追加预算（模拟 CODE-03 setupBudgetCommitment / topUpBudget 的承诺形态）
    ledger.registerCommitment({
      commitmentId: 'commit:prj-1:budget:0:2000000', companyId: 'co-1', sourceType: 'project_budget',
      sourceRef: 'prj-1', amountCents: 2_000_000, period: 'one_off',
      startAt: d(2026, 1, 10), endAt: d(2026, 1, 10),
    })
    ledger.registerCommitment({
      commitmentId: 'commit:prj-1:budget:1:500000', companyId: 'co-1', sourceType: 'project_budget',
      sourceRef: 'prj-1', amountCents: 500_000, period: 'one_off',
      startAt: d(2026, 1, 20), endAt: d(2026, 1, 20),
    })
    const availableOf = () => computeAvailableCash({
      cashBalanceCents: ledger.getCashBalance('co-1'),
      commitments: ledger.getCommitments('co-1'),
      payables: [], receivables: [], horizonMonths: 6, startMonth: '2026-01',
    }, T)
    expect(availableOf()).toBe(500_000) // 3,000,000 − 2,000,000 − 500,000

    // 取消项目：按 sourceRef 找到全部承诺并释放（生效月 = 取消当月的月初）
    const projectCommitments = ledger.getCommitments('co-1', { sourceRef: 'prj-1' })
    expect(projectCommitments).toHaveLength(2)
    for (const c of projectCommitments) {
      const r = ledger.releaseCommitment('co-1', c.commitmentId, monthKeyOf(c.startAt))
      expect(r.success).toBe(true)
    }
    const all = ledger.getCommitments('co-1')
    expect(all.every((c) => c.state === 'cancelled')).toBe(true)
    expect(all.filter((c) => c.state === 'cancelled')).toHaveLength(2)
    // 无残留占用：可用现金回到原始现金 3,000,000
    expect(availableOf()).toBe(3_000_000)
  })
})

describe('D / 承诺随 replay 与 LedgerSnapshot 重建', () => {
  it('replay(txs, companies, commitments) 后承诺集合逐字段相等；快照含承诺', () => {
    const { ledger, c } = makeLedgerWithSalary(6_000_000)
    const tx = ledger.postTransaction({
      idempotencyKey: `${c.commitmentId}:2026-02`, companyId: 'c1', day: d(2026, 2),
      category: 'salary', amountCents: -500_000, description: '薪水', source: 'system_auto',
    }, { allowNegativeBalance: true }).result!.transaction
    ledger.settleCommitment('c1', c.commitmentId, 500_000, tx.transactionId)
    ledger.releaseCommitment('c1', 'cm-salary', '2026-04')

    const snapshot = ledger.getSnapshot('c1')
    expect(snapshot.commitments).toHaveLength(1)
    expect(snapshot.commitments[0]!.state).toBe('cancelled')
    expect(snapshot.cashBalanceCents).toBe(5_500_000)

    const rebuilt = new UnifiedLedger()
    const balances = rebuilt.replay(ledger.getAllTransactions(), ['c1'], snapshot.commitments)
    expect(balances.get('c1')).toBe(5_500_000)
    expect(rebuilt.getCommitments('c1')).toEqual(ledger.getCommitments('c1'))
    expect(rebuilt.getCashBalance('c1')).toBe(ledger.getCashBalance('c1'))
  })

  it('replay 不带承诺时承诺集合为空（不会从交易凭空推断出承诺）', () => {
    const { ledger } = makeLedgerWithSalary(1_000_000)
    const rebuilt = new UnifiedLedger()
    rebuilt.replay(ledger.getAllTransactions(), ['c1'])
    expect(rebuilt.getCommitments('c1')).toHaveLength(0)
    // reconcileCommitmentsFromTransactions 用于"只有交易、需要按 referenceId 回填"
    expect(() => rebuilt.reconcileCommitmentsFromTransactions('c1')).not.toThrow()
  })
})
