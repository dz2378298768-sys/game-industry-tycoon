import { TUNING } from '@content/tuning'
import type { Company } from '@domain/entities/company'
import type { CrisisReasonCode } from '@domain/entities/finance'

/** 公司现金等级（DESIGN-UI-LAYER §2.1） */
export type CashLevel = 'safe' | 'warning' | 'bankrupt' | 'dissolved'

/** CODE-07A：横幅四分支（none / cash_warning / watch / critical / bankrupt / dissolved） */
export type CompanyBannerKind = 'none' | 'cash_warning' | 'watch' | 'critical' | 'bankrupt' | 'dissolved'

/**
 * 槽位 A 公司级危机投影（CrisisProjection）：
 * 由 game-world.getFinancialOverview() 注入；reasonCodes/runwayMonths 缺失时 fail-closed。
 */
export interface CrisisProjection {
  crisisLevel: 'watch' | 'warning' | 'critical' | 'bankrupt' | string
  reasonCodes: ReadonlyArray<CrisisReasonCode>
  runwayMonths: number
  cashBalanceCents: number
  availableCashCents: number
  committedCents: number
}

export interface CompanyBanner {
  kind: CompanyBannerKind
  /** 当前现金（美分），用于 L1/L2 文案 */
  amountCents: number
  /** 危机原因码（critical/watch 分支逐条展示） */
  reasonCodes?: ReadonlyArray<CrisisReasonCode> | undefined
  /** 公司级跑道（月），可能为 +∞ */
  runwayMonths?: number | undefined
  /** 可用现金（FIN §6.2 口径） */
  availableCashCents?: number | undefined
  /** 承诺占用 = max(0, cash − availableCash) */
  committedCents?: number | undefined
}

/** 破产自救恢复线：必须与引擎同一来源（TUNING），不得在本文件另写常量（M3-P0-1 修正） */
export const BANKRUPT_RECOVERY_HINT_CENTS = TUNING.finance.cashRecoveryThresholdCents

/** 现金等级归一：dissolved > bankrupt > warning > safe（不写回，每次渲染求值） */
export function selectCashLevel(company: Company | null | undefined): CashLevel {
  if (!company) return 'safe'
  if (company.status === 'dissolved') return 'dissolved'
  const warningAt = TUNING.finance.cashWarningThresholdCents
  const bankruptAt = TUNING.finance.cashBankruptThresholdCents
  if (company.status === 'bankrupt' || company.cashBalanceCents < bankruptAt) return 'bankrupt'
  if (company.cashBalanceCents < warningAt) return 'warning'
  return 'safe'
}

export function selectIsBankrupt(company: Company | null | undefined): boolean {
  return selectCashLevel(company) === 'bankrupt'
}

/**
 * 槽位 A 单条横幅：同一时刻最多一条。
 * 优先级（CODE-07A）：DISSOLVED > bankrupt（内核判定） > critical > cash_warning > watch > none。
 * 有 crisis 投影时按派生等级取分支；无投影时按旧现金口径兜底（不造数）。
 */
export function selectCompanyBanner(
  company: Company | null | undefined,
  crisis?: CrisisProjection | null,
): CompanyBanner {
  const amountCents = company?.cashBalanceCents ?? 0
  const level = selectCashLevel(company)

  // 内核 status 已置位破产/解散：GAME OVER / 解散优先（三条件 AND 由内核判定）
  if (level === 'dissolved') return { kind: 'dissolved', amountCents }
  if (level === 'bankrupt') {
    return {
      kind: 'bankrupt',
      amountCents,
      runwayMonths: crisis?.runwayMonths,
      availableCashCents: crisis?.availableCashCents,
      committedCents: crisis?.committedCents,
    }
  }

  // 有派生投影时：critical > cash_warning（warning 阈值）> watch
  if (crisis) {
    if (crisis.crisisLevel === 'critical' || crisis.crisisLevel === 'restructuring') {
      return {
        kind: 'critical',
        amountCents: crisis.cashBalanceCents,
        reasonCodes: crisis.reasonCodes,
        runwayMonths: crisis.runwayMonths,
        availableCashCents: crisis.availableCashCents,
        committedCents: crisis.committedCents,
      }
    }
    if (amountCents < TUNING.finance.cashWarningThresholdCents) {
      return { kind: 'cash_warning', amountCents }
    }
    if (crisis.crisisLevel === 'watch') {
      return {
        kind: 'watch',
        amountCents: crisis.cashBalanceCents,
        reasonCodes: crisis.reasonCodes,
        runwayMonths: crisis.runwayMonths,
        availableCashCents: crisis.availableCashCents,
        committedCents: crisis.committedCents,
      }
    }
    return { kind: 'none', amountCents }
  }

  // 无投影兜底：旧现金口径
  switch (level) {
    case 'warning':
      return { kind: 'cash_warning', amountCents }
    default:
      return { kind: 'none', amountCents }
  }
}

/** 横幅文案键（单源，页面不得自写现金分支文案） */
export const ALERT_KEY = {
  warningTitle: 'finance.cashWarning',
  warningThreshold: 'finance.cashWarning.threshold',
  warningHint: 'finance.cashWarning.hint',
  warningShort: 'finance.cashWarning.short',
  bankruptTitle: 'finance.bankrupt',
  bankruptHint: 'finance.bankrupt.hint',
  bankruptAllowed: 'finance.bankrupt.allowed',
  bankruptRecovery: 'finance.bankrupt.recovery',
  bankruptBadge: 'finance.bankrupt.badge',
  bankruptShort: 'finance.bankrupt.short',
  dissolvedTitle: 'finance.dissolved.title',
  viewDetails: 'finance.viewDetails',
} as const
