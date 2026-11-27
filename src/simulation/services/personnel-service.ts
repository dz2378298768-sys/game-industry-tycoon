/**
 * PersonnelService —— D-03 人才与组织运行时编排（TASK-P1-CODE-06）。
 *
 * 职责：Person/Employment/Candidate/PersonEvent 的命令侧与每日 tick；
 * 纯函数（状态机/士气/成长/薪资承诺）在 value-objects，本类只做编排与持久化形状回写。
 *
 * 财务红线（R-D03-3）：本类从不调用 postTransaction、从不读写 Company.cash；
 * 薪资/招聘费/遣散全部经 FIN 承诺（registerCommitment / releaseCommitment / realizeCommitment）。
 *
 * 双轨（任务卡 §6 风险提示）：legacy `Employee` 保留为派生视图，由 reconcileEmployeeView
 * 从 Employment 同步状态；零回归期间两条轨道并存，切换由后续任务执行。
 */
import type { Employee } from '@domain/entities/employee'
import type { EmployeeRole } from '@domain/enums'
import type {
  Candidate,
  D03Discipline,
  D03Result,
  Employment,
  Person,
  PersonEvent,
  PendingHire,
  PersonnelFormulaSnapshot,
} from '@domain/entities/personnel'
import {
  D03_ERROR,
  d03Fail,
  d03Ok,
} from '@domain/entities/personnel'
import {
  DEFAULT_PERSONNEL_PARAMS,
  createPersonnelSnapshot,
  type PersonnelParams,
} from '@domain/value-objects/personnel-tuning'
import {
  beginResigning,
  completeResigning,
  computeProbationEndDay,
  isProbationExpired,
  passProbation,
  terminateEmployment,
} from '@domain/value-objects/personnel-status'
import { deriveMorale, deltaMorale, nextMoraleModifier, zeroMoraleInput, type MoraleDayInput } from '@domain/value-objects/personnel-morale'
import { dailyResignProb, hash01, shouldResign } from '@domain/value-objects/personnel-resign'
import { recordWpCompletion } from '@domain/value-objects/personnel-growth'
import {
  buildRecruitFeeCommitment,
  buildSeveranceCommitment,
  buildSalaryCommitment,
  cancelEffectiveMonthFor,
  realizeCommitmentFor,
  startOfMonthDay,
} from '@domain/value-objects/personnel-salary'
import { refreshCandidatePool } from '@domain/value-objects/personnel-candidates'
import { isRetirementDue } from '@domain/value-objects/personnel-salary'
import { monthKeyOf } from '@domain/value-objects/finance-commitment'
import type { FinanceService } from './finance-service'
import { uuid } from '@domain/types'
import type { CandidatePoolGuardInput } from '@domain/value-objects/personnel-candidates'

export const D03_SCHEMA_VERSION = 3

export interface PersonnelStateSlice {
  persons: Person[]
  employments: Employment[]
  candidates: Candidate[]
  personEvents: PersonEvent[]
  pendingHires: PendingHire[]
}

/** 每日 tick 输入（§8.2；全部由调用方注入，公式层不读 TUNING——§18.3）。 */
export interface DailyTickInput {
  day: number
  /** 当日活跃分配（employmentId 视角，来自 Project.teamAssignments 派生）。 */
  activeEmploymentIds: ReadonlySet<string>
  /** 是否存在在产项目（怠工压力的前提 §6.6）。 */
  anyProjectInProduction: boolean
  /** 当日该公司解雇人数 / 团队人数（RULE-12 外溢，按公司给）。 */
  layoffSpillRatioByCompany?: ReadonlyMap<string, number>
  /** 市场月薪基准（欠薪诱因 §6.7）。 */
  marketSalaryOf: (companyId: string, employment: Employment) => number
}

export interface HireCommand {
  companyId: string
  employmentId?: string
  name: string
  role: EmployeeRole
  skillLevel: number
  salaryMonthlyCents: number
  day: number
  primaryDiscipline?: D03Discipline
  /** 合同月数；缺省 P1_DEFAULT_TERM_MONTHS。 */
  initialTermMonths?: number
  /** headcount 上限判定（R3 countOccupyingByCompany）。 */
  headcountLimit?: number
}

export interface RecruitFromPoolCommand {
  candidateId: string
  companyId: string
  playerOfferCents: number
  day: number
  headcountLimit?: number
  /** B-01a：由调用方传入的确定性 employmentId（同 seed + 序号）。 */
  employmentId?: string
}

export interface PendingArrival {
  pendingHire: PendingHire
  employment: Employment
  feeCents: number
}

export type PendingCompanyStatus = 'active' | 'bankrupt' | 'dissolved' | string

/** role → 默认主学科（§3.2：role 仅影响默认学科提示）。 */
function defaultDisciplineOfRole(role: EmployeeRole): D03Discipline | null {
  switch (role) {
    case 'designer': return 'design'
    case 'programmer': return 'code'
    case 'artist': return 'art'
    case 'audio_designer': return 'audio'
    case 'qa': return 'qa'
    default: return null
  }
}

export class PersonnelService {
  private persons: Person[] = []
  private employments: Employment[] = []
  private candidates: Candidate[] = []
  private personEvents: PersonEvent[] = []
  private pendingHires: PendingHire[] = []
  private snapshot: PersonnelFormulaSnapshot = createPersonnelSnapshot(0)
  private finance: FinanceService
  private params: PersonnelParams
  /** B-01a：由调用方注入的确定性 employmentId 生成器（seed + 递增序号）。 */
  private readonly nextEmploymentIdFactory: (() => string) | undefined

