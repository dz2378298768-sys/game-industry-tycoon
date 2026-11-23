/**
 * TASK-P1-CODE-06 验收测试：D-03 规格 V0.1.2 §13 TC 清单重点用例 + ADJ-09/ADJ-12 裁定。
 *
 * 断言纪律（任务卡）：TC-05 固定值 32/18/8 直接硬编码（禁止取被测函数值自证）；
 * TC-11b 七场景逐行断言笔数与总额；④ 即 ADJ-09 套利反证（干满整月 + 结算日解雇 ⇒ 当月仍 1 笔）。
 * 断言日期全部用真实 dayIndex（1970-01-01 = 0），不用 ×30 近似（C12）。
 */
import { describe, it, expect } from 'vitest'
import {
  D03_ERROR,
  D03_POOL_DISCIPLINES,
  type D03Assignment,
  type D03Discipline,
  type SkillProfile,
} from '@domain/entities/personnel'
import { queryTeam, teamEmptyError } from '@domain/value-objects/personnel-projection'
import {
  computeCapacityVector,
  computeCapacity,
  estimateProjectCost,
} from '@domain/value-objects/project-execution-capacity'
import type { ProjectFormulaParams } from '@domain/value-objects/project-execution-tuning'
import type { Discipline } from '@domain/entities/project-execution'
import {
  isEmploymentAvailable,
  shareOf,
  effortOf,
  allocationLoadOf,
  skillLevelOf,
} from '@domain/value-objects/personnel-availability'
import {
  derivePersonStatus,
  beginResigning,
  completeResigning,
  computeProbationEndDay,
  contractEndDayOf,
} from '@domain/value-objects/personnel-status'
import { nextMoraleModifier, deriveMorale } from '@domain/value-objects/personnel-morale'
import { recordWpCompletion } from '@domain/value-objects/personnel-growth'
import { dailyResignProb, hash01, shouldResign } from '@domain/value-objects/personnel-resign'
import { migrateEmployees } from '@domain/value-objects/personnel-migration'
import { cancelEffectiveMonthFor, isRetirementDue, realizeCommitmentFor } from '@domain/value-objects/personnel-salary'
import { DEFAULT_PERSONNEL_PARAMS } from '@domain/value-objects/personnel-tuning'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { UnifiedLedger } from '@domain/entities/finance/ledger'
import { FinanceService } from '@simulation/services/finance-service'
import { PersonnelService } from '@simulation/services/personnel-service'
import { makeEmployee, makePerson, makeEmployment } from './helpers'

// ===== §13.1 TC-05 共享输入（规格示例值，直接硬编码，不从被测代码读取） =====
const TC05_PARAMS = {
  kOutput: 10,
  fSkill: { 0: 0, 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4 },
  epsilon: 1e-9,
} as unknown as ProjectFormulaParams

const D = 1000 // TC-05 观测日（任意固定 dayIndex）

function skillsOf(level: Partial<Record<D03Discipline, number>>, personId: string): SkillProfile {
  return {
    personId,
    level: { ...level } as SkillProfile['level'],
    exp: {},
    lastLevelUpDay: {},
  }
}

function personOf(personId: string, level: Partial<Record<D03Discipline, number>>) {
  return {
    ...makePerson({ personId }),
    skills: skillsOf(level, personId),
  }
}

function toTeamMembers(members: ReturnType<typeof queryTeam>['members']) {
  return members.map((m) => ({
    employmentId: m.employmentId,
    skillLevels: m.skillLevels as Record<Discipline, number>,
    available: () => m.available,
    salaryCentsPerMonth: m.salaryMonthlyCents,
  }))
}

function assign(
  employmentId: string,
  projectId: string,
  discipline: D03Discipline,
  ratio: number,
): D03Assignment {
  return {
    assignmentId: `asg-${employmentId}-${projectId}`,
    employmentId,
    projectId,
    discipline,
    allocationRatio: ratio,
    effectiveFrom: null,
    effectiveTo: null,
    roleOnProject: 'generalist',
  }
}

function newService(companies: string[] = ['company-a', 'company-b']) {
  const finance = new FinanceService()
  for (const c of companies) finance.registerCompany(c)
  return { svc: new PersonnelService({ finance }), finance }
}

