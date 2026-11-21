/**
 * MarketingService —— 营销投放（DESIGN-M2-001-F §4）。
 *
 * 日序（R1 P1-1 修订后）：① 扣款 → ② 未成功扣款的产品衰减 ③ 提升。
 * 花钱必须走 FinanceService（幂等键），认知度写入不受 cap 限制，读取侧 clamp。
 */
import type { Product } from '@domain/entities/product'
import { makeCampaignId } from '@domain/entities/marketing-campaign'
import type { MarketingCampaign } from '@domain/entities/marketing-campaign'
import {
  createMarketingCampaignEndedEvent,
  createMarketingCampaignSetEvent,
  createMarketingSpendFailedEvent,
  createMarketingSpendPostedEvent,
} from '@domain/events'
import type { MarketingChannel } from '@domain/value-objects/marketing-response'
import {
  awarenessDeltaCents,
  applyAwarenessDecay,
  MARKETING_BUDGET_MAX_CENTS,
  MARKETING_BUDGET_MIN_CENTS,
  splitBudgetAcrossMarkets,
} from '@domain/value-objects'
import { marketingScaleKeyOf } from './sales-formulas'
import type { SalesTuning } from './sales-types'
import type { FinanceService } from './finance-service'
import type { WorldState } from './world-state'

export type MarketingErrorCode =
  | 'MARKETING_PRODUCT_NOT_FOUND'
  | 'MARKETING_PRODUCT_NOT_ACTIVE'
  | 'MARKETING_BUDGET_OUT_OF_RANGE'
  | 'MARKETING_PROJECT_NOT_FOUND'
  | 'MARKETING_PROJECT_TERMINAL'

export interface SetMarketingBudgetCmd {
  productId: string
  channel: MarketingChannel
  dailyBudgetCents: number
}

export interface MarketingCommandResult {
  ok: boolean
  world: WorldState
  errorCode?: MarketingErrorCode
  errorMessage?: string
  campaign?: MarketingCampaign
  ended?: boolean
}

export interface MarketingTickResult {
  world: WorldState
  spentCents: number
  failedChannels: number
}

export interface MarketingDeps {
  finance: FinanceService
  tuning: Pick<SalesTuning, 'marketingResponseScaleCents' | 'awarenessCap'>
}

function findProduct(world: WorldState, productId: string): Product | undefined {
  return world.products.find((p) => p.id === productId)
}

function isInvestable(product: Product): boolean {
  return product.status === 'active' && product.launchPriceCents !== null
}