  constructor(deps: {
    finance: FinanceService
    params?: PersonnelParams
    nextEmploymentId?: () => string
  }) {
    this.finance = deps.finance
    this.params = deps.params ?? DEFAULT_PERSONNEL_PARAMS
    this.nextEmploymentIdFactory = deps.nextEmploymentId
  }

  /** 内部 employmentId 兜底（池招聘/跳槽）：注入时用确定性序列，独立单测未注入时保留 uuid()。 */
  private nextEmploymentId(): string {
    return this.nextEmploymentIdFactory?.() ?? uuid()
  }

  get tuning(): PersonnelParams {
    return this.params
  }

  get formulaSnapshot(): PersonnelFormulaSnapshot {
    return this.snapshot
  }

  /** 从 WorldState 切片接管状态（GameWorld 每次命令前调用，避免服务内陈旧引用）。 */
  adopt(slice: Partial<PersonnelStateSlice>, snapshot?: PersonnelFormulaSnapshot): void {
    this.persons = [...(slice.persons ?? [])]
    this.employments = [...(slice.employments ?? [])]
    this.candidates = [...(slice.candidates ?? [])]
    this.personEvents = [...(slice.personEvents ?? [])]
    this.pendingHires = [...(slice.pendingHires ?? [])]
    if (snapshot !== undefined) {
      this.snapshot = snapshot
      // §18.3：公式参数快照是权威调参入口（存档持久化/测试覆盖均经此注入），
      // adopt 时同步生效；快照缺失键回退 DEFAULT（expCap 等数组字段一并覆盖）。
      this.params = { ...DEFAULT_PERSONNEL_PARAMS, ...(snapshot.params as Partial<typeof this.params>) }
    }
  }

  /** 回写 WorldState 切片（GameWorld 命令后调用）。 */
  toSlice(): PersonnelStateSlice & { snapshot: PersonnelFormulaSnapshot; d03SchemaVersion: number } {
    return {
      persons: [...this.persons],
      employments: [...this.employments],
      candidates: [...this.candidates],
      personEvents: [...this.personEvents],
      pendingHires: [...this.pendingHires],
      snapshot: this.snapshot,
      d03SchemaVersion: D03_SCHEMA_VERSION,
    }
  }

  // ===== 查询 =====

  listEmployments(): Employment[] {
    return [...this.employments]
  }

  listPersons(): Person[] {
    return [...this.persons]
  }

  listCandidates(): Candidate[] {
    return [...this.candidates]
  }

  listPersonEvents(): PersonEvent[] {
    return [...this.personEvents]
  }

  listPendingHires(companyId?: string): PendingHire[] {
    return this.pendingHires.filter((h) => companyId === undefined || h.companyId === companyId)
  }

  countHeadcountByCompany(companyId: string): number {
    return this.countOccupyingByCompany(companyId) + this.pendingHires.filter((h) => h.companyId === companyId && h.state === 'pending').length
  }

  getEmployment(employmentId: string): Employment | undefined {
    return this.employments.find((e) => e.employmentId === employmentId)
  }

  getPerson(personId: string): Person | undefined {
    return this.persons.find((p) => p.personId === personId)
  }

  /** R2/R3 新口径：在职 = occupiesPerson=true（含 probation/active/resigning）。 */
  occupyingByCompany(companyId: string): Employment[] {
    return this.employments.filter((e) => e.companyId === companyId && e.occupiesPerson)
  }

  countOccupyingByCompany(companyId: string): number {
    return this.occupyingByCompany(companyId).length
  }

  employmentOfPerson(personId: string): Employment | undefined {
    return this.employments.find((e) => e.personId === personId && e.occupiesPerson)
  }

  // ===== 招聘 =====