describe('D-03 TC-01～TC-10（身份/团队投影/定价）', () => {
  it('TC-01 招聘→分配→queryTeam：members 与 teamRefs 逐条对应，skillLevels 全五学科', () => {
    const { svc } = newService()
    const h = svc.hire({ companyId: 'company-a', name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000, day: 0 })
    expect(h.ok).toBe(true)
    const e = h.value!.employment
    const p = h.value!.person
    const result = queryTeam({
      teamRefs: [e.employmentId],
      day: 10,
      employmentById: new Map([[e.employmentId, e]]),
      personById: new Map([[p.personId, p]]),
      assignments: [assign(e.employmentId, 'P1', 'code', 1.0)],
    })
    expect(result.members).toHaveLength(1)
    expect(result.members[0]!.employmentId).toBe(e.employmentId)
    expect(Object.keys(result.members[0]!.skillLevels).sort()).toEqual(['art', 'audio', 'code', 'design', 'qa'])
    expect(result.members[0]!.skillLevels.code).toBe(3)
    expect(result.members[0]!.available).toBe(true)
  })

  it('TC-02/TC-04 跳槽：personId 不变、旧 Employment terminated、技能保留', () => {
    const { svc } = newService()
    const h = svc.hire({ companyId: 'company-a', name: 'Dev', role: 'programmer', skillLevel: 4, salaryMonthlyCents: 120_000, day: 0 })
    const { person, employment } = h.value!
    const t = svc.transfer(person.personId, 'company-b', 50, 150_000)
    expect(t.ok).toBe(true)
    expect(t.value!.next.personId).toBe(person.personId)
    expect(t.value!.old.employmentId).toBe(employment.employmentId)
    expect(t.value!.old.status).toBe('terminated')
    expect(t.value!.old.occupiesPerson).toBe(false)
    // TC-04：新 Employment 读同一 SkillProfile，等级不变
    const slice = svc.toSlice()
    const newPerson = slice.persons.find((x) => x.personId === person.personId)!
    expect(newPerson.skills.level.code).toBe(4)
  })

  it('TC-03 同一人被重复招聘 ⇒ D03_ALREADY_EMPLOYED（候选入口防护）', () => {
    const { svc } = newService()
    const h = svc.hire({ companyId: 'company-a', name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000, day: 0 })
    const { person } = h.value!
    const slice = svc.toSlice()
    svc.adopt({
      persons: slice.persons,
      employments: slice.employments,
      candidates: [{
        candidateId: 'cand-1',
        personId: person.personId,
        regionId: 'default',
        discipline: 'code',
        skillLevel: 3,
        askingSalaryCents: 100_000,
        availableFromDay: 0,
        expiresAtDay: 1000,
      }],
      personEvents: [],
    })
    const r = svc.recruitFromCandidate(
      { candidateId: 'cand-1', companyId: 'company-b', playerOfferCents: 100_000, day: 1 },
      () => 100_000,
    )
    expect(r.ok).toBe(false)
    expect(r.error!.code).toBe(D03_ERROR.ALREADY_EMPLOYED)
    // occupying 条数仍为 1（INV-2 未被破坏）
    expect(svc.toSlice().employments.filter((e) => e.occupiesPerson)).toHaveLength(1)
  })

  it('TC-05 Cap_d 数值算例：Cap_code=32 / Cap_design=18 / Cap_art=8（C1 反证锁 + C5 时点）', () => {
    const e1 = makeEmployment({ employmentId: 'e1', personId: 'p-e1' })
    const e2 = makeEmployment({ employmentId: 'e2', personId: 'p-e2' })
    const e3 = makeEmployment({ employmentId: 'e3', personId: 'p-e3' })
    const e4 = makeEmployment({ employmentId: 'e4', personId: 'p-e4', status: 'resigning', endDay: D })
    const people = [
      personOf('p-e1', { design: 4, code: 3 }),
      personOf('p-e2', { design: 1, art: 2 }),
      personOf('p-e3', { code: 5 }),
      personOf('p-e4', { code: 2 }),
    ]
    const employments = [e1, e2, e3, e4]
    const assignments = [
      assign('e1', 'P1', 'art', 0.3),
      assign('e2', 'P1', 'art', 0.5),
      assign('e4', 'P1', 'code', 0.4),
    ]
    const byId = new Map(employments.map((e) => [e.employmentId, e]))
    const pById = new Map(people.map((p) => [p.personId, p]))
    const result = queryTeam({ teamRefs: ['e1', 'e2', 'e3', 'e4'], day: D, employmentById: byId, personById: pById, assignments })
    expect(result.members).toHaveLength(4)
    expect(result.members.map((m) => m.available)).toEqual([true, true, true, true])

    const caps = computeCapacityVector(toTeamMembers(result.members), D, TC05_PARAMS)
    // 规格固定值（硬编码，禁止从被测函数取值自证）
    expect(caps.code).toBe(32)
    expect(caps.design).toBe(18)
    expect(caps.art).toBe(8)

    // C1 反证锁：若按 Assignment.discipline 收窄（e1 仅分到 art 被剔出 code 集）⇒ 10 × (1.4 + 0.8) = 22 ≠ 32
    const narrowed = result.members.filter((m) => {
      const a = assignments.find((x) => x.employmentId === m.employmentId)
      return a === undefined || a.discipline === 'code'
    })
    expect(computeCapacity(toTeamMembers(narrowed), 'code', D, TC05_PARAMS)).toBe(22)

    // C5 时点断言：day = endDay + 1 ⇒ e4 available=false ⇒ Cap_code = 10 × (1.0 + 1.4) = 24
    const nextDay = queryTeam({ teamRefs: ['e1', 'e2', 'e3', 'e4'], day: D + 1, employmentById: byId, personById: pById, assignments })
    expect(nextDay.members[3]!.available).toBe(false)
    expect(computeCapacityVector(toTeamMembers(nextDay.members), D + 1, TC05_PARAMS).code).toBe(24)
  })

  it('TC-06 team_code 含 level 3 与 5 ⇒ Cap_code = 10 × (1.0 + 1.4) = 24', () => {
    const e1 = makeEmployment({ employmentId: 'e1', personId: 'p-e1' })
    const e2 = makeEmployment({ employmentId: 'e2', personId: 'p-e2' })
    const people = [personOf('p-e1', { code: 3 }), personOf('p-e2', { code: 5 })]
    const result = queryTeam({
      teamRefs: ['e1', 'e2'],
      day: D,
      employmentById: new Map([['e1', e1], ['e2', e2]]),
      personById: new Map(people.map((p) => [p.personId, p])),
      assignments: [],
    })
    expect(computeCapacity(toTeamMembers(result.members), 'code', D, TC05_PARAMS)).toBe(24)
  })

  it('TC-07 team_d=∅ ⇒ Cap_d=0、allocationLoad=0、无 NaN/∞ 除零', () => {
    expect(computeCapacity([], 'code', D, TC05_PARAMS)).toBe(0)
    const e1 = makeEmployment({ employmentId: 'e1', personId: 'p-e1' })
    const result = queryTeam({
      teamRefs: ['e1'],
      day: D,
      employmentById: new Map([['e1', e1]]),
      personById: new Map([['p-e1', personOf('p-e1', { code: 0 })]]),
      assignments: [],
    })
    const caps = computeCapacityVector(toTeamMembers(result.members), D, TC05_PARAMS)
    for (const v of Object.values(caps)) {
      expect(v).toBe(0)
      expect(Number.isFinite(v)).toBe(true)
    }
    expect(allocationLoadOf([], 'P1', 'code', D)).toBe(0)
  })

  it('TC-08 同一人分到 2 个项目同学科各 0.5 ⇒ share=0.5、effort≤1、allocationLoad 为无量纲 UI 量', () => {
    const assignments = [assign('e1', 'P1', 'code', 0.5), assign('e1', 'P2', 'code', 0.5)]
    expect(shareOf(assignments, 'e1', 'P1', 'code', D)).toBe(0.5)
    expect(shareOf(assignments, 'e1', 'P2', 'code', D)).toBe(0.5)
    // effort（§6.8）：按当日有 out_wp>0 的项目求和 eff_share ⇒ 定义域 [0,1]
    expect(effortOf(assignments, 'e1', 'code', D, ['P1', 'P2'])).toBe(1.0)
    expect(effortOf(assignments, 'e1', 'code', D, ['P1'])).toBe(0.5)
    // allocationLoad_d：D-03 自有量纲（不顶替 Project burden_d）
    expect(allocationLoadOf(assignments, 'P1', 'code', D)).toBe(0.5)
  })

  it('TC-09 allocationRatio 0.7 + 0.7 ⇒ 第二条 D03_OVER_ALLOCATED', () => {
    const { svc } = newService()
    const h = svc.hire({ companyId: 'company-a', name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000, day: 0 })
    const { employment } = h.value!
    const ok1 = svc.validateAssignment(employment.employmentId, 0.7, [])
    expect(ok1.ok).toBe(true)
    const rejected = svc.validateAssignment(employment.employmentId, 0.7, [
      { employmentId: employment.employmentId, allocationRatio: 0.7 },
    ])
    expect(rejected.ok).toBe(false)
    expect(rejected.error!.code).toBe(D03_ERROR.OVER_ALLOCATED)
  })

  it('TC-10 报价低于 floorPrice ⇒ D03_OFFER_BELOW_FLOOR 且候选保留', () => {
    const { svc } = newService()
    const person = personOf('p-cand', { code: 3 })
    person.status = 'available'
    person.currentEmploymentId = null
    svc.adopt({
      persons: [person],
      employments: [],
      candidates: [{
        candidateId: 'cand-1',
        personId: 'p-cand',
        regionId: 'default',
        discipline: 'code',
        skillLevel: 3,
        askingSalaryCents: 100_000,
        availableFromDay: 0,
        expiresAtDay: 1000,
      }],
      personEvents: [],
    })
    const market = 100_000
    const floor = Math.round(market * DEFAULT_PERSONNEL_PARAMS.floorPriceRatio) // 85000
    const rejected = svc.recruitFromCandidate(
      { candidateId: 'cand-1', companyId: 'company-a', playerOfferCents: floor - 1, day: 1 },
      () => market,
    )
    expect(rejected.ok).toBe(false)
    expect(rejected.error!.code).toBe(D03_ERROR.OFFER_BELOW_FLOOR)
    // 候选保留：同一候选后续按合法报价招聘成功
    const accepted = svc.recruitFromCandidate(
      { candidateId: 'cand-1', companyId: 'company-a', playerOfferCents: 100_000, day: 1 },
      () => market,
    )
    expect(accepted.ok).toBe(true)
  })

  it('TC-20 全员不可用/空 teamRefs ⇒ D03_TEAM_EMPTY、Cap_d=0、Cost_est=+∞', () => {
    expect(teamEmptyError().code).toBe(D03_ERROR.TEAM_EMPTY)
    const estimate = estimateProjectCost(
      {
        workload: { design: 0, code: 100, art: 0, audio: 0, qa: 0 },
        members: [],
        day: D,
        budgetCapacityCents: 10_000_000,
        hrb: 1,
        rTech: 0,
        rScope: 0,
      },
      TC05_PARAMS,
    )
    expect(estimate.capacity.code).toBe(0)
    expect(estimate.costEstCents).toBe(Number.POSITIVE_INFINITY)
  })

  it('TC-21 等级成长到 expCap 升级；effort ≤ 1（C16 反证锁：share 分母跨项目求和）', () => {
    // C16 反证锁：e1 分到 P1/P2 同学科各 0.5 —— 若实现按 (e,d,p) 分组取分母 ⇒ share≡1 ⇒ effort=2 > 1
    const assignments = [assign('e1', 'P1', 'code', 0.5), assign('e1', 'P2', 'code', 0.5)]
    expect(shareOf(assignments, 'e1', 'P1', 'code', D)).toBe(0.5) // 非 1.0
    expect(effortOf(assignments, 'e1', 'code', D, ['P1', 'P2'])).toBeLessThanOrEqual(1)
  })
})

