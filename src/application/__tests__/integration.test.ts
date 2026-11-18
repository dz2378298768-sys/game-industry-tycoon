import { describe, it, expect } from 'vitest'
import { GameWorld } from '@application/mediators/game-world'
import { isQaComplete } from '@simulation/systems/project-progress'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

const PLANNED_LAUNCH_DAY = 200

function buildStudio() {
  const gw = new GameWorld(123)
  const company = gw.createCompany({ name: 'Vertical Slice Studios', cityId: 'san_francisco' })
  const initialCash = company.cashBalanceCents

  const roles = [
    { name: '程序员小李', role: 'programmer' as const },
    { name: '设计师小王', role: 'designer' as const },
    { name: '美术师小张', role: 'artist' as const },
    { name: '测试员小赵', role: 'qa' as const },
  ]
  const hired = roles.map(r =>
    gw.hireEmployee({
      name: r.name,
      role: r.role,
      skillLevel: 3,
      salaryMonthlyCents: 50_000,
    }),
  )
  return { gw, company, hired, initialCash }
}

describe('M1.1 完整集成闭环', () => {
  it('创建公司 → 招聘 → 立项 → 分配 → 研发 → QA → 上市 → 存档', () => {
    const { gw, company, hired, initialCash } = buildStudio()

    // 1. 1970 年创建公司
    expect(company.foundingDay).toBe(0)
    expect(gregorianToDayIndex(1970, 1, 1)).toBe(0)
    expect(initialCash).toBe(5_000_000)
    expect(company.brand).toBe(10)

    // 2. 招聘四人
    expect(hired.every(h => h.success)).toBe(true)

    // 3. 立项
    const created = gw.createProject({
      name: 'Arcade Pioneer',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: PLANNED_LAUNCH_DAY,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    expect(created.success).toBe(true)
    const projectId = created.result?.id
    if (!projectId) throw new Error('project not created')

    // 4. 进入制作阶段
    expect(gw.advanceProjectPhase(projectId).success).toBe(true) // CONCEPT → PRE_PRODUCTION
    expect(gw.advanceProjectPhase(projectId).success).toBe(true) // PRE_PRODUCTION → PRODUCTION

    // 5. 分配全员
    for (const h of hired) {
      const emp = h.result
      if (!emp) continue
      const assign = gw.assignEmployeeToProject(emp.id, projectId, 1, 'generalist')
      expect(assign.success).toBe(true)
    }

    // 6. 推进研发
    gw.advanceSimulation(220)
    const afterDev = gw.world.projects.find(p => p.id === projectId)
    expect(afterDev).toBeDefined()
    if (!afterDev) return

    expect(afterDev.workRemainingByDiscipline.programming).toBeLessThan(
      afterDev.workTotalByDiscipline.programming,
    )
    expect(afterDev.phase).toBe('READY_TO_LAUNCH')
    expect(isQaComplete(afterDev)).toBe(true)
    expect(afterDev.initialDefectLevel).toBeGreaterThanOrEqual(0)

    // 7. 上市
    expect(gw.calendar.currentDayIndex).toBeGreaterThanOrEqual(PLANNED_LAUNCH_DAY)
    const launched = gw.launchProject(projectId)
    expect(launched.success).toBe(true)
    const product = launched.result
    expect(product).toBeDefined()
    if (!product) return

    expect(product.sourceProjectId).toBe(projectId)
    expect(product.launchPriceCents).toBeNull()
    expect(product.launchDay).toBe(gw.calendar.currentDayIndex)
    expect(product.defectLevel).toBeGreaterThanOrEqual(0)
    expect(product.defectLevel).toBeLessThanOrEqual(100)

    const launchedProject = gw.world.projects.find(p => p.id === projectId)
    expect(launchedProject?.phase).toBe('LAUNCHED')
    expect(launchedProject?.actualLaunchDay).toBe(gw.calendar.currentDayIndex)

    // 8. 财务流水与现金一致
    const liveCompany = gw.world.companies.find(c => c.id === company.id)
    if (!liveCompany) throw new Error('company lost')
    const txs = gw.finance.getTransactionsByCompany(liveCompany.id)
    const sum = txs.reduce((acc, tx) => acc + tx.amountCents, 0)
    expect(sum).toBe(liveCompany.cashBalanceCents)
    expect(txs.some(tx => tx.category === 'salary')).toBe(true)

    // 9. 存档 / 读档
    const serialized = gw.serialize()
    const restored = new GameWorld(123)
    restored.restore(structuredClone(serialized))

    expect(restored.calendar.currentDayIndex).toBe(gw.calendar.currentDayIndex)
    expect(restored.world.employees).toHaveLength(gw.world.employees.length)
    expect(restored.world.projects[0]?.phase).toBe('LAUNCHED')
    expect(restored.world.products).toHaveLength(1)
    expect(restored.finance.getCashBalance(liveCompany.id)).toBe(liveCompany.cashBalanceCents)
  })
})

describe('非法操作必须被拒绝且不破坏世界状态', () => {
  it('未到计划日期不能上市', () => {
    const { gw, hired } = buildStudio()
    const created = gw.createProject({
      name: 'Early',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 500,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const pid = created.result?.id
    if (!pid) throw new Error('no project')

    gw.advanceProjectPhase(pid)
    gw.advanceProjectPhase(pid)
    for (const h of hired) {
      if (h.result) gw.assignEmployeeToProject(h.result.id, pid, 1, 'generalist')
    }
    gw.advanceSimulation(260)

    const before = gw.world.projects.find(p => p.id === pid)?.phase
    const res = gw.launchProject(pid)
    expect(res.success).toBe(false)
    expect(gw.world.projects.find(p => p.id === pid)?.phase).toBe(before)
  })

  it('不满足阶段条件时强行推进被拒绝', () => {
    const { gw } = buildStudio()
    const created = gw.createProject({
      name: 'Fresh',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const pid = created.result?.id
    if (!pid) throw new Error('no project')

    // CONCEPT 阶段没有可推进的工作量，直接进入 QA 是不合法的
    const res = gw.launchProject(pid)
    expect(res.success).toBe(false)
    expect(gw.world.projects.find(p => p.id === pid)?.phase).toBe('CONCEPT')
  })

  it('暂停已上市项目被拒绝', () => {
    const gw = new GameWorld(1)
    gw.createCompany({ name: 'X', cityId: 'san_francisco' })
    const project = gw.createProject({
      name: 'Done',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 0,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const pid = project.result?.id
    if (!pid) throw new Error('no project')
    // 强制设为已上市以测试守卫
    const p = gw.world.projects.find(x => x.id === pid)
    if (p) p.phase = 'LAUNCHED'

    expect(gw.toggleProjectPause(pid).success).toBe(false)
    expect(gw.cancelProject(pid).success).toBe(false)
  })

  it('给不属于公司的员工分配项目被拒绝', () => {
    const { gw } = buildStudio()
    const created = gw.createProject({
      name: 'Foreign',
      genreId: 'action',
      budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200,
      targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const pid = created.result?.id
    if (!pid) throw new Error('no project')

    gw.world.employees.push({
      ...gw.world.employees[0]!,
      id: 'foreign-emp',
      companyId: 'other-company',
      name: 'Foreigner',
    })
    const res = gw.assignEmployeeToProject('foreign-emp', pid, 1, 'generalist')
    expect(res.success).toBe(false)
  })

  it('超过员工分配比例上限被拒绝', () => {
    const { gw, hired } = buildStudio()
    const p1 = gw.createProject({
      name: 'P1', genreId: 'action', budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200, targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    }).result
    const p2 = gw.createProject({
      name: 'P2', genreId: 'action', budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200, targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    }).result
    const emp = hired[0]?.result
    if (!p1 || !p2 || !emp) throw new Error('setup failed')

    expect(gw.assignEmployeeToProject(emp.id, p1.id, 0.8, 'generalist').success).toBe(true)
    const res = gw.assignEmployeeToProject(emp.id, p2.id, 0.5, 'generalist')
    expect(res.success).toBe(false)
  })

  it('对同一操作重复提交不会重复生效', () => {
    const { gw, hired } = buildStudio()
    const created = gw.createProject({
      name: 'Dup', genreId: 'action', budgetTotalCapCents: 3_000_000,
      plannedLaunchDay: 200, targetPlatformIds: ['arcade_pre_1975'],
      audienceSegmentIds: ['arcade_enthusiasts'],
    })
    const pid = created.result?.id
    const emp = hired[0]?.result
    if (!pid || !emp) throw new Error('setup failed')

    expect(gw.assignEmployeeToProject(emp.id, pid, 1, 'generalist').success).toBe(true)
    const dup = gw.assignEmployeeToProject(emp.id, pid, 1, 'generalist')
    expect(dup.success).toBe(false)
    expect(gw.world.projects.find(p => p.id === pid)?.teamAssignments).toHaveLength(1)
  })
})
