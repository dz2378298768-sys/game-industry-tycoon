/**
 * ContractService —— 发行合同（DESIGN-M2-001-F §5）。
 *
 * 分成：按当日净销售 − 当日 posted 退款结算；对"销售日已结算过"的跨日退款按同费率冲减（R1 P1-2）。
 * 里程碑：累计口径 = Σ日净销售 − Σ日退款（退款落在退款日，不改历史，R1 P1-3）。
 */
import type { PublishingContract } from '@domain/entities/publishing-contract'
import { makeContractId } from '@domain/entities/publishing-contract'
import {
  createPublishingContractSignedEvent,
  createPublishingMilestonePaidEvent,
  createPublishingRevenueSettledEvent,
} from '@domain/events'
import {
  CONTRACT_DURATION_MAX,
  CONTRACT_DURATION_MIN,
  CONTRACT_PAYOUT_MAX_CENTS,
  CONTRACT_PAYOUT_MIN_CENTS,
  CONTRACT_RATE_MAX,
  CONTRACT_RATE_MIN,
  CONTRACT_THRESHOLD_MIN_CENTS,
  contractBaseCents,
  shareAmountCents,
} from '@domain/value-objects'
import type { FinanceService } from './finance-service'
import type { WorldState } from './world-state'

export type ContractErrorCode =
  | 'CONTRACT_PRODUCT_NOT_LAUNCHED'
  | 'CONTRACT_RATE_OUT_OF_RANGE'
  | 'CONTRACT_THRESHOLD_OUT_OF_RANGE'
  | 'CONTRACT_ALREADY_ACTIVE'
  | 'CONTRACT_NOT_FOUND'

export interface SignRevenueShareCmd {
  productId: string
  ratePercent: number
  durationDays: number | null
}

export interface SignMilestoneCmd {
  productId: string
  thresholdNetRevenueCents: number
  payoutCents: number
  durationDays: number | null
}

export interface ContractResult {
  ok: boolean
  world: WorldState
  errorCode?: ContractErrorCode
  errorMessage?: string
  contract?: PublishingContract
}

export interface ContractTickResult {
  world: WorldState
  paidCents: number
  clawedBackCents: number
  completed: number
  terminated: number
}

function hasActiveContract(world: WorldState, productId: string, type: PublishingContract['type']): boolean {
  return world.publishingContracts.some(
    (c) => c.productId === productId && c.type === type && c.status === 'active',
  )
}

function nextSeq(world: WorldState, productId: string, type: PublishingContract['type']): number {
  return (
    world.publishingContracts.filter((c) => c.productId === productId && c.type === type).length + 1
  )
}

function validateCommon(
  world: WorldState,
  productId: string,
  durationDays: number | null,
  type: PublishingContract['type'],
): ContractResult | null {
  const product = world.products.find((p) => p.id === productId)
  if (product === undefined || product.launchDay === null || product.status !== 'active') {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_PRODUCT_NOT_LAUNCHED',
      errorMessage: '合同只能引用已上市且未退市的产品',
    }
  }
  if (
    durationDays !== null &&
    (!Number.isInteger(durationDays) || durationDays < CONTRACT_DURATION_MIN || durationDays > CONTRACT_DURATION_MAX)
  ) {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_THRESHOLD_OUT_OF_RANGE',
      errorMessage: `合同期限须为 ${CONTRACT_DURATION_MIN}–${CONTRACT_DURATION_MAX} 天或 null`,
    }
  }
  if (hasActiveContract(world, productId, type)) {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_ALREADY_ACTIVE',
      errorMessage: '该产品已有同类型生效合同',
    }
  }
  return null
}

export function signRevenueShareContract(
  world: WorldState,
  cmd: SignRevenueShareCmd,
  day: number,
): ContractResult {
  const invalid = validateCommon(world, cmd.productId, cmd.durationDays, 'revenue_share')
  if (invalid !== null) return invalid
  if (!Number.isInteger(cmd.ratePercent) || cmd.ratePercent < CONTRACT_RATE_MIN || cmd.ratePercent > CONTRACT_RATE_MAX) {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_RATE_OUT_OF_RANGE',
      errorMessage: `分成比例须为 ${CONTRACT_RATE_MIN}–${CONTRACT_RATE_MAX}%`,
    }
  }
  const contract: PublishingContract = {
    id: makeContractId(cmd.productId, 'revenue_share', nextSeq(world, cmd.productId, 'revenue_share')),
    productId: cmd.productId,
    type: 'revenue_share',
    ratePercent: cmd.ratePercent,
    signedDay: day,
    durationDays: cmd.durationDays,
    status: 'active',
    settledCents: 0,
    version: 1,
    createdAt: day,
    updatedAt: day,
  }
  return {
    ok: true,
    contract,
    world: {
      ...world,
      publishingContracts: [...world.publishingContracts, contract],
      events: [
        ...world.events,
        createPublishingContractSignedEvent(`contract-signed:${contract.id}`, {
          day,
          contractId: contract.id,
          productId: contract.productId,
          contractType: contract.type,
        }),
      ],
    },
  }
}

