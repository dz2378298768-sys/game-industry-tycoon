import type { GrowthStage, CompanyStatus } from '@domain/enums'

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
  status: CompanyStatus
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
