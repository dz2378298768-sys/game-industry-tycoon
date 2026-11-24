import { create } from 'zustand'
import type { GameWorld } from '@application/mediators/game-world'
import { createGameWorld } from '@application/factories/create-game-world'
import { saveGame, loadGame, hasSave, clearSave } from '@infrastructure/storage/save-service'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RefundBatch } from '@domain/entities/refund-batch'
import type { MarketingCampaign } from '@domain/entities/marketing-campaign'
import type { PublishingContract } from '@domain/entities/publishing-contract'
import type { Transaction } from '@domain/entities/transaction'
import type { CalendarSpeed, EmployeeRole, ProjectRole } from '@domain/enums'
import type { ReworkCategory } from '@domain/entities/project-execution'
import { BUDGET_TOP_UP_EVENT, recomputeRemaining } from '@domain/value-objects'
import { EntityNotFoundError } from '@domain/errors'
import { t, formatMoney, formatDay, setLocale as setI18nLocale, getLocale as getI18nLocale } from '@i18n'

interface Message { id: string; text: string; type: 'info' | 'error' | 'success' }

interface ActionResult { success: boolean; message?: string | undefined }
interface BudgetActionResult extends ActionResult { errorCode?: string | undefined; idempotent?: boolean | undefined }

/** REC-02 / ADJ-26 A6：交付页选择的三档方案，UI 态暂存，上市成功后经内核命令写入 Product。 */
interface DeliveryLaunchPlan { priceCents: number; dailyBudgetCents: number }

