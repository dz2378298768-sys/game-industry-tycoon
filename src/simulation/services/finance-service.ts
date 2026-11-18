import type { TransactionCategory, TransactionStatus } from '@domain/enums'
import type { Transaction } from '@domain/entities/transaction'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'

export interface PostTransactionCmd {
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: number
  referenceId?: string
  description: string
}

export interface PostTransactionOptions {
  /**
   * 允许余额变为负数。
   * 仅用于不可拒绝的固定结算（工资、租金、解雇补偿），以及读档重放。
   * 招聘、建项目等自主支出必须使用默认值 false。
   */
  allowNegativeBalance?: boolean
}

/**
 * FinanceService —— 所有现金变动的唯一入口。
 *
 * 规则：
 *   - 初始现金只能通过一笔 `advance` 交易入账一次（幂等键由调用方固定）。
 *   - 固定结算允许负现金（财务困难状态由 Application 层读取）。
 *   - 自主支出在余额不足时拒绝。
 *   - 所有交易按幂等键去重。
 */
export class FinanceService {
  private transactions: Transaction[] = []
  /** 公司最新余额快照 */
  private balanceByCompany = new Map<string, number>()
  /** 幂等键 → transaction id */
  private idempotencyIndex = new Map<string, string>()
  /** 幂等键 → day，用于清理 */
  private idempotencyDay = new Map<string, number>()

  private readonly IDEMPOTENCY_RETENTION_DAYS = 30

  /** 注册公司，初始余额固定为 0；真实现金必须由交易入账 */
  registerCompany(companyId: string): void {
    if (!this.balanceByCompany.has(companyId)) {
      this.balanceByCompany.set(companyId, 0)
    }
  }

  postTransaction(
    cmd: PostTransactionCmd,
    options: PostTransactionOptions = {},
  ): CommandResult<Transaction> {
    if (!Number.isInteger(cmd.amountCents)) {
      return fail('FIN_AMOUNT_NOT_INTEGER', 'Transaction amount must be an integer number of cents')
    }
    if (cmd.amountCents === 0) {
      return fail('FIN_AMOUNT_ZERO', 'Transaction amount must be non-zero')
    }
    if (!this.balanceByCompany.has(cmd.companyId)) {
      return fail('FIN_COMPANY_NOT_REGISTERED', `Company ${cmd.companyId} is not registered`)
    }

    const existingId = this.idempotencyIndex.get(cmd.idempotencyKey)
    if (existingId) {
      const found = this.transactions.find((t) => t.id === existingId)
      if (found) {
        return { success: true, result: found, idempotent: true }
      }
    }

    const currentBalance = this.getBalance(cmd.companyId)
    const newBalance = currentBalance + cmd.amountCents
    if (newBalance < 0 && options.allowNegativeBalance !== true) {
      return fail(
        'FIN_INSUFFICIENT_CASH',
        `Cannot post transaction of ${cmd.amountCents}; balance would be ${newBalance}`,
      )
    }

    const tx: Transaction = {
      id: uuid(),
      idempotencyKey: cmd.idempotencyKey,
      companyId: cmd.companyId,
      day: cmd.day,
      category: cmd.category,
      amountCents: cmd.amountCents,
      balanceAfterCents: newBalance,
      description: cmd.description,
      status: 'posted' as TransactionStatus,
      ...(cmd.referenceId !== undefined ? { referenceId: cmd.referenceId } : {}),
    }
    this.transactions.push(tx)
    this.balanceByCompany.set(cmd.companyId, newBalance)
    this.idempotencyIndex.set(cmd.idempotencyKey, tx.id)
    this.idempotencyDay.set(cmd.idempotencyKey, cmd.day)
    this.pruneIdempotency(cmd.day)
    return ok(tx)
  }

  bulkPostTransactions(cmds: PostTransactionCmd[]): CommandResult<Transaction[]> {
    const prevTxs = [...this.transactions]
    const prevBal = new Map(this.balanceByCompany)
    const prevIdx = new Map(this.idempotencyIndex)
    const prevDay = new Map(this.idempotencyDay)
    const results: Transaction[] = []
    for (const cmd of cmds) {
      const r = this.postTransaction(cmd)
      if (!r.success || !r.result) {
        this.transactions = prevTxs
        this.balanceByCompany = prevBal
        this.idempotencyIndex = prevIdx
        this.idempotencyDay = prevDay
        return fail(
          r.errorCode ?? 'FIN_BULK_POST_FAILED',
          r.errorMessage ?? `Bulk transaction failed after ${results.length}`,
        )
      }
      results.push(r.result)
    }
    return ok(results)
  }

