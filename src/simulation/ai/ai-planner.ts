/**
 * AI 月度决策（DECISION-M3-P0-AI-003 §4–§6；DECISION-M3-C1-001 v1.3 §10）。
 *
 * 纯函数：输入公开视图与画像，输出候选、评分、选择与理由。
 * 不读玩家私有字段（预算、薪资、在研项目内部），不调用任何销售/质量/现金加成。
 */
import { TUNING } from '@content/tuning'
import genres from '@content/genres.json'
import { availablePlatforms, availableSegments } from '@content/queries'
import {
  genreSegmentAffinity,
  platformInstallBaseUnits,
  referencePriceCents,
} from '@content/c1-content'
import type { CompanyPersona, ProjectPhase } from '@domain/enums'
import type { MarketingChannel } from '@domain/value-objects/marketing-response'
import {
  MARKETING_BUDGET_MAX_CENTS,
  MARKETING_BUDGET_MIN_CENTS,
} from '@domain/value-objects/marketing-response'

export type AiAction =
  | 'START_PROJECT'
  | 'ADVANCE_PHASE'
  | 'LAUNCH'
  | 'SET_PRICE'
  | 'SET_MARKETING'
  | 'FUND_PROJECT'
  | 'CANCEL_PROJECT'
  | 'CUT_STAFF'
  | 'RESTRUCTURE'
  | 'SELL_ASSET'
  | 'CLEARANCE_PRICING'
  | 'DO_NOTHING'

export type AiActionParams =
  | { action: 'START_PROJECT'; genreId: string; platformIds: string[]; segmentIds: string[] }
  | { action: 'ADVANCE_PHASE'; projectId: string }
  | { action: 'LAUNCH'; projectId: string; priceCents: number; platformIds: string[] }
  | { action: 'SET_PRICE'; productId: string; priceCents: number; discountRatePercent: number }
  | { action: 'SET_MARKETING'; productId: string; channel: MarketingChannel; dailyBudgetCents: number }
  | { action: 'FUND_PROJECT'; projectId: string; amountCents: number }
  | { action: 'CANCEL_PROJECT'; projectId: string; reason: string }
  | { action: 'CUT_STAFF'; percent: number; reason: string }
  | { action: 'RESTRUCTURE'; cutStaffPercent: number; cancelProjectIds: string[] }
  | { action: 'SELL_ASSET'; assetId: string; minPriceCents: number }
  | { action: 'CLEARANCE_PRICING'; productIds: string[]; discountRatePercent: number }
  | { action: 'DO_NOTHING'; reason: string }

export interface AiCompanyView {
  id: string
  persona: CompanyPersona
  status: 'active' | 'bankrupt' | 'dissolved'
  cashCents: number
  monthlyFixedExpenseCents: number
  brand: number
  /** 公司在研项目（至多一个参与决策） */
  project: {
    id: string
    phase: ProjectPhase
    isPaused: boolean
    plannedLaunchDay: number
    budgetRemainingCents?: number
    monthlyBurnCents?: number
    launchMarketingReservedCents?: number
    genreId?: string
    platformIds?: string[]
    segmentIds?: string[]
  } | null
  /** 公司已上市产品（公开信息） */
  products: Array<{
    id: string
    priceCents: number | null
    status: 'active' | 'retired'
    launchDay: number
    genreId?: string
    qualityScore?: number
    supportedPlatformIds?: string[]
    audienceSegmentIds?: string[]
    activeCampaignCount?: number
  }>
  staffCount?: number
}

export interface AiCandidateRecord {
  action: AiAction
  pass: boolean
  failedConstraints: string[]
  probability: number
  expectedRevenueCents: number
  costCents: number
  opportunityCostCents: number
  risk: number
  score: number
  reason: string
}

export interface AiDecisionRecordInput {
  companyId: string
  day: number
  month: string
  candidates: AiCandidateRecord[]
  chosen: AiAction
  reason: string
  /** 公开输入摘要（不哈希隐藏参数） */
  inputsDigest: string
}

export interface AiPlan extends AiDecisionRecordInput {
  /** 执行参数；判别联合，编译期必填 */
  params: AiActionParams
}

const RESERVE_MONTHS = 6

function monthKey(day: number): string {
  // 仅用于记录分组，不参与计算
  return `d${Math.floor(day / 30)}`
}

