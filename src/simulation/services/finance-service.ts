/**
 * FinanceService —— 统一账本的**薄委托层**（CODE-04 A 段 / FIN V0.2 §5.1 BR-1）。
 *
 * 历史：本类原先自己维护 `transactions` / `balanceByCompany` / `idempotencyIndex` /
 * `transactionByKey` 四套索引，是"第二个记账处"。CODE-04 起：
 *
 *  - **自身不再存任何余额或交易**：全部状态在注入的 `UnifiedLedger`；
 *  - **全部写操作**（入账 / 批量 / 冲销 / 重放）直接委托账本，本类不含 `+= / -=`；
 *  - **全部读操作**从账本派生（`getCashBalance` = `ledger.getCashBalance` 等），
 *    并按既有 `Transaction` 形状回吐，保持上层调用方与存档形状零变更；
 *  - 写操作后调用 `syncCash()` 把账本余额**单点回写**到本公司 `Company.cashBalanceCents`
 *    （兼容展示字段，F-10），这是全仓库唯一允许写该字段的两处之一（另一处为读档 hydrate）。
 *
 * 幂等语义随之统一到账本：跨公司同名键互不命中（复合键），冲销/退款以
 * 反向交易实现（不再有"把原交易 status 改置 reversed"的第二种冲销写法）。
 */
import type { TransactionCategory } from '@domain/enums'
import type { Transaction } from '@domain/entities/transaction'
import type { CommandResult } from '@domain/types'
import { fail, ok } from '@domain/types'
import {
  FIN_ERROR,
  UnifiedLedger,
  type BudgetCommitment,
  type LedgerTransaction,
} from '@domain/entities/finance'
import { resolveCashFlowType } from '@domain/value-objects/finance-cashflow'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import { toLegacyTransaction } from '@domain/value-objects/finance-compat'

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
   * 仅用于不可拒绝的固定结算（工资、租金、解雇补偿、退款、合同冲减）、
   * 必得收入（销售入账），以及读档重放。
   * 招聘、建项目等自主支出必须使用默认值 false。
   */
  allowNegativeBalance?: boolean
}

/** 兼容字段单点回写目标（`Company.cashBalanceCents`）。 */
export interface CashCarrier {
  id: string
  cashBalanceCents: number
}

export class FinanceService {
  /**
   * @param ledger 统一账本；缺省自建一个（测试便利）。生产装配应在 `GameWorld`
   *   构造时显式传入同一实例，保证"账本唯一"。
   */
  constructor(private readonly ledger: UnifiedLedger = new UnifiedLedger(DEFAULT_FINANCE_TUNING)) {}

  /** 底层账本（只读用法；供上层做承诺注册表 / 快照 / 不变量断言）。 */
  getLedger(): UnifiedLedger {
    return this.ledger
  }

  /** 注册公司，初始余额固定为 0；真实现金必须由交易入账 */
  registerCompany(companyId: string): void {
    this.ledger.registerCompany(companyId)
  }

  postTransaction(
    cmd: PostTransactionCmd,
    options: PostTransactionOptions = {},
  ): CommandResult<Transaction> {
    const posted = this.ledger.postTransaction(
      {
        idempotencyKey: cmd.idempotencyKey,
        companyId: cmd.companyId,
        day: cmd.day,
        category: cmd.category,
        amountCents: cmd.amountCents,
        description: cmd.description,
        ...(cmd.referenceId !== undefined ? { referenceId: cmd.referenceId } : {}),
        source: 'system_auto',
      },
      { allowNegativeBalance: options.allowNegativeBalance === true },
    )
    if (!posted.success || !posted.result) {
      return fail(posted.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, posted.errorMessage ?? 'post failed')
    }
    return {
      success: true,
      result: toLegacyTransaction(posted.result.transaction),
      ...(posted.result.idempotent ? { idempotent: true } : {}),
    }
  }

  /** 批量入账：委托账本的批量事务（失败整批回滚，与旧实现一致）。 */
  bulkPostTransactions(
    cmds: PostTransactionCmd[],
    options: PostTransactionOptions = {},
  ): CommandResult<Transaction[]> {
    const posted = this.ledger.bulkPostTransactions(
      cmds.map((cmd) => ({
        idempotencyKey: cmd.idempotencyKey,
        companyId: cmd.companyId,
        day: cmd.day,
        category: cmd.category,
        amountCents: cmd.amountCents,
        description: cmd.description,
        ...(cmd.referenceId !== undefined ? { referenceId: cmd.referenceId } : {}),
        source: 'system_auto' as const,
      })),
      { allowNegativeBalance: options.allowNegativeBalance === true },
    )
    if (!posted.success || !posted.result) {
      return fail(posted.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, posted.errorMessage ?? 'bulk post failed')
    }
    return ok(posted.result.map((r) => toLegacyTransaction(r.transaction)))
  }