  /**
   * 直接招聘（双轨兼容入口：legacy hireEmployee 继续可用；R7 的候选池入口见 recruitFromCandidate）。
   * 创建 Person + Employment(probation) + 薪资承诺 + 招聘费承诺（arrivalDay 兑现）。
   */
  hire(cmd: HireCommand): D03Result<{ person: Person; employment: Employment; feeCents: number }> {
    if (!Number.isInteger(cmd.skillLevel) || cmd.skillLevel < 1 || cmd.skillLevel > 5) {
      return d03Fail(D03_ERROR.OFFER_INVALID, 'skillLevel 必须是 1-5 整数')
    }
    if (!Number.isInteger(cmd.salaryMonthlyCents) || cmd.salaryMonthlyCents <= 0) {
      return d03Fail(D03_ERROR.OFFER_INVALID, '月薪必须是正整数美分')
    }
    if (cmd.headcountLimit !== undefined && this.countHeadcountByCompany(cmd.companyId) >= cmd.headcountLimit) {
      return d03Fail(D03_ERROR.HEADCOUNT_FULL, `管理容量已满（${cmd.headcountLimit} 人）`)
    }
    const employmentId = cmd.employmentId ?? this.nextEmploymentId()
    const personId = `d03-per-${employmentId}`
    const discipline = cmd.primaryDiscipline ?? defaultDisciplineOfRole(cmd.role)
    const termMonths = cmd.initialTermMonths ?? this.params.p1DefaultTermMonths
    const day = cmd.day

    const person: Person = {
      personId,
      displayName: cmd.name,
      birthDay: Math.max(0, day - 30 * 365),
      regionId: 'default',
      skills: {
        personId,
        level: discipline !== null ? { [discipline]: cmd.skillLevel } : {},
        exp: {},
        lastLevelUpDay: {},
      },
      seniority: cmd.skillLevel >= 4 ? 'senior' : 'junior',
      traits: null,
      preferences: null,
      baseMorale: Math.max(this.params.startingMoraleFloor, 70),
      status: 'on_leave',
      currentEmploymentId: employmentId,
      careerRecord: [],
      rehireCount: 0,
      version: 1,
      createdAt: day,
      updatedAt: day,
    }

    const salaryCommitmentId = `d03-sal-${employmentId}`
    const employment: Employment = {
      employmentId,
      personId,
      companyId: cmd.companyId,
      role: cmd.role,
      status: 'probation',
      occupiesPerson: true,
      salaryMonthlyCents: cmd.salaryMonthlyCents,
      pendingSalaryMonthlyCents: null,
      pendingEffectiveDay: null,
      startDay: day,
      endDay: null,
      initialTermMonths: termMonths,
      renewalCount: 0,
      moraleModifier: 0,
      probationEndDay: computeProbationEndDay(day, this.params.probationMonths, this.params.workingDaysPerMonth),
      noticeStartDay: null,
      terminationKind: null,
      salaryCommitmentId,
      version: 1,
      createdAt: day,
      updatedAt: day,
    }

    // 薪资承诺（§7.2：创建时不改现金，BR-3）
    const salaryInput = buildSalaryCommitment(employment)
    const reg = this.finance.getLedger().registerCommitment(salaryInput)
    if (!reg.success) {
      return d03Fail(D03_ERROR.SALARY_COMMITMENT_MISSING, reg.errorMessage ?? '薪资承诺注册失败')
    }
    // 招聘费（one_off，S5-3）：hireConfirmDay 创建，arrivalDay 兑现（P1 直接招聘 arrivalDay = 确认日）
    const feeInput = buildRecruitFeeCommitment(employmentId, cmd.companyId, cmd.salaryMonthlyCents, day, this.params)
    const feeReg = this.finance.getLedger().registerCommitment(feeInput)
    if (!feeReg.success) {
      return d03Fail(D03_ERROR.OFFER_INVALID, feeReg.errorMessage ?? '招聘费承诺注册失败')
    }
    let feeCents = feeInput.amountCents
    if (feeInput.startAt <= day) {
      const realized = realizeCommitmentFor(feeReg.result!.commitment, this.finance.getLedger(), day, {
        categoryOverride: 'project_expense',
        description: `入职成本：${cmd.name}`,
      })
      if ('errorCode' in realized) {
        return d03Fail(D03_ERROR.OFFER_INVALID, realized.errorMessage)
      }
      feeCents = realized.amountCents
    }

    this.persons.push(person)
    this.employments.push(employment)
    this.emit({
      eventId: uuid(),
      personId,
      day,
      kind: 'hired',
      payload: { employmentId, companyId: cmd.companyId, salaryMonthlyCents: cmd.salaryMonthlyCents },
    })
    return d03Ok({ person, employment, feeCents })
  }

