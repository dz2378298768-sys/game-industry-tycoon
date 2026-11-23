/**
 * D-03 参数快照（§6.9 / §18.3 C13 必存项）。
 *
 * 规则：公式层禁止直接读 TUNING；由调用方按 personnelFormulaVersion 注入本快照
 * （与 finance-tuning / project §11 S4 同构）。数值为 P1 初值（TUNING，P2 校准）；
 * 其中 recruitFeeMonths 与部分阈值来自 ADJ-2026-11-22-12（S5-1/S5-2/S5-3）。
 */
import type { PersonnelFormulaSnapshot } from '@domain/entities/personnel'

export const PERSONNEL_FORMULA_VERSION = 'personnel-v1'

/**
 * P1 参数初值。
 * 单位一律双写（CODEBUDDY.md §13.1）：注释同时给出业务值与代码单位值。
 */
export const DEFAULT_PERSONNEL_PARAMS = {
  /** 试用期月数：3 个月。 */
  probationMonths: 3,
  /** 每自然月工作日数：21 天（唯一用于 probationEndDay 与迁移判据，禁止 ×30 近似，C12）。 */
  workingDaysPerMonth: 21,
  /** 辞职通知期：5 个工作日（resigning 窗口；endDay = noticeStartDay + noticeDays）。 */
  noticeDays: 5,
  /** 退休年龄：60 岁（§4.1）。 */
  retireAge: 60,
  /** 试用期未通过士气线（§4.2）。 */
  probationFailMorale: 30,
  /** P1_DEFAULT_TERM_MONTHS：旧档 contractEndDay=null 与新招聘的默认合同月数 = 12 个月。 */
  p1DefaultTermMonths: 12,
  /** headcountCap 常数（§2.2 O5）。 */
  headcountCap: 15,
  /** 调薪生效滞后（§6.3）。 */
  kSalaryEffectiveLag: 3,
  /** 招聘周期基准天数 baseLeadDays（§6.3）。 */
  baseLeadDays: 3,
  /** senior 加成天数 k_lead。 */
  kLead: 3,
  /** 候选池规模上限（§5.2 RULE-05）。 */
  candidatePoolSize: 5,
  /** 候选过期天数。 */
  candidateExpiresDays: 30,
  /** 报价下限乘子 floorPrice = market × 本值。 */
  floorPriceRatio: 0.85,
  /** 报价上限乘子 ceilingPrice = market × 本值。 */
  ceilingPriceRatio: 1.1,
  /** 欠薪判定比例 underpayRatio（§6.7 诱因②）。 */
  underpayRatio: 0.9,
  /** 招聘一次性中介费月数（ADJ-2026-11-22-12 S5-3：初值 = 月薪 × 1，TUNING P2 校准）。 */
  recruitFeeMonths: 1,
  /** 遣散月数（§6.4，沿用旧值 1）。 */
  severanceMonths: 1,
  /** 试用期遣散系数（§6.4，默认候选 1）。 */
  kProbationSeveranceFactor: 1,

  // ===== §6.6 士气 =====
  /** moraleModifier 上下界 B（§6.6，如 30）。 */
  moraleModifierBound: 30,
  /** 每日回归速率（§6.6，[0,1)）。 */
  moraleRecoveryRate: 0.02,
  /** 怠工压力：无活跃分配且所属项目在产时每日扣减。 */
  kIdlePressure: 0.5,
  /** 项目困顿：paused/descoped 超过 kStruggleDays 后每日扣减。 */
  kProjectStruggle: 0.3,
  /** 项目成功：交付 PASS 且质量达标时一次性加成。 */
  kProjectSuccess: 5,
  /** 解雇外溢（RULE-12）。 */
  kLayoffSpill: 5,
  /** 困顿判定天数阈值。 */
  kStruggleDays: 10,

  // ===== §6.7 离职 =====
  /** 基础日离职概率。 */
  pBase: 0.001,
  /** 士气权重。 */
  wMorale: 0.02,
  /** 欠薪权重。 */
  wUnder: 0.01,
  /** 空闲权重。 */
  wIdle: 0.005,
  /** 再雇权重。 */
  wRehire: 0.005,
  /** 项目失败权重。 */
  wProjectFail: 0.02,
  /** 日概率上限。 */
  pMax: 0.05,
  /** 士气离职阈值。 */
  resignMoraleThreshold: 25,
  /** 怠工告警阈值（>0 约束）。 */
  idleWarnDays: 10,
  /** 新员工 baseMorale 下限（RULE-16 startingMoraleFloor）。 */
  startingMoraleFloor: 40,

  // ===== §6.8 成长（S5-2 最小实现） =====
  /** 每级经验上限 expCap[level]（0..4 级对应升级到 1..5 所需）。 */
  expCap: [10, 20, 30, 40, 50],
  /** 每日经验速率 k_expPerDay[level]（§6.8 通用式；P1 主用 S5-2 最小实现）。 */
  kExpPerDay: [0, 0.1, 0.1, 0.1, 0.1, 0.1],
  /** 升级冷却天数。 */
  growthCooldownDays: 20,
  /** S5-2：完成一个 WorkPackage 的经验增量 = +0.1 档经验值（内部累计，跨档阈值 expCap）。 */
  expPerWpCompletion: 0.1,
} as const

export type PersonnelParams = typeof DEFAULT_PERSONNEL_PARAMS

/** 参数快照三元组（§18.3：{version, params, createdAt} 随存档强制持久化）。 */
export function createPersonnelSnapshot(createdAt: number): PersonnelFormulaSnapshot {
  return {
    version: PERSONNEL_FORMULA_VERSION,
    params: { ...DEFAULT_PERSONNEL_PARAMS } as unknown as Record<string, number>,
    createdAt,
  }
}
