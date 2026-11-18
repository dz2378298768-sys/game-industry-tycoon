import { create } from 'zustand'
import { GameWorld } from '@application/mediators/game-world'
import { saveGame, loadGame, hasSave } from '@infrastructure/storage/save-service'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { Transaction } from '@domain/entities/transaction'
import type { CalendarSpeed, EmployeeRole, ProjectRole } from '@domain/enums'
import { BUDGET_TOP_UP_EVENT } from '@domain/value-objects'
import { t, formatMoney, formatDay, setLocale as setI18nLocale, getLocale as getI18nLocale } from '@i18n'

interface Message { id: string; text: string; type: 'info' | 'error' | 'success' }

interface ActionResult { success: boolean; message?: string | undefined }
interface BudgetActionResult extends ActionResult { errorCode?: string | undefined; idempotent?: boolean | undefined }

/** 追加预算领域错误码 → i18n 文案键（避免把领域层硬编码中文直接暴露给 UI） */
const TOP_UP_ERROR_I18N: Record<string, string> = {
  BGT_INVALID_AMOUNT: 'error.bgtInvalidAmount',
  PRJ_TERMINAL: 'error.projectTerminal',
  PRJ_NOT_FOUND: 'error.projectNotFound',
}

interface GameStore {
  game: GameWorld | null
  company: Company | null
  employees: Employee[]
  projects: Project[]
  products: Product[]
  transactions: Transaction[]
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
  assignEmployeeToProject(employeeId: string, projectId: string, allocationRatio: number, roleOnProject: ProjectRole): ActionResult
  unassignEmployeeFromProject(employeeId: string, projectId: string): ActionResult
  advanceDays(days: number): void
  setSpeed(speed: CalendarSpeed): void
  refresh(): void
  toast(text: string, type?: 'info' | 'error' | 'success'): void
  setLocale(loc: 'en' | 'zh-CN'): void
  save(): Promise<void>
  load(): Promise<boolean>
  getHasSave(): Promise<boolean>
  isFinanciallyDistressed(): boolean
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  company: null,
  employees: [],
  projects: [],
  products: [],
  transactions: [],
  dayIndex: 0,
  speed: 'paused',
  messages: [],
  locale: 'zh-CN',

  init(seed = 42) {
    const gw = new GameWorld(seed)
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
      get().toast(outcome.message ?? t('error.insufficientCash'), 'error')
      return { error: outcome.message ?? t('error.insufficientCash') }
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
      get().toast(outcome.message ?? t('error.unknown'), 'error')
      return { success: false, message: outcome.message }
    }
    get().toast(t('employee.fire.success'), 'info')
    return { success: true }
  },

  createProject(params) {
    const gw = get().game
    if (!gw) return { error: t('error.noCompany') }
    const outcome = gw.createProject(params)
    if (!outcome.success) {
      get().toast(outcome.message ?? t('error.unknown'), 'error')
      return { error: outcome.message ?? t('error.unknown') }
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
    get().refresh()
    if (!result.success) {
      get().toast(result.message ?? t('error.unknown'), 'error')
      return { success: false, message: result.message }
    }
    get().toast(t('project.launch.success'), 'success')
    return { success: true }
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
    let seq = 0
    for (const entry of project.changeLog) {
      const used = entry.details?.seq
      if (entry.details?.event === BUDGET_TOP_UP_EVENT && typeof used === 'number' && Number.isInteger(used)) {
        seq = Math.max(seq, used + 1)
      }
    }
    const result = gw.topUpBudget({ projectId, amountCents, seq, reason })
    get().refresh()
    if (!result.success) {
      const message = t(TOP_UP_ERROR_I18N[result.errorCode ?? ''] ?? 'error.unknown')
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
    // 已暂停 → toggleProjectPause 走领域 resume：清除 budgetExhausted、resumeSeq+1、pausedDays 清零
    const result = gw.toggleProjectPause(projectId)
    get().refresh()
    if (!result.success) {
      get().toast(result.message ?? t('error.unknown'), 'error')
      return { success: false, message: result.message }
    }
    get().toast(t('project.budget.resume.success'), 'success')
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

  assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return { success: result.success, ...(result.message ? { message: result.message } : {}) }
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
    gw.advanceSimulation(days)
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
    const company = gw.getPlayerCompany() ?? null
    set({
      company,
      employees: gw.world.employees,
      projects: gw.world.projects,
      products: gw.world.products,
      transactions: company ? gw.finance.getTransactionsByCompany(company.id) : [],
      dayIndex: gw.calendar.currentDayIndex,
    })
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
    const gw = get().game ?? new GameWorld(result.state.saveSeed)
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
}))

// Re-export helpers for components
export { t, formatMoney, formatDay, getI18nLocale }