function inputsDigest(view: AiCompanyView): string {
  return [
    view.id,
    view.persona,
    view.status,
    view.cashCents,
    view.brand,
    view.project?.phase ?? 'none',
    view.products.length,
  ].join('|')
}

/** 稳定 0–1 哈希：seed 只进评分与内容选择，不进现金/需求量。 */
function hash01(seed: number, companyId: string, day: number, purpose: string): number {
  let h = 2166136261
  const text = `${seed}|${companyId}|${day}|${purpose}`
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h >>> 0) / 4294967295
}

/** 预期净收入：用公开信息估算（品牌、预算档位、产品数），不读隐藏参数 */
export function estimateRevenueCents(view: AiCompanyView, budgetCents: number): number {
  const factor = Math.max(0.5, Math.min(3, budgetCents / 1_000_000))
  const units = Math.round((2_000 + view.brand * 25) * factor)
  return units * 2_999
}

function candidate(
  action: AiAction,
  failed: string[],
  view: AiCompanyView,
  budgetCents: number,
  riskAversion: number,
  opts: { reason?: string; seedJitter?: number; expectedRevenueCents?: number; costCents?: number } = {},
): AiCandidateRecord {
  const persona = TUNING.ai.persona[view.persona]
  const expectedRevenueCents =
    opts.expectedRevenueCents ??
    (action === 'START_PROJECT' ? estimateRevenueCents(view, budgetCents) : 0)
  const costCents = opts.costCents ?? (action === 'START_PROJECT' ? budgetCents : 0)
  const opportunityCostCents =
    action === 'START_PROJECT'
      ? Math.round(persona.teamSize * TUNING.employee.defaultStartingSalaryCents * 3)
      : 0
  const probability = action === 'START_PROJECT' ? Math.min(0.85, 0.35 + view.brand / 200) : 1
  const risk = action === 'START_PROJECT' ? 0.45 : 0.05
  const ev = expectedRevenueCents * probability - costCents - opportunityCostCents
  const jitter = opts.seedJitter ?? 1
  const score = ev * (1 - riskAversion * risk) * jitter
  return {
    action,
    pass: failed.length === 0,
    failedConstraints: failed,
    probability,
    expectedRevenueCents,
    costCents,
    opportunityCostCents,
    risk,
    score,
    reason: opts.reason ?? '',
  }
}

interface ProjectContent {
  genreId: string
  platformIds: string[]
  segmentIds: string[]
}

/** 按当年平台装机、增速、类型/受众匹配、抽成与 seed 选择立项内容。 */
export function chooseProjectContent(params: {
  companyId: string
  day: number
  seed: number
}): ProjectContent {
  const platforms = availablePlatforms(params.day).filter(
    (platform) => platformInstallBaseUnits(platform.id, params.day) > 0,
  )
  const segments = availableSegments(params.day)
  if (platforms.length === 0 || segments.length === 0) {
    const fallbackGenre = genres[0]!.id
    return { genreId: fallbackGenre, platformIds: [], segmentIds: [] }
  }

  const genrePick = Math.floor(
    hash01(params.seed, params.companyId, params.day, 'genre') * genres.length,
  )
  const genre = genres[Math.min(genres.length - 1, genrePick)]!
  const segmentRank = segments
    .map((segment) => ({
      id: segment.id,
      affinity: genreSegmentAffinity(genre.id, segment.id),
    }))
    .sort((a, b) => b.affinity - a.affinity || a.id.localeCompare(b.id))
  const segmentPick = Math.floor(
    hash01(params.seed, params.companyId, params.day, 'segment') * Math.min(2, segmentRank.length),
  )
  const chosenSegment = segmentRank[Math.min(segmentRank.length - 1, segmentPick)]!

  const installMax = Math.max(
    ...platforms.map((platform) => platformInstallBaseUnits(platform.id, params.day)),
  )
  const growthWindow = Math.max(0, params.day - 365)
  const scores = platforms.map((platform) => {
    const install = platformInstallBaseUnits(platform.id, params.day)
    const previous = platformInstallBaseUnits(platform.id, growthWindow)
    const growth = installMax > 0 ? Math.max(-0.5, Math.min(0.5, (install - previous) / installMax)) : 0
    const genreFit = genreSegmentAffinity(genre.id, chosenSegment.id)
    const segmentFit = genreSegmentAffinity(genre.id, chosenSegment.id)
    const feeScore = 1 - Math.max(0, Math.min(1, platform.platformFee))
    const score =
      0.30 * (installMax > 0 ? install / installMax : 0) +
      0.15 * (growth + 0.5) +
      0.20 * genreFit +
      0.15 * segmentFit +
      0.10 * feeScore
    return { platformId: platform.id, score }
  })
  scores.sort((a, b) => b.score - a.score || a.platformId.localeCompare(b.platformId))
  const count = 1 + Math.floor(hash01(params.seed, params.companyId, params.day, 'platformCount') * 2)
  const platformIds = scores.slice(0, Math.max(1, Math.min(count, scores.length))).map((s) => s.platformId)
  return { genreId: genre.id, platformIds, segmentIds: [chosenSegment.id] }
}

