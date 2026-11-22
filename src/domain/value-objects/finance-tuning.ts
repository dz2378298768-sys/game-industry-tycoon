/**
 * 统一账本 TUNING / OPEN 参数（FIN V0.2 §6.4 / §3.5 / §6.1 / §6.3 / §8.4 / §12）。
 *
 * 纪律：
 *  1. 所有值均为"默认候选值（TUNING，待校准）"，不是终值（F-12）。
 *  2. 金额一律整数美分（cents），注释同时给出业务值（CODEBUDDY.md §13.1）。
 *  3. 公式层禁止硬编码，必须从注入的 FinanceTuning 读取；本文件是唯一默认值来源。
 *  4. OPEN 项不伪装为已定：只在注释登记，不进入计算/输出契约。
 */
import type { CashFlowType, Remedy } from '@domain/entities/finance'
import type { TransactionCategory as TxCategory } from '@domain/enums'

/** §3.9 FIN-T1：category → cashFlowType 默认候选映射（TUNING，待校准）。 */
export type CashFlowTypeMap = Record<TxCategory, CashFlowType>

export interface FinanceTuning {
  // ===== §6.4 预警阈值与滞后（默认候选值 TUNING） =====
  /** L1 现金警告线：跌破 → watch/warning + 横幅。400_000 cents = $4,000。来源 §6.4 / F-06。 */
  cashWarningThresholdCents: number
  /** 恢复线：**严格高于** warning 线，形成真实滞后带。600_000 cents = $6,000。来源 §6.4 / F-06。 */
  cashRecoveryThresholdCents: number
  /** L2 破产参考线：现金 < 0 即负现金 → critical。0 cents = $0。来源 §6.4 / F-03。 */
  cashBankruptThresholdCents: number
  /** 预算超支警告比例（消费 D-01 ratio）。1.0 = 100%。来源 §6.4。 */
  budgetOverrunWarnAt: number
  /**
   * 跑道低于此月数 → watch。重标定（ADJ-11 R-3）默认候选值 4.0 月。
   * 标定依据："玩家在真实 N 个月跑道时应收到预警"的推演——修复双重扣减后 runwayMonths
   * 即真实跑道：4.0 保证真实跑道一旦进入 4 个月内玩家必然收到预警（严格小于，恰 4.0 不触发）；
   * 给玩家留出完整的预警→决策（descope/裁员/融资）→见效的操作周期。
   * 来源 §6.4 / ADJ-11 R-3。
   */
  runwayWarningMonths: number
  /**
   * 跑道低于此月数 → critical。重标定（ADJ-11 R-3）默认候选值 2.0 月。
   * 标定依据：真实跑道 < 2 个月意味着按当前净烧正常运营两个月内现金耗尽，
   * 必须升级为 critical（开补救窗口、解锁全部补救动作），预留两个月的紧急缓冲；
   * 严格小于口径，恰 2.0 仅 watch。来源 §6.4 / ADJ-11 R-3。
   */
  runwayCriticalMonths: number
  /** critical 起补救窗口天数（必须有限）；重入不重置。默认候选值 60 天。来源 §6.4 / F-06 / ADJ-11 R-3。 */
  remediationWindowDays: number
  /** HRB 可行性结论 warn 阈值。1.0（D-01 §6.2.1 锚点，默认候选 TUNING）。来源 §6.4。 */
  hrbVerdictWarn: number
  /** HRB 可行性结论 cut 阈值。1.2（D-01 §6.2.1 锚点，默认候选 TUNING）。来源 §6.4。 */
  hrbVerdictCut: number

  // ===== §3.5 / §6.1 预测窗口 =====
  /** 预测窗口月数。默认候选值 6 月。来源 §3.5 / §6.1。 */
  horizonMonths: number

  // ===== §6.2 FIN-T2：可用现金是否计入高置信应收（TUNING，待校准） =====
  includeHighConfidenceReceivables: boolean
  /** 高置信阈值（confidence >= 该值才计入）。默认候选值 0.8。来源 §6.2 / FIN-T2。 */
  highConfidenceMin: number

  // ===== §6.3 FIN-T3：预测区间六系数（方向固定，取值 TUNING 默认候选值） =====
  /** 下行情景流入折扣（<1）。0.8。来源 §6.3 / F-05。 */
  pInLow: number
  /** 上行情景流入放大（>1）。1.2。来源 §6.3 / F-05。 */
  pInHigh: number
  /** 上行情景承诺支出折减（<1）。0.9。来源 §6.3 / F-05。 */
  pOutLow: number
  /** 下行情景承诺支出放大（>1）。1.1。来源 §6.3 / F-05。 */
  pOutHigh: number
  /** 上行情景应付折减（<1）。0.9。来源 §6.3 / F-05 / F-05 修正点②。 */
  pPayLow: number
  /** 下行情景应付放大（>1，原"折减"语义已修正）。1.2。来源 §6.3 / F-05。 */
  pPayHigh: number

  // ===== §8.4 补救动作代价（默认候选值 TUNING） =====
  /** 每人遣散费（cents）。500_000 cents = $5,000。默认候选值，来源 §8.4 severance 口径。 */
  severancePerEmployeeCents: number

  // ===== FIN-T1：现金流三分映射（可整体替换） =====
  cashFlowTypeByCategory: CashFlowTypeMap

  // ===== §12 幂等与重放参数 =====
  /** 幂等快索引保留天数（transactionByKey 不随之清理）。30 天。来源 BR-7 / §12。 */
  idempotencyRetentionDays: number
  /** replay 加载性能上限（FIN-T5，TUNING 待校准）。默认候选值 100_000 笔。来源 §12 / FIN-T5。 */
  replayMaxTransactions: number

