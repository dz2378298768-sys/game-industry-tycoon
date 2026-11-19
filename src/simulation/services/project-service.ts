import type { ProjectPhase, ConceptSubPhase, Discipline, CancellationReason, CompanyStatus } from '@domain/enums'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RangeItem, TeamAssignment } from '@domain/value-objects'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'
import { EntityNotFoundError } from '@domain/errors'
import { TUNING } from '@content/tuning'
import {
  allProductionDisciplinesCompleteAtLeast,
  completionRatio,
  isQaComplete,
} from '@simulation/systems/project-progress'
import { transitionProject } from '@simulation/systems/phase-rules'
import {
  computeDefectLevel,
  computeFinalQualityScore,
  snapshotQualityProfile,
} from '@simulation/systems/qa-quality'

export interface CreateProjectCmd {
  name: string
  companyId: string
  genreId: string
  audienceSegmentIds: string[]
  targetPlatformIds: string[]
  budgetTotalCapCents: number
  plannedLaunchDay: number
  plannedStartDay: number
  qualityTargets?: {
    gameplay?: number
    technical?: number
    content?: number
    art?: number
    innovation?: number
  }
}

/** 上市前置条件的跨聚合依赖，由 Application 层注入 */
export interface ProjectServiceDeps {
  /** 该项目是否已经生成过 Product */
  hasProductForProject?: (projectId: string) => boolean
  /** 平台在该日期是否可用 */
  isPlatformAvailable?: (platformId: string, dayIndex: number) => boolean
  /** 公司状态 */
  getCompanyStatus?: (companyId: string) => CompanyStatus | null
}

/**
 * 每个项目的"默认工作量"估算 —— 由预算推得，全部系数来自 TUNING。
 *
 *   budgetFactor = clamp(min, max, budgetCents / 1_000_000)
 *   design      = 100 × factor
 *   programming = 150 × factor
 *   art         = 120 × factor
 *   qa          = 0（进入 QA 阶段后由 phase-rules 注入）
 */
function defaultWorkTotalByDiscipline(
  budgetCapCents: number,
): Record<Discipline, number> {
  const raw = budgetCapCents / 1_000_000
  const factor = Math.max(
    TUNING.project.budgetFactorMin,
    Math.min(TUNING.project.budgetFactorMax, raw),
  )
  const per = TUNING.project.workPerMillionBudget
  return {
    design: Math.round(per.design * factor),
    programming: Math.round(per.programming * factor),
    art: Math.round(per.art * factor),
    qa: 0,
  }
}

/**
 * ProjectService —— 项目状态机与生命周期操作。
 * 所有阶段守卫在此强制校验，UI 隐藏按钮不能替代。
 */
export class ProjectService {
  private projects: Project[] = []
  private deps: ProjectServiceDeps

  constructor(deps: ProjectServiceDeps = {}) {
    this.deps = deps
  }

  reset(initialProjects: Project[] = []): void {
    this.projects = [...initialProjects]
  }

  listAll(): Project[] {
    return [...this.projects]
  }

  getById(id: string): Project | null {
    return this.projects.find((p) => p.id === id) ?? null
  }

  listByCompany(companyId: string): Project[] {
    return this.projects.filter((p) => p.companyId === companyId)
  }

  private updateInPlace(next: Project): Project {
    const idx = this.projects.findIndex((p) => p.id === next.id)
    if (idx === -1) throw new EntityNotFoundError('PRJ_NOT_FOUND', `Project ${next.id}`)
    this.projects[idx] = next
    return next
  }

  private assertProject(projectId: string): Project {
    const p = this.getById(projectId)
    if (!p) throw new EntityNotFoundError('PRJ_NOT_FOUND', `Project ${projectId}`)
    return p
  }

  // ============ 创建 ============

