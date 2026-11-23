/**
 * D-03 双状态机与派生式唯一权威（规格 §4；TASK-P1-CODE-06）。
 *
 * - EmploymentStatus 转换规则（§4.2）+ 不可退出状态反证；
 * - PersonStatus 为派生字段，唯一权威 = §4.3 派生式（禁止直接写）；
 * - INV-2：occupiesPerson=true ⇔ status∈{probation,active,resigning}；
 * - probationEndDay = startDay + probationMonths × workingDaysPerMonth（§4.2 C12 唯一口径）。
 */
import type { D03Assignment, Employment, EmploymentStatus, Person, PersonStatus, TerminationKind } from '@domain/entities/personnel'
import { D03_ERROR, d03Fail, d03Ok, type D03Result } from '@domain/entities/personnel'
import { dayIndexToGregorian, daysInMonth, gregorianToDayIndex } from './day-index'

/** 占人状态集合（INV-2 左侧）。 */
export const OCCUPYING_STATUSES: readonly EmploymentStatus[] = ['probation', 'active', 'resigning']

export function isOccupyingStatus(status: EmploymentStatus): boolean {
  return (OCCUPYING_STATUSES as readonly string[]).includes(status)
}

/** INV-2 校验：occupiesPerson 与 status 必须同真同假。 */
export function checkInv2(e: Employment): boolean {
  return e.occupiesPerson === isOccupyingStatus(e.status)
}

/** probationEndDay（§4.2 唯一口径）：全部按工作日制，禁止 ×30 自然日近似（C12）。 */
export function computeProbationEndDay(startDay: number, probationMonths: number, workingDaysPerMonth: number): number {
  return startDay + probationMonths * workingDaysPerMonth
}

/** 试用期到期判据：day ≥ probationEndDay ⇒ 进入"通过/失败"判定；day < ⇒ 仍在 probation。 */
export function isProbationExpired(e: Employment, day: number): boolean {
  return day >= e.probationEndDay
}

// ===== §4.3 派生式（唯一权威） =====

/**
 * Person.status 派生式（§4.3 原文逐符号实现）：
 *   currentEmploymentId == null                                 → available
 *   Employment(currentEmploymentId).occupiesPerson == false     → departed
 *   Σ 活跃分配 > 0                                              → assigned
 *   其余                                                        → on_leave
 *
 * 活跃分配：Assignment 存在且 effectiveFrom ≤ day ≤ (effectiveTo ?? +∞)。
 */
export function derivePersonStatus(
  person: Pick<Person, 'personId' | 'currentEmploymentId'>,
  employment: Employment | undefined,
  assignments: readonly D03Assignment[],
  day: number,
): PersonStatus {
  if (person.currentEmploymentId === null || employment === undefined) return 'available'
  if (!employment.occupiesPerson) return 'departed'
  const activeCount = assignments.filter((a) => {
    if (a.employmentId !== employment.employmentId) return false
    if (a.effectiveFrom !== null && a.effectiveFrom !== undefined && a.effectiveFrom > day) return false
    if (a.effectiveTo !== null && a.effectiveTo !== undefined && day > a.effectiveTo) return false
    return true
  }).length
  return activeCount > 0 ? 'assigned' : 'on_leave'
}

/**
 * §4.3 派生修正 + DESYNC 检测（C14 / E15）：
 * Person.status 与派生式不符（含 INV-2 冲突）时返回错误描述；调用方按 §4.3 重算修正，
 * 并按 §7.1 返回该人 + available=false + 告警 + 修复建议（不得剔除成员）。
 */
export function detectPersonStatusDesync(
  person: Person,
  employment: Employment | undefined,
  assignments: readonly D03Assignment[],
  day: number,
): { desync: boolean; derived: PersonStatus; repairHint?: string } {
  const derived = derivePersonStatus(person, employment, assignments, day)
  if (person.status !== derived) {
    return {
      desync: true,
      derived,
      repairHint: '按 §4.3 派生式重算 Person.status；若根因是 Employment 状态冲突（INV-2），走 §10 E4 数据修复。',
    }
  }
  if (employment !== undefined && !checkInv2(employment)) {
    return {
      desync: true,
      derived,
      repairHint: 'INV-2 冲突：occupiesPerson 与 status 不一致；按 §4.2 重置 occupying 态或置终态（E4 修复，不产生财务后果）。',
    }
  }
  return { desync: false, derived }
}