/** 领域错误码 → i18n 文案键超集（DESIGN-UI-LAYER §3.2 / §9.1，按领域实际字符串逐字匹配） */
export const ERROR_I18N: Record<string, string> = {
  NO_COMPANY: 'error.noCompany',
  FIN_COMPANY_BANKRUPT: 'error.finCompanyBankrupt',
  PRJ_COMPANY_INACTIVE: 'error.prjCompanyInactive',
  EMP_CAPACITY_FULL: 'error.capacityFull',
  FIN_DISTRESS: 'error.financialDistress',
  EMP_INVALID_SALARY: 'error.invalidSalary',
  EMP_INVALID_SKILL: 'error.invalidSkill',
  FIN_INSUFFICIENT_CASH: 'error.insufficientCash',
  EMP_NOT_FOUND: 'error.employeeNotFound',
  EMP_ALREADY_TERMINATED: 'error.employeeAlreadyTerminated',
  PRJ_PLATFORM_UNAVAILABLE: 'error.platformUnavailable',
  PRJ_SEGMENT_UNAVAILABLE: 'error.segmentUnavailable',
  PRJ_TERMINAL: 'error.projectTerminal',
  PRJ_NOT_FOUND: 'error.projectNotFound',
  PRJ_WRONG_PHASE: 'error.prjWrongPhase',
  BGT_INVALID_AMOUNT: 'error.bgtInvalidAmount',
  PRJ_LAUNCH_TOO_EARLY: 'error.cannotLaunchEarly',
  PRJ_MAX_DESCIPE_REACHED: 'error.prjMaxDescopeReached',
  PRJ_SCOPE_TERMINAL: 'error.prjScopeTerminal',
  PRJ_INVALID_CUT_RATIO: 'error.prjInvalidCutRatio',
  PRJ_INVALID_DELAY_DAYS: 'error.prjInvalidDelayDays',
  PRJ_LAUNCH_DELAY_TERMINAL: 'error.prjLaunchDelayTerminal',
  PRJ_LAUNCH_DELAY_EXCEEDS_MAX: 'error.prjLaunchDelayExceedsMax',
  PRJ_NOT_READY: 'error.prjNotReady',
  PRJ_PAUSED: 'error.prjPaused',
  PRJ_QA_INCOMPLETE: 'error.prjQaIncomplete',
  PRJ_PRODUCT_EXISTS: 'error.prjProductExists',
  PRJ_INVALID_TRANSITION: 'error.prjInvalidTransition',
  // M2-C/D/F：定价 / 营销 / 合同（DESIGN-M2-001-G P1-3，共 14 码）
  PRICE_COOLDOWN: 'error.priceCooldown',
  PRICE_RANGE: 'error.priceRange',
  PRICE_DISCOUNT_RANGE: 'error.priceDiscountRange',
  PRICE_LIFECYCLE_LOCKED: 'error.priceLifecycleLocked',
  LIFECYCLE_NOT_ELAPSED: 'error.lifecycleNotElapsed',
  PRD_NOT_FOUND: 'error.prdNotFound',
  MARKETING_PRODUCT_NOT_FOUND: 'error.marketingProductNotFound',
  MARKETING_PRODUCT_NOT_ACTIVE: 'error.marketingProductNotActive',
  MARKETING_BUDGET_OUT_OF_RANGE: 'error.marketingBudgetOutOfRange',
  CONTRACT_PRODUCT_NOT_LAUNCHED: 'error.contractProductNotLaunched',
  CONTRACT_RATE_OUT_OF_RANGE: 'error.contractRateOutOfRange',
  CONTRACT_THRESHOLD_OUT_OF_RANGE: 'error.contractThresholdOutOfRange',
  CONTRACT_ALREADY_ACTIVE: 'error.contractAlreadyActive',
  CONTRACT_NOT_FOUND: 'error.contractNotFound',
  // CODE-07A P1 增量：P1 错误码逐字映射（DESIGN-UI-LAYER §9.1）
  E_EMPTY: 'error.emptyContent',
  E_EMPTY_CONTENT: 'error.emptyContent',
  E_USP: 'error.uspMissing',
  PROJ_BUDGET_CAPACITY_EXCEEDS_CASH: 'error.projBudgetExceedsCash',
  PROJ_DEPENDENCY_CYCLE: 'error.projDependencyCycle',
  PROJ_TEAM_REQUIRED: 'error.projTeamRequired',
  PROJ_SNAPSHOT_SWITCH_BLOCKED: 'error.projSnapshotSwitchBlocked',
  PROJ_REWORK_SESSION_MISSING: 'error.projReworkSessionMissing',
  PROJ_REWORK_NOT_ACTIVE: 'error.projReworkNotActive',
  REWORK_CHANGE_UNMATCHED: 'error.reworkChangeUnmatched',
  PROJ_REWORK_SCOPE_UNKNOWN: 'error.projReworkScopeUnknown',
  PROJ_REWORK_LIMIT: 'error.projReworkLimit',
  BUDGET_OVERRUN: 'error.crisis.budgetOverrun',
  LOW_RUNWAY: 'error.crisis.lowRunway',
  LOW_CASH: 'error.crisis.lowCash',
  COMMITTED_EXCEEDS_CASH: 'error.crisis.committedExceedsCash',
  NEGATIVE_CASH: 'error.crisis.negCash',
  PAYABLE_OVERDUE: 'error.crisis.payableOverdue',
  REWORK_SUNK: 'error.crisis.reworkSunk',
}

/** 错误码优先映射 i18n；无错误码时回退领域文案，再回退通用文案 */
function localizeError(errorCode: string | undefined, message: string | undefined, fallback = 'error.unknown'): string {
  const key = errorCode ? ERROR_I18N[errorCode] : undefined
  if (key) return t(key)
  return message ?? t(fallback)
}

