/**
 * UnifiedLedger —— 统一账本领域内核（FIN V0.2 §0 / §3.1 / §5.1 BR-1 / §11）。
 *
 * 唯一现金入口：所有现金变动只能来自本类的 postTransaction / bulkPostTransactions /
 * reverseTransaction / refundSale / settleItem / replay（后者仅读档重建）。
 *
 * INV-1（F-01 方案 a）：cashBalanceCents == Σ(全部 LedgerTransaction.amountCents)，
 * **不按 status 过滤**。status 仅审计标记；冲销以反向交易实现，原交易与反向交易都参与求和。
 * 余额不存储为可写字段：getCashBalance 每次由交易重算，LedgerAccount.cashBalanceCents 为
 * 派生只读快照（类型 readonly + 无写 API），代码级杜绝绕过入口直改现金。
 */
import type { TransactionCategory } from '@domain/enums'
import { fail, ok, uuid, type CommandResult } from '@domain/types'
import { InsufficientCashError } from '@domain/errors'
import { FIN_ERROR, FinanceError, LedgerInconsistentError } from './errors'
import type {
  Cents,
  CashFlowType,
  LedgerAccount,
  LedgerTransaction,
  PayableReceivable,
  TransactionSource,
} from './types'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import type { FinanceTuning } from '@domain/value-objects/finance-tuning'
import { resolveCashFlowType } from '@domain/value-objects/finance-cashflow'

export interface PostLedgerTxInput {
  idempotencyKey: string
  companyId: string
  day: number
  category: TransactionCategory
  amountCents: Cents
  description: string
  referenceId?: string | null
  source: TransactionSource
  /** 不传时由注入的 FIN-T1 映射表派生；调用方显式传入则优先（公式层不读 TUNING）。 */
  cashFlowType?: CashFlowType
  /** 冲销交易指回原交易；普通入账为 null。 */
  reversalOf?: string | null
  postedAt?: number
}

export interface PostLedgerTxOptions {
  /** 固定结算允许负现金（BR-9）；自主支出为 false。 */
  allowNegativeBalance?: boolean
}

export interface PostLedgerTxResult {
  transaction: LedgerTransaction
  idempotent: boolean
}

export interface LedgerSnapshot {
  companyId: string
  cashBalanceCents: Cents
  transactionCount: number
}

export interface ReversalPairResult {
  original: LedgerTransaction
  reversal: LedgerTransaction
  feeOriginal?: LedgerTransaction
  feeReversal?: LedgerTransaction
  /** 退款交易自身的净额（含手续费冲回）：−(原销售净额)。全额退款后账户回到销售前余额（F-11）。 */
  refundCashImpactCents: Cents
}

export interface SettlementResult {
  item: PayableReceivable
  transaction: LedgerTransaction
  idempotent: boolean
}

/** 生成承诺/结算的确定性幂等键（调用方固定，不随机）。 */
export function settlementIdempotencyKey(itemId: string, period: string): string {
  return `settle:${itemId}:${period}`
}

/**
 * 幂等键按公司作用域（CODE-02 P1-01）：开局固定键 `advance` 等由各公司独立使用，
 * 复合键避免两家公司互相命中。全局 transactionByKey 仅保留首笔供单参查询兼容。
 */
function companyScopedKey(companyId: string, idempotencyKey: string): string {
  return `${companyId}\u0000${idempotencyKey}`
}

/** 结算类别由义务来源决定（§3.4 / §5.8）；不自建第二本账。 */
function settlementCategory(item: PayableReceivable): TransactionCategory {
  if (item.direction === 'receivable') return 'sales_revenue'
  const ref = item.sourceRef.toLowerCase()
  if (ref.includes('contract')) return 'contract_payment'
  if (ref.includes('salary') || ref.includes('employment')) return 'salary'
  if (ref.includes('rent') || ref.includes('office')) return 'office_rent'
  if (ref.includes('tax')) return 'tax'
  return 'project_expense'
}