// ===== §4.2 EmploymentStatus 转换（命令侧唯一入口；返回新 Employment 或拒绝） =====

/**
 * 试用期内玩家提前解雇 / 到期失败：→ terminated（occupiesPerson=false，遣散触发）。
 * 终态不可再转换（两个终态禁止改回，防"幽灵在职"重复计薪）。
 */
export function terminateEmployment(
  e: Employment,
  kind: Extract<TerminationKind, 'terminated'>,
  day: number,
): D03Result<Employment> {
  if (!e.occupiesPerson) {
    return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${e.employmentId} already terminal (status=${e.status})`)
  }
  return d03Ok({
    ...e,
    status: 'terminated',
    occupiesPerson: false,
    endDay: day,
    terminationKind: kind,
    noticeStartDay: null,
    version: e.version + 1,
    updatedAt: day,
  })
}

/** 合同自然到期：active → contract_ended（结算同 terminated）。 */
export function endEmploymentContract(e: Employment, day: number): D03Result<Employment> {
  if (e.status !== 'active') {
    return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${e.employmentId} not active (status=${e.status})`)
  }
  return d03Ok({
    ...e,
    status: 'contract_ended',
    occupiesPerson: false,
    endDay: day,
    terminationKind: 'contract_end',
    version: e.version + 1,
    updatedAt: day,
  })
}

/**
 * 自愿辞职 / 退休 / 离职判定命中：occupying 态 → resigning（RULE-10：不允许 0 通知）。
 * endDay = noticeStartDay + noticeDays；endDay 当天仍可用（§6.1 Z2 / TC-15）。
 */
export function beginResigning(e: Employment, day: number, noticeDays: number): D03Result<Employment> {
  if (!isOccupyingStatus(e.status) || e.status === 'resigning') {
    return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${e.employmentId} cannot resign from status=${e.status}`)
  }
  return d03Ok({
    ...e,
    status: 'resigning',
    noticeStartDay: day,
    endDay: day + noticeDays,
    version: e.version + 1,
    updatedAt: day,
  })
}

/** resigning 期满：→ terminated（voluntary=辞职 / contract_end=退休）。 */
export function completeResigning(e: Employment, day: number, kind: 'voluntary' | 'contract_end'): D03Result<Employment> {
  if (e.status !== 'resigning') {
    return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${e.employmentId} not resigning (status=${e.status})`)
  }
  return d03Ok({
    ...e,
    status: 'terminated',
    occupiesPerson: false,
    terminationKind: kind,
    version: e.version + 1,
    updatedAt: day,
  })
}

/** 试用期到期且通过：→ active（renewalCount+1；调用方重建薪资承诺 §7.2）。 */
export function passProbation(e: Employment, day: number): D03Result<Employment> {
  if (e.status !== 'probation') {
    return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${e.employmentId} not in probation`)
  }
  return d03Ok({
    ...e,
    status: 'active',
    renewalCount: e.renewalCount + 1,
    version: e.version + 1,
    updatedAt: day,
  })
}

/**
 * 合同到期日（§7.2 endAt 口径）：endMonth = monthOf(startDay) + initialTermMonths − 1 的期末。
 * 返回合同期末的 dayIndex（月末最后一天）。
 */
export function contractEndDayOf(startDay: number, initialTermMonths: number): number {
  const g = dayIndexToGregorian(startDay)
  const monthOrdinal = g.year * 12 + (g.month - 1) + initialTermMonths - 1
  const endYear = Math.floor(monthOrdinal / 12)
  const endMonth = (monthOrdinal % 12) + 1
  return gregorianToDayIndex(endYear, endMonth, daysInMonth(endYear, endMonth))
}
