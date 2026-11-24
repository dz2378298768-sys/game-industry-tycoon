/**
 * B-01a R9 盲区红线：同 seed 两次「全新开局」逐字段相等。
 *
 * 背景：既有 R9 测试只覆盖「存档副本续跑」（ai-fairness-longrun.test.ts:47）与
 * 「纯函数」（personnel-d03-tc.test.ts），都不经过新开局的实体 ID 生成。
 * 修复前 employmentId 用 uuid()（src/domain/types.ts:6-14），参与
 * hash01(employmentId, day) 离职判定（personnel-service.ts:593），导致同 seed
 * 同操作序列在不同次开局中结果波动（扫描同帽 2/8~8/8）。
 *
 * 本测试锁定：employmentId = `emp-<seed>-<seq>`（seed + 递增序号），
 * 同 seed + 同操作序列 ⇒ 全部判定结果逐字段相等。
 */
import { describe, it, expect } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { GameWorld } from '@application/mediators/game-world'
import { TUNING } from '@content/tuning'
import { citySalaryMultiplier } from '@content/queries'
import { hash01 } from '@domain/value-objects/personnel-resign'
import { createPersonnelSnapshot } from '@domain/value-objects/personnel-tuning'

const SEED = 42
const CAP_CENTS = 54_000 * 100 // $54,000：修复前 UI 上限帽，同帽曾 2/8 波动
const HORIZON = TUNING.project.defaultLaunchHorizonDays // 200
const ROLES = ['programmer', 'designer', 'artist', 'qa'] as const

interface ResignationEvent {
  personId: string
  day: number
  kind: string
  employmentId: string
}

interface FreshRunResult {
  /** 招聘返回的 Employee.id（= employmentId）序列 —— 确定性ID的核心证据 */
  employmentIds: string[]
  /** Personnel 权威层 employmentId 序列（过滤非占用占位后，按创建序） */
  personnelEmploymentIds: string[]
  /** 离职/退休事件（参与 hash01 判定的直接产物） */
  resignationEvents: ResignationEvent[]
  /** 项目 phase 逐日序列（200 项） */
  phaseByDay: string[]
  /** 关键检查点现金余额 */
  cashByCheckpoint: number[]
  /** 首次预算耗尽日 */
  exhaustedDay: number | null
  /** 项目取消日 */
  cancelledDay: number | null
  /** Day200 最终 phase */
  finalPhase: string
  /** Day200 现金余额 */
  finalCash: number
  /** Day200 上市结果 */
  launched: { success: boolean; errorCode?: string }
}

/**
 * 完整复刻 runDefaultPlay：创建公司 → 默认 4 人招聘 → 立项 → 推进 200 天 → 上市。
 * highResign 仅用于强制 hash01 链真实触发；两次对照使用完全相同的配置。
 */
function runFreshStart(seed: number, highResign = false): FreshRunResult {
  const gw = createGameWorld(seed)
  if (highResign) {
    // 仅抬高离职概率（两世界同配置），使 200 天内必有 hash01 判定命中；
    // 不改任何生产默认值（TUNING / DEFAULT_PERSONNEL_PARAMS 零改动）。
    const snap = createPersonnelSnapshot(0)
    snap.params = { ...snap.params, pBase: 0.5, pMax: 0.6 }
    gw.world.personnelFormulaSnapshot = snap
  }
  const company = gw.createCompany({ name: 'Default Studio', cityId: 'san_francisco' })
  const salary = Math.round(TUNING.employee.defaultStartingSalaryCents * citySalaryMultiplier(company.cityId))
  const hired = ROLES.map((role, i) =>
    gw.hireEmployee({ name: `P${i}`, role, skillLevel: 3, salaryMonthlyCents: salary }),
  )
  expect(hired.every((h) => h.success)).toBe(true)

  const created = gw.createProject({
    name: 'Default Pioneer',
    genreId: 'action',
    budgetTotalCapCents: CAP_CENTS,
    plannedLaunchDay: HORIZON,
    targetPlatformIds: ['arcade_pre_1975'],
    audienceSegmentIds: ['arcade_enthusiasts'],
  })
  expect(created.success).toBe(true)
  const projectId = created.result!.id
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  expect(gw.advanceProjectPhase(projectId).success).toBe(true)
  for (const h of hired) {
    if (h.result) expect(gw.assignEmployeeToProject(h.result.id, projectId, 1, 'generalist').success).toBe(true)
  }

  const checkpoints = new Set([0, 30, 60, 120, HORIZON])
  const cashByCheckpoint: number[] = []
  const phaseByDay: string[] = []
  let exhaustedDay: number | null = null
  let cancelledDay: number | null = null
  const phaseOf = (): string => gw.world.projects.find((p) => p.id === projectId)!.phase
  cashByCheckpoint.push(gw.finance.getCashBalance(company.id))
  phaseByDay.push(phaseOf())
  for (let day = 1; day <= HORIZON; day++) {
    gw.advanceSimulation(1)
    const p = gw.world.projects.find((x) => x.id === projectId)!
    phaseByDay.push(p.phase)
    if (p.budgetExhausted && exhaustedDay === null) exhaustedDay = day
    if (p.phase === 'CANCELLED' && cancelledDay === null) cancelledDay = day
    if (checkpoints.has(day)) cashByCheckpoint.push(gw.finance.getCashBalance(company.id))
  }
  const launched = gw.launchProject(projectId)

  const resignationEvents: ResignationEvent[] = (gw.world.personEvents ?? [])
    .filter((e) => e.kind === 'resigned' || e.kind === 'retired')
    .map((e) => ({
      personId: e.personId,
      day: e.day,
      kind: e.kind,
      employmentId: String(e.payload.employmentId ?? ''),
    }))

  return {
    employmentIds: hired.map((h) => h.result!.id),
    personnelEmploymentIds: (gw.world.employments ?? []).map((e) => e.employmentId),
    resignationEvents,
    phaseByDay,
    cashByCheckpoint,
    exhaustedDay,
    cancelledDay,
    finalPhase: phaseOf(),
    finalCash: gw.finance.getCashBalance(company.id),
    launched: { success: launched.success, ...(launched.errorCode ? { errorCode: launched.errorCode } : {}) },
  }
}

