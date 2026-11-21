/**
 * §3.9 / FIN-T1：现金流三分映射与金额方向（TUNING 注入，公式层不硬编码）。
 */
import type { CashFlowType } from '@domain/entities/finance'
import type { TransactionCategory } from '@domain/enums'
import type { FinanceTuning } from './finance-tuning'

/** category → cashFlowType；映射表来自注入的 TUNING 快照（FIN-T1）。 */
export function resolveCashFlowType(
  category: TransactionCategory,
  tuning: FinanceTuning,
): CashFlowType {
  return tuning.cashFlowTypeByCategory[category]
}

/** 金额符号方向（正=流入，负=流出）；零额由账本入口拒绝。 */
export function cashDirection(amountCents: number): 'inflow' | 'outflow' {
  return amountCents > 0 ? 'inflow' : 'outflow'
}

/**
 * 现金流三分汇总（§9.2 经营/投资/融资三栏）。按 amountCents 有符号求和，
 * 退款/冲销产生的反向交易自然抵消，不重复计数（F-01）。
 */
export function summarizeCashFlow(
  transactions: ReadonlyArray<{ category: TransactionCategory; amountCents: number }>,
  tuning: FinanceTuning,
): Record<CashFlowType, number> {
  const result: Record<CashFlowType, number> = { operating: 0, investing: 0, financing: 0 }
  for (const tx of transactions) {
    const type = resolveCashFlowType(tx.category, tuning)
    result[type] += tx.amountCents
  }
  return result
}