  /** 冲销：委托账本新增反向交易（原交易保留 status='posted'，审计链见反向交易 reversalOf）。 */
  reverseTransaction(
    transactionId: string,
    reason: string,
    newKey: string,
  ): CommandResult<Transaction> {
    const rev = this.ledger.reverseTransaction(transactionId, reason, newKey, { allowNegativeBalance: true })
    if (!rev.success || !rev.result) {
      return fail(rev.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, rev.errorMessage ?? 'reverse failed')
    }
    return { success: true, result: toLegacyTransaction(rev.result) }
  }

  getCashBalance(companyId: string): number {
    return this.ledger.getCashBalance(companyId)
  }

  isInFinancialDistress(companyId: string): boolean {
    return this.ledger.getCashBalance(companyId) < 0
  }

  getTransactionsByCompany(
    companyId: string,
    range?: { fromDay?: number; toDay?: number },
  ): Transaction[] {
    return this.ledger
      .getTransactionsByCompany(companyId)
      .filter((t) => {
        if (range?.fromDay !== undefined && t.day < range.fromDay) return false
        if (range?.toDay !== undefined && t.day > range.toDay) return false
        return true
      })
      .slice()
      .sort((a, b) => a.day - b.day)
      .map(toLegacyTransaction)
  }

  getAllTransactions(): Transaction[] {
    return this.ledger.getAllTransactions().map(toLegacyTransaction)
  }

  /** 幂等键是否已被**某家公司**使用（仅用于审计/诊断；判定请用带 companyId 的查询）。 */
  hasTransaction(idempotencyKey: string, companyId?: string): boolean {
    if (companyId !== undefined) {
      return this.ledger.getTransactionByKeyInCompany(companyId, idempotencyKey) !== undefined
    }
    return this.ledger.getAllTransactions().some((t) => t.idempotencyKey === idempotencyKey)
  }

  /**
   * 按幂等键取交易（跨期可靠，不受 30 天观测窗口清理影响）。
   * 兼容签名：不传 companyId 时只在**唯一命中**时返回，多公司同键返回 undefined
   * （P3-05 的教训：多公司同键不应当作"取到某一笔"）。新代码请传 companyId。
   */
  getTransactionByKey(idempotencyKey: string, companyId?: string): Transaction | undefined {
    if (companyId !== undefined) {
      const hit = this.ledger.getTransactionByKeyInCompany(companyId, idempotencyKey)
      return hit === undefined ? undefined : toLegacyTransaction(hit)
    }
    const hits = this.ledger.getAllTransactions().filter((t) => t.idempotencyKey === idempotencyKey)
    if (hits.length !== 1) return undefined
    return toLegacyTransaction(hits[0] as LedgerTransaction)
  }

  /**
   * 从存档交易重放余额（仅读档，不做余额检查）。
   *
   * `balanceAfterCents` 是**派生快照**（FIN §3.1：= 入账前余额 + amountCents），
   * 不是独立事实；以交易顺序重算并按公司重写该字段后交给 `ledger.replay`，
   * 既保留账本的 FIN-T5 上限检查，又不会因历史存档的字段漂移误判。
   * 真正的现金一致性由 `GameWorld.restore` 的 `assertCashConsistent`（对比
   * `Company.cashBalanceCents`）与 `save-schema` 的 `SAVE_CASH_MISMATCH` 负责。
   */
  replay(
    transactions: Transaction[],
    companyIds: string[],
    commitments: ReadonlyArray<BudgetCommitment> = [],
  ): Map<string, number> {
    const running = new Map<string, number>(companyIds.map((id) => [id, 0]))
    const ledgerTxs: LedgerTransaction[] = transactions.map((t) => {
      const balanceAfterCents = (running.get(t.companyId) ?? 0) + t.amountCents
      running.set(t.companyId, balanceAfterCents)
      return {
        transactionId: t.id,
        idempotencyKey: t.idempotencyKey,
        companyId: t.companyId,
        day: t.day,
        category: t.category,
        cashFlowType: resolveCashFlowType(t.category, DEFAULT_FINANCE_TUNING),
        amountCents: t.amountCents,
        balanceAfterCents,
        referenceId: t.referenceId ?? null,
        source: 'system_auto',
        description: t.description,
        status: t.status,
        reversedBy: t.reversedBy ?? null,
        reversalOf: null,
        postedAt: t.day,
      }
    })
    const balances = this.ledger.replay(ledgerTxs, companyIds, commitments)
    return new Map(balances)
  }

  /**
   * 兼容字段单点回写（A-2 / F-10）：把账本权威余额写入本公司 `cashBalanceCents`。
   * 全仓库**只有**这里与 `GameWorld` 读档 hydrate 会写该字段，且每次都从账本派生。
   */
  syncCash(company: CashCarrier): void {
    company.cashBalanceCents = this.ledger.getCashBalance(company.id)
  }

  /**
   * A-3 一致性断言：`company.cashBalanceCents == ledger Σ amountCents`（status 不参与）。
   * 不一致时 fail-loud 抛 `FIN_CASH_MISMATCH`，**不静默对齐**。
   */
  assertCashConsistent(company: CashCarrier): void {
    this.ledger.assertLedgerInvariant(company.id, company.cashBalanceCents)
  }
}