/** 设置/调整渠道预算；0 表示停止投放。 */
export function setMarketingBudget(
  world: WorldState,
  cmd: SetMarketingBudgetCmd,
  day: number,
): MarketingCommandResult {
  const product = findProduct(world, cmd.productId)
  if (product === undefined) {
    return { ok: false, world, errorCode: 'MARKETING_PRODUCT_NOT_FOUND', errorMessage: '产品不存在' }
  }
  if (!isInvestable(product)) {
    return { ok: false, world, errorCode: 'MARKETING_PRODUCT_NOT_ACTIVE', errorMessage: '产品未上市或已退市' }
  }
  if (
    !Number.isInteger(cmd.dailyBudgetCents) ||
    (cmd.dailyBudgetCents !== 0 &&
      (cmd.dailyBudgetCents < MARKETING_BUDGET_MIN_CENTS || cmd.dailyBudgetCents > MARKETING_BUDGET_MAX_CENTS))
  ) {
    return { ok: false, world, errorCode: 'MARKETING_BUDGET_OUT_OF_RANGE', errorMessage: '预算超出允许区间' }
  }

  const campaignId = makeCampaignId(product.id, cmd.channel)
  const existing = world.marketingCampaigns.find((c) => c.id === campaignId)
  const events = [...world.events]

  if (cmd.dailyBudgetCents === 0) {
    if (existing === undefined || existing.status === 'ended') {
      return { ok: true, world, ended: false }
    }
    const ended: MarketingCampaign = {
      ...existing,
      dailyBudgetCents: 0,
      status: 'ended',
      version: existing.version + 1,
      updatedAt: day,
    }
    events.push(
      createMarketingCampaignEndedEvent(`marketing-ended:${campaignId}:${day}`, {
        day,
        campaignId,
        productId: product.id,
        channel: existing.channel,
      }),
    )
    return {
      ok: true,
      world: {
        ...world,
        marketingCampaigns: world.marketingCampaigns.map((c) => (c.id === campaignId ? ended : c)),
        events,
      },
      campaign: ended,
      ended: true,
    }
  }

  const campaign: MarketingCampaign =
    existing === undefined
      ? {
          id: campaignId,
          productId: product.id,
          channel: cmd.channel,
          dailyBudgetCents: cmd.dailyBudgetCents,
          startDay: day,
          status: 'active',
          version: 1,
          createdAt: day,
          updatedAt: day,
        }
      : {
          ...existing,
          dailyBudgetCents: cmd.dailyBudgetCents,
          status: 'active',
          version: existing.version + 1,
          updatedAt: day,
        }

  events.push(
    createMarketingCampaignSetEvent(`marketing-set:${campaignId}:${day}`, {
      day,
      campaignId,
      productId: product.id,
      channel: cmd.channel,
      dailyBudgetCents: cmd.dailyBudgetCents,
    }),
  )
  return {
    ok: true,
    world: {
      ...world,
      marketingCampaigns:
        existing === undefined
          ? [...world.marketingCampaigns, campaign]
          : world.marketingCampaigns.map((c) => (c.id === campaignId ? campaign : c)),
      events,
    },
    campaign,
  }
}

export interface SetPrelaunchMarketingCmd {
  projectId: string
  channel: MarketingChannel
  dailyBudgetCents: number
}

/** 上市前项目投放：产品尚未生成时挂项目，费用只累加 launchMarketingSpentCents。 */
export function setPrelaunchMarketingBudget(
  world: WorldState,
  cmd: SetPrelaunchMarketingCmd,
  day: number,
): MarketingCommandResult {
  const project = world.projects.find((p) => p.id === cmd.projectId)
  if (project === undefined) {
    return { ok: false, world, errorCode: 'MARKETING_PROJECT_NOT_FOUND', errorMessage: '项目不存在' }
  }
  if (project.phase === 'LAUNCHED' || project.phase === 'CANCELLED') {
    return { ok: false, world, errorCode: 'MARKETING_PROJECT_TERMINAL', errorMessage: '项目已终止' }
  }
  if (
    !Number.isInteger(cmd.dailyBudgetCents) ||
    cmd.dailyBudgetCents < MARKETING_BUDGET_MIN_CENTS ||
    cmd.dailyBudgetCents > MARKETING_BUDGET_MAX_CENTS
  ) {
    return { ok: false, world, errorCode: 'MARKETING_BUDGET_OUT_OF_RANGE', errorMessage: '预算超出允许区间' }
  }

  const campaignId = `MP-${project.id}-${cmd.channel}`
  const existing = world.marketingCampaigns.find((c) => c.id === campaignId)
  const campaign: MarketingCampaign = {
    id: campaignId,
    productId: `prelaunch:${project.id}`,
    projectId: project.id,
    prelaunch: true,
    channel: cmd.channel,
    dailyBudgetCents: cmd.dailyBudgetCents,
    startDay: existing?.startDay ?? day,
    status: 'active',
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? day,
    updatedAt: day,
  }
  return {
    ok: true,
    world: {
      ...world,
      marketingCampaigns:
        existing === undefined
          ? [...world.marketingCampaigns, campaign]
          : world.marketingCampaigns.map((c) => (c.id === campaignId ? campaign : c)),
      events: [
        ...world.events,
        createMarketingCampaignSetEvent(`marketing-set:${campaignId}:${day}`, {
          day,
          campaignId,
          productId: campaign.productId,
          channel: cmd.channel,
          dailyBudgetCents: cmd.dailyBudgetCents,
        }),
      ],
    },
    campaign,
  }
}

