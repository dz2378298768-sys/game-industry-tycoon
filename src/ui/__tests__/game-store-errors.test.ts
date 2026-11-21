import { describe, expect, it, vi } from 'vitest'
import { useGameStore } from '@ui/state/game-store'
import { formatDay, t } from '@i18n'
import type { Project } from '@domain/entities/project'
import type { Product } from '@domain/entities/product'
import type { GameWorld } from '@application/mediators/game-world'

// V12：ERROR_I18N 超集 + 成功 toast 占位符（TASK-M1.2-UI-PARITY-FIX v1.2 F4/F5）。
// 不 mock store，错误码一律由真实 GameWorld / ProjectService 产出，防止字典与领域漂移。

const ERROR_CASES: ReadonlyArray<readonly [string, string]> = [
  ['NO_COMPANY', 'error.noCompany'],
  ['FIN_COMPANY_BANKRUPT', 'error.finCompanyBankrupt'],
  ['PRJ_COMPANY_INACTIVE', 'error.prjCompanyInactive'],
  ['EMP_CAPACITY_FULL', 'error.capacityFull'],
  ['FIN_DISTRESS', 'error.financialDistress'],
  ['EMP_INVALID_SALARY', 'error.invalidSalary'],
  ['EMP_INVALID_SKILL', 'error.invalidSkill'],
  ['FIN_INSUFFICIENT_CASH', 'error.insufficientCash'],
  ['EMP_NOT_FOUND', 'error.employeeNotFound'],
  ['EMP_ALREADY_TERMINATED', 'error.employeeAlreadyTerminated'],
  ['PRJ_PLATFORM_UNAVAILABLE', 'error.platformUnavailable'],
  ['PRJ_SEGMENT_UNAVAILABLE', 'error.segmentUnavailable'],
  ['PRJ_TERMINAL', 'error.projectTerminal'],
  ['PRJ_NOT_FOUND', 'error.projectNotFound'],
  ['PRJ_WRONG_PHASE', 'error.prjWrongPhase'],
  ['BGT_INVALID_AMOUNT', 'error.bgtInvalidAmount'],
  ['PRJ_LAUNCH_TOO_EARLY', 'error.cannotLaunchEarly'],
  ['PRJ_MAX_DESCIPE_REACHED', 'error.prjMaxDescopeReached'],
  ['PRJ_SCOPE_TERMINAL', 'error.prjScopeTerminal'],
  ['PRJ_INVALID_CUT_RATIO', 'error.prjInvalidCutRatio'],
  ['PRJ_INVALID_DELAY_DAYS', 'error.prjInvalidDelayDays'],
  ['PRJ_LAUNCH_DELAY_TERMINAL', 'error.prjLaunchDelayTerminal'],
  ['PRJ_LAUNCH_DELAY_EXCEEDS_MAX', 'error.prjLaunchDelayExceedsMax'],
  ['PRJ_NOT_READY', 'error.prjNotReady'],
  ['PRJ_PAUSED', 'error.prjPaused'],
  ['PRJ_QA_INCOMPLETE', 'error.prjQaIncomplete'],
  ['PRJ_PRODUCT_EXISTS', 'error.prjProductExists'],
  ['PRJ_INVALID_TRANSITION', 'error.prjInvalidTransition'],
]

function resetStore(): GameWorld {
  useGameStore.setState({
    game: null,
    company: null,
    employees: [],
    projects: [],
    products: [],
    transactions: [],
    messages: [],
    dayIndex: 0,
    speed: 'paused',
  })
  useGameStore.getState().init(11)
  useGameStore.getState().setLocale('zh-CN')
  const gw = useGameStore.getState().game
  if (!gw) throw new Error('GameWorld 未初始化')
  return gw
}

function bootProject(plannedLaunchDay = 200): Project {
  resetStore()
  useGameStore.getState().createCompany('Acme', 'san_francisco')
  const outcome = useGameStore.getState().createProject({
    name: 'Parity Target',
    genreId: 'action',
    budgetTotalCapCents: 1_000_000,
    plannedLaunchDay,
  })
  expect(outcome.error).toBeUndefined()
  const project = useGameStore.getState().projects[0]
  if (!project) throw new Error('createProject 未产出项目')
  return project
}

function patchProject(projectId: string, patch: Partial<Project>): void {
  const gw = useGameStore.getState().game
  if (!gw) throw new Error('GameWorld 未初始化')
  gw.world.projects = gw.world.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p))
  useGameStore.getState().refresh()
}

