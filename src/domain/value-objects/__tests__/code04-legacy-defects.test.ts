/**
 * CODE-04 B 段：CODE-02 复审遗留 P3-04 / P3-05 / P3-06 / P3-07 回归。
 *
 * 每条用例都对应"修前的错误行为"（先失败后通过，证据见实施报告 §B）：
 *  - P3-04：窗口前已到期未兑现的 one_off 被扣 0 → 现按 ADJ-2026-11-22-05 §1.3 全额扣；
 *  - P3-05：单参 `getTransactionByKey` 在多公司同键下返回后写者 → 现删除单参重载；
 *  - P3-06：`settleItem` remaining 守卫先于幂等 → 现键命中优先；
 *  - P3-07：`createCommitment` 守卫为选项式、不传默认放行 → 现 options 必填且必须带来源。
 *
 * 另含 ADJ-05 §2 的 OPEN-F3′ 症状锁用例（KNOWN-DEFECT，P2 修公式时必须同步修改）。
 */
import { describe, it, expect } from 'vitest'
import {
  UnifiedLedger,
  FIN_ERROR,
  SandboxCommitmentBlockedError,
  type BudgetCommitment,
} from '@domain/entities/finance'
import { createCommitment } from '@domain/value-objects/finance-commitment'
import {
  computeAvailableCash,
  computeRunwayMonths,
} from '@domain/value-objects/finance-formulas'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const T = DEFAULT_FINANCE_TUNING
const d = (y: number, m: number, day = 1) => gregorianToDayIndex(y, m, day)

function commitment(overrides: {
  commitmentId?: string
  amountCents?: number
  period?: BudgetCommitment['period']
  startAt: number
  endAt: number
  realizedCents?: number
}): BudgetCommitment {
  const base = createCommitment({
    commitmentId: overrides.commitmentId ?? 'cm',
    companyId: 'c1',
    sourceType: 'employment_salary',
    sourceRef: 'emp-1',
    amountCents: overrides.amountCents ?? 100_000,
    period: overrides.period ?? 'monthly',
    startAt: overrides.startAt,
    endAt: overrides.endAt,
  }, { sandboxActive: false, sandboxStateSource: 'caller_asserted' })
  return overrides.realizedCents === undefined ? base : { ...base, realizedCents: overrides.realizedCents }
}

describe('P3-04：窗口开始前已到期未兑现的 one_off 全额扣减（ADJ-2026-11-22-05 §1）', () => {
  /** 审核探针 D5 的原始场景：现金 3,000,000；2025-12 的 50,000 one_off 未兑现；窗口 2026-01 起 6 个月。 */
  const d5 = () => commitment({
    commitmentId: 'cm-dec',
    amountCents: 50_000,
    period: 'one_off',
    startAt: d(2025, 12, 15),
    endAt: d(2025, 12, 15),
  })

  it('探针 D5 场景：AvailableCash = 2,950,000（修前为 3,000,000）', () => {
    const available = computeAvailableCash({
      cashBalanceCents: 3_000_000,
      commitments: [d5()],
      payables: [],
      receivables: [],
      horizonMonths: 6,
      startMonth: '2026-01',
    }, T)
    expect(available).toBe(2_950_000)
  })

  it('缺省锚点（不传 startMonth）同样扣减已到期未兑现的 one_off', () => {
    const available = computeAvailableCash({
      cashBalanceCents: 3_000_000,
      commitments: [d5()],
      payables: [],
      receivables: [],
      horizonMonths: 6,
    }, T)
    expect(available).toBe(2_950_000)
  })

  it('窗口前已到期、部分兑现的 monthly：只扣未兑现部分（totalPlanned − realized）', () => {
    // 2025-10..2025-12 三期 × 100,000，已兑现 2 期
    const c = commitment({
      commitmentId: 'cm-q4', amountCents: 100_000,
      startAt: d(2025, 10), endAt: d(2025, 12), realizedCents: 200_000,
    })
    const available = computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [c], payables: [], receivables: [],
      horizonMonths: 6, startMonth: '2026-01',
    }, T)
    expect(available).toBe(900_000)
  })

  it('互斥性：straddle 承诺（2025-12 起、2026-02 止）不得既"窗口前补扣"又"窗口内按月扣"', () => {
    // 3 期 × 100,000，窗口 2026-01 起 horizon 2（覆盖 2026-01..02）
    const straddle = commitment({
      commitmentId: 'cm-straddle', amountCents: 100_000,
      startAt: d(2025, 12), endAt: d(2026, 2),
    })
    const available = computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [straddle], payables: [], receivables: [],
      horizonMonths: 2, startMonth: '2026-01',
    }, T)
    // 窗口内 2 期 = 200,000；窗口前的 2025-12 一期**不在**"已到期未兑现"之列（它已进入窗口口径）
    expect(available).toBe(800_000)

    // 已兑现 1 期（2025-12）后：窗口内仍扣 2 期
    const realizedOnce = { ...straddle, realizedCents: 100_000 }
    expect(computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [realizedOnce], payables: [], receivables: [],
      horizonMonths: 2, startMonth: '2026-01',
    }, T)).toBe(800_000)

    // 边界对照：窗口更短（仅 2026-02）时只扣 1 期，不得把窗口前的 2025-12 再补扣一次
    expect(computeAvailableCash({
      cashBalanceCents: 1_000_000, commitments: [straddle], payables: [], receivables: [],
      horizonMonths: 1, startMonth: '2026-02',
    }, T)).toBe(900_000)
  })

  it('已取消的窗口前承诺不参与扣减', () => {
    const cancelled: BudgetCommitment = {
      ...d5(), state: 'cancelled', cancelEffectiveMonth: '2025-12', releasedPeriods: 1,
      releasedCents: 50_000, cancelledAtPeriods: 0,
    }
    expect(computeAvailableCash({
      cashBalanceCents: 3_000_000, commitments: [cancelled], payables: [], receivables: [],
      horizonMonths: 6, startMonth: '2026-01',
    }, T)).toBe(3_000_000)
  })
})

