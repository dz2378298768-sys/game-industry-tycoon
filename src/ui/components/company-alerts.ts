import { TUNING } from '@content/tuning'
import type { Company } from '@domain/entities/company'

/** 公司现金等级（DESIGN-UI-LAYER §2.1） */
export type CashLevel = 'safe' | 'warning' | 'bankrupt' | 'dissolved'

export type CompanyBannerKind = 'none' | 'cash_warning' | 'bankrupt' | 'dissolved'

export interface CompanyBanner {
  kind: CompanyBannerKind
  /** 当前现金（美分），用于 L1/L2 文案 */
  amountCents: number
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

/** 槽位 A 单条横幅：同一时刻最多一条，L2 抑制 L1 */
export function selectCompanyBanner(company: Company | null | undefined): CompanyBanner {
  const level = selectCashLevel(company)
  const amountCents = company?.cashBalanceCents ?? 0
  switch (level) {
    case 'dissolved':
      return { kind: 'dissolved', amountCents }
    case 'bankrupt':
      return { kind: 'bankrupt', amountCents }
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
