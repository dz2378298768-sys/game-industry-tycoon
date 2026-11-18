import { describe, it, expect } from 'vitest'
import { FinanceService } from '@simulation/services/finance-service'

function baseCmd(overrides: Partial<Parameters<FinanceService['postTransaction']>[0]> = {}) {
  return {
    idempotencyKey: 'k1',
    companyId: 'c1',
    day: 0,
    category: 'advance' as const,
    amountCents: 5_000_000,
    description: 'opening',
    ...overrides,
  }
}

describe('FinanceService', () => {
  it('注册公司后初始余额为 0', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    expect(fin.getCashBalance('c1')).toBe(0)
  })

  it('初始化交易只入账一次，重复提交由幂等键拦截', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    const first = fin.postTransaction(baseCmd())
    const second = fin.postTransaction(baseCmd())

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.idempotent).toBe(true)
    expect(fin.getCashBalance('c1')).toBe(5_000_000)
    expect(fin.getAllTransactions()).toHaveLength(1)
  })

  it('余额不足时拒绝自主支出', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    fin.postTransaction(baseCmd({ amountCents: 1000 }))
    const r = fin.postTransaction({
      idempotencyKey: 'k2',
      companyId: 'c1',
      day: 1,
      category: 'project_expense',
      amountCents: -2000,
      description: 'overspend',
    })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_INSUFFICIENT_CASH')
    expect(fin.getCashBalance('c1')).toBe(1000)
  })

  it('固定结算允许形成负现金', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    fin.postTransaction(baseCmd({ amountCents: 100 }))
    const r = fin.postTransaction(
      {
        idempotencyKey: 'salary:1',
        companyId: 'c1',
        day: 30,
        category: 'salary',
        amountCents: -150,
        description: 'salary',
      },
      { allowNegativeBalance: true },
    )
    expect(r.success).toBe(true)
    expect(fin.getCashBalance('c1')).toBe(-50)
    expect(fin.isInFinancialDistress('c1')).toBe(true)
  })

  it('重放交易可重建余额', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    fin.postTransaction(baseCmd())
    fin.postTransaction({
      idempotencyKey: 'k2',
      companyId: 'c1',
      day: 1,
      category: 'salary',
      amountCents: -100,
      description: 'salary',
    })
    const txs = fin.getAllTransactions()

    const rebuilt = new FinanceService()
    rebuilt.registerCompany('c1')
    const balances = rebuilt.replay(txs, ['c1'])
    expect(balances.get('c1')).toBe(4_999_900)
    expect(rebuilt.getCashBalance('c1')).toBe(4_999_900)
  })

  it('冲正交易受幂等键保护，重复冲正不重复改变余额', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    const posted = fin.postTransaction(baseCmd())
    if (!posted.result) throw new Error('post failed')

    const first = fin.reverseTransaction(posted.result.id, 'test', 'rev:k1')
    expect(first.success).toBe(true)
    expect(fin.getCashBalance('c1')).toBe(0)

    // 同一幂等键重复冲正：返回原交易，余额不变
    const second = fin.reverseTransaction(posted.result.id, 'test', 'rev:k1')
    expect(second.success).toBe(true)
    expect(second.idempotent).toBe(true)
    expect(fin.getCashBalance('c1')).toBe(0)
    expect(fin.getAllTransactions()).toHaveLength(2)

    // 已冲正的交易换一个键再次冲正：必须拒绝
    const third = fin.reverseTransaction(posted.result.id, 'test', 'rev:k1-again')
    expect(third.success).toBe(false)
    expect(third.errorCode).toBe('FIN_TX_ALREADY_REVERSED')
    expect(fin.getCashBalance('c1')).toBe(0)
  })

  it('冲正必须提供非空幂等键', () => {
    const fin = new FinanceService()
    fin.registerCompany('c1')
    const posted = fin.postTransaction(baseCmd())
    if (!posted.result) throw new Error('post failed')

    const r = fin.reverseTransaction(posted.result.id, 'test', '   ')
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_IDEMPOTENCY_KEY_REQUIRED')
    expect(fin.getCashBalance('c1')).toBe(5_000_000)
  })

  it('未注册公司的交易被拒绝', () => {
    const fin = new FinanceService()
    const r = fin.postTransaction(baseCmd({ companyId: 'ghost' }))
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe('FIN_COMPANY_NOT_REGISTERED')
  })
})