/** 上市建议价：参考价 × (0.75 + 0.5×质量)，clamp 0.5–1.5 倍，seed ±5%。 */
export function suggestedPriceCents(params: {
  genreId: string
  platformId: string
  segmentId: string
  qualityScore: number
  companyId: string
  day: number
  seed: number
}): number {
  const reference = referencePriceCents(params.genreId, params.platformId, params.segmentId)
  const factor = Math.max(0.5, Math.min(1.5, 0.75 + 0.5 * (params.qualityScore / 100)))
  const jitter = 0.95 + hash01(params.seed, params.companyId, params.day, 'price') * 0.1
  return Math.max(1, Math.round(reference * factor * jitter))
}

function marketingBudgetCents(view: AiCompanyView): number {
  const persona = TUNING.ai.persona[view.persona]
  const raw = Math.round((view.monthlyFixedExpenseCents * persona.marketingRatio) / 30)
  return Math.max(MARKETING_BUDGET_MIN_CENTS, Math.min(MARKETING_BUDGET_MAX_CENTS, raw))
}

function chooseChannel(seed: number, companyId: string, day: number, productId: string): MarketingChannel {
  const value = hash01(seed, companyId, day, `channel:${productId}`)
  if (value < 0.45) return 'social'
  if (value < 0.75) return 'expo'
  return 'ads'
}

/**
 * 单公司单月决策（确定性）：
 *   - bankrupt → DO_NOTHING（重整动作由 T8 Phase B 接管）
 *   - 无项目且 runway ≥6 个月 → START_PROJECT（内容随 seed）
 *   - 项目 READY_TO_LAUNCH 且到计划日 → LAUNCH（必带价格）
 *   - 产品无价 → SET_PRICE
 *   - 产品已上市且无投放 → SET_MARKETING
 *   - 其余 → ADVANCE_PHASE / DO_NOTHING
 */