  reverseTransaction(
    transactionId: string,
    reason: string,
    newKey: string,
  ): CommandResult<Transaction> {
    if (typeof newKey !== 'string' || newKey.trim().length === 0) {
      return fail('FIN_IDEMPOTENCY_KEY_REQUIRED', 'Reverse transaction requires a non-empty idempotency key')
    }

    // 冲正同样受幂等键保护：重复冲正同一笔交易不得重复改变余额
    const existingId = this.idempotencyIndex.get(newKey)
    if (existingId) {
      const found = this.transactions.find((t) => t.id === existingId)
      if (found) {
        return { success: true, result: found, idempotent: true }
      }
    }

    const target = this.transactions.find((t) => t.id === transactionId && t.status === 'posted')
    if (!target) {
      const anyStatus = this.transactions.find((t) => t.id === transactionId)
      if (anyStatus) {
        return fail('FIN_TX_ALREADY_REVERSED', `Transaction ${transactionId} is not in posted status`)
      }
      return fail('FIN_TX_NOT_FOUND', `No posted transaction ${transactionId}`)
    }

    const rev: Transaction = {
      id: uuid(),
      idempotencyKey: newKey,
      companyId: target.companyId,
      day: target.day,
      category: target.category,
      amountCents: -target.amountCents,
      balanceAfterCents: this.getBalance(target.companyId) - target.amountCents,
      referenceId: target.id,
      description: `REVERSE ${reason}: ${target.description}`,
      status: 'reversed',
      reversedBy: target.id,
    }
    this.transactions.push(rev)
    this.balanceByCompany.set(target.companyId, rev.balanceAfterCents)
    this.idempotencyIndex.set(newKey, rev.id)
    this.idempotencyDay.set(newKey, rev.day)
    this.pruneIdempotency(rev.day)
    target.status = 'reversed'
    target.reversedBy = rev.id
    return ok(rev)
  }

  getCashBalance(companyId: string): number {
    return this.getBalance(companyId)
  }

  isInFinancialDistress(companyId: string): boolean {
    return this.getBalance(companyId) < 0
  }

  getTransactionsByCompany(
    companyId: string,
    range?: { fromDay?: number; toDay?: number },
  ): Transaction[] {
    return this.transactions
      .filter((t) => t.companyId === companyId)
      .filter((t) => {
        if (range?.fromDay !== undefined && t.day < range.fromDay) return false
        if (range?.toDay !== undefined && t.day > range.toDay) return false
        return true
      })
      .sort((a, b) => a.day - b.day)
  }

  getAllTransactions(): Transaction[] {
    return [...this.transactions]
  }

  hasTransaction(idempotencyKey: string): boolean {
    return this.idempotencyIndex.has(idempotencyKey)
  }

  /**
   * 从存档交易重放余额。仅用于读档，不做余额检查。
   * 返回重放后的余额表，供调用方做一致性校验。
   */
  replay(transactions: Transaction[], companyIds: string[]): Map<string, number> {
    this.transactions = []
    this.balanceByCompany = new Map()
    this.idempotencyIndex = new Map()
    this.idempotencyDay = new Map()
    for (const id of companyIds) this.balanceByCompany.set(id, 0)
    for (const tx of transactions) {
      const prev = this.getBalance(tx.companyId)
      const next = prev + tx.amountCents
      this.transactions.push({ ...tx, balanceAfterCents: next })
      this.balanceByCompany.set(tx.companyId, next)
      this.idempotencyIndex.set(tx.idempotencyKey, tx.id)
    }
    return new Map(this.balanceByCompany)
  }

  private getBalance(companyId: string): number {
    return this.balanceByCompany.get(companyId) ?? 0
  }

  private pruneIdempotency(currentDay: number): void {
    if (this.idempotencyIndex.size < 1024) return
    const cutoff = currentDay - this.IDEMPOTENCY_RETENTION_DAYS
    for (const [key, day] of this.idempotencyDay) {
      if (day < cutoff) {
        this.idempotencyIndex.delete(key)
        this.idempotencyDay.delete(key)
      }
    }
  }
}
