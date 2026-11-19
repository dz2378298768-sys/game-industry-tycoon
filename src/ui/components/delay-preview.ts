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

/** 品牌惩罚（点数）：max(1, round(days/30))，30/60/90 → 1/2/3 */
export function computeBrandPenalty(days: number): number {
  return Math.max(1, Math.round(days / 30))
}

export interface DelayPreview {
  days: number
  originalLaunchDay: number
  newLaunchDay: number
  maxLaunchDay: number
  brandPenalty: number
  /** 实际扣减点数：仅 active 公司扣减，破产期为 0 */
  applyPenalty: number
  newBrand: number
  extraMonths: number
  extraBurnCents: number
  predictedCashCents: number
}

/**
 * 延期上市实时预览（DESIGN-C-02 §3 / DESIGN-UI-LAYER §2.5）。
 * 品牌扣减按延期点数（仅 active 公司）；额外消耗 =（在职月薪 + 月租）× 延期月数。
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
  const rent = Math.round(
    TUNING.company.baseMonthlyRentCents *
      (getCity(company.cityId)?.officeRentMultiplier ?? 1) *
      Math.max(1, company.officeLevel),
  )
  const extraMonths = Math.ceil(days / 30)
  const extraBurnCents = (salary + rent) * extraMonths
  const brandPenalty = computeBrandPenalty(days)
  const applyBrand = company.status === 'active'
  const applyPenalty = applyBrand ? brandPenalty : 0
  const newBrand = applyBrand ? Math.max(0, company.brand - brandPenalty) : company.brand

  return {
    days,
    originalLaunchDay: project.plannedLaunchDay,
    newLaunchDay: project.plannedLaunchDay + days,
    maxLaunchDay: selectMaxLaunchDay(project),
    brandPenalty,
    applyPenalty,
    newBrand,
    extraMonths,
    extraBurnCents,
    predictedCashCents: company.cashBalanceCents - extraBurnCents,
  }
}
