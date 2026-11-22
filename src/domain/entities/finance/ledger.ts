/**
 * UnifiedLedger —— 统一账本领域内核（FIN V0.2 §0 / §3.1 / §5.1 BR-1 / §11）。
 *
 * 唯一现金入口：所有现金变动只能来自本类的 postTransaction / bulkPostTransactions /
 * reverseTransaction / refundSale / settleItem / replay（后者仅读档重建）。
 *
 * 承诺注册表（CODE-04 D 段 / FIN §3.3 §4.1 §6.2 §10.3）：
 * registerCommitment / getCommitments / getCommitment / settleCommitment / releaseCommitment。
 * 承诺本身**永不改现金**（BR-3），它只是 `AvailableCash` 的扣除项来源与"未来支出"的事实源；
 * 这里只是"存得住、查得到、释放得了"，真正的现金变化仍只发生在上面那五个入口。
 *
 * INV-1（F-01 方案 a）：cashBalanceCents == Σ(全部 LedgerTransaction.amountCents)，
 * **不按 status 过滤**。status 仅审计标记；冲销以反向交易实现，原交易与反向交易都参与求和。
 * 余额不存储为可写字段：getCashBalance 每次由交易重算，LedgerAccount.cashBalanceCents 为
 * 派生只读快照（类型 readonly + 无写 API），代码级杜绝绕过入口直改现金。
 */
import type { TransactionCategory } from '@domain/enums'
import { fail, ok, uuid, type CommandResult } from '@domain/types'
import { InsufficientCashError } from '@domain/errors'
import { CashMismatchError, FIN_ERROR, FinanceError, LedgerInconsistentError } from './errors'
import type {
  BudgetCommitment,
  Cents,
  CashFlowType,
  CancelCommitmentResult,
  CommitmentState,
  LedgerAccount,
  LedgerTransaction,
  MonthKey,
  PayableReceivable,
  TransactionSource,
} from './types'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import type { FinanceTuning } from '@domain/value-objects/finance-tuning'
import { resolveCashFlowType } from '@domain/value-objects/finance-cashflow'
import {
  cancelCommitment as computeCancelCommitment,
  createCommitment,
  deriveCommitmentState,
  isEarnedPeriodOfCancelled,
  monthKeyOf,
  remainingPlannedCents,
  type CreateCommitmentInput,
} from '@domain/value-objects/finance-commitment'

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
  /**
   * 该公司承诺集合的只读快照（D 段：承诺注册表）。
   * 与交易一同纳入快照，供存档/对账读取；重建走 `replay(transactions, companyIds, commitments)`。
   */
  commitments: BudgetCommitment[]
}

export interface ReversalPairResult {
  original: LedgerTransaction
  reversal: LedgerTransaction
  feeOriginal?: LedgerTransaction
  feeReversal?: LedgerTransaction
  /** 退款交易自身的净额（含手续费冲回）：−(原销售净额)。全额退款后账户回到销售前余额（F-11）。 */
  refundCashImpactCents: Cents
}

/** 承诺注册结果（幂等键 `commitment:${companyId}:${commitmentId}`）。 */
export interface RegisterCommitmentResult {
  commitment: BudgetCommitment
  idempotent: boolean
}

