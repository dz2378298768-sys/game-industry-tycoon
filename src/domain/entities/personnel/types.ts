/**
 * D-03 人才与组织 —— 领域类型（规格 06_D03人才与组织设计规格 V0.1.2 §3/§4/§7/§10；TASK-P1-CODE-06）。
 *
 * 红线（规格 §0 红线摘要）：
 *  - R-D03-1：Person/Employment 分离；同一 personId 任一日至多一条 occupiesPerson=true。
 *  - R-D03-3：D-03 不读写 Company.cash；薪资/招聘费/遣散只经 FIN 承诺兑现。
 *  - R-D03-4：不复制技能值；Project 只持有 ref(Employment)。
 *  - R-D03-5：不建模私生活；traits/preferences P1 恒 null。
 */
import type { EmployeeRole, ProjectRole } from '@domain/enums'

// ===== 学科枚举（§3.3，D-01 §6.7 五元素；代码别名 programming ≡ code） =====

/** 规格五元素学科（权威口径）。 */
export type D03Discipline = 'design' | 'code' | 'art' | 'audio' | 'qa'

export const D03_DISCIPLINES: readonly D03Discipline[] = ['design', 'code', 'art', 'audio', 'qa']

/** 候选池覆盖全部五学科，与领域岗位一一映射。 */
export const D03_POOL_DISCIPLINES: readonly D03Discipline[] = ['design', 'code', 'art', 'audio', 'qa']

/** 代码侧存储别名 → 规格学科（§15 DisciplineMap：programming ≡ code）。 */
export function toD03Discipline(codeDiscipline: string): D03Discipline | null {
  switch (codeDiscipline) {
    case 'design': return 'design'
    case 'programming': return 'code'
    case 'art': return 'art'
    case 'qa': return 'qa'
    case 'code': return 'code'
    case 'audio': return 'audio'
    default: return null
  }
}

/** 规格学科 → 代码侧存储别名。 */
export function toCodeDiscipline(d: D03Discipline): 'design' | 'programming' | 'art' | 'audio_designer' | 'qa' | null {
  switch (d) {
    case 'design': return 'design'
    case 'code': return 'programming'
    case 'art': return 'art'
    case 'qa': return 'qa'
    case 'audio': return 'audio_designer'
  }
}

// ===== §3.3 SkillProfile =====

export interface SkillProfile {
  personId: string
  /** 五学科等级 int ∈ {0..5}；缺键 ⇒ 0（Project §10 B-9）。 */
  level: Partial<Record<D03Discipline, number>>
  /** 各学科经验点 ≥0；到达 expCap[level] 升一级（§6.8）。 */
  exp: Partial<Record<D03Discipline, number>>
  /** 上次升级日（防同级短周期连升 §6.8）。 */
  lastLevelUpDay: Partial<Record<D03Discipline, number>>
}

// ===== §4 状态枚举 =====

/** PersonStatus：派生字段，非存储权威（§4.1/§4.3；禁止直接写）。 */
export type PersonStatus = 'available' | 'assigned' | 'on_leave' | 'departed'

/** EmploymentStatus（§4.2）。terminated / contract_ended 为终态。 */
export type EmploymentStatus = 'probation' | 'active' | 'resigning' | 'terminated' | 'contract_ended'

export type TerminationKind = 'voluntary' | 'terminated' | 'contract_end'

/** §3.6 PersonEvent kind（P1 无 promoted：保留枚举位，恒不产生）。 */
export type PersonEventKind =
  | 'hired'
  | 'promoted'
  | 'raised'
  | 'salary_cut'
  | 'level_up'
  | 'project_finished'
  | 'project_failed'
  | 'resigned'
  | 'terminated'
  | 'contract_ended'
  | 'retired'

export interface PersonEvent {
  eventId: string
  personId: string
  day: number
  kind: PersonEventKind
  payload: Record<string, unknown>
}

// ===== §3.1 Person =====

