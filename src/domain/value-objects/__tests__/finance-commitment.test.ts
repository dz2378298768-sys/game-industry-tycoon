/**
 * FIN V0.2 §3.3 / §4.1 / §10.3 / F-02：跨月承诺测试。
 * 覆盖 TC-06（承诺不改现金）、TC-19（6 月 6 笔逐月兑现无遗漏）。
 */
import { describe, it, expect } from 'vitest'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import {
  cancelCommitment,
  commitmentIdempotencyKey,
  committedBurnForMonth,
  countDistinctMonths,
  createCommitment,
  deriveCommitmentState,
  monthKeyOf,
  realizeCommitment,
  remainingPlannedCents,
} from '@domain/value-objects/finance-commitment'
import { CommitmentOverRealizedError, SandboxCommitmentBlockedError } from '@domain/entities/finance'
import { makeLedger, postAdvance } from './finance-fixtures'

const d = (m: number, day = 15) => gregorianToDayIndex(2026, m, day)

describe('F-02 累计基准：periodCount / totalPlannedCents / 日历月计数', () => {
  it('TC-19：2026-01..2026-06 覆盖 6 个不同日历月（含首尾）', () => {
    expect(countDistinctMonths(d(1), d(6))).toBe(6)
    expect(countDistinctMonths(d(3), d(3))).toBe(1)
    expect(countDistinctMonths(d(6), d(1))).toBe(0)
    expect(monthKeyOf(d(2))).toBe('2026-02')
  })

  it('totalPlannedCents = amountCents × periodCount；one_off = 1 周期', () => {
    const monthly = createCommitment({
      commitmentId: 'cm', companyId: 'c1', sourceType: 'employment_salary',
      sourceRef: 'emp-1', amountCents: 100_000, period: 'monthly', startAt: d(1), endAt: d(6),
    })
    expect(monthly.periodCount).toBe(6)
    expect(monthly.totalPlannedCents).toBe(600_000)
    expect(monthly.realizedCents).toBe(0)

    const oneOff = createCommitment({
      commitmentId: 'co', companyId: 'c1', sourceType: 'project_budget',
      sourceRef: 'prj-1', amountCents: 300_000, period: 'one_off', startAt: d(1), endAt: d(1),
    })
    expect(oneOff.periodCount).toBe(1)
    expect(oneOff.totalPlannedCents).toBe(300_000)
    expect(remainingPlannedCents(oneOff)).toBe(300_000)
  })

  it('幂等键含月份：<commitmentId>:<YYYY-MM>', () => {
    expect(commitmentIdempotencyKey('cm', '2026-03')).toBe('cm:2026-03')
    expect(commitmentIdempotencyKey('cm', 'one_off')).toBe('cm:one_off')
  })
})

describe('TC-06 承诺不改现金（BR-3）', () => {
  it('创建承诺后现金不变；仅兑现提交 Transaction 后现金才变一次', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 2_000_000, 0)
    const c = createCommitment({
      commitmentId: 'cm', companyId: 'c1', sourceType: 'office_rent',
      sourceRef: 'office-1', amountCents: 100_000, period: 'monthly', startAt: d(1), endAt: d(3),
    })
    expect(ledger.getCashBalance('c1')).toBe(2_000_000)
    expect(committedBurnForMonth([c], '2026-01')).toBe(100_000)

    const r = realizeCommitment({ commitment: c, ledger, day: d(1) })
    expect(r.success).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(1_900_000)
    expect(r.result!.commitment.realizedCents).toBe(100_000)
  })
})

