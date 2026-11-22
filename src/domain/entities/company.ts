import type { BankruptcyPhase, GrowthStage, CompanyStatus, CompanyPersona } from '@domain/enums'

export interface CompanyAssetSale {
  assetId: string
  buyerId: string
  priceCents: number
  day: number
}

export interface Company {
  id: string
  name: string
  foundingDay: number              // dayIndex
  cityId: string
  industryStartYear: number
  brand: number                    // 0-100
  technologyCapacity: number       // 0-100
  managementCapacity: number       // 0-100
  /**
   * 整数分。CODE-08 类型层封口（R8）：对**外部代码只读**——现金唯一事实源是
   * `UnifiedLedger`（INV-1：本字段 == Σ 全部 amountCents），本字段只是兼容展示快照。
   * 运行期唯一合法写路径：`writeCompanyCashBalance`（账本派生回写，见下）；
   * 存档 hydrate / spread 重建（`{ ...c, cashBalanceCents }`）属对象字面量构造，不在此限。
   */
  readonly cashBalanceCents: number
  growthStage: GrowthStage
  isPlayer: boolean
  /** 仅 AI 公司：独立工作室 / 类型专精 / 综合研发发行（DECISION-M3-P0-AI-003 §2） */
  persona?: CompanyPersona
  status: CompanyStatus
  /** 破产起算日：破产时写入，恢复时清除；旧档缺失按读档日回填（ENDGAME-002 §D6） */
  bankruptSinceDay?: number
  /** 重整/收缩子阶段；仅 status='bankrupt' 时有值 */
  bankruptcyPhase?: BankruptcyPhase
  restructuringStartedDay?: number
  restructuringDeadlineDay?: number
  restructuringExtended?: boolean
  /** 破产当日现金，用于 90 天延长条件 */
  restructuringStartCashCents?: number
  /** 破产当日固定月支出，用于“真实降本 ≥10%”判定 */
  restructuringStartFixedCents?: number
  assetSales?: CompanyAssetSale[]
  monthlyFixedExpenseCents: number // TUNING: salary+rent 月合计
  officeLevel: number
  version: number
  createdAt: number
  updatedAt: number
}

/**
 * CODE-08（R8）：`Company.cashBalanceCents` 的**唯一运行期写入口**。
 * 仅限账本派生回写（调用方：`FinanceService.syncCash`；测试夹具播种亦可复用）。
 * 业务代码若绕过本函数直改该字段，typecheck 直接报错（TS2540：readonly）——
 * 与运行期 fail-loud（`FIN_CASH_MISMATCH`）构成"类型层 + 运行层"双层防线。
 */
export function writeCompanyCashBalance(
  company: Pick<Company, 'id' | 'cashBalanceCents'>,
  cashBalanceCents: number,
): void {
  ;(company as { cashBalanceCents: number }).cashBalanceCents = cashBalanceCents
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