export class UnifiedLedger {
  private transactions: LedgerTransaction[] = []
  private readonly transactionById = new Map<string, LedgerTransaction>()
  /** 跨期保留（BR-7）：不随 30 天索引清理删除，供退款等跨期幂等命中。 */
  private readonly transactionByKey = new Map<string, LedgerTransaction>()
  /** 复合键（companyId + idempotencyKey）：幂等判定按公司隔离（P1-01）。 */
  private readonly transactionByCompanyKey = new Map<string, LedgerTransaction>()
  private readonly idempotencyIndex = new Map<string, string>()
  private readonly idempotencyDay = new Map<string, number>()
  private readonly registeredCompanies = new Map<string, number>()
  /** 沙盒观察态公司集合（§10.4）：阻止新增玩家授权支出，不影响固定结算。 */
  private readonly sandboxCompanies = new Set<string>()
  private readonly tuning: FinanceTuning

  constructor(tuning: FinanceTuning = DEFAULT_FINANCE_TUNING) {
    this.tuning = tuning
  }

  // ===== 注册 / 派生只读视图 =====

  /** 注册公司：初始余额固定为 0（§5.1，禁止 registerCompany 直接塞现金）。 */
  registerCompany(companyId: string, openedAt = 0): LedgerAccount {
    if (!this.registeredCompanies.has(companyId)) {
      this.registeredCompanies.set(companyId, openedAt)
    }
    return this.getAccount(companyId)!
  }

  /** 派生只读账户快照；每次构造新对象，无写 API（F-10）。 */
  getAccount(companyId: string): LedgerAccount | undefined {
    const openedAt = this.registeredCompanies.get(companyId)
    if (openedAt === undefined) return undefined
    return {
      ledgerAccountId: `ledger:${companyId}`,
      companyId,
      currency: 'USD',
      cashBalanceCents: this.sumTransactions(companyId),
      accountType: 'operating_cash',
      openedAt,
      state: this.sandboxCompanies.has(companyId) ? 'frozen' : 'active',
    }
  }

  /** INV-1：对全部交易求和，status 不参与过滤。 */
  sumTransactions(companyId: string): Cents {
    let sum = 0
    for (const tx of this.transactions) {
      if (tx.companyId === companyId) sum += tx.amountCents
    }
    return sum
  }

  /** 权威余额读源（UI 唯一读源，§7.2）。 */
  getCashBalance(companyId: string): Cents {
    return this.sumTransactions(companyId)
  }

  getSnapshot(companyId: string): LedgerSnapshot {
    let count = 0
    for (const tx of this.transactions) if (tx.companyId === companyId) count++
    return {
      companyId,
      cashBalanceCents: this.sumTransactions(companyId),
      transactionCount: count,
    }
  }

  // ===== 唯一现金写入路径 =====