  /**
   * 从候选池确认招聘（RULE-04/05 + §6.3 定价）。确认只创建 PendingHire；
   * Employment、项目产能和招聘费交易均延迟到 arrivalDay。
   */
  recruitFromCandidate(
    cmd: RecruitFromPoolCommand,
    marketSalaryOf: (d: D03Discipline) => number,
  ): D03Result<{ person: Person; pendingHire: PendingHire; employment?: Employment; feeCents: number; arrivalDay: number }> {
    const candidate = this.candidates.find((c) => c.candidateId === cmd.candidateId)
    if (candidate === undefined) {
      const reserved = this.pendingHires.find((h) => h.candidateId === cmd.candidateId && h.state === 'pending')
      if (reserved !== undefined) return d03Fail(D03_ERROR.HIRE_PENDING, '候选人已被预留，等待到岗')
      return d03Fail(D03_ERROR.CANDIDATE_NOT_FOUND, `候选 ${cmd.candidateId} 不存在`)
    }
    if (cmd.day > candidate.expiresAtDay) return d03Fail(D03_ERROR.CANDIDATE_EXPIRED, '候选已过期')
    if (this.employmentOfPerson(candidate.personId) !== undefined) {
      return d03Fail(D03_ERROR.ALREADY_EMPLOYED, '候选人已被雇佣')
    }
    const existingPending = this.pendingHires.find((h) => h.personId === candidate.personId && h.state === 'pending')
    if (existingPending !== undefined) {
      return d03Fail(D03_ERROR.HIRE_PENDING, '候选人已被预留，等待到岗')
    }
    if (cmd.headcountLimit !== undefined && this.countHeadcountByCompany(cmd.companyId) >= cmd.headcountLimit) {
      return d03Fail(D03_ERROR.HEADCOUNT_FULL, `管理容量已满（${cmd.headcountLimit} 人）`)
    }
    const market = marketSalaryOf(candidate.discipline)
    const floor = Math.round(market * this.params.floorPriceRatio)
    const ceiling = Math.round(market * this.params.ceilingPriceRatio)
    if (cmd.playerOfferCents < floor) {
      return d03Fail(D03_ERROR.OFFER_BELOW_FLOOR, `报价低于下限 $${(floor / 100).toFixed(0)}`)
    }
    const negotiated = Math.min(cmd.playerOfferCents, ceiling)
    const person = this.getPerson(candidate.personId)
    if (person === undefined) return d03Fail(D03_ERROR.PERSON_NOT_FOUND, '候选人物不存在')
    const level = person.skills.level[candidate.discipline] ?? candidate.skillLevel
    const seniority = person.seniority
    const leadDays = this.params.baseLeadDays + (seniority === 'senior' ? this.params.kLead : 0)
    const arrivalDay = cmd.day + leadDays
    const employmentId = cmd.employmentId ?? this.nextEmploymentId()
    const role: EmployeeRole = candidate.discipline === 'code' ? 'programmer'
      : candidate.discipline === 'design' ? 'designer'
        : candidate.discipline === 'art' ? 'artist'
          : candidate.discipline === 'audio' ? 'audio_designer' : 'qa'
    const termMonths = this.params.p1DefaultTermMonths
    const salaryCommitmentId = `d03-sal-${employmentId}`
    const recruitFeeCommitmentId = `d03-rec-${employmentId}`
    const pendingEmployment: Employment = {
      employmentId,
      personId: person.personId,
      companyId: cmd.companyId,
      role,
      status: 'probation',
      occupiesPerson: true,
      salaryMonthlyCents: negotiated,
      pendingSalaryMonthlyCents: null,
      pendingEffectiveDay: null,
      startDay: arrivalDay,
      endDay: null,
      initialTermMonths: termMonths,
      renewalCount: 0,
      moraleModifier: 0,
      probationEndDay: computeProbationEndDay(arrivalDay, this.params.probationMonths, this.params.workingDaysPerMonth),
      noticeStartDay: null,
      terminationKind: null,
      salaryCommitmentId,
      version: 1,
      createdAt: cmd.day,
      updatedAt: arrivalDay,
    }
    const salaryReg = this.finance.getLedger().registerCommitment(buildSalaryCommitment(pendingEmployment))
    if (!salaryReg.success) return d03Fail(D03_ERROR.SALARY_COMMITMENT_MISSING, salaryReg.errorMessage ?? '薪资承诺注册失败')
    const feeInput = buildRecruitFeeCommitment(employmentId, cmd.companyId, negotiated, arrivalDay, this.params)
    const feeReg = this.finance.getLedger().registerCommitment(feeInput)
    if (!feeReg.success) {
      this.finance.getLedger().releaseCommitment(cmd.companyId, salaryCommitmentId, monthKeyOf(startOfMonthDay(arrivalDay)))
      return d03Fail(D03_ERROR.OFFER_INVALID, feeReg.errorMessage ?? '招聘费承诺注册失败')
    }
    const pendingHire: PendingHire = {
      pendingHireId: `d03-pending-${employmentId}`,
      employmentId,
      personId: person.personId,
      companyId: cmd.companyId,
      candidateId: candidate.candidateId,
      role,
      discipline: candidate.discipline,
      skillLevel: Math.max(1, Math.min(5, level)),
      seniority,
      negotiatedSalaryCents: negotiated,
      askingSalaryCents: candidate.askingSalaryCents,
      initialTermMonths: termMonths,
      hireConfirmDay: cmd.day,
      candidateAvailableFromDay: candidate.availableFromDay,
      arrivalDay,
      candidateExpiresAtDay: candidate.expiresAtDay,
      salaryCommitmentId,
      recruitFeeCommitmentId,
      state: 'pending',
      cancelledAtDay: null,
    }
    this.candidates = this.candidates.filter((c) => c.candidateId !== cmd.candidateId)
    this.pendingHires.push(pendingHire)
    this.emit({
      eventId: uuid(),
      personId: person.personId,
      day: cmd.day,
      kind: 'hired',
      payload: { pendingHireId: pendingHire.pendingHireId, companyId: cmd.companyId, arrivalDay },
    })
    return d03Ok({ person, pendingHire, feeCents: feeInput.amountCents, arrivalDay })
  }

  /**
   * 到岗阶段（必须在月度工资结算前调用）。只有 active 公司才会生效；
   * bankrupt/dissolved 的待到岗项由同一阶段取消。重复调用只处理 pending，保证费用/Employment 幂等。
   */
  processPendingArrivals(
    day: number,
    companyStatus: (companyId: string) => PendingCompanyStatus = () => 'active',
  ): PendingArrival[] {
    const arrivals: PendingArrival[] = []
    for (const pending of [...this.pendingHires]) {
      if (pending.state !== 'pending') continue
      const status = companyStatus(pending.companyId)
      if (status !== 'active') {
        this.cancelPendingHireInternal(pending, day, true)
        continue
      }
      if (pending.arrivalDay > day) continue
      const person = this.getPerson(pending.personId)
      if (person === undefined) continue
      const existing = this.getEmployment(pending.employmentId)
      if (existing !== undefined) {
        if (existing.occupiesPerson) {
          this.markPendingArrived(pending.pendingHireId)
          arrivals.push({ pendingHire: this.pendingHires.find((h) => h.pendingHireId === pending.pendingHireId) ?? pending, employment: existing, feeCents: 0 })
        }
        continue
      }
      if (this.employmentOfPerson(person.personId) !== undefined) continue
      const commitment = this.finance.getLedger().getCommitment(pending.companyId, pending.recruitFeeCommitmentId)
      if (commitment === undefined) continue
      const realized = realizeCommitmentFor(commitment, this.finance.getLedger(), day, {
        categoryOverride: 'project_expense',
        description: `入职成本：${person.displayName}`,
      })
      if ('errorCode' in realized) continue
      const employment = this.employmentFromPending(pending, day)
      this.replaceEmployment(employment)
      this.markPendingArrived(pending.pendingHireId)
      this.emit({
        eventId: uuid(),
        personId: person.personId,
        day,
        kind: 'hired',
        payload: { employmentId: employment.employmentId, arrivalDay: pending.arrivalDay, feeCents: realized.amountCents },
      })
      const arrived = this.pendingHires.find((h) => h.pendingHireId === pending.pendingHireId) ?? pending
      arrivals.push({ pendingHire: arrived, employment, feeCents: realized.amountCents })
    }
    return arrivals
  }