interface GameStore {
  game: GameWorld | null
  company: Company | null
  employees: Employee[]
  projects: Project[]
  products: Product[]
  refundBatches: RefundBatch[]
  marketingCampaigns: MarketingCampaign[]
  publishingContracts: PublishingContract[]
  transactions: Transaction[]
  /** CODE-07A：公司级财务派生视图（game-world.getFinancialOverview 只读投影，随 refresh 刷新） */
  financial: import('@application/mediators/game-world').GameFinancialOverview | null
  dayIndex: number
  speed: CalendarSpeed
  messages: Message[]
  locale: 'en' | 'zh-CN'
  init(seed?: number): void
  createCompany(name: string, cityId: string): void
  hireEmployee(name: string, role: EmployeeRole, skillLevel: number, salaryMonthlyCents: number): { error?: string }
  fireEmployee(employeeId: string): ActionResult
  createProject(params: {
    name: string
    genreId: string
    budgetTotalCapCents: number
    plannedLaunchDay: number
    audienceSegmentIds?: string[]
    targetPlatformIds?: string[]
  }): { error?: string }
  advanceProjectPhase(projectId: string): ActionResult
  launchProject(projectId: string): ActionResult
  toggleProjectPause(projectId: string): ActionResult
  topUpBudget(projectId: string, amountCents: number, reason: string): BudgetActionResult
  resumeProject(projectId: string): ActionResult
  cancelProject(projectId: string): ActionResult
  descopeProject(projectId: string, cutRatio: number): BudgetActionResult
  delayLaunch(projectId: string, extraDays: number): BudgetActionResult
  assignEmployeeToProject(employeeId: string, projectId: string, allocationRatio: number, roleOnProject: ProjectRole): ActionResult
  unassignEmployeeFromProject(employeeId: string, projectId: string): ActionResult
  setProductPrice(productId: string, priceCents: number): BudgetActionResult
  applyProductDiscount(productId: string, ratePercent: number): BudgetActionResult
  retireProduct(productId: string): BudgetActionResult
  setMarketingBudget(productId: string, channel: 'social' | 'expo' | 'ads', dailyBudgetCents: number): BudgetActionResult
  signRevenueShare(productId: string, ratePercent: number, durationDays: number | null): BudgetActionResult
  signMilestone(productId: string, thresholdNetRevenueCents: number, payoutCents: number, durationDays: number | null): BudgetActionResult
  estimateContract(cmd: {
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
  }): import('@simulation/services/contract-estimate').ContractEstimate | null
  signContractTemplate(cmd: {
    productId: string
    template: 'channel' | 'co_marketing' | 'advance'
    ratePercent: number
    durationDays: number | null
    partnerId: string
    prepaymentCents?: number
    marketingCommitmentCents?: number
    qualityThreshold?: number
    deliveryDay?: number
  }): BudgetActionResult
  advanceDays(days: number): void
  setSpeed(speed: CalendarSpeed): void
  refresh(): void
  toast(text: string, type?: 'info' | 'error' | 'success'): void
  setLocale(loc: 'en' | 'zh-CN'): void
  save(): Promise<void>
  load(): Promise<boolean>
  getHasSave(): Promise<boolean>
  isFinanciallyDistressed(): boolean
  /** CODE-07A：清档重开（GAME OVER 横幅入口）：删存档 + 新 GameWorld + 全切片清空 */
  restartNewGame(): Promise<void>
  /** P-05：D-03 候选池只读视图（懒引导补足） */
  listCandidates(): import('@domain/entities/personnel').Candidate[]
  /** P-05：候选池招聘转发（中介费 + 月薪承诺由内核创建） */
  recruitFromCandidate(candidateId: string): { success: boolean; errorCode?: string | undefined; message?: string | undefined }
  /** P-05：招聘影响预览（可用现金/跑道 前→后，同源领域公式） */
  previewRecruitImpact(candidateId: string): import('@application/mediators/game-world').RecruitImpactPreview | null
  /** P-05：月薪承诺合计（KPI） */
  monthlySalaryCommitmentCents(): number
  /** P-04：立项预览（内核同源派生 Budget_cap/Cost_est/ratio/verdict/WP） */
  previewExecutionProject(params: { hrb: number; budgetCapacityCents: number }): { success: boolean; errorCode?: string | undefined; message?: string | undefined } & { preview?: import('@application/mediators/game-world').ExecutionProjectPreview }
  /** P-04：立项确认（PROJ_BUDGET_CAPACITY_EXCEEDS_CASH 校验 + project_budget 承诺，原子） */
  createExecutionProject(params: { name: string; genreId: string; hrb: number; budgetCapacityCents: number }): { success: boolean; errorCode?: string | undefined; message?: string | undefined }
  /** P-06：研发推进摘要（WP/Cap_d 瓶颈/Cost_est ratio verdict，内核同源） */
  getExecutionSummary(projectId: string): import('@application/mediators/game-world').ExecutionSummary | null
  /** P-11：现金流预测只读投影（FIN §6.1/§6.3 → netCashByMonth）。 */
  getCashForecast(): import('@domain/entities/finance').CashForecast | null
  /** P-09：ExecutionProject 交付状态只读投影（ADJ-08 §1.3 失败原因审计）。内核未登记 → 全空。 */
  getDeliveryStatus(projectId: string): {
    state: string | null
    deliveryFailures: number
    /** 07B-09：返工次数（ExecutionProject.reworkCount，真实字段）。 */
    reworkCount: number
    lastDeliveryFailure: {
      day: number
      reasonCodes: string[]
      eViolations: ReadonlyArray<{ code: string; severity: string }>
    } | null
  }
  /** P-02：市场调研（账本 research 交易 + 一次性结果卡数据） */
  conductMarketResearch(): import('@application/mediators/game-world').CommandOutcome<import('@application/mediators/game-world').MarketResearchResult>
  /** CODE-07B REVISION / U4：返工预估只读投影（确认前展示，domain 纯函数同源，不造数） */
  getReworkEstimate(projectId: string, category: ReworkCategory, deltaPercent: number): import('@application/mediators/game-world').ReworkEstimate | null
  /** CODE-07B REVISION / U4「确认后才执行」：planRework + beginRework 创建真实 ReworkSession */
  confirmRework(projectId: string, category: ReworkCategory, deltaPercent: number): { success: boolean; errorCode?: string | undefined; message?: string | undefined; result?: { sessionId: string; reworkWorkUnits: number } | undefined }
  /** CODE-07B REVISION / 端到端：交付提交内核入口（submitDelivery，fail-closed） */
  submitDeliveryForProject(projectId: string, gate: { pass: boolean; violations: ReadonlyArray<{ code: string; severity: string }> }, deliveryForm?: 'full' | 'early_access'): { success: boolean; errorCode?: string | undefined; message?: string | undefined; result?: { completed: boolean; buildId: string | null } | undefined }
  /** 07B REVISION2：交付闸门评估只读投影（fail-closed，供 P-09 确认按钮接线） */
  getDeliveryGateEvaluation(projectId: string, form?: 'full' | 'early_access', disclosureProvided?: boolean): import('@application/mediators/game-world').DeliveryGateEvaluation | null
  /** REC-02：交付页档位方案（UI 态暂存；真正写入 Product 由 launchProject 经内核命令完成） */
  deliveryLaunchPlans: Record<string, DeliveryLaunchPlan>
  setDeliveryLaunchPlan(projectId: string, plan: DeliveryLaunchPlan): void
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  company: null,
  employees: [],
  projects: [],
  products: [],
  refundBatches: [],
  marketingCampaigns: [],
  publishingContracts: [],
  transactions: [],
  financial: null,
  dayIndex: 0,
  speed: 'paused',
  messages: [],
  locale: 'zh-CN',
  deliveryLaunchPlans: {},