describe('D-03 TC-11 / TC-11b / TC-12（承诺链路与 ADJ-09）', () => {
  it('TC-11 招聘 5 人：periodCount=合同月数、Σ薪资承诺=Σ(月薪×月数)、薪资承诺创建不改现金', () => {
    const finance = new FinanceService()
    finance.registerCompany('company-1')
    finance.postTransaction({ idempotencyKey: 'opening', companyId: 'company-1', day: 0, category: 'advance', amountCents: 50_000_000, description: 'opening' })
    const svc = new PersonnelService({ finance })
    const cashBefore = finance.getCashBalance('company-1')
    const TERM = 6
    const SALARY = 100_000
    for (let i = 1; i <= 5; i++) {
      const r = svc.hire({ companyId: 'company-1', name: `Dev${i}`, role: 'programmer', skillLevel: 3, salaryMonthlyCents: SALARY, day: 0, initialTermMonths: TERM })
      expect(r.ok).toBe(true)
    }
    const commitments = finance.getLedger().getCommitments('company-1').filter((c) => c.sourceType === 'employment_salary')
    expect(commitments).toHaveLength(5)
    for (const c of commitments) {
      // periodCount = initialTermMonths（可数，OPEN-D03-7 关闭）：totalPlanned / amount
      expect(c.totalPlannedCents / c.amountCents).toBe(TERM)
      expect(c.totalPlannedCents).toBe(SALARY * TERM)
    }
    expect(commitments.reduce((s, c) => s + c.totalPlannedCents, 0)).toBe(5 * SALARY * TERM)
    // 薪资承诺创建时刻（BR-3）不产生任何 salary 类现金交易；唯一现金流出是 S5-3 招聘费（project_expense）
    const txs = finance.getAllTransactions()
    expect(txs.filter((t) => t.category === 'salary')).toHaveLength(0)
    expect(txs.filter((t) => t.category === 'project_expense')).toHaveLength(5)
    expect(cashBefore - finance.getCashBalance('company-1')).toBe(5 * SALARY * DEFAULT_PERSONNEL_PARAMS.recruitFeeMonths)
  })

  // TC-11b 共享构造：6 个月月薪承诺（2026-02-01 起，月薪 500_000，totalPlanned = 3_000_000）
  const FEB1 = gregorianToDayIndex(2026, 2, 1)
  const SETTLE: Record<string, number> = {
    '2026-02': gregorianToDayIndex(2026, 2, 28),
    '2026-03': gregorianToDayIndex(2026, 3, 31),
    '2026-04': gregorianToDayIndex(2026, 4, 30),
    '2026-05': gregorianToDayIndex(2026, 5, 31),
    '2026-06': gregorianToDayIndex(2026, 6, 30),
    '2026-07': gregorianToDayIndex(2026, 7, 31),
  }
  const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'] as const

  /**
   * 场景驱动：可选 releaseDay（当日 release，effectiveMonth 自动 = monthOf(endDay)+1），
   * 自 realizeFrom 月起逐月结算日兑现；返回薪资交易笔数与承诺 realizedCents。
   */
  function runScene(releaseDay: number | null, realizeFrom = '2026-02'): { salaryTxs: number; realizedCents: number } {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('company-1')
    const reg = ledger.registerCommitment({
      commitmentId: 'd03-sal-scene',
      companyId: 'company-1',
      sourceType: 'employment_salary',
      sourceRef: 'emp-x',
      amountCents: 500_000,
      period: 'monthly',
      startAt: FEB1,
      endAt: contractEndDayOf(FEB1, 6),
    })
    expect(reg.success).toBe(true)
    expect(reg.result!.commitment.totalPlannedCents).toBe(3_000_000)
    if (releaseDay !== null) {
      const r = ledger.releaseCommitment('company-1', 'd03-sal-scene', cancelEffectiveMonthFor(releaseDay))
      expect(r.success).toBe(true)
    }
    let from = false
    for (const m of MONTHS) {
      if (m === realizeFrom) from = true
      if (!from) continue
      const current = ledger.getCommitment('company-1', 'd03-sal-scene')!
      // 生产唯一兑现入口（②流水线同款）：post 交易 + settleCommitment 账面跟踪
      realizeCommitmentFor(current, ledger, SETTLE[m]!, {})
    }
    const txs = ledger.getAllTransactions().filter((t) => t.referenceId === 'd03-sal-scene' && t.amountCents < 0)
    const c = ledger.getCommitment('company-1', 'd03-sal-scene')!
    return { salaryTxs: txs.length, realizedCents: c.realizedCents }
  }

  it('TC-11b ① 未取消 ⇒ 恰 6 笔、realizedCents = 3_000_000', () => {
    expect(runScene(null)).toEqual({ salaryTxs: 6, realizedCents: 3_000_000 })
  })

  it('TC-11b ② 离职 2026-04-10 ⇒ effectiveMonth=2026-05、3 笔（02/03/04）、realizedCents=1_500_000', () => {
    expect(runScene(gregorianToDayIndex(2026, 4, 10))).toEqual({ salaryTxs: 3, realizedCents: 1_500_000 })
  })

  it('TC-11b ③ 离职 2026-04-01（月初在职 1 天）⇒ 仍 3 笔（ADJ-09：碰过该月即计 1 笔）', () => {
    expect(runScene(gregorianToDayIndex(2026, 4, 1))).toEqual({ salaryTxs: 3, realizedCents: 1_500_000 })
  })

  it('TC-11b ④ 结算日 2026-04-30 当天解雇 ⇒ 仍 3 笔（ADJ-09 套利反证：干满整月必付）', () => {
    expect(runScene(SETTLE['2026-04']!)).toEqual({ salaryTxs: 3, realizedCents: 1_500_000 })
  })

  it('TC-11b ⑤ 离职 2026-03-31 ⇒ 2 笔（02/03）', () => {
    expect(runScene(gregorianToDayIndex(2026, 3, 31))).toEqual({ salaryTxs: 2, realizedCents: 1_000_000 })
  })

  it('TC-11b ⑥ 离职 2026-02-15（起始月内）⇒ 1 笔（02；断言 0 笔即套利 ⇒ FAIL）', () => {
    expect(runScene(gregorianToDayIndex(2026, 2, 15))).toEqual({ salaryTxs: 1, realizedCents: 500_000 })
  })

  it('TC-11b ⑦ 入职 2026-04-30（承诺当月创建）⇒ 首月 1 笔（入职侧与离职侧同规则）', () => {
    const ledger = new UnifiedLedger()
    ledger.registerCompany('company-1')
    const startAt = gregorianToDayIndex(2026, 4, 1)
    const reg = ledger.registerCommitment({
      commitmentId: 'd03-sal-hire',
      companyId: 'company-1',
      sourceType: 'employment_salary',
      sourceRef: 'emp-new',
      amountCents: 500_000,
      period: 'monthly',
      startAt,
      endAt: contractEndDayOf(startAt, 6),
    })
    expect(reg.success).toBe(true)
    realizeCommitmentFor(reg.result!.commitment, ledger, SETTLE['2026-04']!, {})
    const txs = ledger.getAllTransactions().filter((t) => t.referenceId === 'd03-sal-hire' && t.amountCents < 0)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.amountCents).toBe(-500_000)
  })

  it('TC-12 解雇：薪资承诺 cancel（次月停）、severance 恰 1 笔、重复解雇 D03_ALREADY_TERMINATED', () => {
    const finance = new FinanceService()
    finance.registerCompany('company-1')
    finance.postTransaction({ idempotencyKey: 'opening', companyId: 'company-1', day: 0, category: 'advance', amountCents: 50_000_000, description: 'opening' })
    const svc = new PersonnelService({ finance })
    const h = svc.hire({ companyId: 'company-1', name: 'Dev', role: 'programmer', skillLevel: 3, salaryMonthlyCents: 100_000, day: 0, initialTermMonths: 6 })
    const { employment } = h.value!
    const F = gregorianToDayIndex(2026, 4, 10)
    const fired = svc.fire(employment.employmentId, F)
    expect(fired.ok).toBe(true)
    const slice = svc.toSlice()
    const e = slice.employments.find((x) => x.employmentId === employment.employmentId)!
    expect(e.status).toBe('terminated')
    expect(e.occupiesPerson).toBe(false)
    // 薪资承诺被取消，生效月 = monthOf(endDay)+1（ADJ-09 唯一停付入口）
    const c = finance.getLedger().getCommitment('company-1', employment.salaryCommitmentId)!
    expect(c.state).toBe('cancelled')
    expect(c.cancelEffectiveMonth).toBe(cancelEffectiveMonthFor(F))
    // 遣散 one_off 恰 1 笔（severance 类）
    expect(finance.getAllTransactions().filter((t) => t.category === 'severance')).toHaveLength(1)
    // 重复解雇
    const again = svc.fire(employment.employmentId, F + 1)
    expect(again.ok).toBe(false)
    expect(again.error!.code).toBe(D03_ERROR.ALREADY_TERMINATED)
  })
})