  /** 玩家取消到岗前招聘；同一 pending 的重复取消返回已取消快照。 */
  cancelPendingHire(pendingHireId: string, day: number): D03Result<PendingHire> {
    const pending = this.pendingHires.find((h) => h.pendingHireId === pendingHireId)
    if (pending === undefined) return d03Fail(D03_ERROR.CANDIDATE_NOT_FOUND, `待到岗招聘 ${pendingHireId} 不存在`)
    if (pending.state === 'cancelled') return d03Ok(pending)
    if (pending.state !== 'pending' || day >= pending.arrivalDay) {
      return d03Fail(D03_ERROR.HIRE_ALREADY_ARRIVED, '招聘已到岗，不能取消')
    }
    this.cancelPendingHireInternal(pending, day, false)
    return d03Ok(this.pendingHires.find((h) => h.pendingHireId === pendingHireId) ?? pending)
  }

  /** 公司破产/解散钩子：取消仍未到岗项并释放未来承诺。 */
  cancelPendingHiresForCompany(companyId: string, day: number): PendingHire[] {
    const cancelled: PendingHire[] = []
    for (const pending of [...this.pendingHires]) {
      if (pending.companyId !== companyId || pending.state !== 'pending') continue
      if (pending.arrivalDay <= day) continue
      this.cancelPendingHireInternal(pending, day, true)
      const next = this.pendingHires.find((h) => h.pendingHireId === pending.pendingHireId)
      if (next !== undefined) cancelled.push(next)
    }
    return cancelled
  }

  private employmentFromPending(pending: PendingHire, day: number): Employment {
    return {
      employmentId: pending.employmentId,
      personId: pending.personId,
      companyId: pending.companyId,
      role: pending.role,
      status: 'probation',
      occupiesPerson: true,
      salaryMonthlyCents: pending.negotiatedSalaryCents,
      pendingSalaryMonthlyCents: null,
      pendingEffectiveDay: null,
      startDay: pending.arrivalDay,
      endDay: null,
      initialTermMonths: pending.initialTermMonths,
      renewalCount: 0,
      moraleModifier: 0,
      probationEndDay: computeProbationEndDay(pending.arrivalDay, this.params.probationMonths, this.params.workingDaysPerMonth),
      noticeStartDay: null,
      terminationKind: null,
      salaryCommitmentId: pending.salaryCommitmentId,
      version: 1,
      createdAt: pending.hireConfirmDay,
      updatedAt: day,
    }
  }

  private markPendingArrived(pendingHireId: string): void {
    const index = this.pendingHires.findIndex((h) => h.pendingHireId === pendingHireId)
    if (index < 0) return
    this.pendingHires[index] = { ...this.pendingHires[index]!, state: 'arrived' as const, cancelledAtDay: null }
  }

  private cancelPendingHireInternal(pending: PendingHire, day: number, system: boolean): void {
    if (pending.state !== 'pending') return
    const effectiveMonth = monthKeyOf(startOfMonthDay(pending.arrivalDay))
    this.finance.getLedger().releaseCommitment(pending.companyId, pending.salaryCommitmentId, effectiveMonth)
    this.finance.getLedger().releaseCommitment(pending.companyId, pending.recruitFeeCommitmentId, effectiveMonth)
    const candidateExists = this.candidates.some((c) => c.candidateId === pending.candidateId || c.personId === pending.personId)
    const person = this.getPerson(pending.personId)
    if (!candidateExists && person !== undefined && pending.candidateExpiresAtDay >= day) {
      this.candidates.push({
        candidateId: pending.candidateId,
        personId: pending.personId,
        regionId: person.regionId,
        discipline: pending.discipline,
        skillLevel: pending.skillLevel,
        askingSalaryCents: pending.askingSalaryCents,
        availableFromDay: pending.candidateAvailableFromDay,
        expiresAtDay: pending.candidateExpiresAtDay,
      })
    }
    const index = this.pendingHires.findIndex((h) => h.pendingHireId === pending.pendingHireId)
    if (index >= 0) this.pendingHires[index] = { ...pending, state: 'cancelled', cancelledAtDay: day }
    this.emit({
      eventId: uuid(),
      personId: pending.personId,
      day,
      kind: 'hired',
      payload: { pendingHireId: pending.pendingHireId, cancelled: true, system },
    })
  }

  // ===== 解雇 / 辞职 / 跳槽 =====