export interface Person {
  personId: string
  displayName: string
  /** 出生日（dayIndex），仅用于年龄/退休判定（§4.1）。 */
  birthDay: number
  regionId: string
  skills: SkillProfile
  seniority: 'junior' | 'senior'
  /** DEFERRED（R-D03-5）：P1 恒 null。 */
  traits: null
  preferences: null
  /** 人物士气基座（跨雇主保留，§6.6 唯一基座）。 */
  baseMorale: number
  /** 派生字段：唯一权威 = §4.3 派生式；存档值不信任（§11 S1 ③）。 */
  status: PersonStatus
  /** 唯一性锚点：非 null 时该 Employment 必须 occupiesPerson=true（§5.1）。 */
  currentEmploymentId: string | null
  careerRecord: string[]
  /** 被本公司离职次数（影响 retentionR §6.7）。 */
  rehireCount: number
  version: number
  createdAt: number
  updatedAt: number
}

// ===== §3.2 Employment =====

export interface Employment {
  employmentId: string
  personId: string
  companyId: string
  /** 岗位：仅影响默认学科提示与 UI 分组，不决定 skillLevel/team_d（§3.2）。 */
  role: EmployeeRole
  status: EmploymentStatus
  /** INV-2：occupiesPerson=true ⇔ status∈{probation,active,resigning}。 */
  occupiesPerson: boolean
  salaryMonthlyCents: number
  /** 调薪待生效值（§3.2/§7.2）；P1 命令侧预留。 */
  pendingSalaryMonthlyCents: number | null
  pendingEffectiveDay: number | null
  startDay: number
  /** available 截止判据（§6.1 Z2）。 */
  endDay: number | null
  /** 首期合同月数：决定薪资承诺 endAt（§7.2）；P1 单期。 */
  initialTermMonths: number
  /** 试用期结束转 active 时 +1（§4.2）。 */
  renewalCount: number
  /** §6.6 唯一状态量；morale = clamp(baseMorale + moraleModifier) 为派生，不存储。 */
  moraleModifier: number
  /** probationEndDay = startDay + probationMonths × workingDaysPerMonth（§4.2 C12 唯一口径）。 */
  probationEndDay: number
  /** resigning 期间非 null（§4.2）。 */
  noticeStartDay: number | null
  terminationKind: TerminationKind | null
  /** 当前薪资承诺（FIN §3.3 employment_salary；必填 INV-3）。 */
  salaryCommitmentId: string
  /**
   * P1 具体化缓存：连续无活跃分配日数（§6.9 idleDays 标"派生"，但"连续"需逐日历史，
   * P1 以字段缓存并随存档持久化；语义不变）。
   */
  idleDays?: number
  version: number
  createdAt: number
  updatedAt: number
}

// ===== §3.4 Assignment（P1 双轨期：权威寄存于 Project.teamAssignments，此为命令侧校验与投影输入形状） =====

export interface D03Assignment {
  assignmentId: string
  employmentId: string
  projectId: string
  /** 必填；越界值 ⇒ D03_UNKNOWN_SKILL（§7.1，不影响 team_d）。 */
  discipline: D03Discipline
  allocationRatio: number
  effectiveFrom: number | null
  effectiveTo: number | null
  roleOnProject: ProjectRole
}

// ===== §3.5 Candidate（P1 有限候选池） =====

export interface Candidate {
  candidateId: string
  personId: string
  regionId: string
  /** 主学科（S5-1：五学科随机分配）。 */
  discipline: D03Discipline
  /** 主学科等级（S5-1：D-03 现值区间 0..5 均匀分布）。 */
  skillLevel: number
  askingSalaryCents: number
  availableFromDay: number
  expiresAtDay: number
}