  /**
   * 入账。重复 idempotencyKey 返回原交易且 idempotent=true，不改变现金（BR-7）。
   * 自主支出余额不足 → FIN_INSUFFICIENT_CASH；固定结算传 allowNegativeBalance=true。
   */
  postTransaction(
    input: PostLedgerTxInput,
    options: PostLedgerTxOptions = {},
  ): CommandResult<PostLedgerTxResult> {
    if (!Number.isInteger(input.amountCents)) {
      return fail(FIN_ERROR.AMOUNT_NOT_INTEGER, 'amountCents must be integer cents')
    }
    if (input.amountCents === 0) {
      return fail(FIN_ERROR.AMOUNT_ZERO, 'amountCents must be non-zero')
    }
    if (!this.registeredCompanies.has(input.companyId)) {
      return fail(FIN_ERROR.COMPANY_NOT_REGISTERED, `Company ${input.companyId} not registered`)
    }

    const hit = this.transactionByKey.get(input.idempotencyKey)
    if (hit && hit.companyId === input.companyId) return ok({ transaction: hit, idempotent: true })
    // 同名键属于其他公司（如两家公司都用固定键 advance）视为未命中，各自独立入账。
    const scopedHit = this.transactionByCompanyKey.get(
      companyScopedKey(input.companyId, input.idempotencyKey),
    )
    if (scopedHit) return ok({ transaction: scopedHit, idempotent: true })

    // §10.4 沙盒守卫：新增玩家授权支出被拒；既有固定结算(source=system_auto)继续。
    if (
      this.sandboxCompanies.has(input.companyId) &&
      input.source === 'player_authorized' &&
      input.amountCents < 0
    ) {
      return fail(
        FIN_ERROR.SANDBOX_PLAYER_EXPENSE_BLOCKED,
        'sandbox_observe blocks new player_authorized expenses',
      )
    }

    const balanceBefore = this.sumTransactions(input.companyId)
    const balanceAfter = balanceBefore + input.amountCents
    if (balanceAfter < 0 && options.allowNegativeBalance !== true) {
      return fail(
        new InsufficientCashError().code,
        `Balance would be ${balanceAfter}`,
      )
    }

    const tx = this.append(input, balanceAfter)
    return ok({ transaction: tx, idempotent: false })
  }

  /** 批量入账：增量回滚（失败截断，不整表复制），与既有 FinanceService 约束一致（§12）。 */
  bulkPostTransactions(
    inputs: ReadonlyArray<PostLedgerTxInput>,
    options: PostLedgerTxOptions = {},
  ): CommandResult<PostLedgerTxResult[]> {
    const startLen = this.transactions.length
    const results: PostLedgerTxResult[] = []
    for (const input of inputs) {
      const r = this.postTransaction(input, options)
      if (!r.success || !r.result) {
        const added = this.transactions.slice(startLen)
        for (const tx of added) {
          this.transactionById.delete(tx.transactionId)
          if (this.transactionByKey.get(tx.idempotencyKey) === tx) {
            this.transactionByKey.delete(tx.idempotencyKey)
          }
          this.transactionByCompanyKey.delete(companyScopedKey(tx.companyId, tx.idempotencyKey))
          this.idempotencyIndex.delete(tx.idempotencyKey)
          this.idempotencyDay.delete(tx.idempotencyKey)
        }
        this.transactions.length = startLen
        return fail(r.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, r.errorMessage ?? 'bulk post failed')
      }
      results.push(r.result)
    }
    return ok(results)
  }

  /**
   * 冲销：新增一笔符号相反的反向交易（customer_refund），原交易 status='reversed' 并记
   * reversedBy；反向交易 reversalOf 指回原交易。两者均计入 INV-1（F-01 / BR-6）。
   */
  reverseTransaction(
    transactionId: string,
    reason: string,
    newKey: string,
    options: PostLedgerTxOptions = {},
  ): CommandResult<LedgerTransaction> {
    const target = this.transactionById.get(transactionId)
    if (!target) return fail(FIN_ERROR.TX_NOT_FOUND, `No transaction ${transactionId}`)
    // 幂等命中优先于"已冲销"守卫：重复提交同一退款键返回原反向交易，不双算（BR-7 / TC-04）。
    const hit = this.transactionByCompanyKey.get(companyScopedKey(target.companyId, newKey))
    if (hit) {
      // P2-04：命中只说明键被本公司的某笔交易用过；必须校验它正是"本次目标交易"的反向交易，
      // 否则同公司复用键会把第二笔冲销静默吞掉并假报成功（返回他笔交易）。
      if (hit.reversalOf !== target.transactionId || hit.amountCents !== -target.amountCents) {
        return fail(
          FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
          `Idempotency key ${newKey} already used by a different reversal (target ${hit.reversalOf ?? 'none'})`,
        )
      }
      return { success: true, result: hit, idempotent: true }
    }
    // 同一冲销键被其他公司占用属调用方错误，不得静默复用他公司交易（P1-01）。
    const foreign = this.transactionByKey.get(newKey)
    if (foreign && foreign.companyId !== target.companyId) {
      return fail(
        FIN_ERROR.IDENTITY_MISMATCH,
        `Idempotency key ${newKey} belongs to company ${foreign.companyId}`,
      )
    }
    if (target.status === 'reversed') {
      return fail(FIN_ERROR.TX_ALREADY_REVERSED, `Transaction ${transactionId} already reversed`)
    }
    // §5.6：销售退款以 customer_refund 入账；其余类别原类别冲销。
    const category: TransactionCategory =
      target.category === 'sales_revenue' ? 'customer_refund' : target.category
    return this.appendReversal(target, -target.amountCents, newKey, reason, options, category)
  }