describe('TC-19 跨月月薪承诺：6 月 6 笔逐月兑现无遗漏（F-02）', () => {
  it('6 个月兑现 6 笔；realizedCents 累加至 totalPlannedCents；重复月份不双算', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 2_000_000, 0)
    let c = createCommitment({
      commitmentId: 'cm6', companyId: 'c1', sourceType: 'employment_salary',
      sourceRef: 'emp-team', amountCents: 100_000, period: 'monthly', startAt: d(1), endAt: d(6),
    })

    const keys = new Set<string>()
    let cash = 2_000_000
    for (let m = 1; m <= 6; m++) {
      const r = realizeCommitment({ commitment: c, ledger, day: d(m) })
      expect(r.success).toBe(true)
      expect(r.result!.idempotent).toBe(false)
      expect(r.result!.periodKey).toBe(`2026-0${m}`)
      keys.add(r.result!.transaction.idempotencyKey)
      c = r.result!.commitment
      cash -= 100_000
      expect(ledger.getCashBalance('c1')).toBe(cash)
      expect(c.realizedCents).toBe(m * 100_000)
      // 中间周期 k<periodCount 仍为 partially_realized
      expect(c.state).toBe(m < 6 ? 'partially_realized' : 'realized')
      expect(c.linkedTxIds).toHaveLength(m)
    }

    expect(keys.size).toBe(6)
    expect(c.totalPlannedCents).toBe(600_000)
    expect(c.realizedCents).toBe(600_000)
    expect(deriveCommitmentState(c)).toBe('realized')
    expect(remainingPlannedCents(c)).toBe(0)
    expect(ledger.getAllTransactions().filter((t) => t.referenceId === 'cm6')).toHaveLength(6)

    // 同月重复兑现命中幂等键，不新增交易
    const dup = realizeCommitment({ commitment: c, ledger, day: d(6) })
    expect(dup.result!.idempotent).toBe(true)
    expect(c.realizedCents).toBe(600_000)
    expect(ledger.getAllTransactions().filter((t) => t.referenceId === 'cm6')).toHaveLength(6)
  })

  it('超出累计上限抛 CommitmentOverRealizedError；中途取消停止未来周期', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 2_000_000, 0)
    const base = createCommitment({
      commitmentId: 'cm2', companyId: 'c1', sourceType: 'project_budget',
      sourceRef: 'prj', amountCents: 100_000, period: 'monthly', startAt: d(1), endAt: d(2),
    })
    const overRealized = { ...base, realizedCents: base.totalPlannedCents }
    expect(() => realizeCommitment({ commitment: overRealized, ledger, day: d(1) }))
      .toThrow(CommitmentOverRealizedError)

    const cancelled = cancelCommitment(base)
    expect(cancelled.state).toBe('cancelled')
    const r = realizeCommitment({ commitment: cancelled, ledger, day: d(1) })
    expect(r.success).toBe(false)
    expect(ledger.getCashBalance('c1')).toBe(2_000_000)
  })
})

describe('CODE-02 C-2：沙盒态拒绝新建承诺（P2-03 / §10.4）', () => {
  const input = {
    commitmentId: 'cm-sandbox', companyId: 'c1', sourceType: 'employment_salary' as const,
    sourceRef: 'emp-new', amountCents: 100_000, period: 'monthly' as const,
    startAt: d(1), endAt: d(3),
  }

  it('sandbox_observe 下经只读账本查询拒绝；非沙盒正常创建', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 2_000_000, 0)
    expect(createCommitment(input, { ledger }).state).toBe('committed')

    ledger.setSandboxObserved('c1', true)
    expect(ledger.isSandboxObserved('c1')).toBe(true)
    let thrown: unknown
    try {
      createCommitment(input, { ledger })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(SandboxCommitmentBlockedError)
    expect((thrown as SandboxCommitmentBlockedError).code).toBe('FIN_SANDBOX_COMMITMENT_BLOCKED')

    // 显式状态入参同样生效（不依赖账本实例）
    expect(() => createCommitment(input, { sandboxActive: true }))
      .toThrow(SandboxCommitmentBlockedError)
    expect(createCommitment({ ...input, commitmentId: 'cm-other', companyId: 'c2' }, { ledger }).state)
      .toBe('committed')
  })
})
