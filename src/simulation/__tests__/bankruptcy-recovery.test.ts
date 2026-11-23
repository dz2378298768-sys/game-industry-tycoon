/**
 * M3-P0-1 破产闭环：自救恢复（DECISION-M3-P0-BANKRUPTCY-CLOSURE-001）。
 *
 * 背景：OI-21 §2.4 批准的「现金回到安全线自动恢复 active」在 M2 未实现，
 * 导致破产状态永久化、自救弧线断裂，且 M3 的「存活/破产率」观测失去意义。
 *
 * W5-C1 修订（ADJ-2026-11-23-18 §3 / FIN V0.2 §6.4 F-06）：恢复线由旧 $4,000 收敛为
 * $6,000 = 600_000 cents（唯一源 finance-tuning.ts，content/tuning.ts 派生）；
 * 真实滞后带 $4k~$6k。旧用例 earn 金额相应上调以越过新恢复线。
 *
 * K01 现金回到 ≥$6,000 → 次日恢复 active + CompanyRecovered
 * K02 滞回区间（0 < 余额 < $6,000）→ 保持 bankrupt，不来回切换
 * K03 恢复后可再招聘（命令守卫解除），破产期间被拒
 * K04 事件幂等：恢复后多日推进只产生一条 CompanyRecovered
 * K06 恢复线穿越边界：$5,999.99 不消失、$6,000 恰好消失；量级自检 600_000 > 400_000
 */
import { describe, it, expect } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { GameWorld } from '@application/mediators/game-world'
import { TUNING } from '@content/tuning'
import { makeCompany } from '../../__tests__/helpers'
import { BANKRUPT_RECOVERY_HINT_CENTS } from '@ui/components/company-alerts'

const COMPANY_ID = 'company-1'

function bootstrap(seed = 42) {
  const gw = createGameWorld(seed)
  const company = makeCompany({ id: COMPANY_ID, cashBalanceCents: 0, status: 'active', monthlyFixedExpenseCents: 0 })
  gw.world = { ...gw.world, companies: [company], employees: [], projects: [], products: [] }
  gw.finance.registerCompany(COMPANY_ID)
  // R7：夹具公司替换后先按账本 hydrate（余额 0 == 账本 0），登记基线；
  // 之后每笔 fixture 支出/收入都经账本，调度器即可按基线识别第二写入者。
  gw.finance.syncCash(company)
  return gw
}

function cash(gw: GameWorld) {
  return gw.finance.getCashBalance(COMPANY_ID)
}

function player(gw: GameWorld) {
  return gw.world.companies.find((c) => c.id === COMPANY_ID)!
}

function eventsOf(gw: GameWorld, type: string) {
  return gw.world.events.filter((e) => e.type === type)
}

function spend(gw: GameWorld, cents: number) {
  const r = gw.finance.postTransaction(
    {
      idempotencyKey: `spend-${cents}-${gw.calendar.currentDayIndex}`,
      companyId: COMPANY_ID,
      day: gw.calendar.currentDayIndex,
      category: 'project_expense',
      amountCents: -cents,
      description: 'fixture spend',
    },
    { allowNegativeBalance: true },
  )
  expect(r.success).toBe(true)
}

function earn(gw: GameWorld, cents: number) {
  const r = gw.finance.postTransaction(
    {
      idempotencyKey: `earn-${cents}-${gw.calendar.currentDayIndex}`,
      companyId: COMPANY_ID,
      day: gw.calendar.currentDayIndex,
      category: 'sales_revenue',
      amountCents: cents,
      description: 'fixture earnings',
    },
    { allowNegativeBalance: true },
  )
  expect(r.success).toBe(true)
}

