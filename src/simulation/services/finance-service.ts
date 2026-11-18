import type { TransactionCategory, TransactionStatus } from '@domain/enums'
import type { Transaction } from '@domain/entities/transaction'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'
import { InsufficientCashError, ValidationError } from '@domain/errors'

export interface PostTransactionCmd {
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: number
  referenceId?: string
  description: string
}

/**
 * FinanceService —— 所有现金变动的唯一入口
 * 幂等、支持批量回滚。
 */
export class FinanceService {
  private transactions: Transaction[] = []
  /** 公司最新余额快照（加速 getCashBalance） */
  private balanceByCompany = new Map<string, number>()
  /** 幂等键 → transaction id */
  private idempotencyIndex = new Map<string, string>()
  /** 用于清理的幂等键 → day */
  private idempotencyDay = new Map<string, number>()

  /** 最多保留最近 N 天的幂等键 */
  private readonly IDEMPOTENCY_RETENTION_DAYS = 30

  private getNextId(): string {
    return uuid()
  }

  private getBalance(companyId: string): number {
    return this.balanceByCompany.get(companyId) ?? 0
  }

  /**
   * 向状态中"同步"注册一家公司。
   * 实际业务里应该由 CompanyService 调用。
   */
  registerCompany(companyId: string, openingCashCents: number): void {
    if (!this.balanceByCompany.has(companyId)) {
      this.balanceByCompany.set(companyId, openingCashCents)
    }
  }

  /**
   * 强制设置现金余额 —— 用于初始化/重置（非交易途径，不会产生 Transaction）。
   */
  setCashBalance(companyId: string, cashCents: number): void {
    this.balanceByCompany.set(companyId, cashCents)
  }

  postTransaction(cmd: PostTransactionCmd): CommandResult<Transaction> {
    // 1. 验证基本字段
    if (cmd.amountCents === 0) {
      return fail('FIN_AMOUNT_ZERO', 'Transaction amount must be non-zero')
    }

    // 2. 幂等命中
    const existingId = this.idempotencyIndex.get(cmd.idempotencyKey)
    if (existingId) {
      const found = this.transactions.find((t) => t.id === existingId)
      if (found) {
        return ok(found, undefined) as CommandResult<Transaction>
      }
    }

    // 3. 余额检查
    const currentBalance = this.getBalance(cmd.companyId)
    const newBalance = currentBalance + cmd.amountCents
    // 只允许因支出出现负数（公司破产检查在 CompanyService），
    // 这里仅禁止在正常状态下余额 < 0
    if (newBalance < 0) {
      return fail(
        'FIN_INSUFFICIENT_CASH',
        `Cannot post transaction of ${cmd.amountCents}; balance would go ${newBalance}`,
      )
    }

    // 4. 写入
    const tx: Transaction = {
      id: this.getNextId(),
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

    // 5. 清理过旧幂等键
    this.pruneIdempotency(cmd.day)

    return ok(tx)
  }

  bulkPostTransactions(
    cmds: PostTransactionCmd[],
  ): CommandResult<Transaction[]> {
    const results: Transaction[] = []
    const prevBalances = new Map<string, number>()
    const prevIdx = new Map(this.idempotencyIndex)
    const prevDay = new Map(this.idempotencyDay)
    const prevTxs = [...this.transactions]
    const prevBalCopy = new Map(this.balanceByCompany)

    let rolledBack = false
    for (const cmd of cmds) {
      const r = this.postTransaction(cmd)
      if (!r.success || !r.result) {
        // 回滚：恢复所有状态
        this.transactions = prevTxs
        this.balanceByCompany = prevBalCopy
        this.idempotencyIndex = prevIdx
        this.idempotencyDay = prevDay
        rolledBack = true
        return fail(
          r.errorCode ?? 'FIN_BULK_POST_FAILED',
          r.errorMessage ?? `Bulk transaction failed; rolled back ${results.length}`,
        )
      }
      results.push(r.result)
      if (!prevBalances.has(cmd.companyId)) {
        prevBalances.set(cmd.companyId, prevBalCopy.get(cmd.companyId) ?? 0)
      }
    }
    if (rolledBack) {
      return fail('FIN_BULK_POST_FAILED', 'Unexpected rollback state')
    }
    return ok(results)
  }

  reverseTransaction(
    transactionId: string,
    reason: string,
    newKey: string,
  ): CommandResult<Transaction> {
    const target = this.transactions.find(
      (t) => t.id === transactionId && t.status === 'posted',
    )
    if (!target) {
      return fail('FIN_TX_NOT_FOUND', `No posted transaction ${transactionId}`)
    }

    const reverseAmt = -target.amountCents
    const rev: Transaction = {
      id: uuid(),
      idempotencyKey: newKey,
      companyId: target.companyId,
      day: target.day,
      category: target.category,
      amountCents: reverseAmt,
      balanceAfterCents: 0, // 下面重算
      referenceId: target.id,
      description: `REVERSE ${reason}: ${target.description}`,
      status: 'reversed',
      reversedBy: target.id,
    }

    const currentBalance = this.getBalance(target.companyId)
    const newBalance = currentBalance + reverseAmt
    rev.balanceAfterCents = newBalance
    this.transactions.push(rev)
    this.balanceByCompany.set(target.companyId, newBalance)

    // 原交易也标记
    target.status = 'reversed'
    target.reversedBy = rev.id

    return ok(rev)
  }

  getCashBalance(companyId: string): number {
    return this.getBalance(companyId)
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

  private pruneIdempotency(currentDay: number): void {
    // 这是一个懒清理；只有当幂等索引规模过大时才裁剪
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

// 防止未使用导入被 tree-shake 警告
void InsufficientCashError
void ValidationError