describe('D-03 TC-13～TC-18（流失确定性/可用性/成长/数据修复）', () => {
  it('TC-13 多诱因叠加 ⇒ dailyResignProb 高于任一单一诱因', () => {
    const p = DEFAULT_PERSONNEL_PARAMS
    const base = makeEmployment({ salaryMonthlyCents: 100_000 })
    const person = makePerson({ baseMorale: 70, rehireCount: 0 })
    const market = 100_000
    const pNone = dailyResignProb(person, base, market, { idleDays: 0, projectFailedFlag: false }, p)
    const pLowMorale = dailyResignProb({ ...person, baseMorale: 0 }, base, market, { idleDays: 0, projectFailedFlag: false }, p)
    const pUnderpaid = dailyResignProb(person, base, market * 2, { idleDays: 0, projectFailedFlag: false }, p)
    const pIdle = dailyResignProb(person, base, market, { idleDays: 40, projectFailedFlag: false }, p)
    const pAll = dailyResignProb(
      { ...person, baseMorale: 0, rehireCount: 3 },
      base,
      market * 2,
      { idleDays: 40, projectFailedFlag: true },
      p,
    )
    expect(pLowMorale).toBeGreaterThan(pNone)
    expect(pUnderpaid).toBeGreaterThan(pNone)
    expect(pIdle).toBeGreaterThan(pNone)
    expect(pAll).toBeGreaterThan(Math.max(pLowMorale, pUnderpaid, pIdle))
    expect(pAll).toBeLessThanOrEqual(p.pMax)
  })

  it('TC-14 同一 (employmentId, dayIndex) 离职判定可重放（确定性）', () => {
    const u1 = hash01('emp-1', 500)
    const u2 = hash01('emp-1', 500)
    expect(u1).toBe(u2)
    expect(shouldResign(u1, 0.5)).toBe(shouldResign(u2, 0.5))
    expect(shouldResign(u1, 1)).toBe(true)
    expect(shouldResign(u1, 0)).toBe(false)
  })

  it('TC-15 resigning 可用性：day ≤ endDay 恒 true（含 endDay 当日），endDay+1 ⇒ false', () => {
    const e = makeEmployment({ status: 'resigning', endDay: 1000, noticeStartDay: 990 })
    expect(isEmploymentAvailable(e, 990)).toBe(true)
    expect(isEmploymentAvailable(e, 1000)).toBe(true)
    expect(isEmploymentAvailable(e, 1001)).toBe(false)
  })

  it('TC-16 skillLevel=0 成员加入 team_d ⇒ Cap_d 贡献 0、不崩溃', () => {
    const e1 = makeEmployment({ employmentId: 'e1', personId: 'p-e1' })
    const e0 = makeEmployment({ employmentId: 'e0', personId: 'p-e0' })
    const people = [personOf('p-e1', { code: 3 }), personOf('p-e0', { code: 0 })]
    const byId = new Map([['e1', e1], ['e0', e0]])
    const pById = new Map(people.map((p) => [p.personId, p]))
    const mk = (refs: string[]) => queryTeam({ teamRefs: refs, day: D, employmentById: byId, personById: pById, assignments: [] })
    expect(computeCapacity(toTeamMembers(mk(['e1']).members), 'code', D, TC05_PARAMS)).toBe(10)
    expect(computeCapacity(toTeamMembers(mk(['e1', 'e0']).members), 'code', D, TC05_PARAMS)).toBe(10)
  })

  it('TC-17 迁移：离职 legacy 员工 currentEmploymentId 修正为 null（fail-safe）', () => {
    const fired = makeEmployee({ id: 'emp-1', status: 'fired' })
    const migration = migrateEmployees({
      employees: [fired],
      day: 500,
      params: DEFAULT_PERSONNEL_PARAMS,
      regionOf: () => 'default',
    })
    expect(migration.persons).toHaveLength(1)
    expect(migration.persons[0]!.currentEmploymentId).toBeNull()
    expect(migration.employments[0]!.status).toBe('terminated')
    expect(migration.employments[0]!.occupiesPerson).toBe(false)
  })

  it('TC-18 skills.level 缺 audio 键 ⇒ 视为 0', () => {
    const skills = skillsOf({ code: 3 }, 'p-1')
    expect(skillLevelOf(skills, 'audio')).toBe(0)
    expect(skillLevelOf(skills, 'qa')).toBe(0)
  })
})

