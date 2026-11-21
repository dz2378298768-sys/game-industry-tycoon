/**
 * M3-A1 AI 公司入场生成（DECISION-M3-P0-AI-003 §2）。
 *
 * T01 1970-01-01 入场 3 家；1990-01-01 累计 24 家
 * T02 同日重复调用幂等，不重复生成
 * T03 画像决定起始现金/品牌/管理容量；AI 不标记为玩家
 * T04 生成结果确定（同 dayIndex 两次逐字段相等）
 */
import { describe, it, expect } from 'vitest'
import {
  AI_COMPANIES,
  aiCompanyId,
  createAiCompany,
  entryDayIndex,
  seedDueAiCompanies,
} from '@content/ai-companies'
import { TUNING } from '@content/tuning'
import { gregorianToDayIndex } from '@domain/value-objects/day-index'
import { makeCompany } from '../../__tests__/helpers'
import { createGameWorld } from '@application/factories/create-game-world'

const DAY_1970 = gregorianToDayIndex(1970, 1, 1)
const DAY_1990 = gregorianToDayIndex(1990, 1, 1)

describe('M3-A1 AI 公司入场', () => {
  it('T01 按入场年累计生成', () => {
    const at1970 = seedDueAiCompanies([], DAY_1970)
    const due1970 = AI_COMPANIES.filter((s) => entryDayIndex(s) <= DAY_1970)
    expect(at1970.seeded).toHaveLength(due1970.length)
    expect(at1970.companies).toHaveLength(due1970.length)

    const at1990 = seedDueAiCompanies([], DAY_1990)
    expect(at1990.companies).toHaveLength(AI_COMPANIES.length)
    console.log('[T01] 1970:', at1970.companies.length, '1990:', at1990.companies.length)
  })

  it('T02 同日重复调用幂等', () => {
    const first = seedDueAiCompanies([], DAY_1990)
    const second = seedDueAiCompanies(first.companies, DAY_1990)
    expect(second.seeded).toHaveLength(0)
    expect(second.companies).toHaveLength(first.companies.length)
  })

  it('T03 画像决定起始规模；AI 不是玩家', () => {
    const spec = AI_COMPANIES.find((s) => s.persona === 'integrated_dev_publisher')!
    const company = createAiCompany(spec, DAY_1990)
    const profile = TUNING.ai.persona[spec.persona]
    expect(company.isPlayer).toBe(false)
    expect(company.persona).toBe(spec.persona)
    expect(company.id).toBe(aiCompanyId(spec))
    expect(company.cashBalanceCents).toBe(profile.startingCashCents)
    expect(company.brand).toBe(profile.brand)
    expect(company.managementCapacity).toBe(profile.teamSize + 2)
  })

  it('T05 生产工厂开启 AI 竞争：首日入场 3 家且各有一笔资本流水；默认关闭', () => {
    const on = createGameWorld(42, { aiCompetition: true })
    on.advanceSimulation(1)
    const ai = on.world.companies.filter((c) => !c.isPlayer)
    expect(ai).toHaveLength(3)
    for (const company of ai) {
      expect(on.finance.getCashBalance(company.id)).toBe(company.cashBalanceCents)
      const capital = on.finance
        .getAllTransactions()
        .filter((t) => t.companyId === company.id && t.idempotencyKey === `ai-capital:${company.id}`)
      expect(capital).toHaveLength(1)
    }
    // 再推进一天不重复
    on.advanceSimulation(1)
    expect(on.world.companies.filter((c) => !c.isPlayer)).toHaveLength(3)

    const off = createGameWorld(42)
    off.advanceSimulation(1)
    expect(off.world.companies.filter((c) => !c.isPlayer)).toHaveLength(0)
  })

  it('T04 生成确定：同输入两次逐字段相等', () => {
    const spec = AI_COMPANIES[0]!
    const a = createAiCompany(spec, DAY_1970)
    const b = createAiCompany(spec, DAY_1970)
    expect(a).toEqual(b)
    const seeded = seedDueAiCompanies([makeCompany()], DAY_1990).companies
    const again = seedDueAiCompanies([makeCompany()], DAY_1990).companies
    expect(seeded).toEqual(again)
  })
})
