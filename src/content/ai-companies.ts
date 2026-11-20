/**
 * AI 公司内容与生成（DECISION-M3-P0-AI-003 §2）。
 *
 * 规则：
 *   - 入场年、画像、城市来自 `ai-companies.json`，不得在代码里散落。
 *   - 画像只决定起始现金/团队/品牌/预算上限，不进入销量、质量、现金结算。
 *   - 生成是纯函数：同 (specs, dayIndex) 必得同一结果；重复入场按 id 幂等。
 */
import aiCompaniesRaw from './ai-companies.json'
import { TUNING } from '@content/tuning'
import { createNewCompany, type Company } from '@domain/entities/company'
import type { CompanyPersona } from '@domain/enums'
import { citySalaryMultiplier } from '@content/queries'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'

export interface AiCompanySpec {
  id: string
  name: string
  persona: CompanyPersona
  cityId: string
  entryYear: number
}

export const AI_COMPANIES: readonly AiCompanySpec[] = aiCompaniesRaw as AiCompanySpec[]

/** 1970-01-01 的 dayIndex 0；入场日固定在当年 1 月 1 日，避免月内抖动 */
export function entryDayIndex(spec: AiCompanySpec): number {
  return gregorianToDayIndex(spec.entryYear, 1, 1)
}

export function aiCompanyId(spec: AiCompanySpec): string {
  return `ai-${spec.id}`
}

/** 生成一家 AI 公司（不含员工/项目，二者由后续批次接入） */
export function createAiCompany(spec: AiCompanySpec, dayIndex: number): Company {
  const profile = TUNING.ai.persona[spec.persona]
  const monthlySalary = TUNING.employee.defaultStartingSalaryCents * citySalaryMultiplier(spec.cityId)
  const monthlyFixed = Math.round(profile.teamSize * monthlySalary + TUNING.company.baseMonthlyRentCents)
  const company = createNewCompany({
    id: aiCompanyId(spec),
    name: spec.name,
    cityId: spec.cityId,
    foundingDay: dayIndex,
    cashCents: profile.startingCashCents,
    brand: profile.brand,
    monthlyFixedExpenseCents: monthlyFixed,
  })
  return {
    ...company,
    isPlayer: false,
    persona: spec.persona,
    managementCapacity: profile.teamSize + 2,
    growthStage:
      spec.persona === 'indie' ? 'startup' : spec.persona === 'genre_specialist' ? 'small_studio' : 'mid_publisher',
  }
}

/**
 * 把「今日应入场」的公司并入现有列表。
 * 幂等：已存在同 id 的公司不重复生成；返回顺序按 spec 原序（保证确定性）。
 */
export function seedDueAiCompanies(
  companies: readonly Company[],
  dayIndex: number,
): { companies: Company[]; seeded: Company[] } {
  const existing = new Set(companies.map((c) => c.id))
  const seeded: Company[] = []
  for (const spec of AI_COMPANIES) {
    const due = entryDayIndex(spec) <= dayIndex
    if (!due) continue
    const id = aiCompanyId(spec)
    if (existing.has(id)) continue
    const company = createAiCompany(spec, dayIndex)
    seeded.push(company)
    existing.add(id)
  }
  if (seeded.length === 0) return { companies: [...companies], seeded }
  return { companies: [...companies, ...seeded], seeded }
}
