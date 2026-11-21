import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, unknown>())

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mem.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    mem.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    mem.delete(key)
  }),
}))

import { saveGame, loadGame } from '@infrastructure/storage/save-service'
import { parseSave, SAVE_SCHEMA_VERSION } from '@infrastructure/storage/save-schema'
import { createEmptyWorld } from '@simulation/services/world-state'
import type { WorldState } from '@simulation/services/world-state'
import { ProjectService } from '@simulation/services/project-service'
import { FinanceService } from '@simulation/services/finance-service'
import type { SalesRecord } from '@domain/entities/sales-record'
import { makeSalesRecordId } from '@domain/entities/sales-record'
import type { RefundBatch } from '@domain/entities/refund-batch'
import { refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import type { Product } from '@domain/entities/product'
import type { Transaction } from '@domain/entities/transaction'
import type { TransactionCategory } from '@domain/enums'
import { makeWorld, makeCompany, makeProject } from '../../__tests__/helpers'

// 测试边界（DESIGN-M2-001-A §13.4）：M2-A 只验证数据契约能否表达 BDD 场景，
// 不验证调度是否触发退款（M2-C）。场景 1/3 的 When 以手工构造批次呈现。

const PRODUCT_ID = 'PROJ-001'
const PROJECT_ID = 'prj-001'
const SALES_RECORD_ID = 'SR-PROJ-001-100-JP-home_console_g2'

function makeSalesRecord(overrides: Partial<SalesRecord> = {}): SalesRecord {
  const base: SalesRecord = {
    id: SALES_RECORD_ID,
    productId: PRODUCT_ID,
    dayIndex: 100,
    marketId: 'JP',
    platformId: 'home_console_g2',
    grossUnits: 1500,
    unitPriceAtSaleCents: 2000,
    grossRevenueCents: 3_000_000,
    platformFeeCents: 900_000,
    netSalesRevenueCents: 2_100_000,
    estimatedRefundUnits: 30,
    actualRefundUnits: 0,
  }
  return { ...base, ...overrides }
}

function makeRefundBatch(overrides: Partial<RefundBatch> = {}): RefundBatch {
  const id = overrides.id ?? 'RB-PROJ-001-100-114-1'
  return {
    id,
    productId: PRODUCT_ID,
    salesRecordId: SALES_RECORD_ID,
    marketId: 'JP',
    platformId: 'home_console_g2',
    saleDayIndex: 100,
    refundDayIndex: 114,
    refundedUnits: 30,
    refundAmountCents: 60_000,
    source: 'auto_window',
    status: 'posted',
    idempotencyKey: refundBatchIdempotencyKey(id),
    ...overrides,
  }
}

function makeProduct(salesByPeriod: SalesRecord[]): Product {
  return {
    id: PRODUCT_ID,
    sourceProjectId: PROJECT_ID,
    companyId: 'company-1',
    name: 'Test Game',
    genreId: 'action',
    audienceSegmentIds: ['arcade_enthusiasts'],
    supportedPlatformIds: ['home_console_g2'],
    launchDay: 100,
    launchPriceCents: 2000,
    qualityProfile: {
      gameplay: 60,
      technical: 60,
      content: 60,
      art: 60,
      innovation: 60,
    },
    defectLevel: 20,
    finalQualityScore: 80,
    reviewScore: null,
    brandImpact: 8,
    lifecycleStage: 'launch',
    awarenessByMarket: {},
    salesByPeriod,
    status: 'active',
    version: 1,
    createdAt: 100,
    updatedAt: 100,
  }
}

function makeTransaction(
  id: string,
  category: TransactionCategory,
  amountCents: number,
  day: number,
): Transaction {
  return {
    id,
    idempotencyKey: `key:${id}`,
    companyId: 'company-1',
    day,
    category,
    amountCents,
    balanceAfterCents: 0,
    description: id,
    status: 'posted',
  }
}

interface WorldParts {
  sales?: SalesRecord[]
  batches?: RefundBatch[]
  transactions?: Transaction[]
}

function makeContractWorld(parts: WorldParts = {}): WorldState {
  const sales = parts.sales ?? [makeSalesRecord()]
  const batches = parts.batches ?? []
  const transactions = parts.transactions ?? [
    makeTransaction('tx-sales', 'sales_revenue', 3_000_000, 100),
    makeTransaction('tx-platform', 'platform_fee', -900_000, 100),
  ]
  const cash = transactions.reduce((acc, t) => acc + t.amountCents, 0)
  return makeWorld({
    companies: [makeCompany({ cashBalanceCents: cash })],
    employees: [],
    projects: [makeProject({ id: PROJECT_ID, teamAssignments: [] })],
    products: [makeProduct(sales)],
    refundBatches: batches,
    transactions,
  })
}

const FULL_TRANSACTIONS: Transaction[] = [
  makeTransaction('tx-sales', 'sales_revenue', 3_000_000, 100),
  makeTransaction('tx-platform', 'platform_fee', -900_000, 100),
  makeTransaction('tx-refund', 'customer_refund', -60_000, 114),
]

describe('M2-A 销售/退款存档契约（DESIGN-M2-001-A T10–T44）', () => {
  beforeEach(() => {
    mem.clear()
  })

  it('T10 场景 1 正：完整往返不丢字段', async () => {
    const sales = [makeSalesRecord({ actualRefundUnits: 30 })]
    const batches = [makeRefundBatch({ firstRefundRequestId: 'REQ-1' })]
    const world = makeContractWorld({
      sales,
      batches,
      transactions: FULL_TRANSACTIONS,
    })

    await saveGame(world)
    const loaded = await loadGame()
    expect(loaded.status).toBe('ok')
    if (loaded.status !== 'ok') return

    expect(loaded.state.products[0]?.salesByPeriod[0]).toEqual(sales[0])
    expect(loaded.state.refundBatches[0]).toEqual(batches[0])
    expect(Object.keys(loaded.state.products[0]?.salesByPeriod[0] ?? {})).toHaveLength(12)
    expect(Object.keys(loaded.state.refundBatches[0] ?? {})).toHaveLength(13)
  })

  it('T11 场景 1 正：actual 累加不覆盖 estimated，无平台费冲正', () => {
    const record = makeSalesRecord({ actualRefundUnits: 30 })
    const world = makeContractWorld({
      sales: [record],
      batches: [makeRefundBatch()],
      transactions: FULL_TRANSACTIONS,
    })

    const r = parseSave(world)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const saved = r.state.products[0]!.salesByPeriod[0]!
    expect(saved.actualRefundUnits).toBe(30)
    expect(saved.estimatedRefundUnits).toBe(30)
    expect(saved.platformFeeCents).toBe(900_000)

    const refunds = r.state.transactions.filter((t) => t.category === 'customer_refund')
    expect(refunds).toHaveLength(1)
    expect(refunds[0]?.amountCents).toBe(-60_000)
    const platformReversals = r.state.transactions.filter(
      (t) => t.category === 'platform_fee' && t.amountCents > 0,
    )
    expect(platformReversals).toHaveLength(0)
  })

  it('T12 场景 1 反：auto 批次退款量不等于 estimated', () => {
    const world = makeContractWorld({
      batches: [makeRefundBatch({ refundedUnits: 29 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })

  it('T13 场景 1 反：净销售收入漂移 1 分', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ netSalesRevenueCents: 2_099_999 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
      expect(r.errorMessage).toContain('netSalesRevenueCents')
    }
  })

  it('T14 场景 1 反：销售单价派生漂移', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ unitPriceAtSaleCents: 1999 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
      expect(r.errorMessage).toContain('unitPriceAtSaleCents')
    }
  })

  it('T15 场景 1 反：同一记录两条非 rejected 的 auto 批次', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord()],
      batches: [
        makeRefundBatch({ id: 'RB-PROJ-001-100-114-1', status: 'pending' }),
        makeRefundBatch({ id: 'RB-PROJ-001-100-114-2', status: 'pending' }),
      ],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })

  it('T16 场景 1 正：一条 auto + 窗口到期后两条 player_request', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 45 })],
      batches: [
        makeRefundBatch(),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-120-1',
          refundDayIndex: 120,
          refundedUnits: 10,
          refundAmountCents: 20_000,
          source: 'player_request',
        }),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-121-1',
          refundDayIndex: 121,
          refundedUnits: 5,
          refundAmountCents: 10_000,
          source: 'player_request',
        }),
      ],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(true)
  })

  it('T17 场景 2 正：同幂等键即时重复入账只记一次', () => {
    const finance = new FinanceService()
    finance.registerCompany('company-1')
    finance.postTransaction({
      idempotencyKey: 'opening',
      companyId: 'company-1',
      day: 0,
      category: 'advance',
      amountCents: 5_000_000,
      description: 'opening',
    })

    const idempotencyKey = refundBatchIdempotencyKey('RB-PROJ-001-100-114-1')
    const cmd = {
      idempotencyKey,
      companyId: 'company-1',
      day: 114,
      category: 'customer_refund' as const,
      amountCents: -60_000,
      description: 'refund',
    }

    const first = finance.postTransaction(cmd)
    const second = finance.postTransaction(cmd)

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.idempotent).toBe(true)
    expect(finance.getAllTransactions()).toHaveLength(2)
    expect(finance.getCashBalance('company-1')).toBe(4_940_000)
  })

  it('T18 场景 2 反：RefundBatch ID 重复', () => {
    const batch = makeRefundBatch()
    const world = makeContractWorld({ batches: [batch, { ...batch }] })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_DUPLICATE_ID')
  })

  it('T19 场景 2 反：SalesRecord ID 重复', () => {
    const record = makeSalesRecord()
    const world = makeContractWorld({ sales: [record, { ...record }] })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_DUPLICATE_ID')
  })

  it('T20 场景 3 正：窗口内 player_request 以 rejected 形态可读档，且无退款交易', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 0 })],
      batches: [
        makeRefundBatch({
          id: 'RB-PROJ-001-100-107-1',
          refundDayIndex: 107,
          source: 'player_request',
          status: 'rejected',
        }),
      ],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.transactions.filter((t) => t.category === 'customer_refund')).toHaveLength(0)
    expect(r.state.products[0]?.salesByPeriod[0]?.actualRefundUnits).toBe(0)
  })

  it('T21 场景 3 反：非 rejected 退款量超上限', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [
        makeRefundBatch(),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-120-1',
          refundDayIndex: 120,
          refundedUnits: 1480,
          source: 'player_request',
          status: 'pending',
        }),
      ],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_OVER_LIMIT')
  })

  it('T22 场景 3 正：非 rejected 退款量恰好等于上限', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [
        makeRefundBatch(),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-120-1',
          refundDayIndex: 120,
          refundedUnits: 1470,
          source: 'player_request',
          status: 'pending',
        }),
      ],
      transactions: FULL_TRANSACTIONS,
    })
    expect(parseSave(world).ok).toBe(true)
  })

  it('T23 场景 3 正：仅 rejected 批次超限不误杀', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [
        makeRefundBatch(),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-107-1',
          refundDayIndex: 107,
          refundedUnits: 1000,
          source: 'player_request',
          status: 'rejected',
        }),
        makeRefundBatch({
          id: 'RB-PROJ-001-100-108-1',
          refundDayIndex: 108,
          refundedUnits: 1000,
          source: 'player_request',
          status: 'rejected',
        }),
      ],
      transactions: FULL_TRANSACTIONS,
    })
    expect(parseSave(world).ok).toBe(true)
  })

  it('T24 零退款批次被拒', () => {
    const world = makeContractWorld({
      batches: [makeRefundBatch({ refundedUnits: 0, status: 'rejected' })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T25 grossUnits=0 的记录被拒', () => {
    const world = makeContractWorld({ sales: [makeSalesRecord({ grossUnits: 0 })] })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T26 浮点金额被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ grossRevenueCents: 2_999.5 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T27 负金额/负计数被拒', () => {
    const negativeFee = parseSave(
      makeContractWorld({ sales: [makeSalesRecord({ platformFeeCents: -1 })] }),
    )
    expect(negativeFee.ok).toBe(false)
    if (!negativeFee.ok) expect(negativeFee.errorCode).toBe('SAVE_SCHEMA_INVALID')

    const negativeActual = parseSave(
      makeContractWorld({ sales: [makeSalesRecord({ actualRefundUnits: -1 })] }),
    )
    expect(negativeActual.ok).toBe(false)
    if (!negativeActual.ok) expect(negativeActual.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T28 estimatedRefundUnits > grossUnits 被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ estimatedRefundUnits: 1501 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T29 actualRefundUnits > grossUnits 被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 1501 })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T30 salesRecordId 断引用被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [makeRefundBatch({ salesRecordId: 'SR-ghost' })],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('T31 批次与记录的元组不一致被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [makeRefundBatch({ marketId: 'US' })],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('T32 refundDayIndex < saleDayIndex 被拒', () => {
    const world = makeContractWorld({
      batches: [
        makeRefundBatch({
          id: 'RB-PROJ-001-100-99-1',
          refundDayIndex: 99,
          status: 'rejected',
        }),
      ],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T33 批次 ID 格式非法被拒', () => {
    const seqZero = parseSave(
      makeContractWorld({
        batches: [makeRefundBatch({ id: 'RB-PROJ-001-100-114-0' })],
      }),
    )
    expect(seqZero.ok).toBe(false)
    if (!seqZero.ok) expect(seqZero.errorCode).toBe('SAVE_SCHEMA_INVALID')

    const malformed = parseSave(
      makeContractWorld({ batches: [makeRefundBatch({ id: 'RB-bad' })] }),
    )
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T34 幂等键漂移被拒', () => {
    const world = makeContractWorld({
      batches: [makeRefundBatch({ idempotencyKey: 'customer-refund:other' })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T35 三态均可读，非法枚举被拒', () => {
    const pending = parseSave(
      makeContractWorld({ batches: [makeRefundBatch({ status: 'pending' })] }),
    )
    expect(pending.ok).toBe(true)

    const posted = parseSave(
      makeContractWorld({
        sales: [makeSalesRecord({ actualRefundUnits: 30 })],
        batches: [makeRefundBatch({ status: 'posted' })],
        transactions: FULL_TRANSACTIONS,
      }),
    )
    expect(posted.ok).toBe(true)

    const rejected = parseSave(
      makeContractWorld({
        batches: [
          makeRefundBatch({
            id: 'RB-PROJ-001-100-107-1',
            refundDayIndex: 107,
            source: 'player_request',
            status: 'rejected',
          }),
        ],
      }),
    )
    expect(rejected.ok).toBe(true)

    const failed = parseSave(
      makeContractWorld({
        batches: [makeRefundBatch({ status: 'failed' as unknown as RefundBatch['status'] })],
      }),
    )
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.errorCode).toBe('SAVE_SCHEMA_INVALID')
  })

  it('T36 非整除毛收入可读', () => {
    const record = makeSalesRecord({
      id: makeSalesRecordId(PRODUCT_ID, 100, 'JP', 'home_console_g2'),
      grossUnits: 2,
      grossRevenueCents: 3001,
      unitPriceAtSaleCents: 1501,
      platformFeeCents: 900,
      netSalesRevenueCents: 2101,
      estimatedRefundUnits: 0,
      actualRefundUnits: 0,
    })
    const world = makeContractWorld({
      sales: [record],
      transactions: [makeTransaction('tx-one', 'sales_revenue', 3001, 100)],
    })
    expect(parseSave(world).ok).toBe(true)
  })

  it('T37 销售记录不属于所属产品被拒', () => {
    const record = makeSalesRecord({
      id: makeSalesRecordId('PROJ-002', 100, 'JP', 'home_console_g2'),
      productId: 'PROJ-002',
    })
    const world = makeContractWorld({ sales: [record] })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_BROKEN_REF')
  })

  it('T38 SalesRecord ID 非规范化被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ id: 'SR-PROJ-001-100-US-home_console_g2' })],
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_ID_MISMATCH')
  })

  it('T39 RefundBatch ID 段不一致被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 30 })],
      batches: [makeRefundBatch({ id: 'RB-PROJ-002-100-114-1' })],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_ID_MISMATCH')
  })

  it('T40 0% 平台抽成边界可读', () => {
    const world = makeContractWorld({
      sales: [
        makeSalesRecord({
          platformFeeCents: 3_000_000,
          netSalesRevenueCents: 0,
        }),
      ],
      transactions: [makeTransaction('tx-sales', 'sales_revenue', 3_000_000, 100)],
    })
    expect(parseSave(world).ok).toBe(true)
  })

  it('T41 旧 v1 存档缺字段兼容：补 [] 且迁移升到 v2', () => {
    const world = makeContractWorld()
    const legacy = structuredClone(world) as unknown as {
      schemaVersion: number
      refundBatches?: unknown
      products: Array<{ salesByPeriod?: unknown }>
      [key: string]: unknown
    }
    delete legacy.products[0]!.salesByPeriod
    delete legacy.refundBatches

    const r = parseSave(legacy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.schemaVersion).toBe(3)
    expect(r.state.products[0]?.salesByPeriod).toEqual([])
    expect(r.state.refundBatches).toEqual([])
    expect(SAVE_SCHEMA_VERSION).toBe(3)
  })

  it('T42 posted 累加与 actualRefundUnits 不一致被拒', () => {
    const world = makeContractWorld({
      sales: [makeSalesRecord({ actualRefundUnits: 29 })],
      batches: [makeRefundBatch()],
      transactions: FULL_TRANSACTIONS,
    })
    const r = parseSave(world)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errorCode).toBe('SAVE_REFUND_INCONSISTENT')
  })

  it('T43 上市初始化 salesByPeriod 为空数组', () => {
    const service = new ProjectService()
    service.reset([
      makeProject({
        phase: 'READY_TO_LAUNCH',
        plannedLaunchDay: 10,
        teamAssignments: [],
      }),
    ])
    const result = service.launch('project-1', 10)
    expect(result.success).toBe(true)
    expect(result.result?.product.salesByPeriod).toEqual([])
  })

  it('T44 空世界与 makeWorld 的 refundBatches 默认为空数组', () => {
    expect(createEmptyWorld().refundBatches).toEqual([])
    expect(makeWorld().refundBatches).toEqual([])
  })
})