  create(cmd: CreateProjectCmd): CommandResult<Project> {
    if (cmd.plannedStartDay < 0 || cmd.plannedLaunchDay < cmd.plannedStartDay) {
      return fail('PRJ_INVALID_SCHEDULE', 'Invalid schedule')
    }
    if (cmd.budgetTotalCapCents <= 0) {
      return fail('PRJ_INVALID_BUDGET', 'budgetTotalCapCents must be positive')
    }

    const qualityTargets = {
      gameplay: cmd.qualityTargets?.gameplay ?? 60,
      technical: cmd.qualityTargets?.technical ?? 60,
      content: cmd.qualityTargets?.content ?? 60,
      art: cmd.qualityTargets?.art ?? 60,
      innovation: cmd.qualityTargets?.innovation ?? 60,
    }

    const workTotal = defaultWorkTotalByDiscipline(cmd.budgetTotalCapCents)
    const workRemaining = { ...workTotal }

    const p: Project = {
      id: uuid(),
      companyId: cmd.companyId,
      name: cmd.name,
      genreId: cmd.genreId,
      audienceSegmentIds: [...cmd.audienceSegmentIds],
      targetPlatformIds: [...cmd.targetPlatformIds],
      phase: 'CONCEPT' as ProjectPhase,
      subPhase: 'DRAFT' as ConceptSubPhase,
      isPaused: false,
      plannedStartDay: cmd.plannedStartDay,
      plannedLaunchDay: cmd.plannedLaunchDay,
      actualStartDay: null,
      actualLaunchDay: null,
      scope: [],
      budgetTotalCapCents: cmd.budgetTotalCapCents,
      budgetSpentCents: 0,
      budgetCommittedCents: 0,
      teamAssignments: [],
      workRemainingByDiscipline: workRemaining,
      workTotalByDiscipline: workTotal,
      qualityTargets,
      qualityEstimate: { ...qualityTargets },
      riskFlags: [],
      changeLog: [],
      cancellationReason: null,
      pausedDays: 0,
      pauseReason: null,
      budgetExhausted: false,
      resumeSeq: 0,
      version: 1,
      createdAt: cmd.plannedStartDay,
      updatedAt: cmd.plannedStartDay,
    }
    this.projects.push(p)
    return ok(p)
  }

  // ============ 状态机 ============

  private applyTransition(project: Project, to: ProjectPhase, dayIndex: number): CommandResult<Project> {
    const next = transitionProject(project, to, dayIndex)
    if (!next) return fail('PRJ_INVALID_TRANSITION', `Cannot transition ${project.phase} → ${to}`)
    return ok(this.updateInPlace(next))
  }

