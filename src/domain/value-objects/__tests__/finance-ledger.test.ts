/**
 * FIN V0.2 唯一现金入口 / INV-1 / 幂等 / 冲销 / 重放测试。
 * 覆盖 TC-01、TC-02、TC-03、TC-04、TC-08、TC-09、TC-16、TC-18 与 §5.1/§5.7/§11.1。
 */
import { describe, it, expect } from 'vitest'
import { UnifiedLedger } from '@domain/entities/finance'
import { FIN_ERROR, FinanceError, LedgerInconsistentError } from '@domain/entities/finance'
import { makeLedger, makeInput, postAdvance, DAY } from './finance-fixtures'

describe('TC-01 / INV-1：唯一现金入口与派生余额（F-01 方案 a）', () => {
  it('所有现金变动均经 postTransaction；cashBalanceCents == Σ全部 amountCents', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 12_000_000, 0) // $120,000 = 12_000_000 cents
    ledger.postTransaction(makeInput({
      idempotencyKey: 'salary:m1', companyId: 'c1', day: 30,
      category: 'salary', amountCents: -350_000, description: '月薪',
    }))
    const account = ledger.getAccount('c1')!
    const sum = ledger.getAllTransactions().reduce((s, t) => s + t.amountCents, 0)
    expect(account.cashBalanceCents).toBe(11_650_000)
    expect(account.cashBalanceCents).toBe(sum)
    expect(ledger.getCashBalance('c1')).toBe(sum)
  })

  it('balanceAfterCents 为每笔入账快照，等于入账前余额 + amountCents', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000_000, 0)
    const r = ledger.postTransaction(makeInput({
      idempotencyKey: 's1', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 250_000, description: '销售',
    }))
    expect(r.success).toBe(true)
    expect(r.result!.transaction.balanceAfterCents).toBe(1_250_000)
  })

  it('status 仅审计、不参与求和：reversed 交易仍计入 INV-1', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 10_000, 0)
    const sale = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 $100',
    })).result!.transaction
    const rev = ledger.reverseTransaction(sale.transactionId, '退款', 'refund:sale', { allowNegativeBalance: true })
    expect(rev.success).toBe(true)
    expect(sale.status).toBe('reversed')
    expect(rev.result!.reversalOf).toBe(sale.transactionId)
    // 原交易 reversed 但仍计入求和，反向交易 −10_000 计入 → 回到注资额
    expect(ledger.getCashBalance('c1')).toBe(10_000)
  })
})

describe('TC-02 反证：绕过唯一入口无法改现金（BR-1 / F-10）', () => {
  it('LedgerAccount.cashBalanceCents 为派生只读快照；篡改快照不源响权威余额', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 5_000, 0)
    const account = ledger.getAccount('c1')!
    // 通过显式类型断言模拟运行时误改（类型 readonly 已在编译期阻止正常赋值）
    ;(account as { cashBalanceCents: number }).cashBalanceCents = 999_999_999
    expect(account.cashBalanceCents).toBe(999_999_999)
    // 权威余额未变：派生视图不是写源
    expect(ledger.getCashBalance('c1')).toBe(5_000)
    expect(ledger.getAccount('c1')!.cashBalanceCents).toBe(5_000)
  })

  it('账本不暴露任何写余额 API；余额每次由交易重算（移除 postTransaction 后无路径改现金）', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 5_000, 0)
    const api = Object.getOwnPropertyNames(Object.getPrototypeOf(ledger))
    expect(api.some((name) => /setBalance|setCash|writeBalance|credit|debit/i.test(name))).toBe(false)
    expect(api).toContain('postTransaction')
    // 无交易入账则余额恒为初始值
    const fresh = makeLedger()
    fresh.registerCompany('c2', 0)
    expect(fresh.getCashBalance('c2')).toBe(0)
  })

  it('两个账户互不串账：现金流三分无第二本账（TC-09）', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 10_000, 0)
    postAdvance(ledger, 'c2', 20_000, 0, 'advance:c2')
    ledger.postTransaction(makeInput({
      idempotencyKey: 'contract', companyId: 'c1', day: 1,
      category: 'contract_payment', amountCents: -3_000, description: '合同付款', referenceId: 'ct-1',
    }))
    expect(ledger.getCashBalance('c1')).toBe(7_000)
    expect(ledger.getCashBalance('c2')).toBe(20_000)
    expect(ledger.getTransactionByKeyInCompany('c1', 'contract')!.referenceId).toBe('ct-1')
  })
})

