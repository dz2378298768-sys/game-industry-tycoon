/**
 * M3-B 发行合同三模板：C01–C06、C08。
 * C07（签署前悲观估算）留 M3-B2，理由见交付文档。
 */
import { describe, expect, it } from 'vitest'
import { FinanceService } from '@simulation/services/finance-service'
import { ContractService } from '@simulation/services/contract-service'
import type { WorldState } from '@simulation/services/world-state'
import type { RefundBatch } from '@domain/entities/refund-batch'
import { refundBatchIdempotencyKey } from '@domain/entities/refund-batch'
import { parseSave } from '@infrastructure/storage/save-schema'
import { estimateContractProceeds, hasFullControl } from '@simulation/services/contract-estimate'
import { isKnownPublisher } from '@content/publishers'
import { makeRecord, makeWorld, D_PRODUCT_ID, D_COMPANY_ID } from './m2d-pricing-fixtures'
import { makeProject } from '../../__tests__/helpers'

function setup(world = makeWorld()): { world: WorldState; finance: FinanceService; svc: ContractService } {
  const finance = new FinanceService()
  finance.registerCompany(D_COMPANY_ID)
  finance.replay(world.transactions, [D_COMPANY_ID])
  return { world, finance, svc: new ContractService(finance) }
}

function withSales(day: number, market: string, net = 1_400_000, extraDay?: number): WorldState {
  const base = makeWorld()
  const record = { ...makeRecord(day), marketId: market, netSalesRevenueCents: net }
  const records = extraDay === undefined
    ? [record]
    : [record, { ...makeRecord(extraDay), marketId: market, netSalesRevenueCents: net }]
  return {
    ...base,
    companies: base.companies.map((c) => ({ ...c, cashBalanceCents: 0 })),
    products: base.products.map((p) => ({ ...p, salesByPeriod: records })),
  }
}

function contractOf(world: WorldState) {
  return world.publishingContracts[0]!
}

