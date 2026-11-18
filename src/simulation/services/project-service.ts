import type {
  ProjectPhase,
  ConceptSubPhase,
  Discipline,
  CancellationReason,
} from '@domain/enums'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { RangeItem, TeamAssignment } from '@domain/value-objects'
import type { CommandResult } from '@domain/types'
import { ok, fail, uuid } from '@domain/types'
import {
  InvalidPhaseTransitionError,
  EmployeeAllocationError,
  EntityNotFoundError,
  ValidationError,
} from '@domain/errors'
import {
  allProductionDisciplinesCompleteAtLeast,
} from '@simulation/systems/project-progress'
import { averageQuality } from '@domain/value-objects/quality-profile'

// 我们不导入 ProductService；而是在调用 launch() 时返回 Product 的最小字段集（由上层决定何时真正持久化）

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

const PRODUCTION_DISCIPLINES: Discipline[] = ['design', 'programming', 'art']

/**
 * 每个项目的"默认工作量"估算 —— 由预算推得。
 * 使用温和的缩放系数，保证「1 个员工 ≈ 6 工作点/天」的基线在计划工期内可以完成。
 *
 *   budgetFactor = clamp(0.5, 4, budgetCents / 1_000_000)
 *   design      = 100 × factor
 *   programming = 150 × factor
 *   art         = 120 × factor
 *   qa          = 0（进入 QA 阶段后注入）
 *
 * 例：$30,000 预算 → factor=3 → design 300 / programming 450 / art 360
 *     单个岗位员工约 6 点/天 → 50~75 天可完成制作，符合 120 天计划工期。
 * 注意：这是 TUNING 候选值，不是最终平衡参数。
 */
function defaultWorkTotalByDiscipline(
  budgetCapCents: number,
): Record<Discipline, number> {
  const raw = budgetCapCents / 1_000_000
  const budgetFactor = Math.max(0.5, Math.min(4, raw))
  return {
    design: Math.round(100 * budgetFactor),
    programming: Math.round(150 * budgetFactor),
    art: Math.round(120 * budgetFactor),
    qa: 0,
  }
}

/**
 * QA 阶段开始时，为 QA discipline 注入工作量。
 */
function injectQaWork(totalWork: Record<Discipline, number>): Record<Discipline, number> {
  if (totalWork.qa > 0) return totalWork
  const qa = Math.round(
    (totalWork.design + totalWork.programming + totalWork.art) * 0.2,
  )
  return { ...totalWork, qa }
}

/**
 * ProjectService —— 完整状态机 + 生命周期操作
 */
export class ProjectService {
  private projects: Project[] = []

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
    if (idx === -1) {
      throw new EntityNotFoundError('PRJ_NOT_FOUND', `Project ${next.id}`)
    }
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