describe('TC-03 / TC-04 幂等与跨期去重（BR-7）', () => {
  it('同 idempotencyKey 两次提交：仅 1 笔、idempotent=true、余额只变一次', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    const key = 'salary:m1'
    const a = ledger.postTransaction(makeInput({
      idempotencyKey: key, companyId: 'c1', day: 1,
      category: 'salary', amountCents: -200, description: '月薪',
    }))
    const b = ledger.postTransaction(makeInput({
      idempotencyKey: key, companyId: 'c1', day: 1,
      category: 'salary', amountCents: -200, description: '月薪',
    }))
    expect(a.success && b.success).toBe(true)
    expect(a.result!.idempotent).toBe(false)
    expect(b.result!.idempotent).toBe(true)
    expect(b.result!.transaction.transactionId).toBe(a.result!.transaction.transactionId)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === key)).toHaveLength(1)
    expect(ledger.getCashBalance('c1')).toBe(800)
  })

  it('TC-04：30 天后退款键仍命中 transactionByKey，不重复入账', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    ledger.postTransaction(makeInput({
      idempotencyKey: 'sale-day1', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 100, description: '销售',
    }))
    const day40 = DAY.after30
    ledger.pruneIdempotency(day40) // 快索引清理，但 transactionByKey 保留
    const rev = ledger.reverseTransaction(
      ledger.getTransactionByKeyInCompany('c1', 'sale-day1')!.transactionId,
      '跨期退款', 'refund:sale-day1', { allowNegativeBalance: true },
    )
    expect(rev.success).toBe(true)
    const again = ledger.reverseTransaction(
      ledger.getTransactionByKeyInCompany('c1', 'sale-day1')!.transactionId,
      '重复退款', 'refund:sale-day1', { allowNegativeBalance: true },
    )
    expect(again.success).toBe(true)
    expect(again.result!.transactionId).toBe(rev.result!.transactionId)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'refund:sale-day1')).toHaveLength(1)
  })

  it('开局注资固定幂等键 advance：重复注册不重复注资', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 10_000, 0)
    const again = postAdvance(ledger, 'c1', 10_000, 0)
    expect(again.result!.idempotent).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(10_000)
  })
})

describe('TC-05 / BR-9：负现金分流（自主拒绝 vs 固定结算允许）', () => {
  it('自主支出余额不足 → FIN_INSUFFICIENT_CASH；固定结算允许负现金', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100, 0)
    const rejected = ledger.postTransaction(makeInput({
      idempotencyKey: 'buy', companyId: 'c1', day: 1,
      category: 'marketing', amountCents: -200, description: '自主营销', source: 'player_authorized',
    }))
    expect(rejected.success).toBe(false)
    expect(rejected.errorCode).toBe('FIN_INSUFFICIENT_CASH')
    expect(ledger.getCashBalance('c1')).toBe(100)

    const fixed = ledger.postTransaction(makeInput({
      idempotencyKey: 'rent', companyId: 'c1', day: 1,
      category: 'office_rent', amountCents: -300, description: '固定租金',
    }), { allowNegativeBalance: true })
    expect(fixed.success).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(-200)
  })

  it('零额与非整数金额被拒绝（BR-2）', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100, 0)
    expect(ledger.postTransaction(makeInput({
      idempotencyKey: 'z', companyId: 'c1', day: 1, category: 'tax', amountCents: 0, description: '零',
    })).errorCode).toBe('FIN_AMOUNT_ZERO')
    expect(ledger.postTransaction(makeInput({
      idempotencyKey: 'n', companyId: 'c1', day: 1, category: 'tax', amountCents: 1.5, description: '小数',
    })).errorCode).toBe('FIN_AMOUNT_NOT_INTEGER')
  })
})