describe('OPEN-F3′ 症状锁（KNOWN-DEFECT，ADJ-2026-11-22-05 §2：P2 校准轮修正）', () => {
  it('KNOWN-DEFECT OPEN-F3：现金 700,000 / 月净烧 100,000 / horizon 6 ⇒ runway 实算 1 个月（真实约 7 个月）', () => {
    const monthly = commitment({
      commitmentId: 'cm-burn', amountCents: 100_000,
      startAt: d(2026, 1), endAt: d(2026, 6),
    })
    const available = computeAvailableCash({
      cashBalanceCents: 700_000, commitments: [monthly], payables: [], receivables: [],
      horizonMonths: 6, startMonth: '2026-01',
    }, T)
    // AvailableCash 必须保持"已扣全部承诺"（HRB 依赖），故为 100,000
    expect(available).toBe(100_000)
    const runway = computeRunwayMonths({
      availableCashCents: available,
      commitments: [monthly],
      expectedInflowsByMonth: [],
      horizonMonths: 6,
      startMonth: '2026-01',
    })
    // 双重扣减的现存输出：100,000 / 100,000 / 月 = 1
    expect(runway).toBe(1)
    // 若按"未扣承诺的原始现金"起算，真实可支撑 7 个月——P2 修正公式后本断言应翻转
    expect(700_000 / 100_000).toBe(7)
  })
})

describe('P3-05：跨公司幂等键无全局歧义（单参查询已移除）', () => {
  it('多公司同键：各公司按 (companyId, key) 精确命中自己的交易', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.registerCompany('c2')
    const t1 = ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    }).result!.transaction
    const t2 = ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c2', day: 0, category: 'advance',
      amountCents: 2_000, description: '注资', source: 'player_authorized',
    }).result!.transaction

    expect(ledger.getTransactionByKeyInCompany('c1', 'advance')!.transactionId).toBe(t1.transactionId)
    expect(ledger.getTransactionByKeyInCompany('c2', 'advance')!.transactionId).toBe(t2.transactionId)
    expect(ledger.getTransactionByKeyInCompany('c3', 'advance')).toBeUndefined()
    // 单参重载已删除：账本不再暴露"只能返回后写者"的查询
    expect((ledger as unknown as { getTransactionByKey?: unknown }).getTransactionByKey).toBeUndefined()
  })

  it('bulk 回滚按复合键删除：失败批次不会误删该公司既有索引项', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    const res = ledger.bulkPostTransactions([
      { idempotencyKey: 'b1', companyId: 'c1', day: 1, category: 'marketing', amountCents: -200, description: 'b1', source: 'system_auto' },
      { idempotencyKey: 'b2', companyId: 'c1', day: 1, category: 'marketing', amountCents: -10_000_000, description: 'b2', source: 'system_auto' },
    ])
    expect(res.success).toBe(false)
    // 整批回滚：b1 的交易与其索引都不存在
    expect(ledger.getTransactionByKeyInCompany('c1', 'b1')).toBeUndefined()
    expect(ledger.getAllTransactions()).toHaveLength(1)
    expect(ledger.getCashBalance('c1')).toBe(1_000)
    // 既有 advance 幂等仍生效
    const again = ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    expect(again.result!.idempotent).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(1_000)
  })

  it('幂等判定不再依赖"观测窗口"索引：pruneIdempotency 后跨期同键仍去重（BR-7 / TC-04）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'sale', companyId: 'c1', day: 1, category: 'sales_revenue',
      amountCents: 500, description: '销售', source: 'system_auto',
    })
    ledger.pruneIdempotency(1 + T.idempotencyRetentionDays + 30)
    const dup = ledger.postTransaction({
      idempotencyKey: 'sale', companyId: 'c1', day: 1, category: 'sales_revenue',
      amountCents: 500, description: '销售', source: 'system_auto',
    })
    expect(dup.result!.idempotent).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(500)
  })
})