describe('M3-P0-1 破产自救恢复', () => {
  it('K01 现金回到 ≥$6,000 → 恢复 active 并派发 CompanyRecovered', () => {
    const gw = bootstrap()
    spend(gw, 500_000) // -$5,000
    gw.advanceSimulation(1)
    expect(player(gw).status).toBe('bankrupt')

    earn(gw, 1_200_000) // +$12,000 → 现金 $7,000 = 700_000 cents，越过 $6,000 恢复线
    expect(cash(gw)).toBe(700_000)
    gw.advanceSimulation(31)
    expect(player(gw).status).toBe('active')

    const recovered = eventsOf(gw, 'CompanyRecovered')
    expect(recovered).toHaveLength(1)
    expect(recovered[0]!.payload).toMatchObject({ companyId: COMPANY_ID, balanceAtRecovery: 700_000 })
    console.log('[K01] status:', player(gw).status, 'cash:', cash(gw), 'events:', recovered.length)
  })

  it('K02 滞回区间：0 < 现金 < $6,000 时保持 bankrupt', () => {
    const gw = bootstrap()
    spend(gw, 500_000)
    gw.advanceSimulation(1)
    earn(gw, 600_000) // +$1,000，高于破产线但低于 $6,000 恢复线
    expect(cash(gw)).toBe(100_000)
    expect(cash(gw)).toBeLessThan(TUNING.finance.cashRecoveryThresholdCents)
    gw.advanceSimulation(1)
    expect(player(gw).status).toBe('bankrupt')
    expect(eventsOf(gw, 'CompanyRecovered')).toHaveLength(0)
    console.log('[K02] cash:', cash(gw), 'status:', player(gw).status)
  })

  it('K03 破产期招聘被拒；恢复后可招聘', () => {
    const gw = bootstrap()
    spend(gw, 500_000)
    gw.advanceSimulation(1)
    expect(player(gw).status).toBe('bankrupt')
    const blocked = gw.hireEmployee({
      name: 'A',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 130_000,
    })
    expect(blocked.success).toBe(false)
    expect(blocked.errorCode).toBe('FIN_COMPANY_BANKRUPT')

    earn(gw, 1_200_000) // +$12,000 → 现金 $7,000，越过 $6,000 恢复线
    gw.advanceSimulation(31)
    expect(player(gw).status).toBe('active')
    const hired = gw.hireEmployee({
      name: 'B',
      role: 'programmer',
      skillLevel: 3,
      salaryMonthlyCents: 130_000,
    })
    console.log('[K03] hired:', hired.success, 'reason:', hired.errorCode ?? 'ok')
    expect(hired.success).toBe(true)
  })

  it('K05 展示与引擎同源：横幅恢复线不得另写常量，且为 $6,000 = 600_000 cents', () => {
    expect(BANKRUPT_RECOVERY_HINT_CENTS).toBe(TUNING.finance.cashRecoveryThresholdCents)
    expect(BANKRUPT_RECOVERY_HINT_CENTS).toBe(600_000) // $6,000
    // 量级自检（CODEBUDDY.md §13.4）：恢复线严格大于警告线 $4,000 = 400_000 cents
    expect(BANKRUPT_RECOVERY_HINT_CENTS).toBeGreaterThan(TUNING.finance.cashWarningThresholdCents)
    expect(TUNING.finance.cashWarningThresholdCents).toBe(400_000)
  })

  it('K04 恢复事件幂等：恢复后连续推进只产生一条', () => {
    const gw = bootstrap()
    spend(gw, 500_000)
    gw.advanceSimulation(1)
    earn(gw, 1_200_000) // +$12,000 → 现金 $7,000，越过 $6,000 恢复线
    gw.advanceSimulation(31)
    expect(eventsOf(gw, 'CompanyRecovered')).toHaveLength(1)
    gw.advanceSimulation(5)
    expect(eventsOf(gw, 'CompanyRecovered')).toHaveLength(1)
  })

  it('K06 恢复线穿越边界：$5,999.99 横幅不消失、$6,000 恰好消失', () => {
    // 破产后展示恢复提示；现金在 $6,000 以下（即便已越过 $4,000 警告线）仍保持 bankrupt。
    const justBelow = bootstrap()
    spend(justBelow, 1_000_000) // -$10,000 → 破产
    justBelow.advanceSimulation(1)
    expect(player(justBelow).status).toBe('bankrupt')
    expect(BANKRUPT_RECOVERY_HINT_CENTS).toBe(600_000)
    earn(justBelow, 1_599_999) // 现金 = 599_999 cents = $5,999.99（> 警告线 $4,000，< 恢复线 $6,000）
    expect(cash(justBelow)).toBe(599_999)
    expect(cash(justBelow)).toBeGreaterThan(TUNING.finance.cashWarningThresholdCents)
    justBelow.advanceSimulation(31)
    expect(player(justBelow).status).toBe('bankrupt') // 横幅仍在
    expect(eventsOf(justBelow, 'CompanyRecovered')).toHaveLength(0)

    // 恰好到 $6,000 = 600_000 cents 时穿越恢复线，横幅消失（status → active）。
    const atLine = bootstrap()
    spend(atLine, 1_000_000)
    atLine.advanceSimulation(1)
    expect(player(atLine).status).toBe('bankrupt')
    earn(atLine, 1_600_000) // 现金 = 600_000 cents = $6,000（恰等于恢复线）
    expect(cash(atLine)).toBe(600_000)
    atLine.advanceSimulation(31)
    expect(player(atLine).status).toBe('active') // 横幅消失
    expect(eventsOf(atLine, 'CompanyRecovered')).toHaveLength(1)
    console.log('[K06] below=599_999→bankrupt, at=600_000→active')
  })
})
