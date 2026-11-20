/**
 * AI 月度决策（DECISION-M3-P0-AI-003 §4–§6）。
 *
 * 纯函数：输入公开视图与画像，输出候选、评分、选择与理由。
 * 不读玩家私有字段（预算、薪资、在研项目内部），不调用任何销售/质量/现金加成。
 */
import { TUNING } from '@content/tuning'
import type { CompanyPersona, ProjectPhase } from '@domain/enums'

export type AiAction =
  | 'START_PROJECT'
  | 'ADVANCE_PHASE'
  | 'LAUNCH'
  | 'SET_PRICE'
  | 'DO_NOTHING'

export interface AiCompanyView {
  id: string
  persona: CompanyPersona
  status: 'active' | 'bankrupt' | 'dissolved'
  cashCents: number
  monthlyFixedExpenseCents: number
  brand: number
  /** 公司在研项目（至多一个参与决策） */
  project: { id: string; phase: ProjectPhase; isPaused: boolean; plannedLaunchDay: number } | null
  /** 公司已上市产品（公开信息） */
  products: Array<{ id: string; priceCents: number | null; status: 'active' | 'retired'; launchDay: number }>
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
  /** 执行参数（由运行时落成实际命令） */
  params: {
    projectId?: string
    productId?: string
    priceCents?: number
  }
}

const RESERVE_MONTHS = 3

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
): AiCandidateRecord {
  const persona = TUNING.ai.persona[view.persona]
  const expectedRevenueCents = action === 'START_PROJECT' ? estimateRevenueCents(view, budgetCents) : 0
  const costCents = action === 'START_PROJECT' ? budgetCents : 0
  const opportunityCostCents =
    action === 'START_PROJECT' ? Math.round(persona.teamSize * TUNING.employee.defaultStartingSalaryCents * 3) : 0
  const probability = action === 'START_PROJECT' ? Math.min(0.85, 0.35 + view.brand / 200) : 1
  const risk = action === 'START_PROJECT' ? 0.45 : 0.05
  const ev = expectedRevenueCents * probability - costCents - opportunityCostCents
  const score = ev * (1 - riskAversion * risk)
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
  }
}

/**
 * 单公司单月决策（确定性）：
 *   - bankrupt → 只允许 DO_NOTHING（本批不做裁员自救）
 *   - 无项目且储备充足 → START_PROJECT
 *   - 项目在 CONCEPT/PRE_PRODUCTION → ADVANCE_PHASE
 *   - READY_TO_LAUNCH → LAUNCH
 *   - 产品未定价 → SET_PRICE
 */
export function planAiMonth(view: AiCompanyView, day: number): AiPlan {
  const persona = TUNING.ai.persona[view.persona]
  const reserve = view.monthlyFixedExpenseCents * RESERVE_MONTHS
  const budget = Math.round(Math.min(view.cashCents * persona.budgetRatioCap, 5_000_000))
  const candidates: AiCandidateRecord[] = []

  if (view.status !== 'active') {
    candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'DO_NOTHING',
      reason: view.status === 'bankrupt' ? '公司破产，暂停扩张' : '公司已退出市场',
      inputsDigest: inputsDigest(view),
      params: {},
    }
  }

  if (view.project === null) {
    const failed: string[] = []
    if (view.cashCents < reserve) failed.push('CASH_RESERVE')
    if (view.cashCents < budget || budget <= 0) failed.push('BUDGET')
    const c = candidate('START_PROJECT', failed, view, budget, persona.riskAversion)
    candidates.push(c)
    if (c.pass && c.score >= TUNING.ai.minActionScore) {
      return {
        companyId: view.id,
        day,
        month: monthKey(day),
        candidates,
        chosen: 'START_PROJECT',
        reason: '无在研项目且现金储备充足，选择立项',
        inputsDigest: inputsDigest(view),
        params: {},
      }
    }
    candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'DO_NOTHING',
      reason: failed.length > 0 ? `硬约束未通过：${failed.join(',')}` : '立项评分低于阈值',
      inputsDigest: inputsDigest(view),
      params: {},
    }
  }

  const { project } = view
  if (project.phase === 'CONCEPT' || project.phase === 'PRE_PRODUCTION') {
    candidates.push(candidate('ADVANCE_PHASE', [], view, 0, persona.riskAversion))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'ADVANCE_PHASE',
      reason: `项目处于 ${project.phase}，推进阶段`,
      inputsDigest: inputsDigest(view),
      params: { projectId: project.id },
    }
  }

  if (project.phase === 'READY_TO_LAUNCH') {
    // 计划上市日未到：上市指令会被领域层 PRJ_LAUNCH_TOO_EARLY 拒绝，故先等待
    if (day < project.plannedLaunchDay) {
      candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion))
      return {
        companyId: view.id,
        day,
        month: monthKey(day),
        candidates,
        chosen: 'DO_NOTHING',
        reason: `项目已完成 QA，等待计划上市日 ${project.plannedLaunchDay}`,
        inputsDigest: inputsDigest(view),
        params: {},
      }
    }
    candidates.push(candidate('LAUNCH', [], view, 0, persona.riskAversion))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'LAUNCH',
      reason: '项目完成 QA，进入上市',
      inputsDigest: inputsDigest(view),
      params: { projectId: project.id },
    }
  }

  const unpriced = view.products.find((p) => p.status === 'active' && p.priceCents === null)
  if (unpriced !== undefined) {
    candidates.push(candidate('SET_PRICE', [], view, 0, persona.riskAversion))
    return {
      companyId: view.id,
      day,
      month: monthKey(day),
      candidates,
      chosen: 'SET_PRICE',
      reason: '产品已上市但未定价，按参考价定价',
      inputsDigest: inputsDigest(view),
      params: { productId: unpriced.id, priceCents: 2_999 },
    }
  }

  candidates.push(candidate('DO_NOTHING', [], view, 0, persona.riskAversion))
  return {
    companyId: view.id,
    day,
    month: monthKey(day),
    candidates,
    chosen: 'DO_NOTHING',
    reason: '无满足条件的候选动作',
    inputsDigest: inputsDigest(view),
    params: {},
  }
}