  init(seed = 42) {
    const gw = createGameWorld(seed)
    gw.calendar.setSpeed('paused')
    set({ game: gw, dayIndex: gw.calendar.currentDayIndex, speed: gw.calendar.getSpeed() })
  },

  createCompany(name: string, cityId: string) {
    const gw = get().game
    if (!gw) return
    const company = gw.createCompany({ name, cityId })
    set({ company })
    get().refresh()
  },

  hireEmployee(name, role, skillLevel, salaryMonthlyCents) {
    const gw = get().game
    if (!gw) return { error: t('error.noCompany') }
    const outcome = gw.hireEmployee({ name, role, skillLevel, salaryMonthlyCents })
    if (!outcome.success) {
      const message = localizeError(outcome.errorCode, outcome.message, 'error.insufficientCash')
      get().toast(message, 'error')
      return { error: message }
    }
    get().refresh()
    return {}
  },

  fireEmployee(employeeId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const outcome = gw.fireEmployee(employeeId)
    get().refresh()
    if (!outcome.success) {
      const message = localizeError(outcome.errorCode, outcome.message)
      get().toast(message, 'error')
      return { success: false, message }
    }
    get().toast(t('employee.fire.success'), 'info')
    return { success: true }
  },

  createProject(params) {
    const gw = get().game
    if (!gw) return { error: t('error.noCompany') }
    const outcome = gw.createProject(params)
    if (!outcome.success) {
      const message = localizeError(outcome.errorCode, outcome.message)
      get().toast(message, 'error')
      return { error: message }
    }
    get().refresh()
    return {}
  },