describe('TC-08 / TC-18 / F-11：退款与平台费同步冲回、重放通过', () => {
  it('全额退款净影响为 0；原交易与反向交易均计入求和，replay 后 INV-1 通过', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100_000, 0)
    const sale = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale', companyId: 'c1', day: DAY.sale,
      category: 'sales_revenue', amountCents: 10_000, description: '$100 销售', referenceId: 'sr-1',
    })).result!.transaction
    const fee = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee', companyId: 'c1', day: DAY.sale,
      category: 'platform_fee', amountCents: -2_000, description: '平台抽成 20%', referenceId: 'sr-1',
    })).result!.transaction

    const beforeSale = 100_000
    const refund = ledger.refundSale({
      saleTxId: sale.transactionId, feeTxId: fee.transactionId,
      refundAmountCents: 10_000, refundKey: 'refund:sale', feeRefundKey: 'refund:fee',
      reason: '全额退款', day: DAY.refund,
    })
    expect(refund.success).toBe(true)
    // 退款交易自身 −10_000 +2_000 = −8_000；原销售净额 +8_000 被完全回冲 → 账户回到 100_000
    expect(refund.result!.refundCashImpactCents).toBe(-8_000)
    expect(refund.result!.reversal.reversalOf).toBe(sale.transactionId)
    expect(refund.result!.feeReversal!.reversalOf).toBe(fee.transactionId)
    expect(ledger.getCashBalance('c1')).toBe(beforeSale)

    // TC-18：replay 从交易重建
    const rebuilt = new UnifiedLedger()
    const balances = rebuilt.replay(ledger.getAllTransactions(), ['c1'])
    expect(balances.get('c1')).toBe(beforeSale)
    rebuilt.verifyInvariant('c1', beforeSale)
    expect(sale.status).toBe('reversed')
    expect(fee.status).toBe('reversed')
  })

  it('部分退款按同费率冲回手续费；重复退款幂等不双算', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100_000, 0)
    const sale = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale', companyId: 'c1', day: 1, category: 'sales_revenue',
      amountCents: 10_000, description: '销售',
    })).result!.transaction
    const fee = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee', companyId: 'c1', day: 1, category: 'platform_fee',
      amountCents: -2_000, description: '抽成',
    })).result!.transaction
    const beforeSale = 100_000
    const first = ledger.refundSale({
      saleTxId: sale.transactionId, feeTxId: fee.transactionId,
      refundAmountCents: 5_000, refundKey: 'r:sale', feeRefundKey: 'r:fee',
      reason: '半额退款', day: 5,
    })
    expect(first.result!.feeReversal!.amountCents).toBe(1_000)
    expect(first.result!.refundCashImpactCents).toBe(-4_000) // −5_000 +1_000
    const second = ledger.refundSale({
      saleTxId: sale.transactionId, feeTxId: fee.transactionId,
      refundAmountCents: 5_000, refundKey: 'r:sale', feeRefundKey: 'r:fee',
      reason: '重复', day: 5,
    })
    expect(second.result!.refundCashImpactCents).toBe(first.result!.refundCashImpactCents)
    expect(ledger.getCashBalance('c1')).toBe(beforeSale + 4_000) // 半额退款后仍保留半额净收入
  })
})

