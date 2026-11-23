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
   * ADJ-12 S9-1 / ADJ-16 R-5 / ADJ-2026-11-24-19 §1 C3：定价三档名称固定，
   * 数值保持 NUMERIC_PENDING_P2 硬占位，UI fail-closed 显示"数值待标定"。
   *
   * W5-C3 派生可行性核查（不臆造终值）：
   *  - `referencePriceCents(genre, platform, segment)`（c1-content.ts:212）是单一组合的
   *    权威参考价，用于需求池 value=clamp(ref/price,0.5,1.5)，**没有** low/medium/high
   *    三档到该参考价的权威映射（ADJ-12 S9-1 仅"引用 p0 §4.3 区间取整"而规格未给区间数值）；
   *  - `basePurchaseConversion=0.05` 是购买转化率，不是价格倍率，不能据此把参考价换算成三档；
   *  - 交付页立项的 audienceSegmentIds / targetPlatformIds 可能为空，缺具体组合时按 C3 明示
   *    保持占位并登记 OPEN。
   *  - 营销预算档 × 单渠道（S9-2）在既有 TUNING 中无对应 dailyBudgetCents 字段
   *    （`marketingResponseScaleCents` 是生命周期阶段响应尺度，非预算档，语义不符）。
   * 结论：本批不派生、不填值，保持 fail-closed + OPEN（OPEN-W5-C3-01），上报主 AI 裁定。
   */
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
