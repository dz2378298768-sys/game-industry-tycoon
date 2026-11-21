import { describe, expect, it } from 'vitest'
import { ProjectService } from '@simulation/services/project-service'
import { GameWorld } from '@application/mediators/game-world'
import { computeDescopePreview } from '@ui/components/descope-preview'
import { computeDelayPreview } from '@ui/components/delay-preview'
import type { Project } from '@domain/entities/project'
import { makeCompany, makeEmployee, makeUiProject } from './fixtures'

// V13：UI 预览与真实 ProjectService 的 parity（TASK-M1.2-UI-PARITY-FIX v1.2 F6）。
// 一律使用同一份项目快照分别驱动预览与命令，禁止预览公式与领域公式各写一套而不校验。

const DAILY = { design: 5, programming: 5, art: 5, qa: 5 }

function parityProject(overrides: Partial<Project> = {}): Project {
  return makeUiProject({
    phase: 'PRODUCTION',
    workTotalByDiscipline: { design: 103, programming: 105, art: 100, qa: 0 },
    workRemainingByDiscipline: { design: 93, programming: 105, art: 100, qa: 0 },
    qualityTargets: { gameplay: 60, technical: 60, content: 60, art: 60, innovation: 60 },
    scopeCutRatio: 0,
    plannedLaunchDay: 200,
    ...overrides,
  })
}

function descopeOnce(project: Project, cutRatio: number): Project {
  const service = new ProjectService()
  service.reset([project])
  const result = service.descope({ projectId: project.id, cutRatio, dayIndex: 1 })
  expect(result.success).toBe(true)
  const next = service.getById(project.id)
  if (!next) throw new Error('descope 后项目丢失')
  return next
}

describe('V13 descope/delay 预览与领域执行 parity（DESIGN-UI-LAYER v1.1 §2.4 / §2.5 / §8.1 V13）', () => {
  it('V13-1 descope total 与累计比例一致', () => {
    const project = parityProject({ scopeCutRatio: 0.1 })
    const preview = computeDescopePreview(project, DAILY, 0.2, 10_000)
    const next = descopeOnce(project, 0.2)
    for (const d of ['design', 'programming', 'art'] as const) {
      expect(preview.newTotal[d]).toBe(next.workTotalByDiscipline[d])
    }
    expect(preview.totalCut).toBe(next.scopeCutRatio)
    expect(preview.totalCut).toBeCloseTo(0.3, 10)
  })

  it('V13-2 descope remaining 一致', () => {
    const project = parityProject()
    const preview = computeDescopePreview(project, DAILY, 0.2, 10_000)
    const next = descopeOnce(project, 0.2)
    expect(preview.newRemaining.design).toBe(74)
    for (const d of ['design', 'programming', 'art'] as const) {
      expect(preview.newRemaining[d]).toBe(next.workRemainingByDiscipline[d])
    }
  })

  it('V13-3 descope QA 一致', () => {
    const project = parityProject()
    const preview = computeDescopePreview(project, DAILY, 0.3, 10_000)
    const next = descopeOnce(project, 0.3)
    expect(preview.newQaTotal).toBe(next.workTotalByDiscipline.qa)
    expect(preview.newQaRemaining).toBe(next.workRemainingByDiscipline.qa)
    expect(preview.newQaRemaining).toBe(preview.newQaTotal)
  })

  it('V13-4 descope 质量目标一致', () => {
    const project = parityProject()
    const preview = computeDescopePreview(project, DAILY, 0.2, 10_000)
    const next = descopeOnce(project, 0.2)
    for (const k of ['gameplay', 'technical', 'content', 'art', 'innovation'] as const) {
      expect(preview.newQuality[k]).toBe(next.qualityTargets[k])
    }
    const values = Object.values(next.qualityTargets)
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    expect(typeof preview.qualityCeiling).toBe('number')
    expect(preview.qualityCeiling).toBe(Math.round(mean))
  })

  it('V13-5 delay 新上市日/上限一致', () => {
    for (const days of [30, 60, 90]) {
      const project = parityProject()
      const preview = computeDelayPreview(project, makeCompany(), [], days)
      const service = new ProjectService()
      service.reset([project])
      const result = service.delayLaunch({ projectId: project.id, extraDays: days, dayIndex: 1 })
      expect(result.success).toBe(true)
      const next = result.result!.project
      expect(preview.newLaunchDay).toBe(next.plannedLaunchDay)
      expect(preview.newLaunchDay).toBe(200 + days)
      expect(preview.maxLaunchDay).toBe(300)
      expect(next.originalPlannedLaunchDay).toBe(200)
    }
  })

  it('V13-6 delay 品牌点数与实际差值一致', () => {
    const activeWorld = new GameWorld(11)
    const activeCompany = activeWorld.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    activeCompany.brand = 60
    activeWorld.world.projects = [{ ...parityProject() }]
    const activePreview = computeDelayPreview(
      activeWorld.world.projects[0]!,
      activeCompany,
      [],
      30,
    )
    expect(activePreview.brandPenalty).toBe(1)
    expect(activePreview.applyPenalty).toBe(1)
    expect(activePreview.newBrand).toBe(59)
    const brandBefore = activeCompany.brand
    expect(activeWorld.delayLaunch('p1', 30).success).toBe(true)
    expect(brandBefore - activeCompany.brand).toBe(activePreview.brandPenalty)

    // 独立路径：ProjectService 的 brandPenalty 与预览同值
    const service = new ProjectService()
    service.reset([parityProject()])
    const result = service.delayLaunch({ projectId: 'p1', extraDays: 30, dayIndex: 1 })
    expect(result.result!.brandPenalty).toBe(activePreview.brandPenalty)

    const bankruptWorld = new GameWorld(11)
    const bankruptCompany = bankruptWorld.createCompany({ name: 'Acme', cityId: 'san_francisco' })
    bankruptCompany.brand = 60
    bankruptCompany.status = 'bankrupt'
    bankruptWorld.world.projects = [{ ...parityProject() }]
    const bankruptPreview = computeDelayPreview(
      bankruptWorld.world.projects[0]!,
      bankruptCompany,
      [],
      30,
    )
    expect(bankruptPreview.applyPenalty).toBe(0)
    expect(bankruptPreview.newBrand).toBe(60)
    const bankruptBefore = bankruptCompany.brand
    expect(bankruptWorld.delayLaunch('p1', 30).success).toBe(true)
    expect(bankruptBefore - bankruptCompany.brand).toBe(0)
  })

  it('V13-7 delay 额外月数与消耗按 §2.5', () => {
    const company = makeCompany({ cashBalanceCents: 1_000_000, monthlyFixedExpenseCents: 300_000 })
    const employee = makeEmployee({ salaryMonthlyCents: 100_000 })
    for (const days of [30, 60, 90]) {
      const preview = computeDelayPreview(parityProject(), company, [employee], days)
      const months = Math.ceil(days / 30)
      expect(preview.extraMonths).toBe(months)
      expect(preview.extraBurnCents).toBe(310_000 * months)
      expect(preview.predictedCashCents).toBe(1_000_000 - 310_000 * months)
    }
  })

  it('V13-8 非档位输入的 extraMonths 契约', () => {
    const company = makeCompany({ cashBalanceCents: 1_000_000 })
    const employee = makeEmployee({ salaryMonthlyCents: 100_000 })
    const preview = computeDelayPreview(parityProject(), company, [employee], 40)
    expect(preview.extraMonths).toBe(2)
    expect(preview.extraBurnCents).toBe(620_000)
    expect(preview.predictedCashCents).toBe(380_000)
  })
})
