/**
 * CODE-04 A 段：统一账本收敛（BR-1 唯一现金入口 / INV-1 / Company.cash 派生只读）。
 *
 * 覆盖任务卡 §4 验收：
 *  - `Company.cashBalanceCents == Σ amountCents`（A-3 断言，status 不参与）；
 *  - 第二写入者反证：绕过账本直接改 cash ⇒ fail-loud（不是静默通过）；
 *  - 随机 200 笔混合交易（含冲销、退款、承诺兑现）后恒等式成立，
 *    且把某笔 status 改成 reversed 不影响求和（验证 status 仅审计）；
 *  - `FinanceService` 与 `UnifiedLedger` 共享同一账本，全部读操作从账本派生。
 */
import { describe, it, expect } from 'vitest'
import { UnifiedLedger, type LedgerTransaction } from '@domain/entities/finance'
import { FinanceService } from '@simulation/services/finance-service'
import { makeCompany } from '../../__tests__/helpers'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

/** 确定性伪随机（mulberry32），仅用于本用例的输入序列；不参与任何生产路径。 */
function makeRand(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const day = (y: number, m: number, d: number) => gregorianToDayIndex(y, m, d)

describe('A-1 FinanceService 全量委托账本（BR-1 唯一现金入口）', () => {
  it('读操作全部从账本派生：getCashBalance / getTransactionsByCompany / getAllTransactions', () => {
    const ledger = new UnifiedLedger()
    const fin = new FinanceService(ledger)
    fin.registerCompany('c1')
    fin.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 5_000_000, description: '开局注资',
    })
    fin.postTransaction({
      idempotencyKey: 'rent', companyId: 'c1', day: 30, category: 'office_rent',
      amountCents: -300_000, description: '租金',
    }, { allowNegativeBalance: true })

    expect(fin.getCashBalance('c1')).toBe(ledger.getCashBalance('c1'))
    expect(fin.getCashBalance('c1')).toBe(4_700_000)
    expect(fin.getAllTransactions()).toHaveLength(ledger.getAllTransactions().length)
    expect(fin.getTransactionsByCompany('c1').map((t) => t.id)).toEqual(
      ledger.getTransactionsByCompany('c1').map((t) => t.transactionId),
    )
    // 账本参数才是真值：直接向账本入账，服务立即可见（不存在第二份余额缓存）
    ledger.postTransaction({
      idempotencyKey: 'sale', companyId: 'c1', day: 31, category: 'sales_revenue',
      amountCents: 100_000, description: '销售', source: 'system_auto',
    })
    expect(fin.getCashBalance('c1')).toBe(4_800_000)
  })

  it('服务与账本是同一实例：经服务冲销后账本侧余额同步变化', () => {
    const ledger = new UnifiedLedger()
    const fin = new FinanceService(ledger)
    fin.registerCompany('c1')
    const sale = fin.postTransaction({
      idempotencyKey: 'sale', companyId: 'c1', day: 1, category: 'sales_revenue',
      amountCents: 10_000, description: '销售',
    }, { allowNegativeBalance: true })
    const rev = fin.reverseTransaction(sale.result!.id, '退款', 'refund:sale')
    expect(rev.success).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(0)
    expect(fin.getCashBalance('c1')).toBe(0)
    expect(ledger.getAllTransactions()).toHaveLength(2)
  })

  it('getTransactionByKey 兼容签名：多公司同键返回 undefined（不再"返回某一笔"）', () => {
    const ledger = new UnifiedLedger()
    const fin = new FinanceService(ledger)
    fin.registerCompany('c1')
    fin.registerCompany('c2')
    for (const id of ['c1', 'c2']) {
      fin.postTransaction({
        idempotencyKey: 'advance', companyId: id, day: 0, category: 'advance',
        amountCents: 1_000, description: '注资',
      })
    }
    expect(fin.getTransactionByKey('advance')).toBeUndefined()
    expect(fin.getTransactionByKey('advance', 'c1')!.companyId).toBe('c1')
    expect(fin.getTransactionByKey('advance', 'c2')!.companyId).toBe('c2')
  })
})

describe('A-2 / A-3 Company.cashBalanceCents 派生只读 + 一致性断言', () => {
  it('syncCash 从账本派生；数值正确', () => {
    const ledger = new UnifiedLedger()
    const fin = new FinanceService(ledger)
    const company = makeCompany({ id: 'c1' })
    fin.registerCompany('c1')
    fin.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 2_000_000, description: '注资',
    })
    fin.syncCash(company)
    expect(company.cashBalanceCents).toBe(2_000_000)
    expect(() => fin.assertCashConsistent(company)).not.toThrow()
  })

  it('第二写入者反证：绕过账本直接改 cash ⇒ FIN_CASH_MISMATCH（fail-loud）', () => {
    const ledger = new UnifiedLedger()
    const fin = new FinanceService(ledger)
    const company = makeCompany({ id: 'c1' })
    fin.registerCompany('c1')
    fin.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 2_000_000, description: '注资',
    })
    fin.syncCash(company)
    // 模拟"第二个写入者"：任何绕过账本改 cash 的代码
    company.cashBalanceCents = 9_999_999
    expect(() => fin.assertCashConsistent(company)).toThrow(/FIN_CASH_MISMATCH/)
    // 断言不会静默修好它：字段保持被篡改的值（fail-loud，不对齐）
    expect(company.cashBalanceCents).toBe(9_999_999)
    expect(ledger.getCashBalance('c1')).toBe(2_000_000)
  })

  it('assertLedgerInvariant：status=reversed 的交易仍计入求和（F-01 方案 a）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('c1')
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId: 'c1', day: 0, category: 'advance',
      amountCents: 1_000, description: '注资', source: 'player_authorized',
    })
    const sale = ledger.postTransaction({
      idempotencyKey: 'sale', companyId: 'c1', day: 1, category: 'sales_revenue',
      amountCents: 500, description: '销售', source: 'system_auto',
    }).result!.transaction
    expect(() => ledger.assertLedgerInvariant('c1', 1_500)).not.toThrow()
    // 只改审计标记：求和不变
    sale.status = 'reversed'
    expect(ledger.sumTransactions('c1')).toBe(1_500)
    expect(() => ledger.assertLedgerInvariant('c1', 1_500)).not.toThrow()
    // 若断言实现错误地"只累加 posted"，这里会失败（1_000 ≠ 1_500）
    expect(() => ledger.assertLedgerInvariant('c1', 1_000)).toThrow(/FIN_CASH_MISMATCH/)
  })
})

