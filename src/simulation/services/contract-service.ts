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
import { awarenessDeltaCents, splitBudgetAcrossMarkets } from '@domain/value-objects'
import { marketingScaleKeyOf } from './sales-formulas'
import { TUNING } from '@content/tuning'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'
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
  | 'CONTRACT_TEMPLATE_INVALID'
  | 'CONTRACT_FIELD_OUT_OF_RANGE'

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

export const CONTRACT_PREPAY_MAX_CENTS = 200_000_000
export const CONTRACT_MARKETING_MAX_CENTS = 120_000_000
export const CONTRACT_RECOUP_MIN_PERCENT = 1
export const CONTRACT_RECOUP_MAX_PERCENT = 100

export interface SignTemplateCmd {
  productId: string
  template: 'channel' | 'co_marketing' | 'advance'
  ratePercent: number
  durationDays: number | null
  partnerId: string
  marketScope?: string[]
  platformScope?: string[]
  prepaymentCents?: number
  recoupRatePercent?: number
  marketingCommitmentCents?: number
  qualityThreshold?: number
  deliveryDay?: number
  controlLevel?: 'full' | 'shared' | 'none'
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

function isInScope(
  contract: PublishingContract,
  record: { marketId: string; platformId: string },
): boolean {
  const markets = contract.marketScope
  const platforms = contract.platformScope
  if (markets !== undefined && markets.length > 0 && !markets.includes(record.marketId)) return false
  if (platforms !== undefined && platforms.length > 0 && !platforms.includes(record.platformId)) {
    return false
  }
  return true
}

function templateRateRange(template: SignTemplateCmd['template']): { min: number; max: number } {
  if (template === 'channel') return { min: 15, max: 30 }
  if (template === 'co_marketing') return { min: 20, max: 35 }
  return { min: 15, max: 30 }
}

/** 三模板签署：预付款走 FinanceService 一次性入账，其余字段纯数据。 */
export function signTemplateContract(
  world: WorldState,
  cmd: SignTemplateCmd,
  day: number,
  finance: FinanceService,
): ContractResult {
  if (!['channel', 'co_marketing', 'advance'].includes(cmd.template)) {
    return { ok: false, world, errorCode: 'CONTRACT_TEMPLATE_INVALID', errorMessage: '未知合同模板' }
  }
  if (typeof cmd.partnerId !== 'string' || cmd.partnerId.trim().length === 0) {
    return { ok: false, world, errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE', errorMessage: 'partnerId 必填' }
  }
  const invalid = validateCommon(world, cmd.productId, cmd.durationDays, 'revenue_share')
  if (invalid !== null) return invalid

  const range = templateRateRange(cmd.template)
  if (!Number.isInteger(cmd.ratePercent) || cmd.ratePercent < range.min || cmd.ratePercent > range.max) {
    return {
      ok: false,
      world,
      errorCode: 'CONTRACT_RATE_OUT_OF_RANGE',
      errorMessage: `${cmd.template} 分成须为 ${range.min}–${range.max}%`,
    }
  }
  if (cmd.template === 'advance') {
    const prepay = cmd.prepaymentCents
    if (
      prepay === undefined ||
      !Number.isInteger(prepay) ||
      prepay <= 0 ||
      prepay > CONTRACT_PREPAY_MAX_CENTS
    ) {
      return {
        ok: false,
        world,
        errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE',
        errorMessage: `预付款须为 1–${CONTRACT_PREPAY_MAX_CENTS} 分`,
      }
    }
    const recoup = cmd.recoupRatePercent ?? 100
    if (!Number.isInteger(recoup) || recoup < CONTRACT_RECOUP_MIN_PERCENT || recoup > CONTRACT_RECOUP_MAX_PERCENT) {
      return {
        ok: false,
        world,
        errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE',
        errorMessage: '回收比例须为 1–100%',
      }
    }
    if (
      cmd.qualityThreshold !== undefined &&
      (!Number.isFinite(cmd.qualityThreshold) || cmd.qualityThreshold < 0 || cmd.qualityThreshold > 100)
    ) {
      return {
        ok: false,
        world,
        errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE',
        errorMessage: '质量门槛须为 0–100',
      }
    }
  }
  if (cmd.template === 'co_marketing') {
    const commitment = cmd.marketingCommitmentCents
    if (
      commitment === undefined ||
      !Number.isInteger(commitment) ||
      commitment <= 0 ||
      commitment > CONTRACT_MARKETING_MAX_CENTS
    ) {
      return {
        ok: false,
        world,
        errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE',
        errorMessage: `营销承诺须为 1–${CONTRACT_MARKETING_MAX_CENTS} 分`,
      }
    }
  }

  const product = world.products.find((p) => p.id === cmd.productId)!
  const contract: PublishingContract = {
    id: makeContractId(cmd.productId, 'revenue_share', nextSeq(world, cmd.productId, 'revenue_share')),
    productId: cmd.productId,
    type: 'revenue_share',
    template: cmd.template,
    partnerId: cmd.partnerId,
    ...(cmd.marketScope !== undefined ? { marketScope: [...cmd.marketScope] } : {}),
    ...(cmd.platformScope !== undefined ? { platformScope: [...cmd.platformScope] } : {}),
    ratePercent: cmd.ratePercent,
    signedDay: day,
    durationDays: cmd.durationDays,
    status: 'active',
    settledCents: 0,
    ...(cmd.template === 'advance'
      ? {
          prepaymentCents: cmd.prepaymentCents,
          recoupRatePercent: cmd.recoupRatePercent ?? 100,
          recoupedCents: 0,
          ...(cmd.qualityThreshold !== undefined ? { qualityThreshold: cmd.qualityThreshold } : {}),
          ...(cmd.deliveryDay !== undefined ? { deliveryDay: cmd.deliveryDay } : {}),
          controlLevel: cmd.controlLevel ?? 'full',
        }
      : {}),
    ...(cmd.template === 'co_marketing'
      ? {
          marketingCommitmentCents: cmd.marketingCommitmentCents,
          marketingInjectedCents: 0,
          controlLevel: cmd.controlLevel ?? 'shared',
        }
      : {}),
    ...(cmd.template === 'channel' ? { controlLevel: cmd.controlLevel ?? 'shared' } : {}),
    version: 1,
    createdAt: day,
    updatedAt: day,
  }

  const nextWorld: WorldState = {
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
  }

  if (cmd.template === 'advance' && cmd.prepaymentCents !== undefined) {
    const posted = finance.postTransaction(
      {
        idempotencyKey: `contract-prepay:${contract.id}`,
        companyId: product.companyId,
        day,
        category: 'contract_payment',
        amountCents: cmd.prepaymentCents,
        description: `预付款 ${contract.id}`,
        referenceId: contract.id,
      },
      { allowNegativeBalance: true },
    )
    if (!posted.success) {
      return {
        ok: false,
        world,
        errorCode: 'CONTRACT_FIELD_OUT_OF_RANGE',
        errorMessage: posted.errorMessage ?? '预付款入账失败',
      }
    }
  }
  return { ok: true, contract, world: nextWorld }
}

function dailyNetSales(world: WorldState, productId: string, day: number, contract?: PublishingContract): number {
  return world.products
    .filter((p) => p.id === productId)
    .flatMap((p) => p.salesByPeriod)
    .filter((r) => r.dayIndex === day)
    .filter((r) => contract === undefined || isInScope(contract, r))
    .reduce((acc, r) => acc + r.netSalesRevenueCents, 0)
}

function dailyRefunds(
  world: WorldState,
  productId: string,
  day: number,
  contract?: PublishingContract,
): { total: number; batches: typeof world.refundBatches } {
  const batches = world.refundBatches.filter(
    (b) =>
      b.productId === productId &&
      b.status === 'posted' &&
      b.refundDayIndex === day &&
      (contract === undefined || isInScope(contract, { marketId: b.marketId, platformId: b.platformId })),
  )
  return { total: batches.reduce((acc, b) => acc + b.refundAmountCents, 0), batches }
}

/** 每日结算：分成（含跨日退款冲减）+ 里程碑 + 到期。 */
export function settleContracts(world: WorldState, day: number, finance: FinanceService): ContractTickResult {
  if (world.publishingContracts.length === 0) {
    return { world, paidCents: 0, clawedBackCents: 0, completed: 0, terminated: 0 }
  }

  let contracts = [...world.publishingContracts]
  let products = [...world.products]
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

    const template = contract.template ?? 'channel'

    if (contract.type === 'revenue_share' && contract.ratePercent !== undefined) {
      const refunds = dailyRefunds(world, contract.productId, day, contract)
      const base = contractBaseCents(
        dailyNetSales(world, contract.productId, day, contract),
        refunds.total,
      )
      let target = contracts.find((c) => c.id === contract.id) ?? contract
      const prepay = target.prepaymentCents ?? 0
      const recouped = target.recoupedCents ?? 0
      const recoupRate = target.recoupRatePercent ?? 100
      let recoup = 0
      if (template === 'advance' && prepay > 0 && recouped < prepay && base > 0) {
        recoup = Math.min(prepay - recouped, Math.floor((base * recoupRate) / 100))
        contracts = contracts.map((c) =>
          c.id === target.id ? { ...c, recoupedCents: recouped + recoup, updatedAt: day } : c,
        )
        target = contracts.find((c) => c.id === contract.id) ?? target
      }
      const shareBase = Math.max(0, base - recoup)
      const amount = shareAmountCents(shareBase, contract.ratePercent)
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
        let refundRemaining = batch.refundAmountCents
        if (template === 'advance') {
          const current = contracts.find((c) => c.id === contract.id)
          const held = current?.recoupedCents ?? 0
          if (held > 0) {
            const release = Math.min(held, refundRemaining)
            refundRemaining -= release
            contracts = contracts.map((c) =>
              c.id === contract.id
                ? { ...c, recoupedCents: held - release, updatedAt: day }
                : c,
            )
          }
        }
        const clawback = shareAmountCents(refundRemaining, contract.ratePercent)
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

    if (template === 'co_marketing' && contract.marketingCommitmentCents !== undefined) {
      const g = dayIndexToGregorian(day)
      if (g.day === 1) {
        const monthly = Math.floor(contract.marketingCommitmentCents / 12)
        const productNow = products.find((p) => p.id === contract.productId)
        if (productNow !== undefined && monthly > 0) {
          const allMarkets =
            Object.keys(productNow.awarenessByMarket).length > 0
              ? Object.keys(productNow.awarenessByMarket)
              : ['japan', 'north_america', 'europe', 'other']
          const marketIds = allMarkets
            .filter((m) => contract.marketScope === undefined || contract.marketScope.length === 0 || contract.marketScope.includes(m))
            .sort()
          const shares = splitBudgetAcrossMarkets(monthly, marketIds)
          const scale = TUNING.sales.marketingResponseScaleCents[marketingScaleKeyOf(productNow.lifecycleStage)]
          const cap = TUNING.sales.awarenessCap
          const awareness = { ...productNow.awarenessByMarket }
          for (const [marketId, budget] of shares) {
            const before = awareness[marketId] ?? 0
            awareness[marketId] = before + awarenessDeltaCents({
              budgetShareCents: budget,
              stageScaleCents: scale,
              channel: 'ads',
              awareness: before,
              cap,
            })
          }
          products = products.map((p) =>
            p.id === productNow.id ? { ...p, awarenessByMarket: awareness } : p,
          )
          contracts = contracts.map((c) =>
            c.id === contract.id
              ? { ...c, marketingInjectedCents: (c.marketingInjectedCents ?? 0) + monthly, updatedAt: day }
              : c,
          )
        }
      }
    }

    // 质量违约：上市质量分低于门槛 → 终止并追回 50% 预付款
    if (
      template === 'advance' &&
      contract.qualityThreshold !== undefined &&
      product.finalQualityScore < contract.qualityThreshold
    ) {
      const prepay = contract.prepaymentCents ?? 0
      const clawback = Math.floor(prepay / 2)
      if (clawback > 0) {
        const key = `contract:${contract.id}:quality-clawback`
        const posted = finance.postTransaction(
          {
            idempotencyKey: key,
            companyId: product.companyId,
            day,
            category: 'contract_payment',
            amountCents: -clawback,
            description: `质量违约追回 ${contract.id}`,
            referenceId: contract.id,
          },
          { allowNegativeBalance: true },
        )
        if (posted.success && !posted.idempotent) {
          clawedBackCents += clawback
          contracts = contracts.map((c) =>
            c.id === contract.id
              ? {
                  ...c,
                  status: 'terminated',
                  terminationClause: 'quality_breach',
                  settledCents: c.settledCents - clawback,
                  updatedAt: day,
                }
              : c,
          )
          terminated += 1
          events.push(
            createPublishingRevenueSettledEvent(`contract-quality-clawback:${contract.id}`, {
              day,
              contractId: contract.id,
              baseCents: prepay,
              amountCents: clawback,
              direction: 'clawback',
            }),
          )
          continue
        }
      }
    }

    // 交付违约：逾期 90 天未交付 → 未回收余额追回 30%
    if (
      template === 'advance' &&
      contract.deliveryDay !== undefined &&
      day >= contract.deliveryDay + 90
    ) {
      const prepay = contract.prepaymentCents ?? 0
      const held = contract.recoupedCents ?? 0
      const unrecouped = Math.max(0, prepay - held)
      const clawback = Math.floor(unrecouped * 0.3)
      if (clawback > 0) {
        const key = `contract:${contract.id}:delivery-clawback`
        const posted = finance.postTransaction(
          {
            idempotencyKey: key,
            companyId: product.companyId,
            day,
            category: 'contract_payment',
            amountCents: -clawback,
            description: `交付违约追回 ${contract.id}`,
            referenceId: contract.id,
          },
          { allowNegativeBalance: true },
        )
        if (!posted.success) continue
        if (!posted.idempotent) clawedBackCents += clawback
      }
      contracts = contracts.map((c) =>
        c.id === contract.id
          ? {
              ...c,
              status: 'terminated',
              terminationClause: 'delivery_breach',
              updatedAt: day,
            }
          : c,
      )
      terminated += 1
      continue
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

  return {
    world: { ...world, publishingContracts: contracts, products, events },
    paidCents,
    clawedBackCents,
    completed,
    terminated,
  }
}

/** 面向调度器/GameWorld 的薄封装，逻辑全部在纯函数里。 */
export class ContractService {
  constructor(private readonly finance: FinanceService) {}

  signRevenueShare(world: WorldState, cmd: SignRevenueShareCmd, day: number): ContractResult {
    return signRevenueShareContract(world, cmd, day)
  }

  signTemplate(world: WorldState, cmd: SignTemplateCmd, day: number): ContractResult {
    return signTemplateContract(world, cmd, day, this.finance)
  }

  signMilestone(world: WorldState, cmd: SignMilestoneCmd, day: number): ContractResult {
    return signMilestoneContract(world, cmd, day)
  }

  settle(world: WorldState, day: number): ContractTickResult {
    return settleContracts(world, day, this.finance)
  }
}
