/**
 * D-03 PersonnelProjection 与 queryTeam（规格 §7.1 输入契约，C1 多学科支持）。
 *
 * 契约要求（§7.1）：纯函数、只读；同一 (projectId, day, 存档快照) 产出完全相同结果；
 * members 与 teamRefs 逐条对应、不做学科收窄；异常路径成员集不变（C14：
 * 除 D03_DANGLING_TEAMREF 外，任何单条成员异常以"返回该条 + available=false + 错误码"表达）。
 */
import type {
  D03Assignment,
  D03Error,
  D03Discipline,
  Employment,
  Person,
  PersonnelProjection,
} from '@domain/entities/personnel'
import { D03_ERROR } from '@domain/entities/personnel'
import { isEmploymentAvailable, skillLevelOf } from './personnel-availability'
import { detectPersonStatusDesync } from './personnel-status'
import { D03_DISCIPLINES } from '@domain/entities/personnel'

export interface QueryTeamInput {
  /** Project.teamRefs（ref(Employment) 原样展开，Z1 不收窄）。 */
  teamRefs: readonly string[]
  day: number
  employmentById: ReadonlyMap<string, Employment>
  personById: ReadonlyMap<string, Person>
  assignments: readonly D03Assignment[]
  /** 为 true 时检测 Person.status 与 §4.3 派生式的失步（E15/TC-24）。 */
  detectDesync?: boolean
}

export interface QueryTeamResult {
  /** 与 teamRefs 一一对应（悬空引用除外）；**任何异常不剔除成员**（C14）。 */
  members: PersonnelProjection[]
  errors: D03Error[]
  /** DESYNC 成员（修复建议在 error.repairHint；写 D03_DATA_REPAIR 由调用方执行）。 */
  desyncEmploymentIds: string[]
}

/** 单人投影（§7.1 契约字段；effShare/notForCap 为版本闸门内部字段）。 */
export function projectEmployment(
  employment: Employment,
  person: Person,
  day: number,
  effShare = 0,
): PersonnelProjection {
  const skillLevels = {} as Record<D03Discipline, number>
  for (const d of D03_DISCIPLINES) {
    skillLevels[d] = skillLevelOf(person.skills, d)
  }
  return {
    employmentId: employment.employmentId,
    personId: person.personId,
    skillLevels,
    available: isEmploymentAvailable(employment, day),
    effShare,
    notForCap: true,
    salaryMonthlyCents: employment.salaryMonthlyCents,
  }
}

/**
 * queryTeam（§7.1）。D-03 不替 Project 过滤 skillLevel>0，也不按 discipline 过滤成员；
 * available 在投影中按 true/false 输出，供 Project 直接用于 team_d 谓词。
 */
export function queryTeam(input: QueryTeamInput): QueryTeamResult {
  const members: PersonnelProjection[] = []
  const errors: D03Error[] = []
  const desyncEmploymentIds: string[] = []

  for (const ref of input.teamRefs) {
    const employment = input.employmentById.get(ref)
    if (employment === undefined) {
      // E7 / §7.1：悬空引用不入 members，记录并推送告警，不抛异常。
      errors.push({
        code: D03_ERROR.DANGLING_TEAMREF,
        message: `teamRef ${ref} 无法解析为 Employment`,
      })
      continue
    }
    const person = input.personById.get(employment.personId)
    if (person === undefined) {
      // 数据完整性异常：仍返回条目（C14 不剔除），available=false。
      errors.push({
        code: D03_ERROR.PERSON_NOT_FOUND,
        message: `Employment ${employment.employmentId} 的 personId ${employment.personId} 不存在`,
        repairHint: '按 §4.3 派生式重建 Person 或走 §10 E4 数据修复。',
      })
      members.push({
        employmentId: employment.employmentId,
        personId: employment.personId,
        skillLevels: { design: 0, code: 0, art: 0, audio: 0, qa: 0 },
        available: false,
        effShare: 0,
        notForCap: true,
        salaryMonthlyCents: employment.salaryMonthlyCents,
      })
      continue
    }
    if (input.detectDesync === true) {
      const { desync, repairHint } = detectPersonStatusDesync(person, employment, input.assignments, input.day)
      if (desync) {
        const desyncError: D03Error = {
          code: D03_ERROR.PERSON_STATUS_DESYNC,
          message: `Person ${person.personId} 的 status 与 §4.3 派生式不符（含 INV-2 冲突）`,
        }
        if (repairHint !== undefined) desyncError.repairHint = repairHint
        errors.push(desyncError)
        errors.push({
          code: D03_ERROR.DATA_REPAIR,
          message: `D03_DATA_REPAIR：Person ${person.personId} 派生值已按 §4.3 重算修正`,
        })
        desyncEmploymentIds.push(employment.employmentId)
        // C14：照常返回该人 + available=false + 告警 + 修复建议，成员集条数不变。
        members.push({
          ...projectEmployment(employment, person, input.day),
          available: false,
        })
        continue
      }
    }
    members.push(projectEmployment(employment, person, input.day))
  }
  return { members, errors, desyncEmploymentIds }
}

/** E1/TC-20：teamRefs 为空 ⇒ D03_TEAM_EMPTY（Project Cap_d=0、Cost_est=+∞）。 */
export function teamEmptyError(): D03Error {
  return { code: D03_ERROR.TEAM_EMPTY, message: '项目 teamRefs 为空：Cap_d=0、Cost_est=+∞' }
}