describe('P3-06：settleItem 键命中优先（同键重试幂等成功）', () => {
  const item = {
    itemId: 'ap-1', direction: 'payable' as const, companyId: 'c1', counterpartyId: 'vendor',
    amountCents: 400, settledCents: 0, dueDate: 30, sourceRef: 'contract-1',
    state: 'open' as const, settlementTxIds: [],
  }

  it('同键重试（已结算对象）返回 idempotent=true 而非 PAYABLE_OVER_SETTLED', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    const first = ledger.settleItem(item, 400, 'settle:ap-1:2026-01', 30)
    expect(first.success).toBe(true)
    const retry = ledger.settleItem(first.result!.item, 400, 'settle:ap-1:2026-01', 30)
    expect(retry.success).toBe(true)
    expect(retry.idempotent).toBe(true)
    expect(retry.errorCode).toBeUndefined()
    expect(retry.result!.transaction.transactionId).toBe(first.result!.transaction.transactionId)
    expect(ledger.getAllTransactions()).toHaveLength(2)
    expect(ledger.getCashBalance('c1')).toBe(600)
  })

  it('命中但 itemId 不一致 ⇒ FIN_IDEMPOTENCY_KEY_CONFLICT（不假成功）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    ledger.settleItem(item, 400, 'settle:key', 30)
    const conflict = ledger.settleItem({ ...item, itemId: 'ap-2' }, 400, 'settle:key', 30)
    expect(conflict.success).toBe(false)
    expect(conflict.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
    expect(ledger.getCashBalance('c1')).toBe(600)
  })

  it('未结算过但金额超过剩余 ⇒ 仍报 PAYABLE_OVER_SETTLED（守卫未被削弱）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    const over = ledger.settleItem(item, 500, 'settle:ap-1:2026-01', 30)
    expect(over.success).toBe(false)
    expect(over.errorCode).toBe(FIN_ERROR.PAYABLE_OVER_SETTLED)
    expect(ledger.getAllTransactions()).toHaveLength(1)
  })
})

describe('P3-07：createCommitment 沙盒守卫必填（无守卫调用在类型/运行期都不可能）', () => {
  const input = {
    commitmentId: 'cm-1', companyId: 'c1', sourceType: 'employment_salary' as const,
    sourceRef: 'emp-1', amountCents: 100_000, period: 'monthly' as const,
    startAt: d(2026, 1), endAt: d(2026, 3),
  }

  it('漏传 options（运行期绕过类型检查）⇒ fail-loud，不默认放行', () => {
    const untyped = createCommitment as unknown as (i: typeof input) => BudgetCommitment
    expect(() => untyped(input)).toThrow(/FIN_COMMITMENT_SETTLEMENT_INVALID/)
  })

  it('传了 options 但既无 ledger 也无 sandboxStateSource ⇒ fail-loud', () => {
    expect(() => createCommitment(input, {})).toThrow(/FIN_COMMITMENT_SETTLEMENT_INVALID/)
    expect(() => createCommitment(input, { sandboxActive: false })).toThrow(/FIN_COMMITMENT_SETTLEMENT_INVALID/)
  })

  it('账本绑定模式：沙盒公司必然被拒（守卫不可"忘记传"）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.setSandboxObserved('c1', true)
    expect(() => createCommitment(input, { ledger })).toThrow(SandboxCommitmentBlockedError)
    // 账本注册入口同样内置守卫
    expect(() => ledger.registerCommitment(input)).toThrow(SandboxCommitmentBlockedError)
    ledger.setSandboxObserved('c1', false)
    expect(createCommitment(input, { ledger }).state).toBe('committed')
  })

  it('显式声明来源模式：sandboxStateSource 必须与 sandboxActive 同时给出', () => {
    expect(createCommitment(input, { sandboxActive: false, sandboxStateSource: 'caller_asserted' }).state)
      .toBe('committed')
    expect(() => createCommitment(input, { sandboxActive: true, sandboxStateSource: 'caller_asserted' }))
      .toThrow(SandboxCommitmentBlockedError)
  })
})
