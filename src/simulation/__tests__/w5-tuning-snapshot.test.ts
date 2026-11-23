/**
 * W5 参数快照守门（ADJ-2026-11-24-19 §2.4 / D-02 §11 S9 / Project §11 S4 / D-03 §18.3）。
 *
 * 本批 C1~C8 未新增/改动任何权威数值（C1 仅把 content/tuning 的重复定义改为从
 * finance-tuning 派生，权威值 $6,000 本就未变），故各模块 formulaVersion 一律不 bump，
 * 历史存档不得被新值重算。本测试锁定版本串与快照三元组的读档保真。
 */
import { describe, it, expect } from 'vitest'
import { createGameWorld } from '@application/factories/create-game-world'
import { TUNING } from '@content/tuning'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'
import {
  PERSONNEL_FORMULA_VERSION,
  createPersonnelSnapshot,
} from '@domain/value-objects/personnel-tuning'
import { DEFAULT_PROJECT_FORMULA_PARAMS } from '@domain/value-objects/project-execution-tuning'
import { DEFAULT_BLUEPRINT_TUNING } from '@domain/value-objects/product-blueprint-tuning'
import { DEFAULT_COMPLETENESS_TUNING } from '@domain/value-objects/product-completeness-tuning'

describe('W5 参数快照：版本锚定（不 bump，禁止重算历史存档）', () => {
  it('各模块 formulaVersion 保持 W5 前基线，未因 C1~C8 收敛而跳版', () => {
    expect(DEFAULT_FINANCE_TUNING.formulaVersion).toBe('fin-formula-v0.3')
    expect(DEFAULT_FINANCE_TUNING.assumptionsVersion).toBe('fin-assumptions-v0.2')
    expect(DEFAULT_FINANCE_TUNING.crisisRulesVersion).toBe('fin-crisis-v0.2')
    expect(DEFAULT_PROJECT_FORMULA_PARAMS.projectFormulaVersion).toBe('PROJ-FORMULA-v0.1.1')
    expect(PERSONNEL_FORMULA_VERSION).toBe('personnel-v1')
    expect(DEFAULT_BLUEPRINT_TUNING.formulaVersion).toBe('D01-FORMULA-v0.1')
    expect(DEFAULT_COMPLETENESS_TUNING.formulaVersion).toBe('D02-FORMULA-v0.1')
  })

  it('C1 单一源快照：content/tuning 派生值与 finance-tuning 权威值同为 $6,000 = 600_000 cents', () => {
    expect(TUNING.finance.cashRecoveryThresholdCents).toBe(600_000)
    expect(TUNING.finance.cashRecoveryThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashRecoveryThresholdCents)
    expect(TUNING.finance.cashWarningThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashWarningThresholdCents)
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashBankruptThresholdCents)
    expect(TUNING.finance.budgetOverrunWarnAt).toBe(DEFAULT_FINANCE_TUNING.budgetOverrunWarnAt)
  })
})

describe('W5 参数快照：D-03 §18.3 三元组随存档持久化且读档不重算', () => {
  it('{version, params, createdAt} 序列化/反序列化原样保留，createdAt 不随读档日重算', () => {
    const gw = createGameWorld(7)
    gw.createCompany({ name: 'Snapshot Co', cityId: 'san_francisco' })
    const createdAt = 12
    const snap = createPersonnelSnapshot(createdAt)
    gw.world.personnelFormulaSnapshot = snap

    const saved = structuredClone(gw.serialize())
    expect(saved.personnelFormulaSnapshot).toEqual(snap)

    // 读档到全新世界：推进到不同日期后快照仍为原 createdAt（未被重算）
    const restored = createGameWorld(7)
    restored.restore(saved)
    expect(restored.world.personnelFormulaSnapshot).toEqual(snap)
    expect(restored.world.personnelFormulaSnapshot!.version).toBe(PERSONNEL_FORMULA_VERSION)
    expect(restored.world.personnelFormulaSnapshot!.createdAt).toBe(createdAt)
  })
})