export function signMilestoneContract(
  world: WorldState,
  cmd: SignMilestoneCmd,
  day: number,
): ContractResult {
  const invalid = validateCommon(world, cmd.productId, cmd.durationDays, 'milestone')
  if (invalid !== null) return invalid
  if (
    !Number.isInteger(cmd.thresholdNetRevenueCents) ||
    cmd.thresholdNetRevenueCents < CONTRACT_THRESHOLD_MIN_CENTS ||
    !Number.isInteger(cmd.payoutCents) ||
    cmd.payoutCents < CONTRACT_PAYOUT_MIN_CENTS ||
    cmd.payoutCents > CONTRACT_PAYOUT_MAX_CENTS
  ) {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_THRESHOLD_OUT_OF_RANGE',
      errorMessage: `门槛须 ≥ ${CONTRACT_THRESHOLD_MIN_CENTS}，奖金须在 ${CONTRACT_PAYOUT_MIN_CENTS}–${CONTRACT_PAYOUT_MAX_CENTS} 之间`,
    }
  }
  const contract: PublishingContract = {
    id: makeContractId(cmd.productId, 'milestone', nextSeq(world, cmd.productId, 'milestone')),
    productId: cmd.productId,
    type: 'milestone',
    thresholdNetRevenueCents: cmd.thresholdNetRevenueCents,
    payoutCents: cmd.payoutCents,
    signedDay: day,
    durationDays: cmd.durationDays,
    status: 'active',
    settledCents: 0,
    version: 1,
    createdAt: day,
    updatedAt: day,
  }
  return {
    ok: true,
    contract,
    world: {
      ...world,
      publishingContracts: [...world.publishingContracts, contract],
      events: [
        ...world.events,
        createPublishingContractSignedEvent(`contract-signed:${contract.id}`, {
          day,
          contractId: contract.id,
          productId: contract.productId,
          contractType: contract.type,
        }),
      ],
    },
  }
}

function dailyNetSales(world: WorldState, productId: string, day: number): number {
  return world.products
    .filter((p) => p.id === productId)
    .flatMap((p) => p.salesByPeriod)
    .filter((r) => r.dayIndex === day)
    .reduce((acc, r) => acc + r.netSalesRevenueCents, 0)
}

function dailyRefunds(world: WorldState, productId: string, day: number): { total: number; batches: typeof world.refundBatches } {
  const batches = world.refundBatches.filter(
    (b) => b.productId === productId && b.status === 'posted' && b.refundDayIndex === day,
  )
  return { total: batches.reduce((acc, b) => acc + b.refundAmountCents, 0), batches }
}