export function planAiMonth(view: AiCompanyView, day: number, seed = 0): AiPlan {
  const persona = TUNING.ai.persona[view.persona]
  const reserve = view.monthlyFixedExpenseCents * RESERVE_MONTHS
  const budget = Math.round(Math.min(view.cashCents * persona.budgetRatioCap, 5_000_000))
  const candidates: AiCandidateRecord[] = []

  if (view.status !== 'active') {
    candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion, { reason: '非经营状态' }))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'DO_NOTHING',
      reason: view.status === 'bankrupt' ? '公司破产，暂停扩张' : '公司已退出市场',
      inputsDigest: inputsDigest(view),
      params: { action: 'DO_NOTHING', reason: view.status === 'bankrupt' ? 'bankrupt' : 'dissolved' },
    }
  }

  const unpriced = view.products.find((p) => p.status === 'active' && p.priceCents === null)
  if (unpriced !== undefined) {
    const price = suggestedPriceCents({
      genreId: unpriced.genreId ?? 'action',
      platformId: unpriced.supportedPlatformIds?.[0] ?? 'arcade_classic',
      segmentId: unpriced.audienceSegmentIds?.[0] ?? 'arcade_enthusiasts',
      qualityScore: unpriced.qualityScore ?? 50,
      companyId: view.id,
      day,
      seed,
    })
    candidates.push(candidate('SET_PRICE', [], view, 0, persona.riskAversion, { reason: '产品未定价' }))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'SET_PRICE',
      reason: '产品已上市但未定价，按参考价定价',
      inputsDigest: inputsDigest(view),
      params: { action: 'SET_PRICE', productId: unpriced.id, priceCents: price, discountRatePercent: 0 },
    }
  }

  const project = view.project
  if (project === null) {
    const failed: string[] = []
    if (view.cashCents < reserve) failed.push('CASH_RESERVE')
    if (view.cashCents < budget || budget <= 0) failed.push('BUDGET')
    const jitter = 0.9 + hash01(seed, view.id, day, 'startScore') * 0.2
    const c = candidate('START_PROJECT', failed, view, budget, persona.riskAversion, {
      seedJitter: jitter,
      reason: '无在研项目',
    })
    candidates.push(c)
    if (c.pass && c.score >= TUNING.ai.minActionScore) {
      const content = chooseProjectContent({ companyId: view.id, day, seed })
      return {
        companyId: view.id,
        day,
        month: monthKey(day),
        candidates,
        chosen: 'START_PROJECT',
        reason: `无在研项目且 runway ≥${RESERVE_MONTHS} 个月，选择立项`,
        inputsDigest: inputsDigest(view),
        params: {
          action: 'START_PROJECT',
          genreId: content.genreId,
          platformIds: content.platformIds,
          segmentIds: content.segmentIds,
        },
      }
    }
    candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion, { reason: '立项不成立' }))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'DO_NOTHING',
      reason: failed.length > 0 ? `硬约束未通过：${failed.join(',')}` : '立项评分低于阈值',
      inputsDigest: inputsDigest(view),
      params: { action: 'DO_NOTHING', reason: failed.join(',') || 'score' },
    }
  }

  if (project.phase === 'READY_TO_LAUNCH') {
    if (day < project.plannedLaunchDay) {
      candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion, { reason: '未到计划上市日' }))
      return {
        companyId: view.id,
        day,
        month: monthKey(day),
        candidates,
        chosen: 'DO_NOTHING',
        reason: `项目已完成 QA，等待计划上市日 ${project.plannedLaunchDay}`,
        inputsDigest: inputsDigest(view),
        params: { action: 'DO_NOTHING', reason: 'waiting-launch-day' },
      }
    }
    const content = {
      genreId: project.genreId ?? 'action',
      platformIds: project.platformIds ?? [],
      segmentIds: project.segmentIds ?? [],
    }
    const platformId = content.platformIds[0] ?? 'arcade_classic'
    const segmentId = content.segmentIds[0] ?? 'arcade_enthusiasts'
    const price = suggestedPriceCents({
      genreId: content.genreId,
      platformId,
      segmentId,
      qualityScore: 50,
      companyId: view.id,
      day,
      seed,
    })
    candidates.push(candidate('LAUNCH', [], view, 0, persona.riskAversion, { reason: '完成 QA 且到期' }))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'LAUNCH',
      reason: '项目完成 QA，进入上市',
      inputsDigest: inputsDigest(view),
      params: {
        action: 'LAUNCH',
        projectId: project.id,
        priceCents: price,
        platformIds: content.platformIds,
      },
    }
  }

  if (project.phase === 'CONCEPT' || project.phase === 'PRE_PRODUCTION') {
    candidates.push(candidate('ADVANCE_PHASE', [], view, 0, persona.riskAversion, { reason: '早期阶段' }))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'ADVANCE_PHASE',
      reason: `项目处于 ${project.phase}，推进阶段`,
      inputsDigest: inputsDigest(view),
      params: { action: 'ADVANCE_PHASE', projectId: project.id },
    }
  }

  const investable = view.products.find(
    (p) => p.status === 'active' && p.priceCents !== null && (p.activeCampaignCount ?? 0) === 0,
  )
  if (investable !== undefined && view.cashCents >= view.monthlyFixedExpenseCents * 6) {
    const channel = chooseChannel(seed, view.id, day, `${investable.launchDay}:${investable.genreId ?? ''}`)
    const dailyBudgetCents = marketingBudgetCents(view)
    candidates.push(
      candidate('SET_MARKETING', [], view, 0, persona.riskAversion, { reason: '产品已上市且无投放' }),
    )
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'SET_MARKETING',
      reason: '产品已上市且无投放，按画像开营销',
      inputsDigest: inputsDigest(view),
      params: { action: 'SET_MARKETING', productId: investable.id, channel, dailyBudgetCents },
    }
  }

  candidates.push(candidate('ADVANCE_PHASE', [], view, 0, persona.riskAversion, { reason: '推进在研项目' }))
  return {
    companyId: view.id,
    day,
    month: monthKey(day),
    candidates,
    chosen: 'ADVANCE_PHASE',
    reason: '推进在研项目',
    inputsDigest: inputsDigest(view),
    params: { action: 'ADVANCE_PHASE', projectId: project.id },
  }
}
