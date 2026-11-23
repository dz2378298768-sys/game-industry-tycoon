/**
 * P1 UI TUNING（CODE-07B）——ADJ-12 / ADJ-16 裁定值在 UI 层的单一来源。
 *
 * 纪律（规格 G-5 / ADJ-12 裁定原则③）：
 *  - 本文件为 07B 专用分节，不改动 07A 已收敛的 content/tuning.ts；
 *  - 每个值标注裁定来源；数值未定值一律标 NUMERIC_PENDING_P2 且以 null 占位，
 *    页面按 fail-closed 显示"数值待标定"，禁止臆造终值（ADJ-16 R-5）；
 *  - UI / 页面代码零硬编码，一律读本文件。
 */
export const P1_UI_TUNING = {
  dataStatus: 'TUNING' as const,
  version: 1,

  /** ADJ-12 S2-1 / ADJ-16 R-4：单次市场调研费用 $5,000 = 500_000 cents；复用 FIN 12 类，不扩枚举。 */
  market: {
    researchCostCents: 500_000,
  },

  /** ADJ-12 S9-1 / ADJ-16 R-5：定价三档名称固定，数值待第五波数值 Agent 标定。 */
  delivery: {
    pricingTiers: [
      { id: 'low', labelKey: 'deliver.pricing.low', priceCents: null, status: 'NUMERIC_PENDING_P2' },
      { id: 'medium', labelKey: 'deliver.pricing.medium', priceCents: null, status: 'NUMERIC_PENDING_P2' },
      { id: 'high', labelKey: 'deliver.pricing.high', priceCents: null, status: 'NUMERIC_PENDING_P2' },
    ],
    /** ADJ-12 S9-2：营销预算档 × 单渠道；3 档预算数值待标定。 */
    marketingBudgetTiers: [
      { id: 'low', labelKey: 'deliver.marketing.low', dailyBudgetCents: null, status: 'NUMERIC_PENDING_P2' },
      { id: 'medium', labelKey: 'deliver.marketing.medium', dailyBudgetCents: null, status: 'NUMERIC_PENDING_P2' },
      { id: 'high', labelKey: 'deliver.marketing.high', dailyBudgetCents: null, status: 'NUMERIC_PENDING_P2' },
    ],
  },

  /** ADJ-16 R-1：媒体评价聚合卡滑动窗口 N=10（TUNING 占位，P2 校准）。 */
  review: {
    mediaWindowN: 10,
  },
} as const

export type P1UiTuning = typeof P1_UI_TUNING