  /**
   * F-11 退款：按净额口径同步冲回 platform_fee。
   * refundAmountCents 为正的退款面额（<= 销售收入），feeRefund = 关联手续费 × (退款/销售额)，
   * 两笔反向交易均以 reversalOf 指回原交易；全额退款后净现金影响为 0。
   */
  refundSale(params: {
    saleTxId: string
    feeTxId: string
    refundAmountCents: Cents
    refundKey: string
    feeRefundKey: string
    reason: string
    day: number
  }): CommandResult<ReversalPairResult> {
    const sale = this.transactionById.get(params.saleTxId)
    const fee = this.transactionById.get(params.feeTxId)
    if (!sale || sale.category !== 'sales_revenue' || sale.amountCents <= 0) {
      return fail(FIN_ERROR.TX_NOT_FOUND, `Sale transaction ${params.saleTxId} invalid`)
    }
    if (!fee || fee.category !== 'platform_fee' || fee.amountCents >= 0) {
      return fail(FIN_ERROR.REFUND_FEE_TX_NOT_FOUND, `Fee transaction ${params.feeTxId} invalid`)
    }
    if (
      !Number.isInteger(params.refundAmountCents) ||
      params.refundAmountCents <= 0 ||
      params.refundAmountCents > sale.amountCents
    ) {
      return fail(FIN_ERROR.AMOUNT_NOT_INTEGER, 'Refund amount must be in (0, saleAmount]')
    }
    const ratio = params.refundAmountCents / sale.amountCents
    // 手续费按同一净额基数同费率冲回；小额退款四舍五入为 0 时不产生零额交易。
    const feeRefund = Math.round(-fee.amountCents * ratio)
    const opts: PostLedgerTxOptions = { allowNegativeBalance: true }

    const refundHit = this.transactionByCompanyKey.get(
      companyScopedKey(sale.companyId, params.refundKey),
    )
    const feeHit = this.transactionByCompanyKey.get(
      companyScopedKey(sale.companyId, params.feeRefundKey),
    )
    for (const key of [params.refundKey, params.feeRefundKey]) {
      const foreign = this.transactionByKey.get(key)
      if (foreign && foreign.companyId !== sale.companyId) {
        return fail(
          FIN_ERROR.IDENTITY_MISMATCH,
          `Idempotency key ${key} belongs to company ${foreign.companyId}`,
        )
      }
    }
    // P2-04：命中不等于"同一次退款"。键已被本公司用于不同销售/不同退款额时，直接返回会
    // 混合"当前销售 + 他笔反向"，调用方误判已退款；此处校验操作同一性后报明确冲突。
    if (
      refundHit &&
      (refundHit.reversalOf !== sale.transactionId ||
        refundHit.amountCents !== -params.refundAmountCents)
    ) {
      return fail(
        FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
        `Idempotency key ${params.refundKey} already used by a different refund (target ${refundHit.reversalOf ?? 'none'})`,
      )
    }
    if (
      feeHit &&
      (feeHit.reversalOf !== fee.transactionId || feeHit.amountCents !== feeRefund)
    ) {
      return fail(
        FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
        `Idempotency key ${params.feeRefundKey} already used by a different fee reversal (target ${feeHit.reversalOf ?? 'none'})`,
      )
    }
    if (refundHit && (feeRefund === 0 || feeHit)) {
      return {
        success: true,
        result: {
          original: sale,
          reversal: refundHit,
          feeOriginal: fee,
          ...(feeHit ? { feeReversal: feeHit } : {}),
          refundCashImpactCents: refundHit.amountCents + (feeHit?.amountCents ?? 0),
        },
        idempotent: true,
      }
    }
    // 半状态（退款已入账、手续费未入账）允许续做；由其他键完成的冲销明确拒绝。
    if (sale.status === 'reversed' && !refundHit) {
      return fail(FIN_ERROR.TX_ALREADY_REVERSED, 'Sale already reversed by another key')
    }
    if (fee.status === 'reversed' && feeRefund !== 0 && !feeHit) {
      return fail(FIN_ERROR.TX_ALREADY_REVERSED, 'Fee already reversed by another key')
    }

    let refundTx: LedgerTransaction
    if (refundHit) {
      refundTx = refundHit
    } else {
      const refund = this.appendReversal(
        sale,
        -params.refundAmountCents,
        params.refundKey,
        params.reason,
        opts,
        'customer_refund',
        params.day,
      )
      if (!refund.success || !refund.result) {
        return fail(refund.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, refund.errorMessage ?? 'refund failed')
      }
      refundTx = refund.result
    }
    if (feeRefund === 0) {
      return ok({
        original: sale,
        reversal: refundTx,
        feeOriginal: fee,
        refundCashImpactCents: refundTx.amountCents,
      })
    }
    if (feeHit) {
      return ok({
        original: sale,
        reversal: refundTx,
        feeOriginal: fee,
        feeReversal: feeHit,
        refundCashImpactCents: refundTx.amountCents + feeHit.amountCents,
      })
    }
    const feeRev = this.appendReversal(
      fee,
      feeRefund,
      params.feeRefundKey,
      `${params.reason} (platform fee clawback)`,
      opts,
      'platform_fee',
      params.day,
    )
    if (!feeRev.success || !feeRev.result) {
      return fail(feeRev.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, feeRev.errorMessage ?? 'fee refund failed')
    }
    return ok({
      original: sale,
      reversal: refundTx,
      feeOriginal: fee,
      feeReversal: feeRev.result,
      refundCashImpactCents: refundTx.amountCents + feeRev.result.amountCents,
    })
  }