  /** RULE-11 玩家解雇：立即 terminated + cancel(次月停) + 遣散承诺兑现 + RULE-12 外溢由调用方处理。 */
  fire(employmentId: string, day: number): D03Result<{ employment: Employment; severanceCents: number }> {
    const employment = this.getEmployment(employmentId)
    if (employment === undefined) return d03Fail(D03_ERROR.EMP_NOT_FOUND, `Employment ${employmentId} 不存在`)
    if (!employment.occupiesPerson) {
      return d03Fail(D03_ERROR.ALREADY_TERMINATED, `Employment ${employmentId} status=${employment.status}，不可重复解雇`)
    }
    const terminated = terminateEmployment(employment, 'terminated', day)
    if (!terminated.ok || !terminated.value) {
      return d03Fail(terminated.error!.code, terminated.error!.message, terminated.error!.repairHint)
    }
    const next = terminated.value
    // 停付唯一入口（ADJ-09）：effectiveMonth = monthOf(endDay) + 1，离职当月照常兑现。
    this.cancelSalaryCommitment(next, day)
    // 遣散（§6.4）：one_off 承诺当日创建并兑现，category=severance。
    const sevInput = buildSeveranceCommitment({ ...next, status: employment.status }, day, this.params)
    const reg = this.finance.getLedger().registerCommitment(sevInput)
    if (!reg.success) return d03Fail(D03_ERROR.EMP_NOT_FOUND, reg.errorMessage ?? '遣散承诺注册失败')
    const realized = realizeCommitmentFor(reg.result!.commitment, this.finance.getLedger(), day, {
      categoryOverride: 'severance',
      description: `解雇补偿：${employment.employmentId}`,
    })
    if ('errorCode' in realized) return d03Fail(D03_ERROR.EMP_NOT_FOUND, realized.errorMessage)
    this.replaceEmployment(next)
    this.emit({
      eventId: uuid(),
      personId: next.personId,
      day,
      kind: 'terminated',
      payload: { employmentId, reason: 'player_dismissal', severanceCents: realized.amountCents },
    })
    return d03Ok({ employment: next, severanceCents: realized.amountCents })
  }

  /** RULE-10：自愿辞职/退休只经 active→resigning；cancel(effectiveMonth=monthOf(endDay)+1)。 */
  resign(employmentId: string, day: number, reason: 'voluntary' | 'retire'): D03Result<Employment> {
    const employment = this.getEmployment(employmentId)
    if (employment === undefined) return d03Fail(D03_ERROR.EMP_NOT_FOUND, `Employment ${employmentId} 不存在`)
    const r = beginResigning(employment, day, this.params.noticeDays)
    if (!r.ok || !r.value) return r
    this.cancelSalaryCommitment(r.value, r.value.endDay ?? day)
    this.replaceEmployment(r.value)
    this.emit({
      eventId: uuid(),
      personId: r.value.personId,
      day,
      kind: 'resigned',
      payload: { employmentId, reason },
    })
    return d03Ok(r.value)
  }

  /** RULE-03 跳槽：关闭旧 Employment（不复制 Person/技能）、新建新 Employment。P1 直接关闭（无通知期）。 */
  transfer(personId: string, toCompanyId: string, day: number, salaryMonthlyCents: number): D03Result<{ old: Employment; next: Employment }> {
    const old = this.employmentOfPerson(personId)
    if (old === undefined) return d03Fail(D03_ERROR.EMP_NOT_FOUND, `personId=${personId} 无 occupying Employment`)
    const closed = terminateEmployment(old, 'terminated', day)
    if (!closed.ok || !closed.value) {
      return d03Fail(closed.error!.code, closed.error!.message, closed.error!.repairHint)
    }
    // 自愿跳槽无遣散（§6.4 仅解雇/试用失败）；薪资承诺按次月停取消。
    this.cancelSalaryCommitment(closed.value, day)
    this.replaceEmployment(closed.value)
    const person = this.getPerson(personId)
    if (person === undefined) return d03Fail(D03_ERROR.PERSON_NOT_FOUND, 'Person 不存在')
    const employmentId = this.nextEmploymentId()
    const next: Employment = {
      employmentId,
      personId,
      companyId: toCompanyId,
      role: old.role,
      status: 'probation',
      occupiesPerson: true,
      salaryMonthlyCents,
      pendingSalaryMonthlyCents: null,
      pendingEffectiveDay: null,
      startDay: day,
      endDay: null,
      initialTermMonths: this.params.p1DefaultTermMonths,
      renewalCount: 0,
      moraleModifier: 0,
      probationEndDay: computeProbationEndDay(day, this.params.probationMonths, this.params.workingDaysPerMonth),
      noticeStartDay: null,
      terminationKind: null,
      salaryCommitmentId: `d03-sal-${employmentId}`,
      version: 1,
      createdAt: day,
      updatedAt: day,
    }
    const reg = this.finance.getLedger().registerCommitment(buildSalaryCommitment(next))
    if (!reg.success) return d03Fail(D03_ERROR.SALARY_COMMITMENT_MISSING, reg.errorMessage ?? '薪资承诺注册失败')
    this.employments.push(next)
    const personIdx = this.persons.indexOf(person)
    this.persons[personIdx] = {
      ...person,
      currentEmploymentId: employmentId,
      status: 'on_leave',
      updatedAt: day,
      version: person.version + 1,
    }
    return d03Ok({ old: closed.value, next })
  }

  // ===== 分配（命令侧校验；权威寄存于 Project.teamAssignments，双轨期投影派生） =====