/** 承诺结算结果：累积 realizedCents、推进 state（不改现金，现金只来自 linkTxId）。 */
export interface SettleCommitmentResult {
  commitment: BudgetCommitment
  idempotent: boolean
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
 * 复合键避免两家公司互相命中。
 *
 * P3-05：幂等判定与查询**一律走复合键** `transactionByCompanyKey`（唯一决策源，
 * 结构上不可能跨公司串账）；不再维护"裸键 → 单笔"的全局索引——
 * 该索引在多公司同键时只能保留**后写者**，却容易被误读为"首笔"（原注释失实，已删除）。
 * 需要精确查询时用 `getTransactionByKeyInCompany(companyId, key)`。
 */
function companyScopedKey(companyId: string, idempotencyKey: string): string {
  return `${companyId}\u0000${idempotencyKey}`
}

/**
 * 承诺注册表幂等键（D 段）：`commitment:${companyId}:${commitmentId}`。
 * 跨公司隔离——两家公司出现同 id（项目 id 碰撞 / AI 公司复制）时互不命中。
 */
export function commitmentScopedKey(companyId: string, commitmentId: string): string {
  return `commitment:${companyId}:${commitmentId}`
}

/** 承诺快照（防调用方持有内部对象并直接改写状态）。 */
function cloneCommitment(c: BudgetCommitment): BudgetCommitment {
  return { ...c, linkedTxIds: [...c.linkedTxIds] }
}

/** 幂等重注册时的字段一致性判定（同 id 不得"换内容"）。 */
function sameCommitmentShape(
  c: BudgetCommitment,
  input: CreateCommitmentInput,
): boolean {
  return (
    c.sourceType === input.sourceType &&
    c.sourceRef === input.sourceRef &&
    c.amountCents === input.amountCents &&
    c.period === input.period &&
    c.startAt === input.startAt &&
    c.endAt === input.endAt
  )
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
  /** 复合键（companyId + idempotencyKey）：幂等判定与查询的唯一索引（P1-01 / P3-05）。 */
  private readonly transactionByCompanyKey = new Map<string, LedgerTransaction>()
  /** 快索引保留窗口（仅 pruneIdempotency 使用；幂等判定不依赖它，故清理不影响去重）。 */
  private readonly idempotencyDay = new Map<string, number>()
  /** 承诺注册表（D 段）：复合键 → 承诺；companyId → 该公司承诺 id 集合（保持插入序）。 */
  private readonly commitments = new Map<string, BudgetCommitment>()
  private readonly commitmentIdsByCompany = new Map<string, string[]>()
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

  /** 是否已在账本注册（未注册公司余额恒为 0，且拒绝入账）。 */
  isCompanyRegistered(companyId: string): boolean {
    return this.registeredCompanies.has(companyId)
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
      commitments: this.getCommitments(companyId),
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

    // P3-05：幂等判定只看本公司复合键命中。同名键属于其他公司（如两家公司都用固定键
    // advance）视为未命中，各自独立入账——不需要（也不会）读取任何"裸键"全局索引。
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
        // 回滚到批前状态：删除本批新增交易及其索引（P3-05：一律按复合键删除）。
        for (let i = startLen; i < this.transactions.length; i++) {
          const tx = this.transactions[i]!
          this.transactionById.delete(tx.transactionId)
          this.transactionByCompanyKey.delete(companyScopedKey(tx.companyId, tx.idempotencyKey))
          this.idempotencyDay.delete(companyScopedKey(tx.companyId, tx.idempotencyKey))
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
   * R9-P1-02：幂等命中时从账本**重建**义务摘要，不信任调用方传入的（可能过期的）快照。
   * `settledCents` = 账本中该义务（referenceId == itemId）已结算交易额之和
   * （payable 取 |负额交易|、receivable 取正额交易）；`state` 按剩余未结算额判定；
   * `settlementTxIds` 同步从账本重算，避免"金额已重建、交易清单还是旧快照"的半新半旧摘要。
   */
  private rebuildItemSummary(item: PayableReceivable): PayableReceivable {
    const settlementTxIds: string[] = []
    let settledCents = 0
    for (const tx of this.transactions) {
      if (tx.companyId !== item.companyId || tx.referenceId !== item.itemId) continue
      if (item.direction === 'payable' ? tx.amountCents < 0 : tx.amountCents > 0) {
        settledCents += item.direction === 'payable' ? -tx.amountCents : tx.amountCents
        settlementTxIds.push(tx.transactionId)
      }
    }
    // O-1（PATCH2 审核）：settledCents===0 时不得原样保留 stale 的结算态——
    // 若旧快照是 'settled' / 'partially_settled' 而账本查无任何结算交易（如全额冲销
    // 后幂等重建），必须降级为 'open'；'open' / 'written_off' / 'overdue' 非
    // 结算推导态，保持原样。
    const state: PayableReceivable['state'] =
      settledCents >= item.amountCents
        ? 'settled'
        : settledCents > 0
          ? 'partially_settled'
          : item.state === 'settled' || item.state === 'partially_settled'
            ? 'open'
            : item.state
    return { ...item, settledCents, state, settlementTxIds }
  }

  /**
   * BR-4 应付/应收结算：同一义务由幂等键去重，只允许一次成功结算。
   * payable 流出（负）、receivable 流入（正）；更新 settledCents / state / settlementTxIds。
   *
   * P3-06：**幂等键命中优先于 remaining 守卫**。
   * 同键重试（结算完成后再次提交同一笔）必须返回幂等成功，而不是 `PAYABLE_OVER_SETTLED`
   * ——后者会让调用方误以为"这次重试失败了"，进而在上层重试/报错。
   * 命中后校验 `itemId` 一致（同一键不得指向另一笔义务），不一致报 `IDEMPOTENCY_KEY_CONFLICT`。
   * R9-P1-02：命中返回的摘要从账本重建（`rebuildItemSummary`），不是调用方的过期快照。
   */
  settleItem(
    item: PayableReceivable,
    amountCents: Cents,
    idempotencyKey: string,
    day: number,
  ): CommandResult<SettlementResult> {
    // 1) 键命中优先：本公司同键交易已存在。
    const hit = this.transactionByCompanyKey.get(companyScopedKey(item.companyId, idempotencyKey))
    if (hit) {
      if (hit.referenceId !== item.itemId) {
        return fail(
          FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
          `Idempotency key ${idempotencyKey} already used for item ${hit.referenceId ?? 'none'}, not ${item.itemId}`,
        )
      }
      if (hit.amountCents !== (item.direction === 'payable' ? -amountCents : amountCents)) {
        return fail(
          FIN_ERROR.IDEMPOTENCY_KEY_CONFLICT,
          `Idempotency key ${idempotencyKey} already used for a different settlement amount (${hit.amountCents})`,
        )
      }
      return {
        success: true,
        result: { item: this.rebuildItemSummary(item), transaction: hit, idempotent: true },
        idempotent: true,
      }
    }

    // 2) 未命中：常规守卫。
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
  replay(
    transactions: ReadonlyArray<LedgerTransaction>,
    companyIds: ReadonlyArray<string>,
    commitments: ReadonlyArray<BudgetCommitment> = [],
  ): Map<string, Cents> {
    // FIN-T5：读档规模上限（P3-02）。超限明确抛错，不静默截断，避免读档后状态不完整。
    if (transactions.length > this.tuning.replayMaxTransactions) {
      throw new FinanceError(
        FIN_ERROR.REPLAY_LIMIT_EXCEEDED,
        `replay ${transactions.length} transactions exceeds limit ${this.tuning.replayMaxTransactions}`,
      )
    }
    this.transactions = []
    this.transactionById.clear()
    this.transactionByCompanyKey.clear()
    this.idempotencyDay.clear()
    this.commitments.clear()
    this.commitmentIdsByCompany.clear()
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
      this.transactionByCompanyKey.set(
        companyScopedKey(rebuilt.companyId, rebuilt.idempotencyKey),
        rebuilt,
      )
      this.idempotencyDay.set(companyScopedKey(rebuilt.companyId, rebuilt.idempotencyKey), rebuilt.day)
      running.set(tx.companyId, next)
    }
    // D 段：承诺集合同样随读档重建（与交易同等对待，不依赖调用方的临时数组）。
    for (const c of commitments) {
      if (!this.registeredCompanies.has(c.companyId)) this.registeredCompanies.set(c.companyId, 0)
      this.storeCommitment({ ...c, linkedTxIds: [...c.linkedTxIds] })
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

  /**
   * A-3 落盘不变量：`Company.cashBalanceCents`（兼容展示字段）必须等于账本求和。
   * `status` **不参与**求和（FIN F-01 方案 a）——本断言只比较求和结果，不按状态过滤。
   * 不一致时抛 `CashMismatchError`（fail-loud），**不做任何静默对齐**。
   */
  assertLedgerInvariant(companyId: string, declaredCashBalanceCents: Cents): void {
    const actual = this.sumTransactions(companyId)
    if (actual !== declaredCashBalanceCents) {
      throw new CashMismatchError(companyId, declaredCashBalanceCents, actual)
    }
  }

  getAllTransactions(): ReadonlyArray<LedgerTransaction> {
    return [...this.transactions]
  }

  getTransactionsByCompany(companyId: string): ReadonlyArray<LedgerTransaction> {
    return this.transactions.filter((t) => t.companyId === companyId)
  }

  /**
   * P3-05：按 (companyId, key) 精确查询。幂等键在多公司间可同名，故**必须**带 companyId；
   * 原单参重载已删除（多公司同键时它只能返回后写者，调用方易误判）。
   */
  getTransactionByKeyInCompany(companyId: string, key: string): LedgerTransaction | undefined {
    return this.transactionByCompanyKey.get(companyScopedKey(companyId, key))
  }

  getTransactionById(id: string): LedgerTransaction | undefined {
    return this.transactionById.get(id)
  }

  /**
   * 30 天保留策略：只清理 idempotencyDay **观测窗口**（供审计/统计），
   * 不影响幂等去重——去重判定只依赖永久的 `transactionByCompanyKey`（BR-7 / §12 / P3-05）。
   */
  pruneIdempotency(currentDay: number): void {
    const cutoff = currentDay - this.tuning.idempotencyRetentionDays
    for (const [key, day] of this.idempotencyDay) {
      if (day < cutoff) this.idempotencyDay.delete(key)
    }
  }

  // ===== 承诺注册表（D 段 / FIN §3.3 §4.1 §6.2.§10.3） =====

  /**
   * 注册承诺（BR-3：不提交交易、不改现金）。
   * 幂等键 `commitment:${companyId}:${commitmentId}`——**按公司隔离**：
   * 同一 commitmentId 出现在两家公司（如项目 id 碰撞、AI 公司复制）互不命中。
   *
   * @throws SandboxCommitmentBlockedError 沙盒观察态（P3-07 守卫由本方法内置，不可绕过）
   */
  registerCommitment(input: CreateCommitmentInput): CommandResult<RegisterCommitmentResult> {
    if (!this.registeredCompanies.has(input.companyId)) {
      return fail(
        FIN_ERROR.COMMITMENT_COMPANY_NOT_REGISTERED,
        `Company ${input.companyId} not registered`,
      )
    }
    const existing = this.commitments.get(commitmentScopedKey(input.companyId, input.commitmentId))
    if (existing) {
      if (!sameCommitmentShape(existing, input)) {
        return fail(
          FIN_ERROR.COMMITMENT_ALREADY_REGISTERED,
          `Commitment ${input.commitmentId} already registered for ${input.companyId} with different fields`,
        )
      }
      return { success: true, result: { commitment: cloneCommitment(existing), idempotent: true }, idempotent: true }
    }
    // P3-07：守卫来源固定为账本自身实例（调用方无法"忘记传"）。
    const commitment = createCommitment(input, { ledger: this })
    this.storeCommitment(commitment)
    return { success: true, result: { commitment: cloneCommitment(commitment), idempotent: false }, idempotent: false }
  }

  getCommitments(
    companyId: string,
    filter?: { state?: CommitmentState | ReadonlyArray<CommitmentState>; sourceRef?: string },
  ): BudgetCommitment[] {
    const ids = this.commitmentIdsByCompany.get(companyId) ?? []
    const states =
      filter?.state === undefined
        ? undefined
        : Array.isArray(filter.state)
          ? filter.state
          : [filter.state as CommitmentState]
    const out: BudgetCommitment[] = []
    for (const id of ids) {
      const c = this.commitments.get(commitmentScopedKey(companyId, id))
      if (!c) continue
      if (states !== undefined && !states.includes(c.state)) continue
      if (filter?.sourceRef !== undefined && c.sourceRef !== filter.sourceRef) continue
      out.push(cloneCommitment(c))
    }
    return out
  }

  getCommitment(companyId: string, commitmentId: string): BudgetCommitment | undefined {
    const c = this.commitments.get(commitmentScopedKey(companyId, commitmentId))
    return c ? cloneCommitment(c) : undefined
  }

  /**
   * 承诺结算（FIN §4.1）：现金**只**来自由 `txId` 指向的既有交易（本方法绝不 post）；
   * 这里只做账面跟踪：累积 realizedCents、追加 linkedTxIds、推进 state。
   *
   * 幂等：txId 已在 linkedTxIds 中 ⇒ 命中（idempotent=true，不重复累加）。
   */
  settleCommitment(
    companyId: string,
    commitmentId: string,
    amountCents: Cents,
    txId: string,
  ): CommandResult<SettleCommitmentResult> {
    const tx = this.transactionById.get(txId)
    if (!tx || tx.companyId !== companyId) {
      return fail(FIN_ERROR.TX_NOT_FOUND, `Transaction ${txId} not found for ${companyId}`)
    }
    // R1 / O-1：取消后的补记按"交易归属月是否早于生效月"判定，故需先拿到交易。
    const pending = this.requireSettlable(companyId, commitmentId, amountCents, monthKeyOf(tx.day))
    if ('errorCode' in pending) return fail(pending.errorCode, pending.errorMessage)
    return this.applySettlement(pending.commitment, amountCents, txId)
  }

  /**
   * 先校验、后入账的结算路径（给调用方"先 post 交易、再登记兑现"的场景用）：
   * 用 `requireSettlable` 在任何副作用前失败，避免"钱已经花了、承诺却登记不上"。
   *
   * R1 / O-1：`cancelled` 不再一律拒绝——`effectiveMonth` **之前**的已赚取周期照常可结算
   * （离职当月已出勤但未到结算日的那一笔）；`effectiveMonth` 及之后拒绝，并返回可区分的
   * `FIN_COMMITMENT_PERIOD_CANCELLED`。`settleMonth` 缺省时（调用方不给归属月）按旧口径拒绝。
   */
  requireSettlable(
    companyId: string,
    commitmentId: string,
    amountCents: Cents,
    settleMonth?: MonthKey,
  ): { commitment: BudgetCommitment } | { errorCode: string; errorMessage: string } {
    const c = this.commitments.get(commitmentScopedKey(companyId, commitmentId))
    if (!c) {
      return { errorCode: FIN_ERROR.COMMITMENT_NOT_FOUND, errorMessage: `Commitment ${commitmentId} not found for ${companyId}` }
    }
    // 已取消：只允许补记生效月之前的已赚取周期，剩余额度 = 已赚取但尚未 post 的差额。
    if (c.state === 'cancelled') {
      if (settleMonth === undefined || !isEarnedPeriodOfCancelled(c, settleMonth)) {
        return {
          errorCode: FIN_ERROR.COMMITMENT_PERIOD_CANCELLED,
          errorMessage: `Commitment ${commitmentId} cancelled effective ${c.cancelEffectiveMonth ?? 'unknown'}; period ${settleMonth ?? 'unknown'} is not an earned period`,
        }
      }
      const earnedUnposted = Math.max(0, c.totalPlannedCents - c.realizedCents - c.releasedCents)
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > earnedUnposted) {
        return {
          errorCode: FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID,
          errorMessage: `Settlement ${amountCents} invalid for earned-unposted ${earnedUnposted}`,
        }
      }
      return { commitment: c }
    }
    // 已整段释放（无剩余额度）同样不可再兑现：全部兑现、或"取消释放了剩余部分"。
    if (c.state === 'realized' || remainingPlannedCents(c) <= 0) {
      return {
        errorCode: FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID,
        errorMessage: `Commitment ${commitmentId} is ${c.state}; cannot settle further`,
      }
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > remainingPlannedCents(c)) {
      return {
        errorCode: FIN_ERROR.COMMITMENT_SETTLEMENT_INVALID,
        errorMessage: `Settlement ${amountCents} invalid for remaining ${remainingPlannedCents(c)}`,
      }
    }
    return { commitment: c }
  }

  private applySettlement(
    c: BudgetCommitment,
    amountCents: Cents,
    txId: string,
  ): CommandResult<SettleCommitmentResult> {
    if (c.linkedTxIds.includes(txId)) {
      return { success: true, result: { commitment: cloneCommitment(c), idempotent: true }, idempotent: true }
    }
    const realizedCents = c.realizedCents + amountCents
    const updated: BudgetCommitment = {
      ...c,
      realizedCents,
      linkedTxIds: [...c.linkedTxIds, txId],
      // 按创建时固化的周期/月度上限判定 state（不得因中途取消而提前变 realized）。
      state: c.state === 'committed' || c.state === 'partially_realized'
        ? deriveCommitmentState({ ...c, realizedCents, state: 'committed' })
        : c.state,
    }
    this.storeCommitment(updated)
    return { success: true, result: { commitment: cloneCommitment(updated), idempotent: false }, idempotent: false }
  }

  /**
   * 承诺释放/取消（FIN-INT-01 / ADJ-2026-11-22-05 §3）：与 `cancelCommitment` 共用实现。
   * `effectiveMonth` 必填；已入账部分不冲回，只释放生效月及之后的周期。
   * 重复以同一 effectiveMonth 释放 ⇒ 幂等命中。
   */
  releaseCommitment(
    companyId: string,
    commitmentId: string,
    effectiveMonth: MonthKey,
  ): CommandResult<CancelCommitmentResult> {
    const c = this.commitments.get(commitmentScopedKey(companyId, commitmentId))
    if (!c) {
      return fail(FIN_ERROR.COMMITMENT_NOT_FOUND, `Commitment ${commitmentId} not found for ${companyId}`)
    }
    if (c.state === 'cancelled') {
      if (c.cancelEffectiveMonth === effectiveMonth) {
        const result = computeCancelCommitment(c, effectiveMonth)
        return { success: true, result, idempotent: true }
      }
      return fail(
        FIN_ERROR.COMMITMENT_MISMATCH,
        `Commitment ${commitmentId} already cancelled at ${c.cancelEffectiveMonth ?? 'unknown'}`,
      )
    }
    const result = computeCancelCommitment(c, effectiveMonth)
    this.storeCommitment(result.commitment)
    return ok(result)
  }

  /**
   * 从既有交易回填承诺的已兑现金额（读档后若只持久化了交易，可在守卫校验下重新对齐）。
   *
   * R4：**`cancelled` 也回填**。取消不改写 `realizedCents`（它只由真实交易驱动），但取消之后
   * 仍可能发生"已赚取周期补记"（ADJ-2026-11-22-10 §1），若读档时跳过 `cancelled`，
   * 这些已 post 的金额就再也重建不出来，`realizedCents` 与账本兑现交易额永久分叉。
   * 回填只累加 `amountCents < 0` 的真实交易（与未取消承诺同口径）。
   */
  reconcileCommitmentsFromTransactions(companyId: string): void {
    for (const id of this.commitmentIdsByCompany.get(companyId) ?? []) {
      const c = this.commitments.get(commitmentScopedKey(companyId, id))
      if (!c) continue
      let realized = 0
      for (const tx of this.transactions) {
        if (tx.companyId !== companyId || tx.referenceId !== c.commitmentId) continue
        if (tx.amountCents < 0) realized += -tx.amountCents
      }
      if (realized > c.realizedCents) {
        const realizedCents = Math.min(c.totalPlannedCents, realized)
        this.storeCommitment({
          ...c,
          realizedCents,
          // 取消为终态：不得因回填被 deriveCommitmentState 改写。
          state: c.state === 'cancelled' ? 'cancelled' : deriveCommitmentState({ ...c, realizedCents }),
        })
      }
    }
  }

  private storeCommitment(c: BudgetCommitment): void {
    this.commitments.set(commitmentScopedKey(c.companyId, c.commitmentId), c)
    const list = this.commitmentIdsByCompany.get(c.companyId)
    if (list === undefined) this.commitmentIdsByCompany.set(c.companyId, [c.commitmentId])
    else if (!list.includes(c.commitmentId)) list.push(c.commitmentId)
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
    this.transactionByCompanyKey.set(companyScopedKey(tx.companyId, tx.idempotencyKey), tx)
    this.idempotencyDay.set(companyScopedKey(tx.companyId, tx.idempotencyKey), tx.day)
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