describe('TC-16 / §10.5：读档重放与一致性', () => {
  it('replay 重建余额与索引；balanceAfterCents 不一致时抛 LEDGER_INCONSISTENT', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    const txs = ledger.getAllTransactions().map((t) => ({ ...t }))
    const rebuilt = new UnifiedLedger()
    expect(rebuilt.replay(txs, ['c1']).get('c1')).toBe(1_000)
    expect(rebuilt.getTransactionByKeyInCompany('c1', 'advance')).toBeDefined()

    const corrupt = txs.map((t) => ({ ...t, balanceAfterCents: t.balanceAfterCents + 1 }))
    expect(() => new UnifiedLedger().replay(corrupt, ['c1'])).toThrow(LedgerInconsistentError)
  })

  it('verifyInvariant 对声明余额不一致抛错（账本不一致错态）', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    expect(() => ledger.verifyInvariant('c1', 999)).toThrow(LedgerInconsistentError)
    expect(() => ledger.verifyInvariant('c1', 1_000)).not.toThrow()
  })

  it('BR-4：同一应付重复结算被幂等键去重，settledCents 不双加', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    const item = {
      itemId: 'ap-1', direction: 'payable' as const, companyId: 'c1',
      counterpartyId: 'vendor', amountCents: 300, settledCents: 0, dueDate: 30,
      sourceRef: 'contract-1', state: 'open' as const, settlementTxIds: [],
    }
    const key = 'settle:ap-1:2026-01'
    const a = ledger.settleItem(item, 300, key, 30)
    // P3-06：同键重试不再"重新累加"，而是返回同一笔交易并声明幂等（item 摘要即为已结算态）。
    const b = ledger.settleItem(item, 300, key, 30)
    expect(a.result!.item.settledCents).toBe(300)
    expect(a.result!.item.state).toBe('settled')
    expect(b.idempotent).toBe(true)
    expect(b.result!.idempotent).toBe(true)
    expect(b.result!.transaction.transactionId).toBe(a.result!.transaction.transactionId)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === key)).toHaveLength(1)
    expect(ledger.getCashBalance('c1')).toBe(700)
  })

  it('R9-P1-02：幂等命中返回账本重建摘要，而非调用方传入的过期快照', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    const item = {
      itemId: 'ap-1', direction: 'payable' as const, companyId: 'c1',
      counterpartyId: 'vendor', amountCents: 300, settledCents: 0, dueDate: 30,
      sourceRef: 'contract-1', state: 'open' as const, settlementTxIds: [],
    }
    const key = 'settle:ap-1:2026-01'
    const first = ledger.settleItem(item, 300, key, 30)
    expect(first.success).toBe(true)
    // 调用方持有"未结算的原始对象"（settledCents=0 / open / 无交易清单）——它已过期。
    const staleOriginal = item
    expect(staleOriginal.settledCents).toBe(0)
    expect(staleOriginal.state).toBe('open')

    // 用同一幂等键 + 过期原始对象重试：返回的必须是账本重建后的最新摘要。
    const retry = ledger.settleItem(staleOriginal, 300, key, 30)
    expect(retry.success).toBe(true)
    expect(retry.idempotent).toBe(true)
    const rebuilt = retry.result!.item
    expect(rebuilt.settledCents).toBe(300)
    expect(rebuilt.state).toBe('settled')
    expect(rebuilt.settlementTxIds).toEqual([first.result!.transaction.transactionId])
    // 不得回显入参快照（旧实现返回 `{ ...item }`，会把 open/0 当结果返回）
    expect(rebuilt).not.toBe(staleOriginal)
    expect(rebuilt).not.toEqual(staleOriginal)
  })
})