/** 产品上市后结束该项目所有上市前投放。 */
export function endPrelaunchCampaigns(world: WorldState, projectId: string, day: number): WorldState {
  const campaigns = world.marketingCampaigns.map((c) =>
    c.prelaunch === true && c.projectId === projectId && c.status === 'active'
      ? { ...c, status: 'ended' as const, dailyBudgetCents: 0, version: c.version + 1, updatedAt: day }
      : c,
  )
  return campaigns === world.marketingCampaigns ? world : { ...world, marketingCampaigns: campaigns }
}

/** 每日投放：扣款 →（未成功渠道）衰减 → 提升。 */
export function tickMarketing(world: WorldState, day: number, deps: MarketingDeps): MarketingTickResult {
  if (world.marketingCampaigns.length === 0) {
    return { world, spentCents: 0, failedChannels: 0 }
  }

  const events = [...world.events]
  const productsById = new Map(world.products.map((p) => [p.id, p]))
  const projectsById = new Map(world.projects.map((p) => [p.id, p]))
  const projectsUpdated = new Map<string, typeof world.projects[number]>()
  const spentByProduct = new Map<string, boolean>()
  const awarenessByProduct = new Map<string, Record<string, number>>()
  let spentCents = 0
  let failedChannels = 0

  for (const campaign of world.marketingCampaigns) {
    if (campaign.status !== 'active' || campaign.dailyBudgetCents <= 0) continue

    if (campaign.prelaunch === true && campaign.projectId !== undefined) {
      const project = projectsById.get(campaign.projectId)
      if (
        project === undefined ||
        project.phase === 'LAUNCHED' ||
        project.phase === 'CANCELLED'
      ) {
        continue
      }
      const key = `marketing-prelaunch:${project.id}:${campaign.channel}:${day}`
      const posted = deps.finance.postTransaction({
        idempotencyKey: key,
        companyId: project.companyId,
        day,
        category: 'marketing',
        amountCents: -campaign.dailyBudgetCents,
        description: `上市前营销 ${campaign.channel}`,
        referenceId: campaign.id,
      })
      if (!posted.success) {
        failedChannels += 1
        events.push(
          createMarketingSpendFailedEvent(`marketing-failed:${campaign.id}:${day}`, {
            day,
            campaignId: campaign.id,
            productId: campaign.productId,
            channel: campaign.channel,
            reasonCode: posted.errorCode ?? 'FIN_UNKNOWN',
          }),
        )
        continue
      }
      if (posted.idempotent) continue
      spentCents += campaign.dailyBudgetCents
      const base = projectsUpdated.get(project.id) ?? project
      projectsUpdated.set(project.id, {
        ...base,
        launchMarketingSpentCents: (base.launchMarketingSpentCents ?? 0) + campaign.dailyBudgetCents,
        version: base.version + 1,
        updatedAt: day,
      })
      events.push(
        createMarketingSpendPostedEvent(`marketing-spend:${campaign.id}:${day}`, {
          day,
          campaignId: campaign.id,
          productId: campaign.productId,
          channel: campaign.channel,
          amountCents: campaign.dailyBudgetCents,
        }),
      )
      continue
    }

    const product = productsById.get(campaign.productId)
    if (product === undefined || !isInvestable(product)) continue

    const key = `marketing:${product.id}:${campaign.channel}:${day}`
    const posted = deps.finance.postTransaction({
      idempotencyKey: key,
      companyId: product.companyId,
      day,
      category: 'marketing',
      amountCents: -campaign.dailyBudgetCents,
      description: `营销投放 ${campaign.channel}`,
      referenceId: campaign.id,
    })
    if (!posted.success) {
      failedChannels += 1
      events.push(
        createMarketingSpendFailedEvent(`marketing-failed:${campaign.id}:${day}`, {
          day,
          campaignId: campaign.id,
          productId: product.id,
          channel: campaign.channel,
          reasonCode: posted.errorCode ?? 'FIN_UNKNOWN',
        }),
      )
      continue
    }

    spentByProduct.set(product.id, true)
    // 同日重复 tick：交易幂等命中，不得再次叠加认知度
    if (posted.idempotent) continue
    spentCents += campaign.dailyBudgetCents

    const current = awarenessByProduct.get(product.id) ?? { ...product.awarenessByMarket }
    const markets = Object.keys(current)
    if (markets.length === 0) {
      awarenessByProduct.set(product.id, current)
      continue
    }
    const shares = splitBudgetAcrossMarkets(campaign.dailyBudgetCents, markets)
    const scale = deps.tuning.marketingResponseScaleCents[marketingScaleKeyOf(product.lifecycleStage)]
    for (const marketId of markets) {
      const awareness = current[marketId] ?? 0
      const delta = awarenessDeltaCents({
        budgetShareCents: shares.get(marketId) ?? 0,
        stageScaleCents: scale,
        channel: campaign.channel,
        awareness,
        cap: deps.tuning.awarenessCap,
      })
      current[marketId] = awareness + delta
    }
    awarenessByProduct.set(product.id, current)
    events.push(
      createMarketingSpendPostedEvent(`marketing-spend:${campaign.id}:${day}`, {
        day,
        campaignId: campaign.id,
        productId: product.id,
        channel: campaign.channel,
        amountCents: campaign.dailyBudgetCents,
      }),
    )
  }

  // 当日没有任何渠道成功扣款的产品：认知度衰减一次（不按渠道重复扣）
  const productsNeedingDecay = new Set(
    world.marketingCampaigns
      .filter((c) => c.status === 'active')
      .map((c) => c.productId)
      .filter((productId) => productsById.get(productId) !== undefined && !spentByProduct.has(productId)),
  )
  for (const productId of productsNeedingDecay) {
    const product = productsById.get(productId)
    if (product === undefined) continue
    const current: Record<string, number> = {}
    for (const [marketId, value] of Object.entries(product.awarenessByMarket)) {
      current[marketId] = applyAwarenessDecay(value)
    }
    awarenessByProduct.set(productId, current)
  }

  const updatedProducts = world.products.map((product) => {
    const nextAwareness = awarenessByProduct.get(product.id)
    return nextAwareness === undefined ? product : { ...product, awarenessByMarket: nextAwareness }
  })

  const updatedProjects =
    projectsUpdated.size === 0
      ? world.projects
      : world.projects.map((p) => projectsUpdated.get(p.id) ?? p)
  return {
    world: { ...world, products: updatedProducts, projects: updatedProjects, events },
    spentCents,
    failedChannels,
  }
}

/** 面向调度器/GameWorld 的薄封装（可注入），逻辑全部在纯函数里。 */
export class MarketingService {
  constructor(private readonly deps: MarketingDeps) {}

  setBudget(world: WorldState, cmd: SetMarketingBudgetCmd, day: number): MarketingCommandResult {
    return setMarketingBudget(world, cmd, day)
  }

  setPrelaunchBudget(
    world: WorldState,
    cmd: SetPrelaunchMarketingCmd,
    day: number,
  ): MarketingCommandResult {
    return setPrelaunchMarketingBudget(world, cmd, day)
  }

  endPrelaunch(world: WorldState, projectId: string, day: number): WorldState {
    return endPrelaunchCampaigns(world, projectId, day)
  }

  tick(world: WorldState, day: number): MarketingTickResult {
    return tickMarketing(world, day, this.deps)
  }
}
