import { create } from 'zustand'
import { GameWorld } from '@application/mediators/game-world'
import { saveGame, loadGame, hasSave } from '@infrastructure/storage/save-service'
import type { Company } from '@domain/entities/company'
import type { Employee } from '@domain/entities/employee'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { Transaction } from '@domain/entities/transaction'
import type { CalendarSpeed } from '@domain/enums'
import { t, formatMoney, formatDay, setLocale as setI18nLocale, getLocale as getI18nLocale } from '@i18n'

interface Message { id: string; text: string; type: 'info' | 'error' | 'success' }

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
  hireEmployee(name: string, role: any, skillLevel: number, salaryMonthlyCents: number): { error?: string }
  createProject(params: {
    name: string
    genreId: string
    budgetTotalCapCents: number
    plannedLaunchDay: number
  }): { error?: string }
  advanceProjectPhase(projectId: string): { success: boolean; message?: string }
  launchProject(projectId: string): { success: boolean; message?: string }
  toggleProjectPause(projectId: string): { success: boolean; message?: string }
  cancelProject(projectId: string): { success: boolean; message?: string }
  assignEmployeeToProject(employeeId: string, projectId: string, allocationRatio: number, roleOnProject: string): { success: boolean; message?: string }
  unassignEmployeeFromProject(employeeId: string, projectId: string): { success: boolean; message?: string }
  advanceDays(days: number): void
  setSpeed(speed: CalendarSpeed): void
  refresh(): void
  toast(text: string, type?: 'info' | 'error' | 'success'): void
  setLocale(loc: 'en' | 'zh-CN'): void
  save(): Promise<void>
  load(): Promise<boolean>
  getHasSave(): Promise<boolean>
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
    const emp = gw.hireEmployee({ name, role, skillLevel, salaryMonthlyCents })
    if (!emp) return { error: t('error.insufficientCash') }
    get().refresh()
    return {}
  },

  createProject(params) {
    const gw = get().game
    if (!gw) return { error: t('error.noCompany') }
    const p = gw.createProject(params)
    if (!p) return { error: t('error.noCompany') }
    get().refresh()
    return {}
  },

  advanceProjectPhase(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.advanceProjectPhase(projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return result
  },

  launchProject(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.launchProject(projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    else get().toast('🚀 Project Launched!', 'success')
    return result
  },

  toggleProjectPause(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.toggleProjectPause(projectId)
    get().refresh()
    return result
  },

  cancelProject(projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.cancelProject(projectId)
    get().refresh()
    return result
  },

  assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.assignEmployeeToProject(employeeId, projectId, allocationRatio, roleOnProject)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return result
  },

  unassignEmployeeFromProject(employeeId, projectId) {
    const gw = get().game
    if (!gw) return { success: false, message: t('error.noCompany') }
    const result = gw.unassignEmployeeFromProject(employeeId, projectId)
    get().refresh()
    if (!result.success) get().toast(result.message ?? t('error.unknown'), 'error')
    return result
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
    set({
      company: gw.getPlayerCompany() ?? null,
      employees: gw.world.employees,
      projects: gw.world.projects,
      products: gw.world.products,
      transactions: gw.finance.getTransactionsByCompany(gw.getPlayerCompany()?.id ?? ''),
      dayIndex: gw.calendar.currentDayIndex,
    })
  },

  toast(text, type = 'info') {
    const id = Math.random().toString(36)
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
    get().toast('✓ 保存成功', 'success')
  },

  async load() {
    const state = await loadGame()
    if (!state) {
      get().toast('没有存档', 'error')
      return false
    }
    const gw = get().game ?? new GameWorld(state.saveSeed)
    gw.restore(state)
    set({ game: gw, speed: gw.calendar.getSpeed(), dayIndex: gw.calendar.currentDayIndex })
    get().refresh()
    get().toast('✓ 读取成功', 'success')
    return true
  },

  async getHasSave() {
    return hasSave()
  },
}))

// Re-export helpers for components
export { t, formatMoney, formatDay, getI18nLocale }