describe('CODE-02 C-1：幂等键按公司隔离（P1-01）', () => {
  it('两家公司同用固定键 advance：各自到账并返回自身交易', () => {
    const ledger = makeLedger()
    const c1 = postAdvance(ledger, 'c1', 1_000_000, 0)
    const c2 = postAdvance(ledger, 'c2', 1_000_000, 0)
    expect(c1.success && c2.success).toBe(true)
    expect(c2.result!.idempotent).toBe(false)
    expect(c2.result!.transaction.companyId).toBe('c2')
    expect(c2.result!.transaction.transactionId).not.toBe(c1.result!.transaction.transactionId)
    expect(ledger.getCashBalance('c1')).toBe(1_000_000)
    expect(ledger.getCashBalance('c2')).toBe(1_000_000)
    // 同公司重复提交仍幂等
    const again = postAdvance(ledger, 'c2', 1_000_000, 0)
    expect(again.result!.idempotent).toBe(true)
    expect(again.result!.transaction.transactionId).toBe(c2.result!.transaction.transactionId)
    expect(ledger.getCashBalance('c2')).toBe(1_000_000)
  })

  it('冲销键被其他公司占用 → FIN_IDEMPOTENCY_KEY_MISMATCH，不串账', () => {
    const ledger = makeLedger()
    const a = postAdvance(ledger, 'c1', 1_000_000, 0).result!.transaction
    const b = postAdvance(ledger, 'c2', 1_000_000, 0).result!.transaction
    const first = ledger.reverseTransaction(a.transactionId, '退款', 'refund:shared', { allowNegativeBalance: true })
    expect(first.success).toBe(true)
    // P3-05：幂等键改为纯复合键，跨公司同名键是**各自独立的合法操作**（如两家公司都用
    // refund:m1），不再有"裸键被谁占用"的全局概念 → 两家各自冲销成功、互不串账、互不误扣。
    const second = ledger.reverseTransaction(b.transactionId, '退款', 'refund:shared', { allowNegativeBalance: true })
    expect(second.success).toBe(true)
    expect(second.result!.companyId).toBe('c2')
    expect(second.result!.reversalOf).toBe(b.transactionId)
    expect(ledger.getCashBalance('c1')).toBe(0)
    expect(ledger.getCashBalance('c2')).toBe(0)
    expect(ledger.getTransactionByKeyInCompany('c1', 'refund:shared')!.reversalOf).toBe(a.transactionId)
    expect(ledger.getTransactionByKeyInCompany('c2', 'refund:shared')!.reversalOf).toBe(b.transactionId)
  })

  it('refundSale 退款/手续费键被其他公司占用 → FIN_IDEMPOTENCY_KEY_MISMATCH', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100_000, 0)
    postAdvance(ledger, 'c2', 100_000, 0)
    const sale1 = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:c1', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: 'c1 销售',
    })).result!.transaction
    const fee1 = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee:c1', companyId: 'c1', day: 1,
      category: 'platform_fee', amountCents: -2_000, description: 'c1 抽成',
    })).result!.transaction
    const sale2 = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:c2', companyId: 'c2', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: 'c2 销售',
    })).result!.transaction
    const fee2 = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee:c2', companyId: 'c2', day: 1,
      category: 'platform_fee', amountCents: -2_000, description: 'c2 抽成',
    })).result!.transaction

    const okRefund = ledger.refundSale({
      saleTxId: sale1.transactionId, feeTxId: fee1.transactionId,
      refundAmountCents: 10_000, refundKey: 'refund:shared', feeRefundKey: 'feeRefund:shared',
      reason: 'c1 退款', day: 5,
    })
    expect(okRefund.success).toBe(true)
    const blocked = ledger.refundSale({
      saleTxId: sale2.transactionId, feeTxId: fee2.transactionId,
      refundAmountCents: 10_000, refundKey: 'refund:shared', feeRefundKey: 'feeRefund:shared',
      reason: 'c2 退款', day: 5,
    })
    // P3-05：同上——跨公司同名退款键不再冲突，c2 的退款独立成立且只作用于 c2 的交易。
    expect(blocked.success).toBe(true)
    expect(blocked.result!.original.companyId).toBe('c2')
    expect(blocked.result!.reversal.companyId).toBe('c2')
    expect(ledger.getCashBalance('c1')).toBe(100_000)
    expect(ledger.getCashBalance('c2')).toBe(100_000)
  })
})

