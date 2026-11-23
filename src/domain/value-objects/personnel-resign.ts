/**
 * D-03 每日离职概率（规格 §6.7；RULE-15 仅四类诱因；退休走确定性路径不进随机判定）。
 *
 * 确定性：u = hash01(employmentId, day)；禁 Math.random；resigning 期间不重复判定。
 */
import type { Employment, Person } from '@domain/entities/personnel'
import type { PersonnelParams } from './personnel-tuning'
import { clamp } from '@simulation/systems/work-systems'
import { deriveMorale } from './personnel-morale'

/** 确定性伪随机（§6.7 判定 + S6 随机种子约定：hash(entityId, day, salt)，天然可重放）。 */
export function hash01(entityId: string, day: number, salt = 'd03-resign'): number {
  let h = 2166136261
  const input = `${salt}:${entityId}:${day}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // FNV-1a 32bit → [0,1)
  return (h >>> 0) / 4294967296
}

export interface ResignProbInput {
  /** 连续无活跃分配日数（§6.9 派生）。 */
  idleDays: number
  /** 所在项目失败/取消标记（诱因③）。 */
  projectFailedFlag: boolean
}

export function dailyResignProb(
  person: Person,
  employment: Employment,
  marketSalaryCents: number,
  input: ResignProbInput,
  p: PersonnelParams,
): number {
  const morale = deriveMorale(person, employment)
  const salaryShortfall = Math.max(0, 1 - employment.salaryMonthlyCents / Math.max(1, marketSalaryCents))
  let prob = p.pBase
  prob += p.wMorale * (Math.max(0, p.resignMoraleThreshold - morale) / 100)
  // 欠薪诱因（RULE-15 ②）：薪资 < market × underpayRatio 才计入欠薪项，否则按缺口线性项计
  const underpaid = employment.salaryMonthlyCents < marketSalaryCents * p.underpayRatio
  prob += underpaid ? p.wUnder * salaryShortfall : 0
  prob += p.wIdle * (Math.max(0, input.idleDays - p.idleWarnDays) / Math.max(1, p.idleWarnDays))
  prob += p.wRehire * person.rehireCount
  if (input.projectFailedFlag) prob += p.wProjectFail
  return clamp(prob, 0, p.pMax)
}

/** 判定：u < dailyResignProb ⇒ active → resigning（§6.7）。 */
export function shouldResign(u: number, prob: number): boolean {
  return u < prob
}
