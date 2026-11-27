import type { RefundBatch } from '@domain/entities/refund-batch'
import type { SalesRecord } from '@domain/entities/sales-record'
import type { Product } from '@domain/entities/product'
import type { Transaction } from '@domain/entities/transaction'
import type { RefundRejectReason, RefundWindowBasis } from '@domain/enums'
import type { WorldState } from '@simulation/services/world-state'
import { makeRefundBatchId, refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import {
  createRefundBatchPostedEvent,
  createRefundBatchRejectedEvent,
} from '@domain/events'
import {
  compareRefundBatchesForPosting,
  isRefundBatchDue,
  nextRefundSeq,
  resolveRefundWindow,
  sumRefundedUnits,
} from '@domain/value-objects/refund-window'
import type { FinanceService } from '@simulation/services/finance-service'

/** 退款服务的失败分类（DESIGN-M2-001-C §10.4） */
export type RefundErrorCode =
  | 'REFUND_DAY_MISMATCH'
  | 'REFUND_INVALID_REQUEST'
  | 'REFUND_RECORD_NOT_FOUND'
  | 'REFUND_UNITS_MISMATCH'
  | 'REFUND_AMOUNT_MISMATCH'
  | 'REFUND_BROKEN_REF'

/** 数据损坏/装配损坏：必须 fail-fast，不得吞错、不得置态、不得重试 */
export class RefundServiceError extends Error {
  constructor(
    public readonly code: RefundErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RefundServiceError'
  }
}

export interface RefundServiceDeps {
  finance: Pick<
    FinanceService,
    'postTransaction' | 'hasTransaction' | 'getAllTransactions'
  > & {
    /** P3-05：按 (companyId, key) 精确查询，避免多公司同键时取到"某一笔"。 */
    getTransactionByKey?: (idempotencyKey: string, companyId?: string) => Transaction | undefined
  }
  /**
   * 当前 TUNING 的窗口天数；**仅用于无快照的 player_request**（Q10 回退口径）。
   * 历史批次一律按 `batch.refundDayIndex`，绝不按此值复算。
   */
  refundWindowDays: number
  /**
   * 装配探测端口（实现细节，规格 §10.4 未列出）：
   * `FinanceService` 没有"是否已注册"的查询方法，`getCashBalance` 对未注册公司返回 0，
   * 因此由装配方注入探针，用于在预检阶段 fail-fast 判 `REFUND_BROKEN_REF`。
   * 未注入时，退化为在入账返回 `FIN_COMPANY_NOT_REGISTERED` 时抛错（可能已产生前面批次的部分写入，故生产装配必须注入）。
   */
  isCompanyRegistered?: (companyId: string) => boolean
}

export interface RefundFailedItem {
  batchId: string
  errorCode: string
}

export interface RefundProcessResult {
  world: WorldState
  postedBatchIds: string[]
  rejectedBatchIds: string[]
  failed: RefundFailedItem[]
}

export interface PlayerRefundRequest {
  /** 玩家操作幂等 ID；同一 ID 重复提交返回既有批次 */
  requestId: string
  productId: string
  salesRecordId: string
  requestedUnits: number
  /** 必须等于 world.currentDayIndex */
  dayIndex: number
}

export type RefundRequestOutcome = 'posted' | 'rejected' | 'deduplicated' | 'pending' | 'error'

export interface RefundRequestResult {
  world: WorldState
  outcome: RefundRequestOutcome
  batch?: RefundBatch | undefined
  reasonCode?: RefundRejectReason | undefined
  errorCode?: RefundErrorCode | undefined
  windowBasis?: RefundWindowBasis | undefined
}

interface CheckedBatch {
  batch: RefundBatch
  record: SalesRecord
  product: Product
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export class RefundService {
  /** salesRecordId → 已入账退款件数（避免每次入账都全表扫描） */
  private postedUnitsByRecord = new Map<string, number>()
  private countedBatchIds = new Set<string>()
  private indexSeeded = false
  /** refundDayIndex → 批次；避免每日对全表做 filter。 */
  private dueIndex = new Map<number, RefundBatch[]>()
  private indexedBatchCount = 0
  private lastIndexedBatchId: string | null = null
  private scannedThroughDay = -1

  constructor(private readonly deps: RefundServiceDeps) {}

  private seedPostedUnits(world: WorldState): void {
    if (this.indexSeeded) return
    for (const b of world.refundBatches) {
      if (b.status !== 'posted' || this.countedBatchIds.has(b.id)) continue
      this.countedBatchIds.add(b.id)
      this.postedUnitsByRecord.set(
        b.salesRecordId,
        (this.postedUnitsByRecord.get(b.salesRecordId) ?? 0) + b.refundedUnits,
      )
    }
    this.indexSeeded = true
  }

  private countPosted(batch: RefundBatch): void {
    if (this.countedBatchIds.has(batch.id)) return
    this.countedBatchIds.add(batch.id)
    this.postedUnitsByRecord.set(
      batch.salesRecordId,
      (this.postedUnitsByRecord.get(batch.salesRecordId) ?? 0) + batch.refundedUnits,
    )
  }

  // ---------- 到期兑现（F2–F5） ----------

  processDueRefunds(world: WorldState, dayIndex: number): RefundProcessResult {
    const due = this.collectDue(world, dayIndex)
    if (due.length === 0) {
      return { world, postedBatchIds: [], rejectedBatchIds: [], failed: [] }
    }

    // 阶段 1：预检（无任何资金副作用）。全部通过后才进入入账。
    const checked = this.precheckAll(world, due)

    // 阶段 2：只深拷贝会变动的批次/产品/销售记录；其余共享引用。
    const dueIds = new Set(due.map((b) => b.id))
    const affectedProducts = new Set(due.map((b) => b.productId))
    const recordIds = new Set(due.map((b) => b.salesRecordId))
    const batchById = new Map<string, RefundBatch>()
    const draft: WorldState = {
      ...world,
      refundBatches: world.refundBatches.map((batch) => {
        if (!dueIds.has(batch.id)) return batch
        const copy = { ...batch }
        batchById.set(copy.id, copy)
        return copy
      }),
      products: world.products.map((p) =>
        affectedProducts.has(p.id)
          ? {
              ...p,
              salesByPeriod: p.salesByPeriod.map((r) => (recordIds.has(r.id) ? { ...r } : r)),
            }
          : p,
      ),
      events: [...world.events],
      transactions: [...world.transactions],
    }
    this.seedPostedUnits(world)
    const postedBatchIds: string[] = []
    const rejectedBatchIds: string[] = []
    const failed: RefundFailedItem[] = []

    for (const item of checked) {
      const batch = batchById.get(item.batch.id)
      const product = draft.products.find((p) => p.id === item.batch.productId)
      if (batch === undefined || product === undefined) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `refund batch ${item.batch.id} lost during draft copy`,
        )
      }
      const record = product.salesByPeriod.find((r) => r.id === batch.salesRecordId)
      if (record === undefined) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `refund batch ${batch.id} points to missing sales record`,
        )
      }
      const outcome = this.postOneMutable(draft, batch, record, product, dayIndex)
      if (outcome.posted) postedBatchIds.push(batch.id)
      if (outcome.rejected) rejectedBatchIds.push(batch.id)
      if (outcome.failure !== undefined) {
        failed.push({ batchId: batch.id, errorCode: outcome.failure })
      }
    }

    return { world: draft, postedBatchIds, rejectedBatchIds, failed }
  }

  /** 增量到期索引：只把新追加的批次入桶，按日取桶，不再全表 filter。 */
  private collectDue(world: WorldState, dayIndex: number): RefundBatch[] {
    const list = world.refundBatches
    const lastId = this.indexedBatchCount > 0 ? list[this.indexedBatchCount - 1]?.id ?? null : null
    if (list.length < this.indexedBatchCount || lastId !== this.lastIndexedBatchId) {
      this.dueIndex.clear()
      this.indexedBatchCount = 0
      this.lastIndexedBatchId = null
      this.scannedThroughDay = -1
    }
    for (let i = this.indexedBatchCount; i < list.length; i += 1) {
      const batch = list[i]!
      const bucket = this.dueIndex.get(batch.refundDayIndex)
      if (bucket === undefined) this.dueIndex.set(batch.refundDayIndex, [batch])
      else bucket.push(batch)
    }
    this.indexedBatchCount = list.length
    this.lastIndexedBatchId = list[list.length - 1]?.id ?? null

    const from = Math.max(0, this.scannedThroughDay + 1)
    const due: RefundBatch[] = []
    for (let d = from; d <= dayIndex; d += 1) {
      const bucket = this.dueIndex.get(d)
      if (bucket !== undefined) due.push(...bucket.filter((b) => isRefundBatchDue(b, dayIndex)))
    }
    this.scannedThroughDay = Math.max(this.scannedThroughDay, dayIndex)
    return due.sort(compareRefundBatchesForPosting)
  }

  private postOneMutable(
    draft: WorldState,
    batch: RefundBatch,
    record: SalesRecord,
    product: Product,
    dayIndex: number,
  ): { posted: boolean; rejected: boolean; failure?: string | undefined } {
    if (batch.refundedUnits <= 0) {
      this.rejectMutable(draft, batch, 'zero_units', 'not_applicable', dayIndex)
      return { posted: false, rejected: true }
    }
    if (batch.refundAmountCents <= 0) {
      this.rejectMutable(draft, batch, 'zero_amount', 'not_applicable', dayIndex)
      return { posted: false, rejected: true }
    }

    const postedUnits = this.postedUnitsByRecord.get(record.id) ?? 0
    if (batch.refundedUnits > record.grossUnits - postedUnits) {
      this.rejectMutable(draft, batch, 'over_limit', 'not_applicable', dayIndex)
      return { posted: false, rejected: true }
    }

    const key = refundBatchIdempotencyKey(batch.id)
    const existing = this.findRefundTransaction(draft, key, product.companyId)
    if (existing !== undefined) {
      this.assertExistingTransaction(existing, batch)
      this.countPosted(batch)
      this.markPostedMutable(draft, batch, record, dayIndex)
      return { posted: true, rejected: false }
    }

    const posted = this.deps.finance.postTransaction(
      {
        idempotencyKey: key,
        companyId: product.companyId,
        day: dayIndex,
        category: 'customer_refund',
        amountCents: -batch.refundAmountCents,
        referenceId: batch.productId,
        description: `Refund batch ${batch.id}: ${batch.refundedUnits} units`,
      },
      { allowNegativeBalance: true },
    )
    if (posted.success) {
      this.countPosted(batch)
      this.markPostedMutable(draft, batch, record, dayIndex)
      return { posted: true, rejected: false }
    }
    if (posted.errorCode === 'FIN_COMPANY_NOT_REGISTERED') {
      throw new RefundServiceError(
        'REFUND_BROKEN_REF',
        `company ${product.companyId} is not registered in FinanceService`,
      )
    }
    return { posted: false, rejected: false, failure: posted.errorCode ?? 'FIN_UNKNOWN' }
  }

  /** 退款批次所属公司（经产品反查；批次本身只记 productId）。 */
  private companyIdOfBatch(world: WorldState, batch: RefundBatch): string | undefined {
    return world.products.find((p) => p.id === batch.productId)?.companyId
  }

  private markPostedMutable(
    draft: WorldState,
    batch: RefundBatch,
    record: SalesRecord,
    dayIndex: number,
  ): void {
    batch.status = 'posted'
    record.actualRefundUnits = this.postedUnitsByRecord.get(record.id) ?? 0
    const eventId = `refund-posted:${batch.id}`
    if (this.eventIds === null) this.eventIds = new Set(draft.events.map((e) => e.id))
    if (!this.eventIds.has(eventId)) {
      this.eventIds.add(eventId)
      draft.events.push(
        createRefundBatchPostedEvent(eventId, {
          refundBatchId: batch.id,
          productId: batch.productId,
          salesRecordId: batch.salesRecordId,
          day: dayIndex,
          refundedUnits: batch.refundedUnits,
          amountCents: batch.refundAmountCents,
        }),
      )
    }
    const txKey = refundBatchIdempotencyKey(batch.id)
    if (this.appendedTxKeys === null) this.appendedTxKeys = new Set(draft.transactions.map((t) => t.idempotencyKey))
    if (!this.appendedTxKeys.has(txKey)) {
      const tx = this.deps.finance.getTransactionByKey?.(txKey, this.companyIdOfBatch(draft, batch))
      if (tx !== undefined) {
        this.appendedTxKeys.add(txKey)
        draft.transactions.push(tx)
      }
    }
  }

  private rejectMutable(
    draft: WorldState,
    batch: RefundBatch,
    reasonCode: RefundRejectReason,
    windowBasis: RefundWindowBasis,
    dayIndex: number,
  ): void {
    batch.status = 'rejected'
    const eventId = `refund-rejected:${batch.id}`
    if (this.eventIds === null) this.eventIds = new Set(draft.events.map((e) => e.id))
    if (this.eventIds.has(eventId)) return
    this.eventIds.add(eventId)
    draft.events.push(
      createRefundBatchRejectedEvent(eventId, {
        refundBatchId: batch.id,
        productId: batch.productId,
        salesRecordId: batch.salesRecordId,
        day: dayIndex,
        refundedUnits: batch.refundedUnits,
        amountCents: batch.refundAmountCents,
        reasonCode,
        windowBasis,
      }),
    )
  }

  private precheckAll(world: WorldState, due: readonly RefundBatch[]): CheckedBatch[] {
    const result: CheckedBatch[] = []
    const companiesById = new Map(world.companies.map((c) => [c.id, c]))
    for (const batch of due) {
      const product = world.products.find((p) => p.id === batch.productId)
      if (product === undefined) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `refund batch ${batch.id} points to missing product ${batch.productId}`,
        )
      }
      const record = product.salesByPeriod.find((r) => r.id === batch.salesRecordId)
      if (record === undefined) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `refund batch ${batch.id} points to missing sales record ${batch.salesRecordId}`,
        )
      }
      if (
        record.productId !== batch.productId ||
        record.dayIndex !== batch.saleDayIndex ||
        record.marketId !== batch.marketId ||
        record.platformId !== batch.platformId
      ) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `refund batch ${batch.id} tuple does not match sales record ${record.id}`,
        )
      }
      if (batch.source === 'auto_window' && batch.refundedUnits !== record.estimatedRefundUnits) {
        throw new RefundServiceError(
          'REFUND_UNITS_MISMATCH',
          `auto refund batch ${batch.id} units ${batch.refundedUnits} != estimated ${record.estimatedRefundUnits}`,
        )
      }
      const expected = batch.refundedUnits * record.unitPriceAtSaleCents
      if (batch.refundAmountCents !== expected) {
        throw new RefundServiceError(
          'REFUND_AMOUNT_MISMATCH',
          `refund batch ${batch.id} amount ${batch.refundAmountCents} != ${expected}`,
        )
      }
      if (!companiesById.has(product.companyId)) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `product ${product.id} company ${product.companyId} is missing from world.companies`,
        )
      }
      if (
        this.deps.isCompanyRegistered !== undefined &&
        !this.deps.isCompanyRegistered(product.companyId)
      ) {
        throw new RefundServiceError(
          'REFUND_BROKEN_REF',
          `company ${product.companyId} is not registered in FinanceService`,
        )
      }
      result.push({ batch, record, product })
    }
    return result
  }

  private postOne(
    world: WorldState,
    item: CheckedBatch,
    dayIndex: number,
  ): {
    world: WorldState
    posted: boolean
    rejected: boolean
    failure?: string | undefined
  } {
    const { batch, record, product } = item

    if (batch.refundedUnits <= 0) {
      return {
        world: this.rejectBatch(world, batch, 'zero_units', 'not_applicable', dayIndex),
        posted: false,
        rejected: true,
      }
    }
    if (batch.refundAmountCents <= 0) {
      return {
        world: this.rejectBatch(world, batch, 'zero_amount', 'not_applicable', dayIndex),
        posted: false,
        rejected: true,
      }
    }

    this.seedPostedUnits(world)
    const postedUnits = this.postedUnitsByRecord.get(record.id) ?? 0
    const remaining = record.grossUnits - postedUnits
    if (batch.refundedUnits > remaining) {
      return {
        world: this.rejectBatch(world, batch, 'over_limit', 'not_applicable', dayIndex),
        posted: false,
        rejected: true,
      }
    }

    const key = refundBatchIdempotencyKey(batch.id)
    const existing = this.findRefundTransaction(world, key, product.companyId)

    if (existing !== undefined) {
      this.assertExistingTransaction(existing, batch)
      this.countPosted(batch)
      return { world: this.markPosted(world, batch, record, dayIndex), posted: true, rejected: false }
    }

    const posted = this.deps.finance.postTransaction(
      {
        idempotencyKey: key,
        companyId: product.companyId,
        day: dayIndex,
        category: 'customer_refund',
        amountCents: -batch.refundAmountCents,
        referenceId: batch.productId,
        description: `Refund batch ${batch.id}: ${batch.refundedUnits} units`,
      },
      { allowNegativeBalance: true },
    )

    if (posted.success) {
      this.countPosted(batch)
      return { world: this.markPosted(world, batch, record, dayIndex), posted: true, rejected: false }
    }

    if (posted.errorCode === 'FIN_COMPANY_NOT_REGISTERED') {
      throw new RefundServiceError(
        'REFUND_BROKEN_REF',
        `company ${product.companyId} is not registered in FinanceService`,
      )
    }

    return { world, posted: false, rejected: false, failure: posted.errorCode ?? 'FIN_UNKNOWN' }
  }

  /** 第二/第三判据：幂等索引或持久化流水命中 */
  private findRefundTransaction(world: WorldState, key: string, companyId: string): Transaction | undefined {
    // 生产 FinanceService 有全量幂等索引：undefined 即"确实不存在"，不再全表扫描证明缺席。
    if (this.deps.finance.getTransactionByKey !== undefined) {
      return this.deps.finance.getTransactionByKey(key, companyId)
    }
    // 兼容测试注入的轻量 mock（无索引），保留旧路径
    return world.transactions.find(
      (t) => t.idempotencyKey === key && t.category === 'customer_refund',
    ) ?? this.deps.finance
      .getAllTransactions()
      .find((t) => t.idempotencyKey === key && t.category === 'customer_refund')
  }

  private assertExistingTransaction(tx: Transaction, batch: RefundBatch): void {
    if (tx.category !== 'customer_refund') {
      throw new RefundServiceError(
        'REFUND_BROKEN_REF',
        `existing transaction ${tx.id} for batch ${batch.id} is ${tx.category}, not customer_refund`,
      )
    }
    if (tx.amountCents !== -batch.refundAmountCents) {
      throw new RefundServiceError(
        'REFUND_AMOUNT_MISMATCH',
        `existing transaction ${tx.id} amount ${tx.amountCents} != ${-batch.refundAmountCents}`,
      )
    }
  }

  // ---------- 状态写入 ----------

  private markPosted(
    world: WorldState,
    batch: RefundBatch,
    record: SalesRecord,
    dayIndex: number,
  ): WorldState {
    const refundBatches = world.refundBatches.map((b) =>
      b.id === batch.id ? { ...b, status: 'posted' as const } : b,
    )
    const products = this.withActualUnits(world, record.id)
    const eventId = `refund-posted:${batch.id}`
    if (this.eventIds === null) this.eventIds = new Set(world.events.map((e) => e.id))
    const events = this.eventIds.has(eventId)
      ? world.events
      : [
          ...world.events,
          createRefundBatchPostedEvent(eventId, {
            refundBatchId: batch.id,
            productId: batch.productId,
            salesRecordId: batch.salesRecordId,
            day: dayIndex,
            refundedUnits: batch.refundedUnits,
            amountCents: batch.refundAmountCents,
          }),
        ]
    this.eventIds.add(eventId)
    const transactions = this.withTransaction(world, batch)
    return { ...world, refundBatches, products, events, transactions }
  }

  private rejectBatch(
    world: WorldState,
    batch: RefundBatch,
    reasonCode: RefundRejectReason,
    windowBasis: RefundWindowBasis,
    dayIndex: number,
  ): WorldState {
    const refundBatches = world.refundBatches.map((b) =>
      b.id === batch.id ? { ...b, status: 'rejected' as const } : b,
    )
    const eventId = `refund-rejected:${batch.id}`
    const events = world.events.some((e) => e.id === eventId)
      ? world.events
      : [
          ...world.events,
          createRefundBatchRejectedEvent(eventId, {
            refundBatchId: batch.id,
            productId: batch.productId,
            salesRecordId: batch.salesRecordId,
            day: dayIndex,
            refundedUnits: batch.refundedUnits,
            amountCents: batch.refundAmountCents,
            reasonCode,
            windowBasis,
          }),
        ]
    return { ...world, refundBatches, events }
  }

  /** 按 `Σposted` 重算，不做增量累加（§10.5.3） */
  private withActualUnits(world: WorldState, salesRecordId: string): Product[] {
    const actual = this.postedUnitsByRecord.get(salesRecordId) ?? 0
    return world.products.map((p) => {
      if (!p.salesByPeriod.some((r) => r.id === salesRecordId)) return p
      return {
        ...p,
        salesByPeriod: p.salesByPeriod.map((r) =>
          r.id === salesRecordId ? { ...r, actualRefundUnits: actual } : r,
        ),
      }
    })
  }

  /** world.transactions 与 Finance 流水保持一致（新增退款交易时追加） */
  private appendedTxKeys: Set<string> | null = null
  private eventIds: Set<string> | null = null

  private withTransaction(world: WorldState, batch: RefundBatch): Transaction[] {
    const key = refundBatchIdempotencyKey(batch.id)
    if (this.appendedTxKeys === null) {
      this.appendedTxKeys = new Set(world.transactions.map((t) => t.idempotencyKey))
    }
    if (this.appendedTxKeys.has(key)) return world.transactions
    const tx = this.deps.finance.getTransactionByKey?.(key, this.companyIdOfBatch(world, batch))
    if (tx === undefined) return world.transactions
    this.appendedTxKeys.add(key)
    return [...world.transactions, tx]
  }

  // ---------- 玩家退款请求（F6） ----------

  requestPlayerRefund(world: WorldState, cmd: PlayerRefundRequest): RefundRequestResult {
    if (cmd.dayIndex !== world.currentDayIndex) {
      return failRequest(world, 'REFUND_DAY_MISMATCH')
    }
    if (
      !isNonEmptyString(cmd.requestId) ||
      !isNonEmptyString(cmd.productId) ||
      !isNonEmptyString(cmd.salesRecordId)
    ) {
      return failRequest(world, 'REFUND_INVALID_REQUEST')
    }
    if (!isPositiveInteger(cmd.requestedUnits)) {
      return failRequest(world, 'REFUND_INVALID_REQUEST')
    }

    // 1. 去重（先于窗口判定，保证重放返回既有批次）
    const prior = world.refundBatches.find((b) => b.firstRefundRequestId === cmd.requestId)
    if (prior !== undefined) {
      if (prior.salesRecordId !== cmd.salesRecordId) {
        return failRequest(world, 'REFUND_INVALID_REQUEST')
      }
      return { world, outcome: 'deduplicated', batch: prior }
    }

    // 2. 归属
    const product = world.products.find((p) => p.id === cmd.productId)
    if (product === undefined) return failRequest(world, 'REFUND_RECORD_NOT_FOUND')
    const record = product.salesByPeriod.find((r) => r.id === cmd.salesRecordId)
    if (record === undefined) return failRequest(world, 'REFUND_RECORD_NOT_FOUND')
    if (record.productId !== cmd.productId) return failRequest(world, 'REFUND_INVALID_REQUEST')

    // 3. 窗口（Q10：快照优先；无快照回退当前 TUNING）
    const window = resolveRefundWindow(
      record.id,
      record.dayIndex,
      world.refundBatches,
      this.deps.refundWindowDays,
    )
    const requestDay = cmd.dayIndex

    if (requestDay < window.windowEnd) {
      const created = this.createRequestBatch(world, product, record, cmd, requestDay)
      const rejectedWorld = this.rejectBatch(
        { ...world, refundBatches: [...world.refundBatches, created] },
        created,
        'window_not_elapsed',
        window.basis,
        requestDay,
      )
      return {
        world: rejectedWorld,
        outcome: 'rejected',
        batch: { ...created, status: 'rejected' },
        reasonCode: 'window_not_elapsed',
        windowBasis: window.basis,
      }
    }

    // 4. 上限（含 pending auto，A E17）
    const nonRejected = sumRefundedUnits(world.refundBatches, record.id, 'non-rejected')
    const remaining = record.grossUnits - nonRejected
    if (cmd.requestedUnits > remaining) {
      const created = this.createRequestBatch(world, product, record, cmd, requestDay)
      const rejectedWorld = this.rejectBatch(
        { ...world, refundBatches: [...world.refundBatches, created] },
        created,
        'over_limit',
        'not_applicable',
        requestDay,
      )
      return {
        world: rejectedWorld,
        outcome: 'rejected',
        batch: { ...created, status: 'rejected' },
        reasonCode: 'over_limit',
      }
    }

    // 5. 允许：生成 pending 并即时尝试入账（与 §10.5.1 同一路径）
    const created = this.createRequestBatch(world, product, record, cmd, requestDay)
    const withBatch = { ...world, refundBatches: [...world.refundBatches, created] }
    const checked: CheckedBatch = { batch: created, record, product }
    const outcome = this.postOne(withBatch, checked, requestDay)

    if (outcome.posted) {
      return {
        world: outcome.world,
        outcome: 'posted',
        batch: { ...created, status: 'posted' },
        windowBasis: window.basis,
      }
    }
    if (outcome.rejected) {
      return {
        world: outcome.world,
        outcome: 'rejected',
        batch: { ...created, status: 'rejected' },
        reasonCode: created.refundedUnits <= 0 ? 'zero_units' : 'zero_amount',
      }
    }
    return {
      world: outcome.world,
      outcome: 'pending',
      batch: created,
      windowBasis: window.basis,
    }
  }

  private createRequestBatch(
    world: WorldState,
    product: Product,
    record: SalesRecord,
    cmd: PlayerRefundRequest,
    requestDay: number,
  ): RefundBatch {
    const batchId = makeRefundBatchId(
      product.id,
      record.dayIndex,
      requestDay,
      nextRefundSeq(world.refundBatches, product.id, record.dayIndex, requestDay),
    )
    return {
      id: batchId,
      productId: product.id,
      salesRecordId: record.id,
      marketId: record.marketId,
      platformId: record.platformId,
      saleDayIndex: record.dayIndex,
      refundDayIndex: requestDay,
      refundedUnits: cmd.requestedUnits,
      refundAmountCents: cmd.requestedUnits * record.unitPriceAtSaleCents,
      source: 'player_request',
      status: 'pending',
      firstRefundRequestId: cmd.requestId,
      idempotencyKey: refundBatchIdempotencyKey(batchId),
    }
  }
}

function failRequest(world: WorldState, errorCode: RefundErrorCode): RefundRequestResult {
  return { world, outcome: 'error', errorCode }
}