  /** RULE-07/09：Σ allocationRatio ≤ 1.0；resigning 不得新增分配。 */
  validateAssignment(
    employmentId: string,
    newRatio: number,
    currentAssignments: ReadonlyArray<{ employmentId: string; allocationRatio: number }>,
  ): D03Result<null> {
    const employment = this.getEmployment(employmentId)
    if (employment === undefined) return d03Fail(D03_ERROR.EMP_NOT_FOUND, `Employment ${employmentId} 不存在`)
    if (employment.status === 'resigning') {
      return d03Fail(D03_ERROR.NOTICE_REQUIRED, 'resigning 期间不得新增分配（RULE-09）')
    }
    const sum = currentAssignments
      .filter((a) => a.employmentId === employmentId)
      .reduce((s, a) => s + a.allocationRatio, 0)
    if (sum + newRatio > 1.0 + 1e-9) {
      return d03Fail(D03_ERROR.OVER_ALLOCATED, `Σ allocationRatio = ${(sum + newRatio).toFixed(2)} > 1.0`)
    }
    return d03Ok(null)
  }

  // ===== 成长（S5-2 最小实现） =====

  /** 完成 WP：对应学科 +0.1 档经验值内部累计（ADJ-2026-11-22-12 S5-2）。 */
  recordWorkPackageCompletion(employmentId: string, discipline: D03Discipline, day: number): D03Result<{ leveledUp: boolean; newLevel?: number }> {
    const employment = this.getEmployment(employmentId)
    if (employment === undefined) return d03Fail(D03_ERROR.EMP_NOT_FOUND, `Employment ${employmentId} 不存在`)
    const person = this.getPerson(employment.personId)
    if (person === undefined) return d03Fail(D03_ERROR.PERSON_NOT_FOUND, 'Person 不存在')
    const outcome = recordWpCompletion(person.skills, discipline, day, this.params)
    const idx = this.persons.indexOf(person)
    this.persons[idx] = { ...person, skills: outcome.skills, updatedAt: day, version: person.version + 1 }
    if (outcome.leveledUp) {
      this.emit({
        eventId: uuid(),
        personId: person.personId,
        day,
        kind: 'level_up',
        payload: { employmentId, discipline, newLevel: outcome.newLevel },
      })
    }
    return d03Ok({ leveledUp: outcome.leveledUp, ...(outcome.newLevel !== undefined ? { newLevel: outcome.newLevel } : {}) })
  }

  // ===== 每日 tick（§8.2 自动化；ORD-01：人事变更先于月度结算，由调度器钩子保证） =====

  /**
   * 每日推进：试用期到期判定 → resigning 期满 → 退休判定 → 随机离职判定（§6.7）
   * → 士气单一递推（§6.6）→ idleDays 维护。全部确定性（hash01，可重放）。
   */
  dailyTick(input: DailyTickInput): { resignations: Employment[]; terminations: Employment[] } {
    const day = input.day
    const resignations: Employment[] = []
    const terminations: Employment[] = []

    for (const employment of [...this.employments]) {
      if (!employment.occupiesPerson) continue
      const person = this.getPerson(employment.personId)
      if (person === undefined) continue

      // (1) 试用期到期（§4.2）：morale ≥ probationFailMorale 通过，否则 terminated（遣散触发）
      if (employment.status === 'probation' && isProbationExpired(employment, day)) {
        const morale = deriveMorale(person, employment)
        if (morale >= this.params.probationFailMorale) {
          const passed = passProbation(employment, day)
          if (passed.ok && passed.value) this.replaceEmployment(passed.value)
        } else {
          const t = terminateEmployment(employment, 'terminated', day)
          if (t.ok && t.value) {
            this.cancelSalaryCommitment(t.value, day)
            const sevInput = buildSeveranceCommitment(employment, day, this.params)
            const reg = this.finance.getLedger().registerCommitment(sevInput)
            if (reg.success) {
              realizeCommitmentFor(reg.result!.commitment, this.finance.getLedger(), day, {
                categoryOverride: 'severance',
                description: `试用期未通过补偿：${employment.employmentId}`,
              })
            }
            this.replaceEmployment(t.value)
            terminations.push(t.value)
          }
        }
        continue
      }

      // (2) resigning 期满（day > endDay）：terminated(voluntary / contract_end=退休)
      if (employment.status === 'resigning' && employment.endDay !== null && day > employment.endDay) {
        const kind: 'voluntary' | 'contract_end' = employment.terminationKind === 'contract_end' ? 'contract_end' : 'voluntary'
        const done = completeResigning(employment, day, kind)
        if (done.ok && done.value) {
          this.replaceEmployment(done.value)
          terminations.push(done.value)
          this.emit({
            eventId: uuid(),
            personId: done.value.personId,
            day,
            kind: kind === 'contract_end' ? 'retired' : 'resigned',
            payload: { employmentId: employment.employmentId, completedAt: day },
          })
        }
        continue
      }

      // (3) 退休（§4.1 确定性触发，不走随机判定）：age ≥ retireAge 且无 resigning ⇒ resigning(reason=retire)
      if (employment.status === 'active' && isRetirementDue(person, day, this.params.retireAge)) {
        const r = this.resign(employment.employmentId, day, 'retire')
        if (r.ok && r.value) resignations.push(r.value)
        continue
      }

      // (4) 随机离职判定（§6.7；确定性 u = hash01(employmentId, day)；resigning 期间不重复判定）
      if (employment.status === 'active') {
        const idleDays = employment.idleDays ?? 0
        const prob = dailyResignProb(
          person,
          employment,
          input.marketSalaryOf(employment.companyId, employment),
          { idleDays, projectFailedFlag: false },
          this.params,
        )
        if (shouldResign(hash01(employment.employmentId, day), prob)) {
          const r = this.resign(employment.employmentId, day, 'voluntary')
          if (r.ok && r.value) resignations.push(r.value)
          continue
        }
      }

      // (5) 士气单一递推（§6.6）：Δ 由当日观测组成；无事件日按 (1−rate) 回归
      const moraleInput: MoraleDayInput = zeroMoraleInput()
      moraleInput.idle = !input.activeEmploymentIds.has(employment.employmentId) && input.anyProjectInProduction
      const spill = input.layoffSpillRatioByCompany?.get(employment.companyId)
      if (spill !== undefined) moraleInput.layoffSpillRatio = spill
      const delta = moraleInput
      const nextModifier = nextMoraleModifier(employment.moraleModifier, deltaMorale(delta, this.params), this.params)
      const idx = this.employments.indexOf(employment)
      this.employments[idx] = {
        ...employment,
        moraleModifier: nextModifier,
        idleDays: input.activeEmploymentIds.has(employment.employmentId) ? 0 : (employment.idleDays ?? 0) + 1,
        updatedAt: day,
        version: employment.version + 1,
      }
    }
    return { resignations, terminations }
  }