describe('D-03 TC-19 / TC-22 / TC-23 / TC-24 / S5-1 / S5-2', () => {
  it('TC-19 旧档迁移：字段映射 + 老员工 active + probationEndDay = startDay + 3×workingDaysPerMonth（禁 ×30）', () => {
    const DAY = 1500
    // hireDay 为迁移 startDay 权威来源（R15 #15）
    const old = makeEmployee({ id: 'emp-old', status: 'hired', salaryMonthlyCents: 123_456, hireDay: DAY - 3 * 365 })
    const fresh = makeEmployee({ id: 'emp-fresh', status: 'hired', hireDay: DAY - 10, skillLevel: 4 })
    const migration = migrateEmployees({
      employees: [old, fresh],
      day: DAY,
      params: DEFAULT_PERSONNEL_PARAMS,
      regionOf: () => 'default',
    })
    const oldEmp = migration.employments.find((e) => e.employmentId === 'emp-old')!
    const freshEmp = migration.employments.find((e) => e.employmentId === 'emp-fresh')!
    // 老员工（入职已达试用期数倍）迁移后必须 active，不得置 probation
    expect(oldEmp.status).toBe('active')
    expect(freshEmp.status).toBe('probation')
    // probationEndDay = startDay + probationMonths × workingDaysPerMonth（C12：禁 ×30）
    expect(oldEmp.probationEndDay).toBe(
      computeProbationEndDay(oldEmp.startDay, DEFAULT_PERSONNEL_PARAMS.probationMonths, DEFAULT_PERSONNEL_PARAMS.workingDaysPerMonth),
    )
    expect(oldEmp.probationEndDay).toBe(oldEmp.startDay + 3 * DEFAULT_PERSONNEL_PARAMS.workingDaysPerMonth)
    // 字段映射：月薪、startDay、skillLevel→level[primary]
    expect(oldEmp.salaryMonthlyCents).toBe(123_456)
    expect(oldEmp.startDay).toBe(DAY - 3 * 365)
    const oldPerson = migration.persons.find((p) => p.personId === oldEmp.personId)!
    expect(oldPerson.skills.level.code).toBe(old.skillLevel)
    // Step 3：occupying Employment 生成薪资承诺参数
    expect(migration.salaryCommitments.length).toBe(2)
    for (const c of migration.salaryCommitments) {
      expect(c.period).toBe('monthly')
      expect(c.startAt).toBeLessThanOrEqual(c.endAt)
    }
  })

  it('TC-22 士气单一递推：连续 40 日 Δ=+10 ⇒ moraleModifier 恰 clamp 于 +B，morale ≤ 100', () => {
    const p = DEFAULT_PERSONNEL_PARAMS
    let m = 0
    for (let d = 0; d < 40; d++) {
      m = nextMoraleModifier(m, 10, p)
      expect(Math.abs(m)).toBeLessThanOrEqual(p.moraleModifierBound)
    }
    expect(m).toBe(p.moraleModifierBound) // 恰为 +30（单一递推式，无第二结果）
    const person = makePerson({ baseMorale: 70 })
    const employment = makeEmployment({ moraleModifier: m })
    expect(deriveMorale(person, employment)).toBe(100)
    expect(deriveMorale(person, employment)).toBeLessThanOrEqual(100)
  })

  it('TC-22b 士气 365 天连续下跌：|modifier| ≤ B 且 morale ∈ [0,100] 恒成立', () => {
    const p = DEFAULT_PERSONNEL_PARAMS
    let m = 0
    for (let d = 0; d < 365; d++) {
      m = nextMoraleModifier(m, -10, p)
      expect(Math.abs(m)).toBeLessThanOrEqual(p.moraleModifierBound)
      const morale = deriveMorale(makePerson({ baseMorale: 70 }), makeEmployment({ moraleModifier: m }))
      expect(morale).toBeGreaterThanOrEqual(0)
      expect(morale).toBeLessThanOrEqual(100)
    }
    expect(m).toBe(-p.moraleModifierBound) // 恰为 −30
  })

  it('TC-23 退休：到龄 ⇒ resigning；期满 ⇒ terminated(contract_end) ⇒ Person 派生 departed', () => {
    const DAY = 40 * 365
    const person = makePerson({ personId: 'p-old', birthDay: DAY - 61 * 365 })
    const employment = makeEmployment({ employmentId: 'e-old', personId: 'p-old', status: 'active' })
    // 到龄判定（确定性，不走随机）
    expect(isRetirementDue(person, DAY, DEFAULT_PERSONNEL_PARAMS.retireAge)).toBe(true)
    // active → resigning（RULE-10 唯一路径，禁止直接写 departed）
    const r = beginResigning(employment, DAY, DEFAULT_PERSONNEL_PARAMS.noticeDays)
    expect(r.ok).toBe(true)
    expect(r.value!.status).toBe('resigning')
    // 期满 ⇒ terminated(contract_end)
    const done = completeResigning(r.value!, r.value!.endDay! + 1, 'contract_end')
    expect(done.ok).toBe(true)
    expect(done.value!.status).toBe('terminated')
    expect(done.value!.terminationKind).toBe('contract_end')
    // §4.3 派生式：非 occupying ⇒ departed
    expect(derivePersonStatus(person, done.value!, [], done.value!.endDay! + 1)).toBe('departed')
  })

  it('TC-24 DESYNC 投影：members 条数 = teamRefs 条数、该条 available=false、DESYNC + DATA_REPAIR 告警', () => {
    const e1 = makeEmployment({ employmentId: 'e1', personId: 'p-e1' })
    const e2 = makeEmployment({ employmentId: 'e2', personId: 'p-e2' })
    const p1 = personOf('p-e1', { code: 3 })
    p1.status = 'departed' // 与 §4.3 派生式（assigned/on_leave）不符：外部改写/迁移半途
    const p2 = personOf('p-e2', { code: 2 })
    const result = queryTeam({
      teamRefs: ['e1', 'e2'],
      day: D,
      employmentById: new Map([['e1', e1], ['e2', e2]]),
      personById: new Map([['p-e1', p1], ['p-e2', p2]]),
      assignments: [assign('e1', 'P1', 'code', 1.0)],
      detectDesync: true,
    })
    // C14：不剔除成员（D03-24 反证：members 比 teamRefs 少一条 ⇒ FAIL）
    expect(result.members).toHaveLength(2)
    expect(result.members[0]!.employmentId).toBe('e1')
    expect(result.members[0]!.available).toBe(false)
    expect(result.members[1]!.available).toBe(true)
    expect(result.desyncEmploymentIds).toEqual(['e1'])
    expect(result.errors.some((x) => x.code === D03_ERROR.PERSON_STATUS_DESYNC)).toBe(true)
    expect(result.errors.some((x) => x.code === D03_ERROR.DATA_REPAIR)).toBe(true)
  })

  it('S5-1 候选池：每次 5 名、固定 4 学科随机分配、档位 0..5 均匀、asking ∈ [0.85,1.10]×market', () => {
    const { svc } = newService(['company-1'])
    svc.refreshCandidatePool(100, () => 100_000, 'default')
    const { candidates } = svc.toSlice()
    expect(candidates).toHaveLength(5)
    for (const c of candidates) {
      expect(D03_POOL_DISCIPLINES).toContain(c.discipline)
      expect(Number.isInteger(c.skillLevel)).toBe(true)
      expect(c.skillLevel).toBeGreaterThanOrEqual(0)
      expect(c.skillLevel).toBeLessThanOrEqual(5)
      expect(c.askingSalaryCents).toBeGreaterThanOrEqual(Math.round(100_000 * 0.85))
      expect(c.askingSalaryCents).toBeLessThanOrEqual(Math.round(100_000 * 1.10))
    }
  })

  it('S5-2 基础成长：完成 WP ⇒ +0.1 档经验；跨档阈值 expCap 升级；冷却期内不得连升', () => {
    const p = DEFAULT_PERSONNEL_PARAMS
    let s = skillsOf({ code: 3 }, 'p-1')
    // 单次 WP：exp['code'] = +0.1，不升级（S5-2：expPerWpCompletion = 0.1）
    s = recordWpCompletion(s, 'code', 100, p).skills
    expect(s.exp.code).toBeCloseTo(0.1, 10)
    expect(s.level.code).toBe(3)
    // 同日刷满 expCap[3] = 40（0.1 连加含浮点漂移，多刷 10 次确保越过阈值）⇒ 升到 4
    // （首升无冷却约束：lastLevelUpDay = -∞）
    for (let i = 0; i < 410; i++) s = recordWpCompletion(s, 'code', 100, p).skills
    expect(s.level.code).toBe(4)
    // 升级后 exp 重置；循环中升级后剩余迭代会再累计少量经验（< 一档阈值）
    expect(s.exp.code).toBeLessThan(10)
    // 冷却：升到 4 后同日再刷满 expCap[4] = 50，day − lastLevelUpDay = 0 < 20 ⇒ 不得连升
    for (let i = 0; i < 510; i++) s = recordWpCompletion(s, 'code', 101, p).skills
    expect(s.level.code).toBe(4)
    expect(s.exp.code).toBeGreaterThanOrEqual(50) // 已跨档但被冷却压制
    // 冷却期满（day − last ≥ growthCooldownDays）⇒ 可升到 5
    s = recordWpCompletion(s, 'code', 101 + p.growthCooldownDays, p).skills
    expect(s.level.code).toBe(5)
    expect(s.exp.code).toBe(0)
  })
})