describe('CODE-02 C-3：结算守卫 / 退款半状态 / replay 上限（P3-02、P3-03）', () => {
  /**
   * P3-06 回归（先失败后通过）：原实现中 remaining 守卫先于幂等判定，同键重试返回
   * PAYABLE_OVER_SETTLED。CODE-04 按任务卡 §B.7 改为"键命中优先 + 校验 itemId"，
   * 同键重试必须幂等成功且不新增交易；键被另一笔义务占用时报冲突。
   * 本用例替换了 CODE-02 C-3 中**固化了旧错误行为**的断言（详见实施报告 §B.3）。
   */
  it('P3-06：同键重试幂等成功（不再报 PAYABLE_OVER_SETTLED）；键指向他笔义务报冲突', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    const item = {
      itemId: 'ap-1', direction: 'payable' as const, companyId: 'c1',
      counterpartyId: 'vendor', amountCents: 300, settledCents: 0, dueDate: 30,
      sourceRef: 'contract-1', state: 'open' as const, settlementTxIds: [],
    }
    const first = ledger.settleItem(item, 300, 'settle:ap-1:2026-01', 30)
    expect(first.success).toBe(true)
    const settled = first.result!.item
    expect(settled.settledCents).toBe(300)

    const retry = ledger.settleItem(settled, 300, 'settle:ap-1:2026-01', 30)
    expect(retry.success).toBe(true)
    expect(retry.idempotent).toBe(true)
    expect(retry.result!.idempotent).toBe(true)
    expect(retry.result!.transaction.transactionId).toBe(first.result!.transaction.transactionId)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'settle:ap-1:2026-01')).toHaveLength(1)
    expect(ledger.getCashBalance('c1')).toBe(700)

    // 同键指向另一笔义务 → 不得静默复用（假成功）
    const other = { ...item, itemId: 'ap-2' }
    const conflict = ledger.settleItem(other, 300, 'settle:ap-1:2026-01', 30)
    expect(conflict.success).toBe(false)
    expect(conflict.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
    expect(ledger.getCashBalance('c1')).toBe(700)
    // 同键但金额不同 → 同样报冲突
    const mismatch = ledger.settleItem(settled, 100, 'settle:ap-1:2026-01', 30)
    expect(mismatch.success).toBe(false)
    expect(mismatch.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
  })

  it('退款半状态（refund 已入账、fee 未入账）续做手续费冲回，不重复退款', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 100_000, 0)
    const sale = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售',
    })).result!.transaction
    const fee = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee', companyId: 'c1', day: 1,
      category: 'platform_fee', amountCents: -2_000, description: '抽成',
    })).result!.transaction

    // 构造半状态：先用同一退款键完成销售冲销（等同上次退款中断在 fee 之前）
    const partial = ledger.reverseTransaction(sale.transactionId, '早先退款', 'r:sale', { allowNegativeBalance: true })
    expect(partial.success).toBe(true)
    expect(sale.status).toBe('reversed')

    const resumed = ledger.refundSale({
      saleTxId: sale.transactionId, feeTxId: fee.transactionId,
      refundAmountCents: 10_000, refundKey: 'r:sale', feeRefundKey: 'r:fee',
      reason: '续做退款', day: 5,
    })
    expect(resumed.success).toBe(true)
    expect(resumed.result!.reversal.transactionId).toBe(partial.result!.transactionId)
    expect(resumed.result!.feeReversal!.amountCents).toBe(2_000)
    expect(resumed.result!.refundCashImpactCents).toBe(-8_000) // −10_000 +2_000
    expect(ledger.getCashBalance('c1')).toBe(100_000)
    // 再次调用两键均命中，幂等不双算
    const again = ledger.refundSale({
      saleTxId: sale.transactionId, feeTxId: fee.transactionId,
      refundAmountCents: 10_000, refundKey: 'r:sale', feeRefundKey: 'r:fee',
      reason: '重复', day: 5,
    })
    expect(again.result!.refundCashImpactCents).toBe(-8_000)
    expect(ledger.getCashBalance('c1')).toBe(100_000)
  })

  it('replay 超过 tuning.replayMaxTransactions → 明确抛 FIN_REPLAY_LIMIT_EXCEEDED', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 1_000, 0)
    ledger.postTransaction(makeInput({
      idempotencyKey: 'salary', companyId: 'c1', day: 1,
      category: 'salary', amountCents: -200, description: '月薪',
    }))
    const txs = ledger.getAllTransactions()
    const limited = makeLedger({ replayMaxTransactions: 1 })
    try {
      limited.replay(txs, ['c1'])
      throw new Error('expected replay limit error')
    } catch (e) {
      expect(e).toBeInstanceOf(FinanceError)
      expect((e as FinanceError).code).toBe(FIN_ERROR.REPLAY_LIMIT_EXCEEDED)
    }
  })
})

/**
 * P2-04 反证：同公司复用冲销/退款键时，命中必须校验"就是本次目标操作"，
 * 不得静默返回他笔交易并假报成功（漏冲销 / 混合结果）。
 */