  // ===== §11.3 / F-09 版本锚点 =====
  /** 预测公式版本（可注入，读档按此版本重算）。来源 §11.3 / OPEN-F4。 */
  formulaVersion: string
  /** 预测假设版本（可注入）。来源 §11.3 / OPEN-F4。 */
  assumptionsVersion: string
  /** 危机规则版本（随 CrisisState 持久化）。来源 §11.3 / F-09。 */
  crisisRulesVersion: string
}

/**
 * §3.9 FIN-T1 默认候选映射表（TUNING，待校准）。
 * contract_payment 收/付侧细分未定（OPEN-F1），默认统一 operating；
 * 实际借贷方向由 amountCents 符号决定，不在此表伪造细分。
 */
export const DEFAULT_CASH_FLOW_TYPE_MAP: CashFlowTypeMap = {
  salary: 'operating',
  office_rent: 'operating',
  marketing: 'operating',
  project_expense: 'operating',
  sales_revenue: 'operating',
  customer_refund: 'operating',
  platform_fee: 'operating',
  contract_payment: 'operating',
  tax: 'operating',
  advance: 'financing', // §3.9 P1 唯一融资流入
  severance: 'operating',
  asset_sale: 'investing',
}

/** 全部默认候选值（TUNING，待校准；无终值）。 */
export const DEFAULT_FINANCE_TUNING: FinanceTuning = {
  cashWarningThresholdCents: 400_000, // $4,000
  cashRecoveryThresholdCents: 600_000, // $6,000（严格 > warning）
  cashBankruptThresholdCents: 0, // $0
  budgetOverrunWarnAt: 1.0,
  runwayWarningMonths: 4, // ADJ-11 R-3 重标定（原 3）：真实跑道 4 个月内必预警
  runwayCriticalMonths: 2, // ADJ-11 R-3 重标定（原 1）：真实跑道 < 2 个月进 critical
  remediationWindowDays: 60, // 60 天补救窗口，自进入 critical 日起算
  hrbVerdictWarn: 1.0,
  hrbVerdictCut: 1.2,

  horizonMonths: 6,
  includeHighConfidenceReceivables: false,
  highConfidenceMin: 0.8,

  pInLow: 0.8,
  pInHigh: 1.2,
  pOutLow: 0.9,
  pOutHigh: 1.1,
  pPayLow: 0.9,
  pPayHigh: 1.2,

  severancePerEmployeeCents: 500_000, // $5,000/人（默认候选值）

  cashFlowTypeByCategory: DEFAULT_CASH_FLOW_TYPE_MAP,

  idempotencyRetentionDays: 30,
  replayMaxTransactions: 100_000,

  // ADJ-11：跑道公式语义变更（起点改 CashBalance + inclusionMode 三态 + 阈值重标定 4.0/2.0/60），版本随语义 bump
  formulaVersion: 'fin-formula-v0.3',
  assumptionsVersion: 'fin-assumptions-v0.2',
  crisisRulesVersion: 'fin-crisis-v0.2',
}

/**
 * 注入式部分覆盖（保留未指定默认值；映射表按项合并）。
 * 用于测试与 P2 校准；公式层不直接读本文件的默认值。
 */
export function withFinanceTuningOverrides(
  overrides: Partial<Omit<FinanceTuning, 'cashFlowTypeByCategory'>> & {
    cashFlowTypeByCategory?: Partial<CashFlowTypeMap>
  } = {},
): FinanceTuning {
  const base = DEFAULT_FINANCE_TUNING
  const merged: FinanceTuning = {
    ...base,
    ...overrides,
    cashFlowTypeByCategory: {
      ...base.cashFlowTypeByCategory,
      ...(overrides.cashFlowTypeByCategory ?? {}),
    },
  }
  return merged
}

/** 所有可用补救动作（"补救必须可执行"：列出动作 / 代价 / 风险，§8.4）。 */
export const ALL_REMEDIES: Remedy[] = [
  'descope',
  'pause_project',
  'cut_staff',
  'sublet_office',
  'terminate_contract',
  'sell_asset',
  'advance',
  'restructure',
]

/** 全部动作类别（用于现金流三分映射测试的 TUNING 注入断言）。 */
export const ALL_TRANSACTION_CATEGORIES: TxCategory[] = [
  'salary', 'office_rent', 'project_expense', 'marketing', 'sales_revenue',
  'customer_refund', 'platform_fee', 'contract_payment', 'tax', 'advance',
  'severance', 'asset_sale',
]

/**
 * OPEN 项登记（不实现为计算，不伪装为已定；FIN V0.2 §14 / F-01~F-12）：
 * - OPEN-F1 contract_payment 收/付侧三分细分：默认 operating，待 D-05。
 * - OPEN-F2 sandbox_observe 现有实现扩展与 M1.2 UI 对齐：本内核只给账本口径（frozen）。
 * - OPEN-F3 收入确认时点与总额/净额法：不锁定，以 Transaction 入账为确认标志。
 * - OPEN-F4 formulaVersion/assumptionsVersion 与 save-schema 对齐：本内核提供可注入字段。
 * - OPEN-F5 破产是否引入"连续 N 日负现金"：默认 <0 + 窗口耗尽（AND）。
 * - OPEN-F6 窗口到期但现金非负未达恢复线：沿用原 deadline，保持 critical。
 * - OPEN-F7 D-05 对退款冲回 platform_fee 的复核：默认按净额口径同步冲回。
 */
