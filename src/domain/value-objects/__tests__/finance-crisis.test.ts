/**
 * FIN V0.2 §4.2 / §5.9 / §6.4 / §10.1 / §10.4 / §10.5：危机状态机测试。
 * 覆盖 TC-05、TC-12、TC-13、TC-14、TC-15、TC-22（F-03/F-06/F-07/F-08/F-09）。
 */
import { describe, it, expect } from 'vitest'
import {
  createHealthyCrisisState,
  RestructuringConsequenceRequiredError,
  UnifiedLedger,
  type CrisisSignals,
  type CrisisState,
  type RestructuringConsequences,
} from '@domain/entities/finance'
import {
  applyRemedy,
  assertConsequences,
  bankruptcyConsequences,
  enterSandbox,
  reasonCodesForSignals,
  resolveRestructuring,
  restoreCrisisState,
  transitionCrisis,
  verifyCrisisAgainstRules,
} from '@domain/value-objects/finance-crisis'
import { withFinanceTuningOverrides } from '@domain/value-objects/finance-tuning'
import { makeInput, postAdvance } from './finance-fixtures'

const T = withFinanceTuningOverrides()

function crisis(at = 0): CrisisState {
  return createHealthyCrisisState({
    crisisId: 'crisis-1', companyId: 'c1', atDay: at,
    remediationWindowDays: T.remediationWindowDays,
    crisisRulesVersion: T.crisisRulesVersion,
    availableRemedies: ['restructure', 'cut_staff', 'sell_asset', 'advance'],
  })
}

function signals(partial: Partial<CrisisSignals>): CrisisSignals {
  return {
    cashBalanceCents: 1_000_000, availableCashCents: 1_000_000,
    runwayMonths: 12, hasOverduePayable: false, budgetOverrunRatio: 0,
    hasReworkSunk: false, today: 0, ...partial,
  }
}

function consequences(partial: Partial<RestructuringConsequences> = {}): RestructuringConsequences {
  return {
    debtCents: 0, assetChanges: [], reputationDelta: -1, talentLoss: 0,
    controlChange: 'none', summary: '裁定后果', ...partial,
  }
}

describe('TC-05 / F-03：负现金 → critical（非破产）与原因码', () => {
  it('负现金触发 NEGATIVE_CASH → critical，并开补救窗口，非破产', () => {
    const c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    expect(c.state).toBe('critical')
    expect(c.reasonCodes).toContain('NEGATIVE_CASH')
    expect(c.remediationDeadline).toBe(60)
    expect(c.phase).toBeNull()
  })

  it('非健康态至少带一个原因码；多个信号可叠加', () => {
    const codes = reasonCodesForSignals(signals({
      cashBalanceCents: -100, runwayMonths: 1, availableCashCents: -10,
      hasOverduePayable: true, budgetOverrunRatio: 1.2, hasReworkSunk: true,
    }), T)
    expect(codes).toEqual(expect.arrayContaining([
      'NEGATIVE_CASH', 'LOW_RUNWAY', 'COMMITTED_EXCEEDS_CASH',
      'PAYABLE_OVERDUE', 'BUDGET_OVERRUN', 'REWORK_SUNK',
    ]))
  })
})

describe('TC-12 / F-03/F-06：滞后带、AND 破产、重入不重置 deadline', () => {
  it('warning 线 $4,000 / recovery 线 $6,000 形成真实滞后带', () => {
    expect(T.cashRecoveryThresholdCents).toBeGreaterThan(T.cashWarningThresholdCents)
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: 500_000 }), T)
    expect(c.state).toBe('healthy') // $5,000 在两线之间但尚未跌破 warning
    c = transitionCrisis(c, signals({ cashBalanceCents: 300_000, today: 1 }), T)
    expect(c.state).toBe('warning') // 跌破 $4,000 → 横幅
    c = transitionCrisis(c, signals({ cashBalanceCents: 500_000, today: 2 }), T)
    expect(c.state).toBe('warning') // 两线间维持预警
    c = transitionCrisis(c, signals({ cashBalanceCents: 650_000, today: 3 }), T)
    expect(c.state).toBe('healthy') // 超过 $6,000 才恢复
  })

  it('窗口未耗尽且负现金未解仍 critical；窗口到期 AND 负现金才 bankrupt', () => {
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    c = transitionCrisis(c, signals({ cashBalanceCents: -100, today: 59 }), T)
    expect(c.state).toBe('critical')
    c = transitionCrisis(c, signals({ cashBalanceCents: -100, today: 60 }), T)
    expect(c.state).toBe('bankrupt')
    expect(c.phase).toBe('winddown')
    expect(c.restructuringConsequences).not.toBeNull()
    expect(c.restructuringConsequences!.debtCents).toBe(100)
    expect(c.reasonCodes).toContain('NEGATIVE_CASH')
  })

  it('窗口到期但现金已 ≥0 未达 recovery：沿用原 deadline，保持 critical（OPEN-F6）', () => {
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    c = transitionCrisis(c, signals({ cashBalanceCents: 500_000, today: 60 }), T)
    expect(c.state).toBe('critical')
    expect(c.remediationDeadline).toBe(60)
  })

  it('重入 critical 沿用原 deadline；踩线恢复再回落不刷新 60 天窗口（F-06）', () => {
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    c = transitionCrisis(c, signals({ cashBalanceCents: 700_000, today: 10 }), T)
    expect(c.state).toBe('watch')
    expect(c.remediationDeadline).toBe(60) // 离开 critical 也保留截止日
    c = transitionCrisis(c, signals({ cashBalanceCents: -50, today: 20 }), T)
    expect(c.state).toBe('critical')
    expect(c.remediationDeadline).toBe(60) // 不重置为 20+60
  })
})