describe('INV-1 随机 200 笔混合交易（含冲销 / 退款 / 承诺兑现）', () => {
  it('200 笔后 cash == Σ amount；改任一 status 不影响求和', () => {
    const ledger = new UnifiedLedger()
    const rand = makeRand(20261122)
    const intBetween = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
    const companyId = 'c1'
    ledger.registerCompany(companyId)
    ledger.postTransaction({
      idempotencyKey: 'advance', companyId, day: 0, category: 'advance',
      amountCents: 50_000_000, description: '注资', source: 'player_authorized',
    })

    const commitment = (() => {
      const r = ledger.registerCommitment({
        commitmentId: 'cm-rand', companyId, sourceType: 'employment_salary', sourceRef: 'emp-team',
        amountCents: 100_000, period: 'monthly', startAt: day(2026, 1, 1), endAt: day(2026, 12, 1),
      })
      expect(r.success).toBe(true)
      return r.result!.commitment
    })()

    let nextDay = 1
    const posted: LedgerTransaction[] = []
    for (let i = 0; i < 200; i++) {
      nextDay += 1 + intBetween(0, 3)
      const roll = i % 10
      if (roll === 0) {
        // 冲销：冲掉一笔已入账的销售
        const target = posted.find((t) => t.category === 'sales_revenue' && t.status === 'posted')
        if (target !== undefined) {
          ledger.reverseTransaction(target.transactionId, '随机冲销', `rev:${i}`, { allowNegativeBalance: true })
          continue
        }
      }
      if (roll === 1) {
        // 退款：销售 + 平台费同步冲回
        const sale = posted.find((t) => t.category === 'sales_revenue' && t.status === 'posted')
        const fee = posted.find((t) => t.category === 'platform_fee' && t.status === 'posted')
        if (sale !== undefined && fee !== undefined) {
          ledger.refundSale({
            saleTxId: sale.transactionId, feeTxId: fee.transactionId,
            refundAmountCents: Math.abs(sale.amountCents), refundKey: `r:sale:${i}`,
            feeRefundKey: `r:fee:${i}`, reason: '随机退款', day: nextDay,
          })
          continue
        }
      }
      if (roll === 2) {
        // 承诺兑现：每月至多一笔（幂等键含月份）
        const period = `2026-${String(1 + (i % 12)).padStart(2, '0')}`
        const txDay = day(2026, 1 + (i % 12), 15)
        const r = ledger.postTransaction({
          idempotencyKey: `${commitment.commitmentId}:${period}`, companyId, day: txDay,
          category: 'salary', amountCents: -100_000,
          description: `兑现承诺 ${period}`, referenceId: commitment.commitmentId,
          source: 'system_auto',
        }, { allowNegativeBalance: true })
        if (r.success && !r.result!.idempotent) {
          posted.push(r.result!.transaction)
          const settled = ledger.settleCommitment(companyId, commitment.commitmentId, 100_000, r.result!.transaction.transactionId)
          expect(settled.success).toBe(true)
        }
        continue
      }
      const categories = ['sales_revenue', 'platform_fee', 'marketing', 'project_expense', 'office_rent'] as const
      const category = categories[i % categories.length]!
      const amount = category === 'sales_revenue'
        ? intBetween(10_000, 200_000)
        : -intBetween(1_000, 50_000)
      const r = ledger.postTransaction({
        idempotencyKey: `mix:${i}`, companyId, day: nextDay, category, amountCents: amount,
        description: `混合 ${i}`, source: 'system_auto',
      }, { allowNegativeBalance: true })
      expect(r.success).toBe(true)
      if (!r.result!.idempotent) posted.push(r.result!.transaction)
    }

    const sum = ledger.getAllTransactions().reduce((s, t) => s + t.amountCents, 0)
    expect(ledger.getCashBalance(companyId)).toBe(sum)
    expect(() => ledger.assertLedgerInvariant(companyId, sum)).not.toThrow()

    // status 仅审计：把任意一笔（含正向销售）改成 reversed，求和与断言结果都不变
    const sample = posted.find((t) => t.category === 'sales_revenue')!
    sample.status = 'reversed'
    expect(ledger.sumTransactions(companyId)).toBe(sum)
    expect(() => ledger.assertLedgerInvariant(companyId, sum)).not.toThrow()

    // replay 后仍满足 INV-1
    const rebuilt = new UnifiedLedger()
    const balances = rebuilt.replay(ledger.getAllTransactions(), [companyId], ledger.getCommitments(companyId))
    expect(balances.get(companyId)).toBe(sum)
    expect(() => rebuilt.verifyInvariant(companyId, sum)).not.toThrow()
  })
})