  approveConcept(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'CONCEPT') return fail('PRJ_WRONG_PHASE', 'Must be in CONCEPT phase')
    return this.applyTransition({ ...p, subPhase: 'APPROVED' }, 'PRE_PRODUCTION', dayIndex)
  }

  advancePastConcept(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'CONCEPT') return fail('PRJ_WRONG_PHASE', 'Must be in CONCEPT phase')
    return this.applyTransition(p, 'PRE_PRODUCTION', dayIndex)
  }

  advanceToProduction(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'PRE_PRODUCTION') {
      return fail('PRJ_WRONG_PHASE', 'Must be in PRE_PRODUCTION phase')
    }
    const r = this.applyTransition(p, 'PRODUCTION', dayIndex)
    if (!r.success || !r.result) return r
    if (r.result.actualStartDay === null || r.result.actualStartDay === undefined) {
      return ok(this.updateInPlace({ ...r.result, actualStartDay: dayIndex }))
    }
    return r
  }

  /** 泛化推进：根据当前阶段前进一格，并强制执行各阶段守卫 */
  advancePhaseGeneric(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.isPaused) return fail('PRJ_PAUSED', 'Paused project cannot advance')
    switch (p.phase) {
      case 'CONCEPT':
        return this.advancePastConcept(projectId, dayIndex)
      case 'PRE_PRODUCTION':
        return this.advanceToProduction(projectId, dayIndex)
      case 'PRODUCTION': {
        if (!allProductionDisciplinesCompleteAtLeast(p, TUNING.project.productionCompletionThreshold)) {
          return fail('PRJ_QA_NOT_READY', 'Production disciplines below threshold')
        }
        return this.enterQA(projectId, dayIndex)
      }
      case 'QA':
        return this.advanceToReadyToLaunch(projectId, dayIndex)
      default:
        return fail('PRJ_CANNOT_ADVANCE', `Cannot advance from ${p.phase}`)
    }
  }

  /**
   * 进入 QA。必须三项生产完成度均达到 TUNING 阈值。
   * 在 90%–100% 之间进入会按 B7 产生提前进入惩罚（见 qa-quality）。
   */
  enterQA(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'PRODUCTION') return fail('PRJ_WRONG_PHASE', 'Must be in PRODUCTION phase')
    if (!allProductionDisciplinesCompleteAtLeast(p, TUNING.project.productionCompletionThreshold)) {
      return fail('PRJ_PRODUCTION_NOT_COMPLETE', 'Production disciplines below threshold')
    }
    return this.applyTransition(p, 'QA', dayIndex)
  }

  /** QA → 上市准备：QA 完成度必须为 100% */
  advanceToReadyToLaunch(projectId: string, dayIndex = 0): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'QA') return fail('PRJ_WRONG_PHASE', 'Must be in QA phase')
    if (!isQaComplete(p)) {
      return fail(
        'PRJ_QA_INCOMPLETE',
        `QA completion ${Math.round(completionRatio(p, 'qa') * 100)}% < 100%`,
      )
    }
    return this.applyTransition(p, 'READY_TO_LAUNCH', dayIndex)
  }

  // ============ 暂停/恢复/取消 ============

  pause(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_CANNOT_PAUSE', 'Terminal phase cannot be paused')
    }
    if (p.isPaused) return { success: true, result: p, idempotent: true }
    return ok(
      this.updateInPlace({
        ...p,
        isPaused: true,
        pausedDays: 0,
        pauseReason: 'manual',
        version: p.version + 1,
      }),
    )
  }

  resume(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_CANNOT_RESUME', 'Terminal phase cannot be resumed')
    }
    if (!p.isPaused) return { success: true, result: p, idempotent: true }
    return ok(
      this.updateInPlace({
        ...p,
        isPaused: false,
        pausedDays: 0,
        pauseReason: null,
        // 预算耗尽态是「当前状态」而非历史，恢复成功即清除（DESIGN-G05 §6.3）
        budgetExhausted: false,
        // 新一轮恢复周期：耗尽事件幂等键换轮，允许再次耗尽时产生新事件（GDR R2）
        resumeSeq: (p.resumeSeq ?? 0) + 1,
        version: p.version + 1,
      }),
    )
  }

  cancel(projectId: string, reason: CancellationReason, dayIndex?: number): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'LAUNCHED') return fail('PRJ_ALREADY_LAUNCHED', 'Launched project cannot be cancelled')
    if (p.phase === 'CANCELLED') return fail('PRJ_ALREADY_TERMINAL', 'Already cancelled')
    return ok(
      this.updateInPlace({
        ...p,
        phase: 'CANCELLED',
        isPaused: false,
        pauseReason: null,
        // 终态清理口径（DESIGN-G05 §6.3）：过程态标记不留入终态
        budgetExhausted: false,
        pausedDays: 0,
        riskFlags: p.riskFlags.filter((f) => f !== 'budget_exhausted'),
        cancellationReason: reason,
        // 取消日 = 传入的游戏日（UI 取消日期唯一来源，TASK-M1.1-UI-001-FIX F4）
        updatedAt: dayIndex ?? p.updatedAt,
        version: p.version + 1,
      }),
    )
  }

  // ============ 发布 ============

  launch(
    projectId: string,
    dayIndex: number,
  ): CommandResult<{ projectId: string; productId: string; product: Product }> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'READY_TO_LAUNCH') return fail('PRJ_NOT_READY', 'Must be READY_TO_LAUNCH')
    if (p.isPaused) return fail('PRJ_PAUSED', 'Paused project cannot launch')
    if (!isQaComplete(p)) return fail('PRJ_QA_INCOMPLETE', 'QA must be 100% complete')
    if (dayIndex < p.plannedLaunchDay) {
      return fail('PRJ_LAUNCH_TOO_EARLY', `Cannot launch before plannedLaunchDay ${p.plannedLaunchDay}`)
    }

    if (this.deps.getCompanyStatus) {
      const status = this.deps.getCompanyStatus(p.companyId)
      if (status !== 'active') return fail('PRJ_COMPANY_INACTIVE', 'Company is not active')
    }
    if (this.deps.hasProductForProject?.(p.id)) {
      return fail('PRJ_PRODUCT_EXISTS', 'Product already exists for this project')
    }
    if (this.deps.isPlatformAvailable) {
      for (const platformId of p.targetPlatformIds) {
        if (!this.deps.isPlatformAvailable(platformId, dayIndex)) {
          return fail('PRJ_PLATFORM_UNAVAILABLE', `Platform ${platformId} not available`)
        }
      }
    }

    const advanced = transitionProject(p, 'LAUNCHED', dayIndex)
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot transition to LAUNCHED')

    const defectLevel = computeDefectLevel(advanced)
    const finalQualityScore = computeFinalQualityScore(defectLevel)
    const finalQualityProfile = snapshotQualityProfile(advanced)
    const launched: Project = {
      ...advanced,
      actualLaunchDay: dayIndex,
      finalDefectLevel: defectLevel,
      finalQualityScore,
      finalQuality: finalQualityProfile,
    }
    this.updateInPlace(launched)

    const product: Product = {
      id: uuid(),
      sourceProjectId: launched.id,
      companyId: launched.companyId,
      name: launched.name,
      genreId: launched.genreId,
      audienceSegmentIds: [...launched.audienceSegmentIds],
      supportedPlatformIds: [...launched.targetPlatformIds],
      launchDay: dayIndex,
      // M1 不做真实定价
      launchPriceCents: null,
      qualityProfile: finalQualityProfile,
      defectLevel,
      finalQualityScore,
      reviewScore: null,
      brandImpact: Math.round(finalQualityScore / 10),
      lifecycleStage: 'launch',
      awarenessByMarket: {},
      status: 'active',
      version: 1,
      createdAt: dayIndex,
      updatedAt: dayIndex,
    }

    return ok({ projectId: launched.id, productId: product.id, product })
  }

  // ============ 范围 & 团队 ============

  adjustScope(cmd: {
    projectId: string
    addItems?: RangeItem[]
    removeItemIds?: string[]
    updateItems?: RangeItem[]
    dayIndex?: number
  }): CommandResult<Project> {
    const p = this.assertProject(cmd.projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_SCOPE_TERMINAL', 'Terminal project scope cannot change')
    }
    let scope = [...p.scope]
    if (cmd.addItems?.length) scope = [...scope, ...cmd.addItems]
    if (cmd.removeItemIds?.length) {
      const remove = new Set(cmd.removeItemIds)
      scope = scope.filter((i) => !remove.has(i.id))
    }
    if (cmd.updateItems?.length) {
      const updateMap = new Map(cmd.updateItems.map((i) => [i.id, i]))
      scope = scope.map((i) => updateMap.get(i.id) ?? i)
    }
    return ok(this.updateInPlace({ ...p, scope, version: p.version + 1 }))
  }

  reassignTeam(cmd: {
    projectId: string
    assignments: TeamAssignment[]
    /** 公司内所有项目的 assignments（供校验总分配） */
    allAssignmentsInCompany: TeamAssignment[]
  }): CommandResult<Project> {
    const p = this.assertProject(cmd.projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_TEAM_TERMINAL', 'Terminal project team cannot change')
    }

    const otherAssignments = cmd.allAssignmentsInCompany.filter((a) => a.projectId !== cmd.projectId)
    const totals = new Map<string, number>()
    for (const a of otherAssignments) {
      totals.set(a.employeeId, (totals.get(a.employeeId) ?? 0) + a.allocationRatio)
    }
    for (const a of cmd.assignments) {
      // 拒绝 NaN / Infinity / 0 / 负数 / 大于 1 的投入比例
      if (
        !Number.isFinite(a.allocationRatio) ||
        a.allocationRatio <= 0 ||
        a.allocationRatio > 1
      ) {
        return fail(
          'EMP_INVALID_ALLOCATION',
          `Employee ${a.employeeId} allocationRatio must be in (0, 1]`,
        )
      }
      const newTotal = (totals.get(a.employeeId) ?? 0) + a.allocationRatio
      if (newTotal > 1.00001) {
        return fail(
          'EMP_ALLOCATION_EXCEEDS_100_PERCENT',
          `Employee ${a.employeeId} total allocation would be ${newTotal}`,
        )
      }
    }

    return ok(this.updateInPlace({ ...p, teamAssignments: cmd.assignments, version: p.version + 1 }))
  }

  computeWorkRemaining(project: Project): Record<Discipline, number> {
    return { ...project.workRemainingByDiscipline }
  }
}