describe('TC-13 / TC-14 / F-07：补救窗口、后果结构化、非免费复活', () => {
  it('窗口内重整成功 → watch；后果必填且至少一项实质（TC-14）', () => {
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    c = applyRemedy(c, 'restructure', 5, consequences({ debtCents: 10_000 }))
    expect(c.state).toBe('restructuring')
    expect(c.phase).toBe('restructuring')
    const done = resolveRestructuring(
      c, true, consequences({ assetChanges: [{ assetRef: 'a', deltaCents: -5_000, description: '卖资产' }] }),
      signals({ cashBalanceCents: 700_000, today: 20 }), T,
    )
    expect(done.state).toBe('watch')
    expect(done.restructuringConsequences!.assetChanges).toHaveLength(1)
    expect(done.history.at(-1)!.reason).toContain('重整成功')
  })

  it('全零后果被拒（不能免费复活）', () => {
    const empty = consequences()
    expect(() => assertConsequences(empty)).toThrow(RestructuringConsequenceRequiredError)
    const c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100 }), T)
    expect(() => applyRemedy(c, 'restructure', 1, empty)).toThrow(RestructuringConsequenceRequiredError)
    expect(bankruptcyConsequences(-100).debtCents).toBe(100)
  })

  it('重整失败 → bankrupt，phase=winddown，后果随存', () => {
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100 }), T)
    c = applyRemedy(c, 'restructure', 1, consequences({ talentLoss: 3 }))
    const failed = resolveRestructuring(
      c, false, consequences({ talentLoss: 3 }), signals({ cashBalanceCents: -200, today: 10 }), T,
    )
    expect(failed.state).toBe('bankrupt')
    expect(failed.phase).toBe('winddown')
    expect(failed.restructuringConsequences!.talentLoss).toBe(3)
  })
})

describe('TC-15 / F-08：破产后沙盒观察态', () => {
  it('bankrupt → sandbox_observe；账户 frozen；新玩家支出被拒，固定结算继续', () => {
    const ledger = new UnifiedLedger(T)
    postAdvance(ledger, 'c1', 1_000, 0)
    let c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    c = transitionCrisis(c, signals({ cashBalanceCents: -100, today: 60 }), T)
    expect(c.state).toBe('bankrupt')
    c = enterSandbox(c, 61)
    expect(c.state).toBe('sandbox_observe')
    ledger.setSandboxObserved('c1', true)
    expect(ledger.getAccount('c1')!.state).toBe('frozen')

    const blocked = ledger.postTransaction(makeInput({
      idempotencyKey: 'new-player-expense', companyId: 'c1', day: 62,
      category: 'marketing', amountCents: -50, description: '新增玩家支出', source: 'player_authorized',
    }))
    expect(blocked.success).toBe(false)
    expect(blocked.errorCode).toBe('FIN_SANDBOX_PLAYER_EXPENSE_BLOCKED')

    const fixed = ledger.postTransaction(makeInput({
      idempotencyKey: 'fixed-salary', companyId: 'c1', day: 62,
      category: 'salary', amountCents: -80, description: '既有固定结算', source: 'system_auto',
    }), { allowNegativeBalance: true })
    expect(fixed.success).toBe(true)
    expect(ledger.getCashBalance('c1')).toBe(920)
  })
})

describe('TC-22 / F-09：危机态读档无漂移', () => {
  it('restore 不改 state/deadline/reasonCodes；当前 TUNING 变化不覆盖持久值', () => {
    const original = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 5 }), T)
    const persisted: CrisisState = JSON.parse(JSON.stringify(original)) as CrisisState
    const restored = restoreCrisisState(persisted)
    expect(restored.state).toBe('critical')
    expect(restored.remediationDeadline).toBe(65)
    expect(restored.reasonCodes).toEqual(['NEGATIVE_CASH'])
    expect(restored.crisisRulesVersion).toBe(T.crisisRulesVersion)
    expect(restored.history).toHaveLength(1)

    const driftedTuning = withFinanceTuningOverrides({ cashWarningThresholdCents: 1, crisisRulesVersion: 'other' })
    const after = transitionCrisis(restored, signals({ cashBalanceCents: 700_000, today: 6 }), driftedTuning)
    // 恢复函数本身不重推等级（读档语义）；版本不一致时一致性校验不强行判不一致
    expect(verifyCrisisAgainstRules(restored, signals({ cashBalanceCents: -1, today: 999 }), driftedTuning)).toBe(true)
    expect(after.state).toBe('watch')
  })

  it('同版本下窗口耗尽且负现金未解 → 一致性校验失败（可拒绝读档）', () => {
    const c = transitionCrisis(crisis(), signals({ cashBalanceCents: -100, today: 0 }), T)
    expect(verifyCrisisAgainstRules(c, signals({ cashBalanceCents: -100, today: 60 }), T)).toBe(false)
  })
})