  /**
   * BR-4 应付/应收结算：同一义务由幂等键去重，只允许一次成功结算。
   * payable 流出（负）、receivable 流入（正）；更新 settledCents / state / settlementTxIds。
   */
  settleItem(
    item: PayableReceivable,
    amountCents: Cents,
    idempotencyKey: string,
    day: number,
  ): CommandResult<SettlementResult> {
    const remaining = item.amountCents - item.settledCents
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > remaining) {
      return fail(FIN_ERROR.PAYABLE_OVER_SETTLED, `Settlement ${amountCents} exceeds remaining ${remaining}`)
    }
    const signed = item.direction === 'payable' ? -amountCents : amountCents
    const posted = this.postTransaction({
      idempotencyKey,
      companyId: item.companyId,
      day,
      category: settlementCategory(item),
      amountCents: signed,
      description: `Settle ${item.direction} ${item.itemId}`,
      referenceId: item.itemId,
      source: 'system_auto',
    }, { allowNegativeBalance: item.direction === 'payable' })
    if (!posted.success || !posted.result) {
      return fail(posted.errorCode ?? FIN_ERROR.LEDGER_INCONSISTENT, posted.errorMessage ?? 'settle failed')
    }

    const settledCents = item.settledCents + amountCents
    const updated: PayableReceivable = {
      ...item,
      settledCents,
      state: settledCents >= item.amountCents ? 'settled' : 'partially_settled',
      settlementTxIds: [...item.settlementTxIds, posted.result.transaction.transactionId],
    }
    return ok({ item: updated, transaction: posted.result.transaction, idempotent: posted.result.idempotent })
  }

  // ===== 读档重建（§10.5） =====

  /**
   * replay：从持久化交易按 INV-1 重建余额与索引，status 不参与求和。
   * 逐笔校验持久化 balanceAfterCents 与重算值一致，不一致抛 LedgerInconsistentError（拒绝读档）。
   */
  replay(transactions: ReadonlyArray<LedgerTransaction>, companyIds: ReadonlyArray<string>): Map<string, Cents> {
    // FIN-T5：读档规模上限（P3-02）。超限明确抛错，不静默截断，避免读档后状态不完整。
    if (transactions.length > this.tuning.replayMaxTransactions) {
      throw new FinanceError(
        FIN_ERROR.REPLAY_LIMIT_EXCEEDED,
        `replay ${transactions.length} transactions exceeds limit ${this.tuning.replayMaxTransactions}`,
      )
    }
    this.transactions = []
    this.transactionById.clear()
    this.transactionByKey.clear()
    this.transactionByCompanyKey.clear()
    this.idempotencyIndex.clear()
    this.idempotencyDay.clear()
    this.registeredCompanies.clear()
    this.sandboxCompanies.clear()
    for (const id of companyIds) this.registeredCompanies.set(id, 0)

    const running = new Map<string, Cents>()
    for (const id of companyIds) running.set(id, 0)
    for (const tx of transactions) {
      if (!this.registeredCompanies.has(tx.companyId)) this.registeredCompanies.set(tx.companyId, 0)
      const prev = running.get(tx.companyId) ?? 0
      const next = prev + tx.amountCents
      if (tx.balanceAfterCents !== next) {
        throw new LedgerInconsistentError(tx.companyId, tx.balanceAfterCents, next)
      }
      const rebuilt: LedgerTransaction = { ...tx, balanceAfterCents: next }
      this.transactions.push(rebuilt)
      this.transactionById.set(rebuilt.transactionId, rebuilt)
      this.transactionByKey.set(rebuilt.idempotencyKey, rebuilt)
      this.transactionByCompanyKey.set(
        companyScopedKey(rebuilt.companyId, rebuilt.idempotencyKey),
        rebuilt,
      )
      this.idempotencyIndex.set(rebuilt.idempotencyKey, rebuilt.transactionId)
      this.idempotencyDay.set(rebuilt.idempotencyKey, rebuilt.day)
      running.set(tx.companyId, next)
    }
    return new Map(running)
  }

  /** INV-1 一致性校验（声明余额与重算余额比较），失败抛错（§9.1 错态）。 */
  verifyInvariant(companyId: string, declaredBalanceCents: Cents): void {
    const actual = this.sumTransactions(companyId)
    if (actual !== declaredBalanceCents) {
      throw new LedgerInconsistentError(companyId, declaredBalanceCents, actual)
    }
  }

  getAllTransactions(): ReadonlyArray<LedgerTransaction> {
    return [...this.transactions]
  }

  /** 单参查询保留全局语义（兼容既有调用）；传 companyId 时按公司作用域精确查询（P1-01）。 */
  getTransactionByKey(key: string, companyId?: string): LedgerTransaction | undefined {
    if (companyId !== undefined) {
      return this.transactionByCompanyKey.get(companyScopedKey(companyId, key))
    }
    return this.transactionByKey.get(key)
  }

  getTransactionById(id: string): LedgerTransaction | undefined {
    return this.transactionById.get(id)
  }

  /** 跨期幂等：30 天只清理快索引，transactionByKey 永久保留（BR-7 / §12）。 */
  pruneIdempotency(currentDay: number): void {
    const cutoff = currentDay - this.tuning.idempotencyRetentionDays
    for (const [key, day] of this.idempotencyDay) {
      if (day < cutoff) {
        this.idempotencyIndex.delete(key)
        this.idempotencyDay.delete(key)
      }
    }
  }

  /** 设置/解除沙盒观察态（§10.4）；仅影响新支出守卫，不改现金。 */
  setSandboxObserved(companyId: string, enabled: boolean): void {
    if (enabled) this.sandboxCompanies.add(companyId)
    else this.sandboxCompanies.delete(companyId)
  }

  /** 只读查询沙盒态：供 createCommitment 等上游在新建义务前校验（P2-03）。 */
  isSandboxObserved(companyId: string): boolean {
    return this.sandboxCompanies.has(companyId)
  }

  // ===== 内部：唯一 append 路径 =====

  private append(input: PostLedgerTxInput, balanceAfter: Cents): LedgerTransaction {
    const tx: LedgerTransaction = {
      transactionId: uuid(),
      idempotencyKey: input.idempotencyKey,
      companyId: input.companyId,
      day: input.day,
      category: input.category,
      cashFlowType: input.cashFlowType ?? resolveCashFlowType(input.category, this.tuning),
      amountCents: input.amountCents,
      balanceAfterCents: balanceAfter,
      referenceId: input.referenceId ?? null,
      source: input.source,
      description: input.description,
      status: 'posted',
      reversedBy: null,
      reversalOf: input.reversalOf ?? null,
      postedAt: input.postedAt ?? input.day,
    }
    this.transactions.push(tx)
    this.transactionById.set(tx.transactionId, tx)
    this.transactionByKey.set(tx.idempotencyKey, tx)
    this.transactionByCompanyKey.set(companyScopedKey(tx.companyId, tx.idempotencyKey), tx)
    this.idempotencyIndex.set(tx.idempotencyKey, tx.transactionId)
    this.idempotencyDay.set(tx.idempotencyKey, tx.day)
    this.pruneIdempotency(tx.day)
    return tx
  }

  private appendReversal(
    target: LedgerTransaction,
    signedAmount: Cents,
    newKey: string,
    reason: string,
    options: PostLedgerTxOptions,
    category: TransactionCategory = target.category,
    day: number = target.day,
  ): CommandResult<LedgerTransaction> {
    const hit = this.transactionByCompanyKey.get(companyScopedKey(target.companyId, newKey))
    if (hit) {
      // P2-04：与 reverseTransaction 同一判据——键命中必须是本目标的等额反向交易。
      if (hit.reversalOf !== target.transactionId || hit.amountCents !== signedAmount) {
        return fail(
          FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
          `Idempotency key ${newKey} already used by a different reversal (target ${hit.reversalOf ?? 'none'})`,
        )
      }
      return { success: true, result: hit, idempotent: true }
    }
    const foreign = this.transactionByKey.get(newKey)
    if (foreign && foreign.companyId !== target.companyId) {
      return fail(
        FIN_ERROR.IDENTITY_MISMATCH,
        `Idempotency key ${newKey} belongs to company ${foreign.companyId}`,
      )
    }

    const prev = this.sumTransactions(target.companyId)
    if (prev + signedAmount < 0 && options.allowNegativeBalance !== true) {
      return fail(FIN_ERROR.LEDGER_INCONSISTENT, 'Reversal would violate balance guard')
    }
    const rev = this.append({
      idempotencyKey: newKey,
      companyId: target.companyId,
      day,
      category,
      amountCents: signedAmount,
      description: `REVERSE ${reason}: ${target.description}`,
      referenceId: target.transactionId,
      source: 'system_auto',
      cashFlowType: resolveCashFlowType(category, this.tuning),
      reversalOf: target.transactionId,
    }, prev + signedAmount)

    target.status = 'reversed'
    target.reversedBy = rev.transactionId
    return ok(rev)
  }
}
