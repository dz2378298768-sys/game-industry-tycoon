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
  version: 1,

  company: {
    /** 单位：美分。公司初始现金，只能由 FinanceService 的初始化交易入账一次。 */
    startingCashCents: 5_000_000,
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
    defaultStartingSalaryCents: 200_000,
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
    qaWorkRatio: 0.2,
    /** 单位：倍率。预算换算工作量的下限系数。 */
    budgetFactorMin: 0.5,
    /** 单位：倍率。预算换算工作量的上限系数。 */
    budgetFactorMax: 4,
    /** 单位：工作点/百万美分预算。各学科基准工作量。 */
    workPerMillionBudget: {
      design: 100,
      programming: 150,
      art: 120,
    },
    /** 单位：工作点。QA 工作量的最小保底值，避免小预算项目 QA 瞬间完成。 */
    minQaWorkPoints: 40,
    /**
     * 单位：天。项目连续暂停（isPaused=true）达到该天数即由系统自动取消（D-01 设计裁定）。
     * 计的是「实际暂停天数计数器」consecutivePauseDays，不是自然日；恢复后清零。
     */
    autoCancelAfterPausedDays: 60,
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
  },
} as const

export type Tuning = typeof TUNING

/** 显式声明 TUNING 标记，供文档与测试引用 */
export const TUNING_STATUS = TUNING.dataStatus