  advanceProjectPhase(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.advanceProjectPhase(projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
  },

  launchProject(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.launchProject(projectId)
    if (!result.success) {
      get().refresh()
      const message = localizeError(result.errorCode, result.message)
      get().toast(message, 'error')
      return { success: false, message }
    }
    // REC-02 / ADJ-26 A6：交付页档位选择经内核命令写入上市产品。
    // 先定价（营销 setBudget 要求 launchPriceCents 非 null），再三渠道同值写入预算。
    const plan = get().deliveryLaunchPlans[projectId]
    const productId = result.result?.id
    if (plan !== undefined && productId !== undefined) {
      const priced = gw.setProductPrice({ productId, priceCents: plan.priceCents })
      if (!priced.success) get().toast(localizeError(priced.errorCode, priced.message), 'error')
      for (const channel of ['social', 'expo', 'ads'] as const) {
        const budgeted = gw.setMarketingBudget({ productId, channel, dailyBudgetCents: plan.dailyBudgetCents })
        if (!budgeted.success) get().toast(localizeError(budgeted.errorCode, budgeted.message), 'error')
      }
      // 方案按项目一次性消费，避免同项目重复上市时沿用旧档位
      const nextPlans = { ...get().deliveryLaunchPlans }
      delete nextPlans[projectId]
      set({ deliveryLaunchPlans: nextPlans })
    }
    get().refresh()
    get().toast(t('project.launch.success'), 'success')
    return { success: true }
  },

  setDeliveryLaunchPlan(projectId, plan) {
    set((state) => ({ deliveryLaunchPlans: { ...state.deliveryLaunchPlans, [projectId]: plan } }))
  },

  toggleProjectPause(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.toggleProjectPause(projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
  },

  topUpBudget(projectId, amountCents, reason) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const project = gw.world.projects.find(p => p.id === projectId)
    if (!project) {
      return { success: false, errorCode: 'PRJ_NOT_FOUND', message: t('error.projectNotFound') }
    }
    // 为每次追加分配唯一递增 seq，满足幂等键 budget:topup:{projectId}:{seq}（UI 不改领域逻辑）
    // 无历史记录时首个 seq 取 1（DESIGN-G05 v1.4 §7.1 / v1.5）；旧存档若存在 seq=0，新 seq 从 1 起且键不冲突
    let seq = 1
    for (const entry of project.changeLog) {
      const used = entry.details?.seq
      if (entry.details?.event === BUDGET_TOP_UP_EVENT && typeof used === 'number' && Number.isInteger(used)) {
        seq = Math.max(seq, used + 1)
      }
    }
    const result = gw.topUpBudget({ projectId, amountCents, seq, reason })
    get().refresh()
    if (!result.success) {
      const message = t(ERROR_I18N[result.errorCode ?? ''] ?? 'error.unknown')
      get().toast(message, 'error')
      return { success: false, errorCode: result.errorCode, message }
    }
    const message = result.idempotent
      ? t('project.budget.topUp.idempotent')
      : t('project.budget.topUp.success')
    get().toast(message, 'success')
    return { success: true, message, idempotent: result.idempotent }
  },

  resumeProject(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const project = gw.world.projects.find(p => p.id === projectId)
    if (!project) return { success: false, message: t('error.projectNotFound') }
    if (!project.isPaused) return { success: false, message: t('project.budget.resume.notPaused') }
    // 恢复前按权威公式取剩余额度，用于恢复后的“预算仍为负”提示（DESIGN-G05 v1.5 §10.1a-6）
    const remainingCapCents = recomputeRemaining({
      totalCapCents: project.budgetTotalCapCents,
      committedCents: project.budgetCommittedCents,
      spentCents: project.budgetSpentCents,
      remainingCapCents: 0,
    }).remainingCapCents
    // 已暂停 → toggleProjectPause 走领域 resume：清除 budgetExhausted、resumeSeq+1、pausedDays 清零
    const result = gw.toggleProjectPause(projectId)
    get().refresh()
    if (!result.success) {
      get().toast(result.message ?? t('error.unknown'), 'error')
      return { success: false, message: result.message }
    }
    get().toast(t('project.budget.resume.success'), 'success')
    if (remainingCapCents <= 0) {
      get().toast(t('project.budget.resume.negativeWarning'), 'info')
    }
    return { success: true }
  },

  cancelProject(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.cancelProject(projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
  },

  descopeProject(projectId, cutRatio) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    try {
      const result = gw.descopeProject(projectId, cutRatio)
      get().refresh()
      if (!result.success) {
        const message = localizeError(result.errorCode, result.message)
        get().toast(message, 'error')
        return { success: false, errorCode: result.errorCode, message }
      }
      const updated = gw.world.projects.find((p) => p.id === projectId)
      const pct = Math.round(cutRatio * 100)
      const total = Math.round((updated?.scopeCutRatio ?? 0) * 100)
      const message = t('project.descope.success')
        .replace('{pct}', String(pct))
        .replace('{total}', String(total))
      get().toast(message, 'success')
      return { success: true, message }
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        const message = t('error.projectNotFound')
        get().toast(message, 'error')
        return { success: false, errorCode: 'PRJ_NOT_FOUND', message }
      }
      throw error
    }
  },

