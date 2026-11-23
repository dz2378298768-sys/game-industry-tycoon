/**
 * D-03 存档迁移（规格 §15.1 字段映射 + §15.3 两步/四步迁移，C10/D03-07/D03-21）。
 *
 * Step 1 旧 Employee → Person；Step 2 依旧 status 决定 Employment；
 * Step 3 为每条 occupying Employment 生成薪资承诺参数（由调用方注册进 FIN 账本）；
 * Step 4 全库 occupying personId 唯一性校验（违反走 §10 E4：只改状态、不产生财务后果）。
 *
 * 纯函数：不读存储、不调服务、不改入参（对齐 save-migrations INV-1/INV-2）。
 */
import type { Employee } from '@domain/entities/employee'
import type { EmployeeRole } from '@domain/enums'
import type {
  D03Discipline,
  Employment,
  Person,
  PersonEvent,
} from '@domain/entities/personnel'
import { D03_ERROR } from '@domain/entities/personnel'
import { toD03Discipline } from '@domain/entities/personnel'
import type { PersonnelParams } from './personnel-tuning'
import { computeProbationEndDay, contractEndDayOf } from './personnel-status'
import { buildSalaryCommitment, type CommitmentBuildInput } from './personnel-salary'

/** role → 规格学科（迁移派生一次，R14；producer/manager 无学科）。 */
export function roleToD03Discipline(role: EmployeeRole): D03Discipline | null {
  switch (role) {
    case 'designer': return 'design'
    case 'programmer': return 'code'
    case 'artist': return 'art'
    case 'qa': return 'qa'
    default: return null
  }
}

export interface MigrationLogEntry {
  legacyId: string
  code: string
  message: string
}

export interface MigrationOutput {
  persons: Person[]
  employments: Employment[]
  /** Step 3：occupying Employment 的薪资承诺参数（调用方 registerCommitment 注册）。 */
  salaryCommitments: CommitmentBuildInput[]
  personEvents: PersonEvent[]
  /** 迁移日志（legacyId → (personId, employmentId) 可追溯，§17.2）。 */
  logs: MigrationLogEntry[]
  /** E4 修复记录（不产生遣散、不调 FIN）。 */
  repairs: MigrationLogEntry[]
}

export interface MigrateEmployeesInput {
  employees: readonly Employee[]
  /** 存档日（probation 判据基准）。 */
  day: number
  params: PersonnelParams
  /** City.regionId 解析；缺失取默认（§15.3 Step 1）。 */
  regionOf: (cityId: string) => string
}

function primaryDisciplineOf(primarySkill: string, role: EmployeeRole): D03Discipline | null {
  return toD03Discipline(primarySkill) ?? roleToD03Discipline(role)
}

/** 旧档合同月数：ceilMonths(contractEndDay − contractStartDay)；null ⇒ P1_DEFAULT_TERM_MONTHS（记日志）。 */
function initialTermMonthsOf(startDay: number, endDay: number | null | undefined, p: PersonnelParams): number {
  if (endDay === null || endDay === undefined || endDay <= startDay) return p.p1DefaultTermMonths
  return Math.max(1, Math.ceil((endDay - startDay) / 30))
}

/**
 * §15.3 两步迁移主入口（含 Step 3 / Step 4）。
 * 老员工（存档日 ≥ probationEndDay）一律 active，不得置 probation（TC-19）。
 */