  // ===== 候选池（S5-1） =====

  /** §15.3 迁移产物并入（GameWorld.restore / seedAiCompanies 用）。 */
  mergeMigration(output: { persons: Person[]; employments: Employment[]; personEvents: PersonEvent[] }): void {
    this.persons.push(...output.persons)
    this.employments.push(...output.employments)
    this.personEvents.push(...output.personEvents)
  }

  /** 每游戏日刷新一次（§12）：5 名候选、五学科随机分配、档位 0..5 均匀（REC-04 扩展 S5-1）。 */
  refreshCandidatePool(day: number, marketSalaryOf: (d: D03Discipline) => number, regionId: string, guard?: CandidatePoolGuardInput): number {
    const occupied = new Set(
      [
        ...this.employments.filter((e) => e.occupiesPerson).map((e) => e.personId),
        ...this.pendingHires.filter((h) => h.state === 'pending').map((h) => h.personId),
      ],
    )
    const r = refreshCandidatePool({
      day,
      existing: this.candidates,
      occupiedPersonIds: occupied,
      params: this.params,
      marketSalaryOf,
      regionId,
      guard,
    })
    this.persons.push(...r.newPersons)
    this.candidates = r.candidates
    if (r.duplicatesRemoved.length > 0) {
      this.emit({
        eventId: uuid(),
        personId: 'pool',
        day,
        kind: 'hired',
        payload: { duplicateCandidatesRemoved: r.duplicatesRemoved, code: D03_ERROR.DUPLICATE_CANDIDATE },
      })
    }
    return r.supplementSequence
  }

  // ===== 派生 Employee 视图（双轨：零回归桥） =====

  /**
   * 用 Employment 状态同步 legacy Employee 视图（Employee 保留为派生视图，任务卡 §6）：
   * occupying → 'hired'；terminated(voluntary/contract_end) → 'resigned'；terminated(terminated) → 'fired'。
   * morale/fatigue/experience 等 legacy 每日字段保持不变（避免第二写入者冲突）。
   */
  reconcileEmployeeView(employees: readonly Employee[]): Employee[] {
    return employees.map((emp) => {
      const employment = this.getEmployment(emp.id)
      if (employment === undefined) return emp
      let status = emp.status
      if (employment.occupiesPerson) status = 'hired'
      else if (employment.terminationKind === 'voluntary' || employment.terminationKind === 'contract_end') status = 'resigned'
      else status = 'fired'
      if (status === emp.status) return emp
      return { ...emp, status, version: emp.version + 1, updatedAt: employment.updatedAt }
    })
  }

  // ===== 内部 =====

  private replaceEmployment(next: Employment): void {
    const idx = this.employments.findIndex((e) => e.employmentId === next.employmentId)
    if (idx >= 0) this.employments[idx] = next
    else this.employments.push(next)
    // Person.status 为派生字段（§4.3）：occupying 变更后按派生式回写（无分配 ⇒ on_leave）
    const person = this.getPerson(next.personId)
    if (person !== undefined) {
      const idx2 = this.persons.indexOf(person)
      this.persons[idx2] = {
        ...person,
        status: next.occupiesPerson ? 'on_leave' : 'departed',
        currentEmploymentId: next.occupiesPerson ? next.employmentId : null,
        rehireCount: next.occupiesPerson ? person.rehireCount : person.rehireCount + 1,
        updatedAt: next.updatedAt,
        version: person.version + 1,
      }
    }
  }

  /** 停付唯一入口（ADJ-09 / FIN-INT-01）：effectiveMonth 必填 = monthOf(endDay) + 1。 */
  private cancelSalaryCommitment(employment: Employment, endDay: number): void {
    const effectiveMonth = cancelEffectiveMonthFor(endDay)
    this.finance.getLedger().releaseCommitment(employment.companyId, employment.salaryCommitmentId, effectiveMonth)
  }

  private emit(event: PersonEvent): void {
    this.personEvents.push(event)
  }
}