  delayLaunch(projectId, extraDays) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const brandBefore = gw.world.companies.find((c) => c.isPlayer)?.brand ?? 0
    try {
      const result = gw.delayLaunch(projectId, extraDays)
      get().refresh()
      if (!result.success) {
        const message = localizeError(result.errorCode, result.message)
        get().toast(message, 'error')
        return { success: false, errorCode: result.errorCode, message }
      }
      const brandAfter = (get().company ?? gw.world.companies.find((c) => c.isPlayer))?.brand ?? brandBefore
      const penalty = brandBefore - brandAfter
      const updated = gw.world.projects.find((p) => p.id === projectId)
      const day = formatDay(updated?.plannedLaunchDay ?? 0)
      let message = t(penalty > 0 ? 'project.delay.success' : 'project.delay.successNoBrand').replace('{day}', day)
      if (penalty > 0) message = message.replace('{penalty}', String(penalty))
      get().toast(message, 'success')
      return { success: true, message }
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        const message = t('error.projectNotFound')
        get().toast(message, 'error')
        return { success: false, errorCode: 'PRJ_NOT_FOUND', message }
      }
      throw error
    }
  },

  assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
  },

  setProductPrice(productId, priceCents) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.setProductPrice({ productId, priceCents })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('product.priceSaved') : localizeError(r.errorCode, r.message) }
  },

  applyProductDiscount(productId, ratePercent) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.applyProductDiscount({ productId, ratePercent })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('product.discountSaved') : localizeError(r.errorCode, r.message) }
  },

  retireProduct(productId) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.retireProduct({ productId })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('product.retired') : localizeError(r.errorCode, r.message) }
  },

  setMarketingBudget(productId, channel, dailyBudgetCents) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.setMarketingBudget({ productId, channel, dailyBudgetCents })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('marketing.saved') : localizeError(r.errorCode, r.message) }
  },

  signRevenueShare(productId, ratePercent, durationDays) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.signRevenueShareContract({ productId, ratePercent, durationDays })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('contract.signed') : localizeError(r.errorCode, r.message) }
  },

  signMilestone(productId, thresholdNetRevenueCents, payoutCents, durationDays) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.signMilestoneContract({ productId, thresholdNetRevenueCents, payoutCents, durationDays })
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('contract.signed') : localizeError(r.errorCode, r.message) }
  },

  estimateContract(cmd) {
    const gw = get().game
    if (!gw) return null
    return gw.estimateContract(cmd)
  },

  signContractTemplate(cmd) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.signContractTemplate(cmd)
    get().refresh()
    return { success: r.success, errorCode: r.errorCode, message: r.success ? t('contract.signed') : localizeError(r.errorCode, r.message) }
  },

  unassignEmployeeFromProject(employeeId, projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.unassignEmployeeFromProject(employeeId, projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
  },

  advanceDays(days) {
    const gw = get().game
    if (!gw) return
    try {
      gw.advanceSimulation(days)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      get().toast(message, 'error')
      get().refresh()
      return
    }
    get().refresh()
  },

  setSpeed(speed) {
    const gw = get().game
    if (!gw) return
    gw.calendar.setSpeed(speed)
    set({ speed })
  },

  refresh() {
    const gw = get().game
    if (!gw) return
    // 破产后 getPlayerCompany() 返回 undefined → 回退到 isPlayer（否则横幅/顶栏失效，DESIGN-UI-LAYER §3.3）
    const company =
      gw.getPlayerCompany() ?? gw.world.companies.find((c) => c.isPlayer) ?? null
    set({
      company,
      employees: gw.world.employees,
      projects: gw.world.projects,
      products: gw.world.products,
      refundBatches: gw.world.refundBatches,
      marketingCampaigns: gw.world.marketingCampaigns,
      publishingContracts: gw.world.publishingContracts,
      transactions: company ? gw.finance.getTransactionsByCompany(company.id) : [],
      financial: gw.getFinancialOverview(),
      dayIndex: gw.calendar.currentDayIndex,
    })
  },

  async restartNewGame() {
    await clearSave()
    const gw = createGameWorld(Math.floor(Math.random() * 1_000_000))
    gw.calendar.setSpeed('paused')
    set({
      game: gw,
      company: null,
      employees: [],
      projects: [],
      products: [],
      refundBatches: [],
      marketingCampaigns: [],
      publishingContracts: [],
      transactions: [],
      financial: null,
      dayIndex: gw.calendar.currentDayIndex,
      speed: 'paused',
    })
    get().toast(t('banner.gameover.restartDone'), 'info')
  },

  toast(text, type = 'info') {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    set(state => ({ messages: [...state.messages, { id, text, type }] }))
    setTimeout(() => {
      set(state => ({ messages: state.messages.filter(m => m.id !== id) }))
    }, 3000)
  },

  setLocale(loc) {
    setI18nLocale(loc)
    set({ locale: loc })
    get().refresh()
  },

  async save() {
    const gw = get().game
    if (!gw) return
    await saveGame(gw.serialize())
    get().toast(t('save.success'), 'success')
  },

  async load() {
    const result = await loadGame()
    if (result.status === 'empty') {
      get().toast(t('load.empty'), 'error')
      return false
    }
    if (result.status === 'invalid') {
      // 无效存档不得覆盖当前运行状态
      get().toast(result.errorMessage, 'error')
      return false
    }
    const gw = get().game ?? createGameWorld(result.state.saveSeed)
    gw.restore(result.state)
    set({ game: gw, speed: gw.calendar.getSpeed(), dayIndex: gw.calendar.currentDayIndex })
    get().refresh()
    get().toast(t('load.success'), 'success')
    return true
  },

  async getHasSave() {
    return hasSave()
  },

  isFinanciallyDistressed() {
    const gw = get().game
    return gw ? gw.isFinanciallyDistressed() : false
  },

  listCandidates() {
    const gw = get().game
    return gw ? gw.listCandidates() : []
  },

  recruitFromCandidate(candidateId) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.recruitFromCandidate(candidateId)
    get().refresh()
    if (!r.success) get().toast(localizeError(r.errorCode, r.message), 'error')
    else get().toast(t('hire.recruit.success'), 'success')
    return { success: r.success, errorCode: r.errorCode, message: r.message }
  },

  previewRecruitImpact(candidateId) {
    const gw = get().game
    return gw ? gw.previewRecruitImpact(candidateId) : null
  },

  monthlySalaryCommitmentCents() {
    const gw = get().game
    return gw ? gw.monthlySalaryCommitmentCents() : 0
  },

  previewExecutionProject(params) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.previewExecutionProject(params)
    if (r.success && r.result) return { success: true, preview: r.result }
    return { success: false, errorCode: r.errorCode, message: r.message }
  },

  createExecutionProject(params) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.createExecutionProject(params)
    get().refresh()
    if (r.success) get().toast(t('newProject.created'), 'success')
    else get().toast(localizeError(r.errorCode, r.message), 'error')
    return { success: r.success, errorCode: r.errorCode, message: r.message }
  },

  getExecutionSummary(projectId) {
    const gw = get().game
    return gw ? gw.getExecutionSummary(projectId) : null
  },

  getCashForecast() {
    return get().game?.getCashForecast() ?? null
  },

  getDeliveryStatus(projectId) {
    const exec = get().game?.getExecutionProject(projectId)
    if (!exec) return { state: null, deliveryFailures: 0, reworkCount: 0, lastDeliveryFailure: null }
    return {
      state: exec.project.state,
      deliveryFailures: exec.project.deliveryFailures,
      reworkCount: exec.project.reworkCount,
      lastDeliveryFailure: exec.project.lastDeliveryFailure,
    }
  },

  conductMarketResearch() {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.conductMarketResearch()
    get().refresh()
    if (r.success) get().toast(t('market.research.success'), 'success')
    else get().toast(localizeError(r.errorCode, r.message), 'error')
    return r
  },

  getReworkEstimate(projectId, category, deltaPercent) {
    const gw = get().game
    return gw ? gw.getReworkEstimate(projectId, category, deltaPercent) : null
  },

  confirmRework(projectId, category, deltaPercent) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.confirmRework(projectId, category, deltaPercent)
    get().refresh()
    if (r.success) get().toast(t('p07.rework.started'), 'success')
    else get().toast(localizeError(r.errorCode, r.message), 'error')
    return r
  },

  submitDeliveryForProject(projectId, gate, deliveryForm) {
    const gw = get().game
    if (!gw) return { success: false, errorCode: 'NO_COMPANY', message: t('error.noCompany') }
    const r = gw.submitDeliveryForProject(projectId, gate, deliveryForm)
    get().refresh()
    return r
  },

  getDeliveryGateEvaluation(projectId, form, disclosureProvided) {
    const gw = get().game
    if (!gw) return null
    return gw.getDeliveryGateEvaluation(projectId, form ?? 'full', disclosureProvided ?? false)
  },
}))

// Re-export helpers for components
export { t, formatMoney, formatDay, getI18nLocale }