/** REC-04B：候选确认后、正式到岗前的招聘预留。不得伪装成 Employment。 */
export interface PendingHire {
  pendingHireId: string
  employmentId: string
  personId: string
  companyId: string
  candidateId: string
  role: EmployeeRole
  discipline: D03Discipline
  skillLevel: number
  seniority: 'junior' | 'senior'
  negotiatedSalaryCents: number
  askingSalaryCents: number
  initialTermMonths: number
  hireConfirmDay: number
  /** 候选最初可入职日；用于取消后无参数漂移地恢复候选。 */
  candidateAvailableFromDay: number
  arrivalDay: number
  candidateExpiresAtDay: number
  salaryCommitmentId: string
  recruitFeeCommitmentId: string
  state: 'pending' | 'arrived' | 'cancelled'
  cancelledAtDay: number | null
}

// ===== §11 S7 版本与参数快照（C13 必存项） =====

export interface PersonnelFormulaSnapshot {
  version: string
  params: Record<string, number>
  createdAt: number
}

// ===== §7.1 PersonnelProjection =====

export interface PersonnelProjection {
  employmentId: string
  personId: string
  /** 全部五学科；缺键=0（Project B-9）。 */
  skillLevels: Record<D03Discipline, number>
  /** §6.1 Z2（仅 Employment 可用性）。 */
  available: boolean
  /** D-03 内部字段；notForCap: true（§6.2 版本闸门），Project 不得读取。 */
  effShare: number
  notForCap: true
  salaryMonthlyCents: number
}

// ===== §10 异常码（E1–E15 全集 + 数据修复日志码） =====

export const D03_ERROR = {
  TEAM_EMPTY: 'D03_TEAM_EMPTY',
  DANGLING_TEAMREF: 'D03_DANGLING_TEAMREF',
  UNKNOWN_SKILL: 'D03_UNKNOWN_SKILL',
  OVER_ALLOCATED: 'D03_OVER_ALLOCATED',
  PERSON_STATUS_DESYNC: 'D03_PERSON_STATUS_DESYNC',
  ALREADY_EMPLOYED: 'D03_ALREADY_EMPLOYED',
  CANDIDATE_EXPIRED: 'D03_CANDIDATE_EXPIRED',
  OFFER_BELOW_FLOOR: 'D03_OFFER_BELOW_FLOOR',
  OFFER_INVALID: 'D03_OFFER_INVALID',
  HEADCOUNT_FULL: 'D03_HEADCOUNT_FULL',
  DUPLICATE_CANDIDATE: 'D03_DUPLICATE_CANDIDATE',
  ALREADY_TERMINATED: 'D03_ALREADY_TERMINATED',
  EMP_NOT_FOUND: 'D03_EMP_NOT_FOUND',
  PERSON_NOT_FOUND: 'D03_PERSON_NOT_FOUND',
  CANDIDATE_NOT_FOUND: 'D03_CANDIDATE_NOT_FOUND',
  NOTICE_REQUIRED: 'D03_NOTICE_REQUIRED',
  SALARY_COMMITMENT_MISSING: 'D03_SALARY_COMMITMENT_MISSING',
  HIRE_PENDING: 'D03_HIRE_PENDING',
  HIRE_ALREADY_ARRIVED: 'D03_HIRE_ALREADY_ARRIVED',
  DATA_REPAIR: 'D03_DATA_REPAIR',
} as const

export type D03ErrorCode = (typeof D03_ERROR)[keyof typeof D03_ERROR]

export interface D03Error {
  code: D03ErrorCode
  message: string
  /** 修复建议（§7.1 C14：DESYNC 必须给出）。 */
  repairHint?: string
}

export interface D03Result<T> {
  ok: boolean
  value?: T
  error?: D03Error
}

export function d03Ok<T>(value: T): D03Result<T> {
  return { ok: true, value }
}

export function d03Fail<T = never>(code: D03ErrorCode, message: string, repairHint?: string): D03Result<T> {
  return { ok: false, error: { code, message, ...(repairHint !== undefined ? { repairHint } : {}) } }
}
