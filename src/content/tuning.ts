/**
 * TUNING —— M1.1 全部可调参数的唯一配置入口。
 *
 * 约束：
 *   - ProjectService / GameWorld / DailyScheduler / EmployeeService 不得重复定义同名参数。
 *   - 每个参数标注单位。数值为候选值，状态见 `dataStatus`，不代表已平衡。
 *   - 城市相关系数不在此处，按设计裁定保存在 `content/cities.json`。
 */

export interface ThresholdMultiplier {
  /** 达到该值即采用对应倍率（从高到低匹配） */
  min: number
  multiplier: number
}

export interface FatigueThresholdMultiplier {
  /** 疲劳未超过该值即采用对应倍率（从低到高匹配） */
  max: number
  multiplier: number
}

export const TUNING = {
  dataStatus: 'TUNING' as const,
  version: 3,

  company: {
    /** 单位：美分。公司初始现金，只能由 FinanceService 的初始化交易入账一次。 */
    startingCashCents: 6_500_000,
    /** 单位：0-100 分。 */
    startingBrand: 10,
    /** 单位：0-100 分。 */
    startingTechnologyCapacity: 10,
    /** 单位：人。在职员工数量上限。 */
    managementCapacity: 15,
    /** 单位：美分/月。办公室基础租金，实际租金 = 本值 × 城市租金系数 × 办公室等级。 */
    baseMonthlyRentCents: 140_000,
    /** 单位：倍率。办公室等级对租金的乘数基准。 */
    officeLevelRentMultiplier: 1,
  },

  employee: {
    /** 单位：工作点/天。一名基准员工（技能 3、士气 70、疲劳 0）的日产能。 */
    baseDailyWorkPoints: 5,
    /** 单位：比例。入职成本 = 月薪 × 本值。 */
    hireCostRatio: 0.15,
    /** 单位：月薪倍数。解雇补偿 = 月薪 × 本值。 */
    severanceMonths: 1,
    /** 单位：美分/月。招聘界面默认建议月薪（应用城市系数前）。 */
    defaultStartingSalaryCents: 130_000,
    /** 单位：0-100。士气回归基准。 */
    moraleBaseline: 70,
    /** 单位：比例/天。士气向基准回归的速率：morale += (基准 - morale) × 本值。 */
    moraleRecoveryRate: 0.02,
    /** 单位：疲劳点/天。满投入时每日疲劳增量：fatigue += 本值 × 当日总投入比例。 */
    fatigueGainPerAllocation: 0.5,
    /** 单位：疲劳点/天。无研发任务时的每日恢复量。 */
    fatigueRestRecovery: 1.0,
    /** 单位：0-100。新员工初始士气。 */
    startingMorale: 70,
    /** 单位：0-100。新员工初始疲劳。 */
    startingFatigue: 20,
    /** 单位：倍率。技能等级 1-5 对应产能系数。 */
    skillMultiplier: {
      1: 0.7,
      2: 0.85,
      3: 1.0,
      4: 1.15,
      5: 1.3,
    } as Record<number, number>,
    /** 单位：倍率。士气阈值对应的产能系数。 */
    moraleMultiplier: [
      { min: 70, multiplier: 1.1 },
      { min: 40, multiplier: 1.0 },
      { min: 20, multiplier: 0.85 },
      { min: 0, multiplier: 0.7 },
    ] as ThresholdMultiplier[],
    /** 单位：倍率。疲劳阈值对应的产能系数。 */
    fatigueMultiplier: [
      { max: 30, multiplier: 1.0 },
      { max: 50, multiplier: 0.9 },
      { max: 70, multiplier: 0.8 },
      { max: 90, multiplier: 0.6 },
      { max: 100, multiplier: 0.4 },
    ] as FatigueThresholdMultiplier[],
  },

  project: {
    /** 单位：完成度比例。制作 → 测试的门槛（设计/程序/美术三项都需达到）。 */
    productionCompletionThreshold: 0.9,
    /** 单位：比例。QA 工作量 = 制作三学科总量 × 本值。 */
    qaWorkRatio: 0.15,
    /** 单位：倍率。预算换算工作量的下限系数。 */
    budgetFactorMin: 0.5,
    /** 单位：倍率。预算换算工作量的上限系数。 */
    budgetFactorMax: 4,
    /** 单位：工作点/百万美分预算。各学科基准工作量。 */
    workPerMillionBudget: {
      design: 65,
      programming: 98,
      art: 78,
    },
    /** 单位：工作点。QA 工作量的最小保底值，避免小预算项目 QA 瞬间完成。 */
    minQaWorkPoints: 40,
  },

  qa: {
    /** 单位：缺陷点/完整缺口。提前进入 QA 的惩罚 = 平均剩余生产完成度（0-1）× 本值。 */
    earlyEntryPenaltyFactor: 50,
    /** 单位：比例。QA 完成 100% 时可修复的缺陷比例（设计裁定 B8）。 */
    repairRatio: 0.7,
  },

  finance: {
    /** 单位：比例。预算使用超过该比例时产生警告（不强制取消）。 */
    budgetOverrunWarnAt: 1.0,
    /** 单位：美分。L1 现金警告线：现金低于此值（≥0）触发顶部警告横幅（DESIGN-OI-21 §2.1）。400_000 = $4,000。 */
    cashWarningThresholdCents: 400_000,
    /** 单位：美分。L2 破产线：现金低于此值触发公司 status='bankrupt'（DESIGN-OI-21 §2.1）。 */
    cashBankruptThresholdCents: 0,
    /**
     * 单位：美分。自救恢复线：bankrupt 公司现金回到此值（≥ L1 警告线）时恢复 active。
     * 取 $4,000 而非 $5,000：与 L1 同线形成滞回区间（0 ~ $4,000 不反复切换），
     * 并修订 DESIGN-OI-21 §2.4 的 $5,000 口径（见 DECISION-M3-P0-BANKRUPTCY-CLOSURE-001 §3）。
     */
    cashRecoveryThresholdCents: 400_000,
  },

  /**
   * 销售管线（TASK-M2-001-B，DESIGN-M2-001-B-SALES-PIPELINE v1.2 §8.1）。
   * 所有数值仅此处定义；公式层禁止读取 TUNING，必须由调用方注入本快照。
   */
  sales: {
    /** 单位：比例。类别兴趣系数（仅内容缺失时 fallback，Q4）。 */
    categoryInterest: 0.5,
    /** 单位：比例。自然考虑集基准。 */
    baseConsideration: 0.5,
    /** 单位：比例。基础购买转化率。 */
    basePurchaseConversion: 0.05,
    /** 单位：比例。涨价弹性（涨 10% → 转化 −12%）。 */
    priceElasticityUp: 0.12,
    /** 单位：比例。降价弹性（跌 10% → 转化 +8%）。 */
    priceElasticityDown: 0.08,
    /** 单位：倍率。由质量带来的考虑提升的允许区间。 */
    considerationLiftRange: { min: 0.5, max: 2.0 },
    /** 单位：倍率。媒体评分提升的允许区间。 */
    reviewLiftRange: { min: 0.5, max: 1.8 },
    /** 单位：倍率。购买转化提升的允许区间。 */
    purchaseConversionLiftRange: { min: 0.2, max: 2.0 },
    /** 单位：比例。购买转化率的最终允许区间。 */
    purchaseConversionRange: { min: 0.01, max: 0.5 },
    /** 单位：倍率。营销响应乘数上限（1+lift；数学不可达，防御性，D-02）。 */
    marketingResponseMultiplierMax: 2.0,
    /** 单位：美分。营销响应尺度（按生命周期阶段）。0 支出 → 提升 0。 */
    marketingResponseScaleCents: {
      launch: 50_000,
      growth: 100_000,
      mature: 200_000,
      decline: 300_000,
      long_tail: 300_000,
    },
    /** 单位：比例。认知度读取上限（写入值保留）。 */
    awarenessCap: 0.6,
    /** 单位：倍率。随机扰动高斯采样的标准差；最终扰动 = clamp(1 + 采样值)。 */
    randomPerturbationStddev: 0.05,
    /** 单位：倍率。随机扰动允许区间。 */
    randomPerturbationRange: { min: 0.8, max: 1.2 },
    /** 单位：概率。小市场整数保底：rawUnits>0 但 floor=0 时的补 1 单位概率。0 = 关闭（Q7）。 */
    smallMarketFloorChance: 0,
    /** 单位：比例。基础预期退款率（DATA-001 §2 权威）。 */
    refundRate: 0.03,
    /** 单位：比例。按缺陷等级修正后的预期退款率允许区间。 */
    refundRateRange: { min: 0.02, max: 0.35 },
    /** 单位：天。销售日之后第几天执行退款（pending 批次窗口）。 */
    refundWindowDays: 14,
    /** 单位：比例。平台 id 未知（不在显式 14 条映射内）时的抽成兜底。 */
    platformFeeRateFallback: 0.3,
    /** 单位：比例。平台记录缺失/非法时按类别使用的默认抽成。 */
    platformFeeRateByCategory: {
      arcade: 0.5,
      console: 0.35,
      pc: 0,
      digital: 0.3,
    },
    /** 单位：权重。质量偏好默认权重（segment/genre 未声明时使用）。 */
    qualityPrefWeightDefault: {
      gameplay: 0.35,
      technical: 0.30,
      content: 0.15,
      art: 0.10,
      innovation: 0.10,
    },
    /** 单位：0-100 分。质量画像缺失/非法时的质量分兜底（Q4 仅缺 profile 时）。 */
    qualityScoreFallback: 50,
  },
} as const

export type Tuning = typeof TUNING

/** 显式声明 TUNING 标记，供文档与测试引用 */
export const TUNING_STATUS = TUNING.dataStatus
