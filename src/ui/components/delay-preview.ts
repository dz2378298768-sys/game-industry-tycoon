import type { Company } from '@domain/entities/company'
import type { Project } from '@domain/entities/project'
import type { Employee } from '@domain/entities/employee'
import { TUNING } from '@content/tuning'
import { getCity } from '@content/queries'

/** 选择延期时点的最大 plannedLaunchDay（DESIGN-C-02 §2.3）：original × 1.5 */
export function selectMaxLaunchDay(project: Project): number {
  const base =
    project.originalPlannedLaunchDay !== null && project.originalPlannedLaunchDay !== undefined
      ? project.originalPlannedLaunchDay
      : project.plannedLaunchDay
  return Math.round(base * 1.5)
}

/** 品牌惩罚 = 0.6 + 0.1×(days/30)，30 天 → 0.70（保留 2 位小数） */
export function computeBrandPenalty(days: number): number {
  return Math.round((0.6 + 0.1 * (days / 30)) * 100) / 100
}

export interface DelayPreview {
  days: number
  originalLaunchDay: number
  newLaunchDay: number
  maxLaunchDay: number
  brandPenalty: number
  /** = brand × brandPenalty；幂等，不随选中档位变化 */
  applyPenalty: number
  newBrand: number
  extraMonths: number
  extraBurnCents: number
  predictedCashCents: number
}

/**
 * 延期上市实时预览（DESIGN-C-02 §3 / DESIGN-UI-LAYER §2.5）。
 * applyPenalty 固定用 0.7 档（不吃选择偏差）；现金预测标注"估算值"由 UI 负责。
 */
export function computeDelayPreview(
  project: Project,
  company: Company,
  employees: Employee[],
  days: number,
): DelayPreview {
  const salary = employees
    .filter((e) => e.companyId === company.id && e.status === 'hired')
    .reduce((sum, e) => sum + e.salaryMonthlyCents, 0)
  const rent =
    TUNING.company.baseMonthlyRentCents *
    (getCity(company.cityId)?.officeRentMultiplier ?? 1) *
    Math.max(1, company.officeLevel)
  const monthlyBurn =
    company.monthlyFixedExpenseCents > 0 ? company.monthlyFixedExpenseCents : salary + rent
  const extraMonths = days / 30
  const extraBurnCents = Math.round(monthlyBurn * extraMonths)
  const brandPenalty = computeBrandPenalty(days)
  const applyPenalty = Math.round(company.brand * 0.7 * 100) / 100

  return {
    days,
    originalLaunchDay: project.plannedLaunchDay,
    newLaunchDay: project.plannedLaunchDay + days,
    maxLaunchDay: selectMaxLaunchDay(project),
    brandPenalty,
    applyPenalty,
    newBrand: Math.max(0, Math.round((company.brand - applyPenalty) * 100) / 100),
    extraMonths,
    extraBurnCents,
    predictedCashCents: company.cashBalanceCents - extraBurnCents,
  }
}