describe('M3-B 合同三模板', () => {
  it('C01 channel：分成只按 marketScope/platformScope 过滤后的销售计算', () => {
    const { world, finance, svc } = setup(withSales(2, 'japan'))
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'channel',
        ratePercent: 20,
        durationDays: null,
        partnerId: 'nippon-soft',
        marketScope: ['japan'],
        platformScope: ['arcade_pre_1975'],
      },
      1,
    )
    expect(signed.ok).toBe(true)
    const settled = svc.settle(signed.world, 2)
    const paid = settled.world.publishingContracts[0]!.settledCents
    expect(paid).toBe(Math.round(1_400_000 * 0.2))
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(paid)
  })

  it('C02 co_marketing：发行商月投入提升认知度，玩家现金分文不动', () => {
    const { world, finance, svc } = setup()
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'co_marketing',
        ratePercent: 25,
        durationDays: null,
        partnerId: 'global-star',
        marketingCommitmentCents: 12_000_000,
      },
      0,
    )
    expect(signed.ok).toBe(true)
    const beforeCash = finance.getCashBalance(D_COMPANY_ID)
    const settled = svc.settle(signed.world, 31) // 1970-02-01
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(beforeCash)
    const c = contractOf(settled.world)
    expect(c.marketingInjectedCents).toBe(1_000_000)
    const awareness = settled.world.products[0]!.awarenessByMarket
    expect(Object.keys(awareness).length).toBeGreaterThan(0)
    expect(Object.values(awareness).some((v) => v > 0)).toBe(true)
  })

  it('C03 advance：预付款入账一次；回收期内分成 0，回收完成后按费率分成', () => {
    const base = withSales(2, 'japan', 1_000_000, 3)
    const { world, finance, svc } = setup(base)
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'advance',
        ratePercent: 20,
        durationDays: null,
        partnerId: 'sunrise-publishing',
        prepaymentCents: 5_000_000,
        recoupRatePercent: 100,
      },
      1,
    )
    expect(signed.ok).toBe(true)
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(5_000_000)

    const first = svc.settle(signed.world, 2)
    expect(contractOf(first.world).recoupedCents).toBe(1_000_000)
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(5_000_000)

    // 把剩余未回收压到 0，再结算一天 → 分成按 20%
    const nearDone: WorldState = {
      ...first.world,
      publishingContracts: first.world.publishingContracts.map((c) => ({
        ...c,
        recoupedCents: 5_000_000,
      })),
    }
    const done = svc.settle(nearDone, 3)
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(5_000_000 + 200_000)
    expect(contractOf(done.world).settledCents).toBe(200_000)
  })

  it('C04 质量违约：追回 50% 预付款，允许负余额且只追一次', () => {
    const { world, finance, svc } = setup()
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'advance',
        ratePercent: 20,
        durationDays: null,
        partnerId: 'sunrise-publishing',
        prepaymentCents: 4_000_000,
        qualityThreshold: 60,
      },
      0,
    )
    expect(signed.ok).toBe(true)
    const lowQuality: WorldState = {
      ...signed.world,
      products: signed.world.products.map((p) => ({ ...p, finalQualityScore: 40 })),
      companies: signed.world.companies.map((c) => ({ ...c, cashBalanceCents: 0 })),
    }
    // 把预付款花掉，制造负余额场景
    finance.postTransaction(
      {
        idempotencyKey: 'burn-cash',
        companyId: D_COMPANY_ID,
        day: 1,
        category: 'project_expense',
        amountCents: -4_000_000,
        description: 'burn',
      },
      { allowNegativeBalance: true },
    )
    const first = svc.settle(lowQuality, 1)
    expect(contractOf(first.world).status).toBe('terminated')
    expect(contractOf(first.world).terminationClause).toBe('quality_breach')
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(-2_000_000)
    svc.settle(first.world, 2)
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(-2_000_000)
  })

  it('C05 交付违约：逾期 90 天终止，未回收余额追回 30%', () => {
    const { world, finance, svc } = setup()
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'advance',
        ratePercent: 20,
        durationDays: null,
        partnerId: 'sunrise-publishing',
        prepaymentCents: 10_000_000,
        deliveryDay: 1,
      },
      1,
    )
    expect(signed.ok).toBe(true)
    const terminated = svc.settle(signed.world, 91)
    expect(contractOf(terminated.world).status).toBe('terminated')
    expect(contractOf(terminated.world).terminationClause).toBe('delivery_breach')
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(10_000_000 - 3_000_000)
    expect(contractOf(terminated.world).recoupedCents).toBe(3_000_000)
  })

  it('C06 跨日退款在回收期先冲减未回收余额，不重复计入玩家分成', () => {
    const base = makeWorld()
    const batch: RefundBatch = {
      id: 'RB-C06',
      productId: D_PRODUCT_ID,
      salesRecordId: 'SR-PROD-D-10',
      marketId: 'japan',
      platformId: 'arcade_pre_1975',
      saleDayIndex: 10,
      refundDayIndex: 12,
      refundedUnits: 10,
      refundAmountCents: 1_000_000,
      source: 'auto_window',
      status: 'posted',
      idempotencyKey: refundBatchIdempotencyKey('RB-C06'),
    }
    const { world, finance, svc } = setup({ ...base, refundBatches: [batch] })
    const signed = svc.signTemplate(
      world,
      {
        productId: D_PRODUCT_ID,
        template: 'advance',
        ratePercent: 20,
        durationDays: null,
        partnerId: 'sunrise-publishing',
        prepaymentCents: 5_000_000,
      },
      11,
    )
    const recoupHeld: WorldState = {
      ...signed.world,
      publishingContracts: signed.world.publishingContracts.map((c) => ({
        ...c,
        recoupedCents: 2_000_000,
      })),
    }
    const settled = svc.settle(recoupHeld, 12)
    expect(contractOf(settled.world).recoupedCents).toBe(1_000_000)
    expect(finance.getCashBalance(D_COMPANY_ID)).toBe(5_000_000)
    expect(contractOf(settled.world).settledCents).toBe(0)
  })

  it('C08 旧档无 template：读档推断为 channel，结算口径不变', () => {
    const world: WorldState = {
      ...makeWorld(),
      companies: [{ ...makeWorld().companies[0]!, cashBalanceCents: 0 }],
      projects: [makeProject({ id: 'prj-d', companyId: D_COMPANY_ID, teamAssignments: [] })],
      publishingContracts: [
        {
          id: 'CT-old',
          productId: D_PRODUCT_ID,
          type: 'revenue_share',
          ratePercent: 20,
          signedDay: 0,
          durationDays: null,
          status: 'active',
          settledCents: 0,
          version: 1,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }
    const parsed = parseSave(JSON.parse(JSON.stringify(world)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.state.publishingContracts[0]!.template).toBe('channel')
  })

  it('C07 签署前模拟：同口径历史窗口估算与实际 12 个月偏差 ≤ 20%', () => {
    const history = Array.from({ length: 90 }, (_, i) => ({
      ...makeRecord(i + 1),
      marketId: 'japan',
      netSalesRevenueCents: 1_000_000,
    }))
    const base = makeWorld()
    const world: WorldState = {
      ...base,
      companies: base.companies.map((c) => ({ ...c, cashBalanceCents: 0 })),
      products: base.products.map((p) => ({ ...p, salesByPeriod: history })),
    }
    const { svc } = setup(world)
    const cmd = {
      productId: D_PRODUCT_ID,
      template: 'channel' as const,
      ratePercent: 20,
      durationDays: null,
      partnerId: 'global-star',
    }
    const estimate = estimateContractProceeds(world, cmd, 91)
    expect(estimate.projectedNetCents).toBe(365 * 1_000_000)
    expect(estimate.worstNetCents).toBe(Math.round(365 * 1_000_000 * 0.5))
    const signed = svc.signTemplate(world, cmd, 91)
    expect(signed.ok).toBe(true)
    let cur = signed.world
    for (let d = 91; d <= 455; d += 1) {
      cur = {
        ...cur,
        products: cur.products.map((p) => ({
          ...p,
          salesByPeriod: [...p.salesByPeriod, { ...makeRecord(d), marketId: 'japan', netSalesRevenueCents: 1_000_000 }],
        })),
      }
      cur = svc.settle(cur, d).world
    }
    const actualNet = 365 * 1_000_000
    const deviation = Math.abs(actualNet - estimate.projectedNetCents) / actualNet
    expect(deviation).toBeLessThanOrEqual(0.2)
    expect(contractOf(cur).settledCents).toBe(Math.round(actualNet * 0.2))
  })

  it('C09 partnerId 必须来自内容表，且模板需被该发行商支持', () => {
    expect(isKnownPublisher('global-star')).toBe(true)
    const { world, svc } = setup()
    const unknown = svc.signTemplate(world, {
      productId: D_PRODUCT_ID,
      template: 'channel',
      ratePercent: 20,
      durationDays: null,
      partnerId: 'not-a-publisher',
    }, 1)
    expect(unknown.ok).toBe(false)
    expect(unknown.errorCode).toBe('CONTRACT_PARTNER_UNKNOWN')
    const unsupported = svc.signTemplate(world, {
      productId: D_PRODUCT_ID,
      template: 'advance',
      ratePercent: 20,
      durationDays: null,
      partnerId: 'rhein-media',
      prepaymentCents: 1_000_000,
    }, 1)
    expect(unsupported.ok).toBe(false)
    expect(unsupported.errorCode).toBe('CONTRACT_PARTNER_TEMPLATE_UNSUPPORTED')
  })

  it('C10 controlLevel=full 的 advance 生效期内锁定改价/营销', () => {
    const { world } = setup()
    const activeAdvance: WorldState = {
      ...world,
      publishingContracts: [{
        id: 'CT-lock', productId: D_PRODUCT_ID, type: 'revenue_share', template: 'advance',
        partnerId: 'sunrise-publishing', ratePercent: 20, signedDay: 1, durationDays: null,
        status: 'active', settledCents: 0, controlLevel: 'full', version: 1, createdAt: 1, updatedAt: 1,
      }],
    }
    expect(hasFullControl(activeAdvance, D_PRODUCT_ID)).toBe(true)
    const shared: WorldState = {
      ...activeAdvance,
      publishingContracts: activeAdvance.publishingContracts.map((c) => ({ ...c, controlLevel: 'shared' })),
    }
    expect(hasFullControl(shared, D_PRODUCT_ID)).toBe(false)
  })
})
