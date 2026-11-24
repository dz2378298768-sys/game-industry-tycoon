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
    /** 07B-10：契合方向「定性分档展示规则」（非数值机会模型，ADJ-16 R-6）；单一来源，UI 零硬编码。 */
    affinityBandHigh: 0.8,
    affinityBandMedium: 0.6,
  },

  /**
   * ADJ-2026-11-24-26 A1~A6：定价/营销三档真实口径（解除 NUMERIC_PENDING_P2）。
   *  - 定价用动态倍率 factor × referencePriceCents(genre, platform, segment)，
   *    空组合/未知组合兜底 defaultReferencePriceCents = 2,999 cents（$29.99），
   *    UI 明示"按默认参考价估算"；factor 对齐既有 AI 定价锚点
   *    （ai-planner.ts:285 质量 0/50/100 分），落在权威夹逼带 [0.5,1.5]×ref 内。
   *  - 营销用固定绝对 cents（launch scale 50,000 cents = $500/天/渠道的 0.2×/1×/3×），
   *    三渠道同值（渠道差异由 CHANNEL_FACTOR 体现，不重复计价）；
   *    全部落在合法域 [1,000, 500,000] cents 内。
   *  - 任一档位选择必须在上市时经 setProductPrice/setMarketingBudget 写入内核（见 deliver.tsx / game-store.ts）。
   */
  delivery: {
    /** ADJ-26 A1/A2：相对参考价的动态倍率，不存绝对 priceCents。 */
    pricingTiers: [
      { id: 'low', labelKey: 'deliver.pricing.low', factor: 0.75 },
      { id: 'medium', labelKey: 'deliver.pricing.medium', factor: 1.0 },
      { id: 'high', labelKey: 'deliver.pricing.high', factor: 1.25 },
    ],
    /** ADJ-26 A3：空组合兜底参考价（= C1_DEFAULT_REFERENCE_PRICE_CENTS）。 */
    defaultReferencePriceCents: 2_999,
    /** ADJ-26 A4/A5：单渠道日预算固定绝对 cents，三渠道同值。 */
    marketingBudgetTiers: [
      { id: 'low', labelKey: 'deliver.marketing.low', dailyBudgetCents: 10_000 },
      { id: 'medium', labelKey: 'deliver.marketing.medium', dailyBudgetCents: 50_000 },
      { id: 'high', labelKey: 'deliver.marketing.high', dailyBudgetCents: 150_000 },
    ],
  },

  /** ADJ-16 R-1：媒体评价聚合卡滑动窗口 N=10（TUNING 占位，P2 校准）。 */
  review: {
    mediaWindowN: 10,
  },
} as const

export type P1UiTuning = typeof P1_UI_TUNING