    const defaultTargets = {
      gameplay: 60,
      technical: 60,
      content: 60,
      art: 60,
      innovation: 60,
    }
    const qualityTargets = {
      gameplay: cmd.qualityTargets?.gameplay ?? defaultTargets.gameplay,
      technical: cmd.qualityTargets?.technical ?? defaultTargets.technical,
      content: cmd.qualityTargets?.content ?? defaultTargets.content,
      art: cmd.qualityTargets?.art ?? defaultTargets.art,
      innovation: cmd.qualityTargets?.innovation ?? defaultTargets.innovation,
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
      consecutivePauseDays: 0,
      version: 1,
      createdAt: cmd.plannedStartDay,
      updatedAt: cmd.plannedStartDay,
    }
    this.projects.push(p)
    return ok(p)
  }

  // ============ 状态机：CONCEPT → PRE_PRODUCTION → PRODUCTION → QA → READY_TO_LAUNCH → LAUNCHED ============

  approveConcept(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'CONCEPT') {
      return fail('PRJ_WRONG_PHASE', 'Must be in CONCEPT phase')
    }
    const withSub: Project = {
      ...p,
      subPhase: 'APPROVED',
      version: p.version + 1,
      updatedAt: p.updatedAt,
    }
    // 自动推进到 PRE_PRODUCTION
    const advanced = this.transitionTo(withSub, 'PRE_PRODUCTION')
    if (!advanced) {
      return fail('PRJ_INVALID_TRANSITION', 'Cannot advance from CONCEPT after approve')
    }
    return ok(advanced)
  }

  advancePastConcept(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'CONCEPT') {
      return fail('PRJ_WRONG_PHASE', 'Must be in CONCEPT phase')
    }
    const advanced = this.transitionTo(p, 'PRE_PRODUCTION')
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot advance from CONCEPT')
    return ok(advanced)
  }

  advanceToProduction(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'PRE_PRODUCTION') {
      return fail('PRJ_WRONG_PHASE', 'Must be in PRE_PRODUCTION phase')
    }
    const advanced = this.transitionTo(p, 'PRODUCTION')
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot advance to PRODUCTION')
    // PRODUCTION 开始 = actualStartDay
    const withStart: Project =
      advanced.actualStartDay == null
        ? { ...advanced, actualStartDay: advanced.plannedStartDay }
        : advanced
    return ok(this.updateInPlace(withStart))
  }

  /** 泛化状态机 —— 根据 phase 推进到下一个阶段 */
  advancePhaseGeneric(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'CONCEPT') return this.advancePastConcept(projectId)
    if (p.phase === 'PRE_PRODUCTION') return this.advanceToProduction(projectId)
    if (p.phase === 'PRODUCTION') {
      const canAutoQA = allProductionDisciplinesCompleteAtLeast(p, 0.9)
      if (!canAutoQA) {
        return fail('PRJ_QA_NOT_READY', 'Production disciplines < 90% complete')
      }
      return this.enterQA(projectId, undefined, false)
    }
    if (p.phase === 'QA') {
      const advanced = this.transitionTo(p, 'READY_TO_LAUNCH')
      if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot enter READY_TO_LAUNCH')
      return ok(advanced)
    }
    return fail('PRJ_CANNOT_ADVANCE', `Cannot advance from ${p.phase}`)
  }

  advanceToReadyToLaunch(projectId: string): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'QA') {
      return fail('PRJ_WRONG_PHASE', 'Must be in QA phase')
    }
    const advanced = this.transitionTo(p, 'READY_TO_LAUNCH')
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot enter READY_TO_LAUNCH')
    return ok(advanced)
  }

  /**
   * 通用 Phase→Phase 转换表
   */
  private transitionTo(from: Project, to: ProjectPhase): Project | null {
    const valid: Record<ProjectPhase, ProjectPhase[]> = {
      CONCEPT: ['PRE_PRODUCTION'],
      PRE_PRODUCTION: ['PRODUCTION'],
      PRODUCTION: ['QA'],
      QA: ['READY_TO_LAUNCH'],
      READY_TO_LAUNCH: ['LAUNCHED'],
      LAUNCHED: [],
      CANCELLED: [],
    }
    if (!valid[from.phase].includes(to)) return null

    let next: Project = {
      ...from,
      phase: to,
      subPhase: to === 'CONCEPT' ? from.subPhase : null,
      version: from.version + 1,
    }

    // 进入 QA 时注入 QA 工作量
    if (to === 'QA') {
      const total = injectQaWork(next.workTotalByDiscipline)
      const remainingInject = { ...next.workRemainingByDiscipline }
      // 如果 qa workTotal 从 0 增加，remaining 也要同步
      const totalBefore = next.workTotalByDiscipline.qa
      const totalAfter = total.qa
      if (totalAfter > totalBefore) {
        remainingInject.qa += totalAfter - totalBefore
      }
      next = {
        ...next,
        workTotalByDiscipline: total,
        workRemainingByDiscipline: remainingInject,
      }
    }

    // LAUNCHED 时写 actualLaunchDay（如果还没写）
    if (to === 'LAUNCHED' && next.actualLaunchDay == null) {
      next = { ...next, actualLaunchDay: next.plannedLaunchDay }
    }

    return this.updateInPlace(next)
  }

  // ============ 暂停/恢复/取消 ============

  pause(
    projectId: string,
    _idempotencyKey?: string,
  ): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_CANNOT_PAUSE', 'Terminal phase cannot be paused')
    }
    if (p.isPaused) {
      return ok(p, undefined)
    }
    const paused: Project = {
      ...p,
      isPaused: true,
      consecutivePauseDays: p.consecutivePauseDays,
      version: p.version + 1,
    }
    return ok(this.updateInPlace(paused))
  }

  resume(
    projectId: string,
    _idempotencyKey?: string,
  ): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (!p.isPaused) return ok(p, undefined)
    const resumed: Project = {
      ...p,
      isPaused: false,
      consecutivePauseDays: 0,
      version: p.version + 1,
    }
    return ok(this.updateInPlace(resumed))
  }

  cancel(
    projectId: string,
    reason: CancellationReason,
    _idempotencyKey?: string,
  ): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase === 'LAUNCHED' || p.phase === 'CANCELLED') {
      return fail('PRJ_ALREADY_TERMINAL', 'Already in terminal phase')
    }
    const next: Project = {
      ...p,
      phase: 'CANCELLED',
      isPaused: true,
      cancellationReason: reason,
      version: p.version + 1,
    }
    return ok(this.updateInPlace(next))
  }

  // ============ QA ============

  enterQA(
    projectId: string,
    _idempotencyKey?: string,
    forced = false,
  ): CommandResult<Project> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'PRODUCTION') {
      return fail('PRJ_WRONG_PHASE', 'Must be in PRODUCTION phase')
    }
    if (!forced && !allProductionDisciplinesCompleteAtLeast(p, 0.9)) {
      return fail(
        'PRJ_PRODUCTION_NOT_COMPLETE',
        'production disciplines must be >= 90% complete (or forced)',
      )
    }
    const advanced = this.transitionTo(p, 'QA')
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot enter QA')
    return ok(advanced)
  }

  // ============ 发布 ============

  launch(
    projectId: string,
    _idempotencyKey?: string,
    dayIndex?: number,
  ): CommandResult<{ projectId: string; productId: string; product: Product }> {
    const p = this.assertProject(projectId)
    if (p.phase !== 'READY_TO_LAUNCH') {
      return fail('PRJ_NOT_READY', 'Must be READY_TO_LAUNCH to launch')
    }
    const actualDay = dayIndex ?? p.plannedLaunchDay
    if (actualDay < p.plannedLaunchDay) {
      return fail('PRJ_LAUNCH_TOO_EARLY', 'Cannot launch before plannedLaunchDay')
    }

    const advanced = this.transitionTo(p, 'LAUNCHED')
    if (!advanced) return fail('PRJ_INVALID_TRANSITION', 'Cannot transition to LAUNCHED')

    // 构造 Product —— 此处仅生成字段；调用方负责持久化
    const avgQ = averageQuality(advanced.qualityEstimate)
    const product: Product = {
      id: uuid(),
      sourceProjectId: advanced.id,
      companyId: advanced.companyId,
      name: advanced.name,
      genreId: advanced.genreId,
      audienceSegmentIds: [...advanced.audienceSegmentIds],
      supportedPlatformIds: [...advanced.targetPlatformIds],
      launchDay: actualDay,
      launchPriceCents: 29_999, // TUNING: $29.99 默认首发价
      qualityProfile: { ...advanced.qualityEstimate },
      defectLevel: Math.round(Math.max(0, 100 - avgQ)),
      reviewScore: null,
      brandImpact: Math.round(avgQ / 10),
      lifecycleStage: 'launch',
      awarenessByMarket: {},
      status: 'active',
      version: 1,
      createdAt: actualDay,
      updatedAt: actualDay,
    }

    // 回填项目的 actualLaunchDay
    const withLaunchDay: Project = {
      ...advanced,
      actualLaunchDay: actualDay,
    }
    this.updateInPlace(withLaunchDay)

    return ok({
      projectId: advanced.id,
      productId: product.id,
      product,
    })
  }

  // ============ 范围 & 团队 ============

  adjustScope(cmd: {
    projectId: string
    addItems?: RangeItem[]
    removeItemIds?: string[]
    updateItems?: RangeItem[]
  }): CommandResult<Project> {
    const p = this.assertProject(cmd.projectId)
    let scope = [...p.scope]
    if (cmd.addItems?.length) {
      scope = [...scope, ...cmd.addItems]
    }
    if (cmd.removeItemIds?.length) {
      const remove = new Set(cmd.removeItemIds)
      scope = scope.filter((i) => !remove.has(i.id))
    }
    if (cmd.updateItems?.length) {
      const updateMap = new Map(cmd.updateItems.map((i) => [i.id, i]))
      scope = scope.map((i) => updateMap.get(i.id) ?? i)
    }
    const next: Project = {
      ...p,
      scope,
      version: p.version + 1,
    }
    return ok(this.updateInPlace(next))
  }

  reassignTeam(cmd: {
    projectId: string
    assignments: TeamAssignment[]
    /** 公司内所有项目的 assignments（供校验总分配） */
    allAssignmentsInCompany: TeamAssignment[]
  }): CommandResult<Project> {
    const p = this.assertProject(cmd.projectId)

    // 构造"除本项目外"的 assignments，再叠加新 assignments，做总量校验
    const otherAssignments = cmd.allAssignmentsInCompany.filter(
      (a) => a.projectId !== cmd.projectId,
    )
    const totalsBefore = new Map<string, number>()
    for (const a of otherAssignments) {
      totalsBefore.set(a.employeeId, (totalsBefore.get(a.employeeId) ?? 0) + a.allocationRatio)
    }
    for (const a of cmd.assignments) {
      const newTotal = (totalsBefore.get(a.employeeId) ?? 0) + a.allocationRatio
      if (newTotal > 1.00001) {
        return fail(
          'EMP_ALLOCATION_EXCEEDS_100_PERCENT',
          `Employee ${a.employeeId} total allocation would be ${newTotal}`,
        )
      }
    }

    const next: Project = {
      ...p,
      teamAssignments: cmd.assignments,
      version: p.version + 1,
    }
    return ok(this.updateInPlace(next))
  }

  // ============ 纯计算 ============

  computeWorkRemaining(project: Project): Record<Discipline, number> {
    return { ...project.workRemainingByDiscipline }
  }
}

// 引用保持：避免未使用 lint 报错
void PRODUCTION_DISCIPLINES
void InvalidPhaseTransitionError
void EmployeeAllocationError
void ValidationError
