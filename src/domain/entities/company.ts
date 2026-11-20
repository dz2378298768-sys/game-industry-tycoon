import type { GrowthStage, CompanyStatus, CompanyPersona } from '@domain/enums'

export interface Company {
  id: string
  name: string
  foundingDay: number              // dayIndex
  cityId: string
  industryStartYear: number
  brand: number                    // 0-100
  technologyCapacity: number       // 0-100
  managementCapacity: number       // 0-100
  cashBalanceCents: number         // 整数分
  growthStage: GrowthStage
  isPlayer: boolean
  /** 仅 AI 公司：独立工作室 / 类型专精 / 综合研发发行（DECISION-M3-P0-AI-003 §2） */
  persona?: CompanyPersona
  status: CompanyStatus
  /** 破产起算日：破产时写入，恢复时清除；旧档缺失按读档日回填（ENDGAME-002 §D6） */
  bankruptSinceDay?: number
  monthlyFixedExpenseCents: number // TUNING: salary+rent 月合计
  officeLevel: number
  version: number
  createdAt: number
  updatedAt: number
}

export function createNewCompany(params: {
  id: string
  name: string
  cityId: string
  foundingDay: number
  cashCents?: number
  brand?: number
  technologyCapacity?: number
  managementCapacity?: number
  monthlyFixedExpenseCents?: number
}): Company {
  return {
    id: params.id,
    name: params.name,
    foundingDay: params.foundingDay,
    cityId: params.cityId,
    // 行业起始年占位：使用 1970（DayIndex=0 对应年）
    industryStartYear: 1970,
    brand: params.brand ?? 10,
    technologyCapacity: params.technologyCapacity ?? 10,
    managementCapacity: params.managementCapacity ?? 15,
    cashBalanceCents: params.cashCents ?? 5_000_000, // $50,000 基线
    growthStage: 'startup',
    isPlayer: true,
    status: 'active',
    monthlyFixedExpenseCents:
      params.monthlyFixedExpenseCents ?? 350_000, // $3,500/月 基线
    officeLevel: 1,
    version: 1,
    createdAt: params.foundingDay,
    updatedAt: params.foundingDay,
  }
}