export function migrateEmployees(input: MigrateEmployeesInput): MigrationOutput {
  const { employees, day, params: p } = input
  const persons: Person[] = []
  const employments: Employment[] = []
  const personEvents: PersonEvent[] = []
  const logs: MigrationLogEntry[] = []
  const repairs: MigrationLogEntry[] = []

  for (const e of employees) {
    const employmentId = e.id
    const personId = `d03-per-${e.id}`
    const primary = primaryDisciplineOf(e.primarySkill, e.role)
    const level: Partial<Record<D03Discipline, number>> = {}
    const exp: Partial<Record<D03Discipline, number>> = {}
    if (primary !== null) {
      level[primary] = e.skillLevel
      exp[primary] = e.experience
    }
    // R15 #15：hireDay 与 contractStartDay 冲突时以 hireDay 为准并记日志。
    const startDay = e.hireDay !== e.contractStartDay ? e.hireDay : e.contractStartDay
    if (e.hireDay !== e.contractStartDay) {
      logs.push({ legacyId: e.id, code: 'MIGRATE_HIRE_DAY_CONFLICT', message: `hireDay=${e.hireDay} ≠ contractStartDay=${e.contractStartDay}，以 hireDay 为准` })
    }
    // R16 #12：fatigue P1 不建模，读档丢弃并记迁移日志（OPEN-D03-3）。
    logs.push({ legacyId: e.id, code: 'MIGRATE_FATIGUE_DROPPED', message: `fatigue=${e.fatigue} 为 P1 冻结字段，读档丢弃` })

    const person: Person = {
      personId,
      displayName: e.name,
      birthDay: Math.max(0, startDay - 30 * 365),
      regionId: input.regionOf(e.companyId),
      skills: { personId, level, exp, lastLevelUpDay: {} },
      seniority: e.skillLevel >= 4 ? 'senior' : 'junior',
      traits: null,
      preferences: null,
      baseMorale: e.morale,
      status: 'available', // Step 2 回填
      currentEmploymentId: null,
      careerRecord: [],
      rehireCount: 0,
      version: e.version,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }

    const probationEndDay = computeProbationEndDay(startDay, p.probationMonths, p.workingDaysPerMonth)
    let employment: Employment
    let statusEvent: PersonEvent | null = null
    switch (e.status) {
      case 'hired': {
        // §15.3 Step 2 'hired'：唯一口径 probationEndDay = startDay + probationMonths × workingDaysPerMonth（C12）
        const status = day < probationEndDay ? 'probation' : 'active'
        employment = {
          employmentId,
          personId,
          companyId: e.companyId,
          role: e.role,
          status,
          occupiesPerson: true,
          salaryMonthlyCents: e.salaryMonthlyCents,
          pendingSalaryMonthlyCents: null,
          pendingEffectiveDay: null,
          startDay,
          endDay: null,
          initialTermMonths: initialTermMonthsOf(e.contractStartDay, e.contractEndDay, p),
          renewalCount: 0,
          moraleModifier: 0,
          probationEndDay,
          noticeStartDay: null,
          terminationKind: null,
          salaryCommitmentId: `d03-sal-${employmentId}`,
          version: e.version,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }
        break
      }
      case 'on_leave': {
        // OPEN-D03-8 关闭：旧 on_leave = 在职无分配 ⇒ active + 无 Assignment（§4.3 派生 Person.status=on_leave）
        employment = {
          employmentId,
          personId,
          companyId: e.companyId,
          role: e.role,
          status: 'active',
          occupiesPerson: true,
          salaryMonthlyCents: e.salaryMonthlyCents,
          pendingSalaryMonthlyCents: null,
          pendingEffectiveDay: null,
          startDay,
          endDay: null,
          initialTermMonths: initialTermMonthsOf(e.contractStartDay, e.contractEndDay, p),
          renewalCount: 0,
          moraleModifier: 0,
          probationEndDay,
          noticeStartDay: null,
          terminationKind: null,
          salaryCommitmentId: `d03-sal-${employmentId}`,
          version: e.version,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }
        break
      }
      case 'resigned': {
        employment = {
          employmentId,
          personId,
          companyId: e.companyId,
          role: e.role,
          status: 'terminated',
          occupiesPerson: false,
          salaryMonthlyCents: e.salaryMonthlyCents,
          pendingSalaryMonthlyCents: null,
          pendingEffectiveDay: null,
          startDay,
          endDay: day,
          initialTermMonths: initialTermMonthsOf(e.contractStartDay, e.contractEndDay, p),
          renewalCount: 0,
          moraleModifier: 0,
          probationEndDay,
          noticeStartDay: null,
          terminationKind: 'voluntary',
          salaryCommitmentId: `d03-sal-${employmentId}`,
          version: e.version,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }
        statusEvent = {
          eventId: `d03-ev-${employmentId}-resigned`,
          personId,
          day,
          kind: 'resigned',
          payload: { reason: 'migrate_legacy_status', legacyStatus: 'resigned' },
        }
        break
      }
      case 'fired':
      default: {
        employment = {
          employmentId,
          personId,
          companyId: e.companyId,
          role: e.role,
          status: 'terminated',
          occupiesPerson: false,
          salaryMonthlyCents: e.salaryMonthlyCents,
          pendingSalaryMonthlyCents: null,
          pendingEffectiveDay: null,
          startDay,
          endDay: day,
          initialTermMonths: initialTermMonthsOf(e.contractStartDay, e.contractEndDay, p),
          renewalCount: 0,
          moraleModifier: 0,
          probationEndDay,
          noticeStartDay: null,
          terminationKind: 'terminated',
          salaryCommitmentId: `d03-sal-${employmentId}`,
          version: e.version,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
        }
        statusEvent = {
          eventId: `d03-ev-${employmentId}-terminated`,
          personId,
          day,
          kind: 'terminated',
          payload: { reason: 'migrate_legacy_status', legacyStatus: e.status },
        }
        break
      }
    }

    if (employment.occupiesPerson) {
      person.currentEmploymentId = employmentId
      person.status = 'on_leave' // Step 1 占位，Step 4 校验后由派生式重算
      // Step 3：occupying ⇒ 薪资承诺（已结束的不创建）
      personEvents.push({
        eventId: `d03-ev-${employmentId}-hired`,
        personId,
        day: employment.startDay,
        kind: 'hired',
        payload: { legacyId: e.id, migrated: true },
      })
    } else {
      person.status = 'departed'
    }
    if (statusEvent !== null) personEvents.push(statusEvent)

    persons.push(person)
    employments.push(employment)
  }

  // ===== Step 4：全库 occupying personId 唯一（§10 E4：修复只改状态、不产生财务后果） =====
  const byPerson = new Map<string, Employment[]>()
  for (const emp of employments) {
    if (!emp.occupiesPerson) continue
    const list = byPerson.get(emp.personId) ?? []
    list.push(emp)
    byPerson.set(emp.personId, list)
  }
  const occupyingCommitments: CommitmentBuildInput[] = []
  for (const [, list] of byPerson) {
    if (list.length <= 1) {
      if (list.length === 1) occupyingCommitments.push(buildSalaryCommitment(list[0] as Employment))
      continue
    }
    // 保留 startDay 最早一条（并列取 employmentId 字典序小者），其余置 terminated。
    const sorted = [...list].sort(
      (a, b) => a.startDay - b.startDay || a.employmentId.localeCompare(b.employmentId),
    )
    const keep = sorted[0] as Employment
    occupyingCommitments.push(buildSalaryCommitment(keep))
    for (const dup of sorted.slice(1)) {
      const repaired: Employment = {
        ...dup,
        status: 'terminated',
        occupiesPerson: false,
        endDay: day,
        terminationKind: 'terminated',
        version: dup.version + 1,
        updatedAt: day,
      }
      const idx = employments.findIndex((x) => x.employmentId === dup.employmentId)
      employments[idx] = repaired
      repairs.push({
        legacyId: dup.employmentId,
        code: D03_ERROR.DATA_REPAIR,
        message: `E4 双重雇佣修复：personId=${dup.personId} 保留 startDay 最早的 ${keep.employmentId}，${dup.employmentId} 置 terminated（不创建遣散、不调 FIN）`,
      })
      personEvents.push({
        eventId: `d03-ev-${dup.employmentId}-repair`,
        personId: dup.personId,
        day,
        kind: 'terminated',
        payload: { reason: 'read_repair', duplicateOf: keep.employmentId },
      })
    }
  }

  // TC-17 fail-safe：Person.currentEmploymentId 必须指向 occupying，否则置 null。
  const occupyingIds = new Set(employments.filter((x) => x.occupiesPerson).map((x) => x.employmentId))
  for (const person of persons) {
    if (person.currentEmploymentId !== null && !occupyingIds.has(person.currentEmploymentId)) {
      repairs.push({
        legacyId: person.personId,
        code: D03_ERROR.DATA_REPAIR,
        message: `TC-17：currentEmploymentId=${person.currentEmploymentId} 非 occupying，置 null（fail-safe）`,
      })
      person.currentEmploymentId = null
      person.status = 'available'
    }
  }

  return { persons, employments, salaryCommitments: occupyingCommitments, personEvents, logs, repairs }
}