/** 每日结算：分成（含跨日退款冲减）+ 里程碑 + 到期。 */
export function settleContracts(world: WorldState, day: number, finance: FinanceService): ContractTickResult {
  if (world.publishingContracts.length === 0) {
    return { world, paidCents: 0, clawedBackCents: 0, completed: 0, terminated: 0 }
  }

  let contracts = [...world.publishingContracts]
  const events = [...world.events]
  let paidCents = 0
  let clawedBackCents = 0
  let completed = 0
  let terminated = 0

  for (const contract of contracts) {
    if (contract.status !== 'active') continue
    const product = world.products.find((p) => p.id === contract.productId)
    if (product === undefined) continue

    // 到期判定（先结算当天，再结束）
    const expired = contract.durationDays !== null && day >= contract.signedDay + contract.durationDays

    if (contract.type === 'revenue_share' && contract.ratePercent !== undefined) {
      const refunds = dailyRefunds(world, contract.productId, day)
      const base = contractBaseCents(dailyNetSales(world, contract.productId, day), refunds.total)
      const amount = shareAmountCents(base, contract.ratePercent)
      if (amount > 0) {
        const key = `contract:${contract.id}:${day}`
        const posted = finance.postTransaction({
          idempotencyKey: key,
          companyId: product.companyId,
          day,
          category: 'contract_payment',
          amountCents: amount,
          description: `发行分成 ${contract.id}`,
          referenceId: contract.id,
        })
        if (posted.success) {
          if (!posted.idempotent) paidCents += amount
          contracts = contracts.map((c) =>
            c.id === contract.id
              ? { ...c, settledCents: c.settledCents + amount, updatedAt: day }
              : c,
          )
          events.push(
            createPublishingRevenueSettledEvent(`contract-settled:${contract.id}:${day}`, {
              day,
              contractId: contract.id,
              baseCents: base,
              amountCents: amount,
              direction: 'pay',
            }),
          )
        }
      }

      // 跨日退款冲减：销售日早于今天的分成已结，退款当日按同费率扣回
      for (const batch of refunds.batches) {
        if (batch.saleDayIndex >= day) continue
        const clawback = shareAmountCents(batch.refundAmountCents, contract.ratePercent)
        if (clawback <= 0) continue
        const key = `contract:${contract.id}:refund:${batch.id}`
        const posted = finance.postTransaction(
          {
            idempotencyKey: key,
            companyId: product.companyId,
            day,
            category: 'contract_payment',
            amountCents: -clawback,
            description: `分成退款冲减 ${batch.id}`,
            referenceId: contract.id,
          },
          { allowNegativeBalance: true },
        )
        if (posted.success && !posted.idempotent) {
          clawedBackCents += clawback
          contracts = contracts.map((c) =>
            c.id === contract.id
              ? { ...c, settledCents: c.settledCents - clawback, updatedAt: day }
              : c,
          )
          events.push(
            createPublishingRevenueSettledEvent(`contract-clawback:${contract.id}:${batch.id}`, {
              day,
              contractId: contract.id,
              baseCents: batch.refundAmountCents,
              amountCents: clawback,
              direction: 'clawback',
            }),
          )
        }
      }
    }

    if (contract.type === 'milestone' && contract.thresholdNetRevenueCents !== undefined && contract.payoutCents !== undefined) {
      let cumulative = 0
      for (let d = contract.signedDay; d <= day; d += 1) {
        const refunds = dailyRefunds(world, contract.productId, d)
        cumulative += contractBaseCents(dailyNetSales(world, contract.productId, d), refunds.total)
      }
      if (cumulative >= contract.thresholdNetRevenueCents) {
        const key = `contract:${contract.id}:milestone`
        const posted = finance.postTransaction({
          idempotencyKey: key,
          companyId: product.companyId,
          day,
          category: 'contract_payment',
          amountCents: contract.payoutCents,
          description: `里程碑奖金 ${contract.id}`,
          referenceId: contract.id,
        })
        if (posted.success && !posted.idempotent) {
          paidCents += contract.payoutCents
          contracts = contracts.map((c) =>
            c.id === contract.id
              ? { ...c, settledCents: c.settledCents + contract.payoutCents!, status: 'completed', updatedAt: day }
              : c,
          )
          completed += 1
          events.push(
            createPublishingMilestonePaidEvent(`contract-milestone:${contract.id}`, {
              day,
              contractId: contract.id,
              amountCents: contract.payoutCents,
            }),
          )
        }
      }
    }

    if (expired) {
      const target = contracts.find((c) => c.id === contract.id)
      if (target !== undefined && target.status === 'active') {
        const nextStatus = contract.type === 'revenue_share' ? 'completed' : 'terminated'
        contracts = contracts.map((c) =>
          c.id === contract.id ? { ...c, status: nextStatus, updatedAt: day } : c,
        )
        if (nextStatus === 'completed') completed += 1
        else terminated += 1
      }
    }
  }

  return { world: { ...world, publishingContracts: contracts, events }, paidCents, clawedBackCents, completed, terminated }
}

/** 面向调度器/GameWorld 的薄封装，逻辑全部在纯函数里。 */
export class ContractService {
  constructor(private readonly finance: FinanceService) {}

  signRevenueShare(world: WorldState, cmd: SignRevenueShareCmd, day: number): ContractResult {
    return signRevenueShareContract(world, cmd, day)
  }

  signMilestone(world: WorldState, cmd: SignMilestoneCmd, day: number): ContractResult {
    return signMilestoneContract(world, cmd, day)
  }

  settle(world: WorldState, day: number): ContractTickResult {
    return settleContracts(world, day, this.finance)
  }
}