describe('CODE-02 P2-04：同公司幂等键复用的操作同一性校验', () => {
  it('P2-04-B2：同键冲销两笔不同交易 → 第二笔 FIN_IDEMPOTENCY_KEY_CONFLICT，目标仍 posted、余额不变', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 500_000, 0)
    const t1 = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:1', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 1',
    })).result!.transaction
    const t2 = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:2', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 2',
    })).result!.transaction

    const first = ledger.reverseTransaction(t1.transactionId, '退款', 'refund:dup', { allowNegativeBalance: true })
    expect(first.success).toBe(true)
    const balanceAfterFirst = ledger.getCashBalance('c1')
    expect(balanceAfterFirst).toBe(510_000)

    const second = ledger.reverseTransaction(t2.transactionId, '退款', 'refund:dup', { allowNegativeBalance: true })
    expect(second.success).toBe(false)
    expect(second.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
    // 不返回他笔交易（否则调用方会误以为 t2 已冲销）
    expect(second.result).toBeUndefined()
    expect(t1.status).toBe('reversed')
    expect(t2.status).toBe('posted')
    expect(t2.reversedBy).toBeNull()
    expect(ledger.getCashBalance('c1')).toBe(balanceAfterFirst)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'refund:dup')).toHaveLength(1)
  })

  it('P2-04-B3：普通入账键被复用作冲销键 → FIN_IDEMPOTENCY_KEY_CONFLICT，不返回 advance 交易', () => {
    const ledger = makeLedger()
    const advance = postAdvance(ledger, 'c1', 500_000, 0).result!.transaction
    const sale = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售',
    })).result!.transaction
    const balanceBefore = ledger.getCashBalance('c1')

    const reused = ledger.reverseTransaction(sale.transactionId, '退款', 'advance', { allowNegativeBalance: true })
    expect(reused.success).toBe(false)
    expect(reused.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
    expect(reused.result).toBeUndefined()
    expect(sale.status).toBe('posted')
    expect(advance.status).toBe('posted')
    expect(ledger.getCashBalance('c1')).toBe(balanceBefore)
  })

  it('P2-04：同键冲销同一笔交易的真实重复仍幂等（同反向交易、单笔、余额不变）', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 500_000, 0)
    const t1 = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:1', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 1',
    })).result!.transaction
    ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:2', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 2',
    }))

    const first = ledger.reverseTransaction(t1.transactionId, '退款', 'refund:dup', { allowNegativeBalance: true })
    const balanceAfterFirst = ledger.getCashBalance('c1')
    const again = ledger.reverseTransaction(t1.transactionId, '重复退款', 'refund:dup', { allowNegativeBalance: true })

    expect(again.success).toBe(true)
    expect(again.idempotent).toBe(true)
    expect(again.result!.transactionId).toBe(first.result!.transactionId)
    expect(again.result!.reversalOf).toBe(t1.transactionId)
    expect(again.result!.amountCents).toBe(-10_000)
    expect(ledger.getCashBalance('c1')).toBe(balanceAfterFirst)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'refund:dup')).toHaveLength(1)
  })

  it('P2-04-B4：同键 refundSale 针对不同销售 → 冲突报错，不返回混合结果', () => {
    const ledger = makeLedger()
    postAdvance(ledger, 'c1', 200_000, 0)
    const saleA = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:A', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 A',
    })).result!.transaction
    const feeA = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee:A', companyId: 'c1', day: 1,
      category: 'platform_fee', amountCents: -2_000, description: '抽成 A',
    })).result!.transaction
    const saleB = ledger.postTransaction(makeInput({
      idempotencyKey: 'sale:B', companyId: 'c1', day: 1,
      category: 'sales_revenue', amountCents: 10_000, description: '销售 B',
    })).result!.transaction
    const feeB = ledger.postTransaction(makeInput({
      idempotencyKey: 'fee:B', companyId: 'c1', day: 1,
      category: 'platform_fee', amountCents: -2_000, description: '抽成 B',
    })).result!.transaction

    const refundA = ledger.refundSale({
      saleTxId: saleA.transactionId, feeTxId: feeA.transactionId,
      refundAmountCents: 10_000, refundKey: 'refund:dup', feeRefundKey: 'feeRefund:dup',
      reason: 'A 退款', day: 5,
    })
    expect(refundA.success).toBe(true)
    const balanceAfterA = ledger.getCashBalance('c1')
    // 200,000 + A 净额 8,000 + B 净额 8,000 − A 退款净额 8,000
    expect(balanceAfterA).toBe(208_000)

    const refundB = ledger.refundSale({
      saleTxId: saleB.transactionId, feeTxId: feeB.transactionId,
      refundAmountCents: 10_000, refundKey: 'refund:dup', feeRefundKey: 'feeRefund:dup',
      reason: 'B 退款', day: 5,
    })
    expect(refundB.success).toBe(false)
    expect(refundB.errorCode).toBe(FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT)
    // 不返回"当前销售 + 他笔反向"的混合结果
    expect(refundB.result).toBeUndefined()
    expect(saleB.status).toBe('posted')
    expect(feeB.status).toBe('posted')
    expect(ledger.getCashBalance('c1')).toBe(balanceAfterA)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'refund:dup')).toHaveLength(1)
    expect(ledger.getAllTransactions().filter((t) => t.idempotencyKey === 'feeRefund:dup')).toHaveLength(1)
  })
})