describe('B-01a R9 红线：同 seed 全新开局可复现', () => {
  it('默认参数：两次全新开局（建公司→招4人→立项→推进200天→上市）逐字段相等', () => {
    const a = runFreshStart(SEED)
    const b = runFreshStart(SEED)
    expect(a).toEqual(b)
    // ID 格式与序列锁定（若回退为 uuid()，此断言立刻失败）
    expect(a.employmentIds).toEqual(['emp-42-1', 'emp-42-2', 'emp-42-3', 'emp-42-4'])
  })

  it('高离职概率下：确有离职事件发生，且两次全新开局的离职链逐字段相等', () => {
    const a = runFreshStart(SEED, true)
    const b = runFreshStart(SEED, true)
    // 前置：本用例必须真实触发 hash01 → shouldResign，否则红线失去意义
    expect(a.resignationEvents.length).toBeGreaterThan(0)
    expect(a).toEqual(b)
    expect(a.employmentIds).toEqual(['emp-42-1', 'emp-42-2', 'emp-42-3', 'emp-42-4'])
  })

  it('负向对照（明确标注）：不同 employmentId 会改变 hash01 离职判定，证明 ID 必须确定性', () => {
    // 同一 day、同一 salt，仅 employmentId 不同 → u 不同；且存在某天使 shouldResign 结果翻转。
    const deterministicId = 'emp-42-1'
    const legacyRandomId = 'a4eda5b3-2526-4b8e-b168-beff638f6f69'
    let uDifferentDays = 0
    let verdictFlipDays = 0
    for (let day = 1; day <= 200; day++) {
      const u1 = hash01(deterministicId, day)
      const u2 = hash01(legacyRandomId, day)
      if (u1 !== u2) uDifferentDays++
      // 以 prob=0.5 作放大器：两侧是否越阈（shouldResign）在某些天必然翻转
      if ((u1 < 0.5) !== (u2 < 0.5)) verdictFlipDays++
    }
    expect(uDifferentDays).toBeGreaterThan(0)
    expect(verdictFlipDays).toBeGreaterThan(0)
    // 因而若 employmentId 退回 uuid()，前两用例的 resignationEvents / phaseByDay / cash
    // 等字段将不再逐字段相等 → 红线测试会失败（无需真的改回随机实现）。
  })

  it('读档续跑：restore 后按已有 emp-<seed>-<seq> 还原序号，新 ID 不碰撞且确定', () => {
    const live = new GameWorld(SEED)
    const company = live.createCompany({ name: 'A', cityId: 'san_francisco' })
    const salary = Math.round(TUNING.employee.defaultStartingSalaryCents * citySalaryMultiplier(company.cityId))
    const hire = (): string => live.hireEmployee({ name: 'N', role: 'programmer', skillLevel: 3, salaryMonthlyCents: salary }).result!.id
    expect(hire()).toBe('emp-42-1')
    expect(hire()).toBe('emp-42-2')

    const restored = new GameWorld(SEED)
    restored.restore(JSON.parse(JSON.stringify(live.serialize())))
    const c2 = restored.world.companies.find((c) => c.id === company.id)!
    const hireRestored = (): string =>
      restored.hireEmployee({ name: 'M', role: 'qa', skillLevel: 3, salaryMonthlyCents: salary }).result!.id
    expect(c2).toBeDefined()
    expect(hireRestored()).toBe('emp-42-3')
    expect(hireRestored()).toBe('emp-42-4')
  })
})