function lastToast(): string | undefined {
  const messages = useGameStore.getState().messages
  return messages[messages.length - 1]?.text
}

describe('V12 错误码 → i18n toast 全集（DESIGN-UI-LAYER v1.1 §3.2 / R-04 / §8.1 V12）', () => {
  it('V12-1 §9.1 全表逐码命中', () => {
    expect(ERROR_CASES).toHaveLength(28)
    for (const [code, key] of ERROR_CASES) {
      resetStore()
      const gw = useGameStore.getState().game!
      const spy = vi
        .spyOn(gw, 'descopeProject')
        .mockReturnValue({ success: false, errorCode: code, message: 'RAW_DOMAIN_TEXT' })
      const result = useGameStore.getState().descopeProject('any-project', 0.2)
      expect(result.success).toBe(false)
      expect(result.errorCode).toBe(code)
      expect(result.message).toBe(t(key))
      expect(lastToast()).toBe(t(key))
      expect(lastToast()).not.toContain('RAW_DOMAIN_TEXT')
      spy.mockRestore()
    }
  })

  it('V12-2 descope 真实命令三码', () => {
    const project = bootProject()

    const invalid = useGameStore.getState().descopeProject(project.id, 0.15)
    expect(invalid.errorCode).toBe('PRJ_INVALID_CUT_RATIO')
    expect(invalid.message).toBe(t('error.prjInvalidCutRatio'))

    patchProject(project.id, { phase: 'LAUNCHED' })
    const terminal = useGameStore.getState().descopeProject(project.id, 0.2)
    expect(terminal.errorCode).toBe('PRJ_SCOPE_TERMINAL')
    expect(terminal.message).toBe(t('error.prjScopeTerminal'))

    patchProject(project.id, { phase: 'PRODUCTION', scopeCutRatio: 0 })
    expect(useGameStore.getState().descopeProject(project.id, 0.2).success).toBe(true)
    expect(useGameStore.getState().descopeProject(project.id, 0.3).success).toBe(true)

    const capped = useGameStore.getState().descopeProject(project.id, 0.1)
    expect(capped.errorCode).toBe('PRJ_MAX_DESCIPE_REACHED')
    expect(capped.message).toBe(t('error.prjMaxDescopeReached'))
  })

  it('V12-3 delay 真实命令三码', () => {
    const project = bootProject()

    const invalid = useGameStore.getState().delayLaunch(project.id, 45)
    expect(invalid.errorCode).toBe('PRJ_INVALID_DELAY_DAYS')
    expect(invalid.message).toBe(t('error.prjInvalidDelayDays'))

    patchProject(project.id, { phase: 'LAUNCHED' })
    const terminal = useGameStore.getState().delayLaunch(project.id, 30)
    expect(terminal.errorCode).toBe('PRJ_LAUNCH_DELAY_TERMINAL')
    expect(terminal.message).toBe(t('error.prjLaunchDelayTerminal'))

    patchProject(project.id, { phase: 'PRODUCTION' })
    expect(useGameStore.getState().delayLaunch(project.id, 30).success).toBe(true)
    expect(useGameStore.getState().delayLaunch(project.id, 60).success).toBe(true)

    const capped = useGameStore.getState().delayLaunch(project.id, 30)
    expect(capped.errorCode).toBe('PRJ_LAUNCH_DELAY_EXCEEDS_MAX')
    expect(capped.message).toBe(t('error.prjLaunchDelayExceedsMax'))
  })

  it('V12-4 招聘/解雇/立项/上市真实码', () => {
    bootProject()
    const hire = (name: string, skill: number, salary: number) =>
      useGameStore.getState().hireEmployee(name, 'programmer', skill, salary)

    expect(hire('BadSalary', 3, 0).error).toBe(t('error.invalidSalary'))
    expect(hire('BadSkill', Number.NaN, 100_000).error).toBe(t('error.invalidSkill'))
    expect(hire('NoCash', 3, 1_000_000_000).error).toBe(t('error.insufficientCash'))

    expect(hire('Worker', 3, 100_000).error).toBeUndefined()
    const employee = useGameStore.getState().employees[0]
    if (!employee) throw new Error('招聘未产出员工')
    expect(useGameStore.getState().fireEmployee(employee.id).success).toBe(true)
    const fired = useGameStore.getState().fireEmployee(employee.id)
    expect(fired.message).toBe(t('error.employeeAlreadyTerminated'))

    const badPlatform = useGameStore.getState().createProject({
      name: 'Bad Platform',
      genreId: 'action',
      budgetTotalCapCents: 1_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['not_a_platform'],
    })
    expect(badPlatform.error).toBe(t('error.platformUnavailable'))

    const gw = useGameStore.getState().game!
    const company = gw.world.companies.find((c) => c.isPlayer)!
    company.status = 'bankrupt'
    expect(hire('Bankrupt', 3, 100_000).error).toBe(t('error.finCompanyBankrupt'))

    // 上市：独立重置一个 active 公司，逐码驱动
    const ready = bootProject()
    const gwReady = useGameStore.getState().game!
    const notReady = useGameStore.getState().launchProject(ready.id)
    expect(notReady.message).toBe(t('error.prjNotReady'))

    patchProject(ready.id, { phase: 'READY_TO_LAUNCH', isPaused: true })
    expect(useGameStore.getState().launchProject(ready.id).message).toBe(t('error.prjPaused'))

    patchProject(ready.id, {
      phase: 'READY_TO_LAUNCH',
      isPaused: false,
      workTotalByDiscipline: { ...ready.workTotalByDiscipline, qa: 40 },
      workRemainingByDiscipline: { ...ready.workRemainingByDiscipline, qa: 20 },
    })
    expect(useGameStore.getState().launchProject(ready.id).message).toBe(t('error.prjQaIncomplete'))

    const current = useGameStore.getState().projects.find((p) => p.id === ready.id)!
    patchProject(ready.id, {
      phase: 'READY_TO_LAUNCH',
      isPaused: false,
      plannedLaunchDay: 0,
      workTotalByDiscipline: { ...current.workTotalByDiscipline, qa: 40 },
      workRemainingByDiscipline: { ...current.workRemainingByDiscipline, qa: 0 },
    })
    gwReady.world.products.push({ sourceProjectId: ready.id } as Product)
    expect(useGameStore.getState().launchProject(ready.id).message).toBe(t('error.prjProductExists'))

    const spy = vi
      .spyOn(gwReady, 'launchProject')
      .mockReturnValue({ success: false, errorCode: 'PRJ_INVALID_TRANSITION', message: 'RAW_DOMAIN_TEXT' })
    expect(useGameStore.getState().launchProject('any-project').message).toBe(
      t('error.prjInvalidTransition'),
    )
    spy.mockRestore()
  })

  it('V12-5 未命中回退', () => {
    resetStore()
    const gw = useGameStore.getState().game!
    const spy = vi
      .spyOn(gw, 'descopeProject')
      .mockReturnValue({ success: false, errorCode: 'SOMETHING_NEW' })
    expect(useGameStore.getState().descopeProject('any-project', 0.2).message).toBe(
      t('error.unknown'),
    )
    expect(lastToast()).toBe(t('error.unknown'))

    spy.mockReturnValue({ success: false, errorCode: 'SOMETHING_NEW', message: 'RAW_DOMAIN_TEXT' })
    expect(useGameStore.getState().descopeProject('any-project', 0.2).message).toBe(
      'RAW_DOMAIN_TEXT',
    )
    spy.mockRestore()
  })

  it('V12-6 成功 toast 占位符', () => {
    const project = bootProject()
    patchProject(project.id, { scopeCutRatio: 0.1 })
    const descoped = useGameStore.getState().descopeProject(project.id, 0.2)
    expect(descoped.success).toBe(true)
    const expectedDescope = t('project.descope.success')
      .replace('{pct}', '20')
      .replace('{total}', '30')
    expect(descoped.message).toBe(expectedDescope)
    expect(lastToast()).toBe(expectedDescope)

    const delayed = useGameStore.getState().delayLaunch(project.id, 30)
    expect(delayed.success).toBe(true)
    const expectedDelay = t('project.delay.success')
      .replace('{day}', formatDay(230))
      .replace('{penalty}', '1')
    expect(delayed.message).toBe(expectedDelay)
    expect(lastToast()).toBe(expectedDelay)

    const gw = useGameStore.getState().game!
    gw.world.companies.find((c) => c.isPlayer)!.status = 'bankrupt'
    const bankruptDelay = useGameStore.getState().delayLaunch(project.id, 30)
    expect(bankruptDelay.success).toBe(true)
    const expectedNoBrand = t('project.delay.successNoBrand').replace('{day}', formatDay(260))
    expect(bankruptDelay.message).toBe(expectedNoBrand)
    expect(bankruptDelay.message).not.toContain('{penalty}')
    expect(lastToast()).toBe(expectedNoBrand)
  })
})
