import { describe, it, expect } from 'vitest'
import { TUNING } from '@content/tuning'
import { DEFAULT_FINANCE_TUNING } from '@domain/value-objects/finance-tuning'

describe('TUNING finance 阈值（T-FIX-3 / W5-C1 / C2）', () => {
  it('cashWarningThresholdCents 为 400_000（$4,000），cashBankruptThresholdCents 为 0', () => {
    expect(TUNING.finance.cashWarningThresholdCents).toBe(400_000)
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(0)
  })

  it('W5-C1 财务四字段单一事实源：content/tuning 从 finance-tuning 派生，禁止双写', () => {
    expect(TUNING.finance.budgetOverrunWarnAt).toBe(DEFAULT_FINANCE_TUNING.budgetOverrunWarnAt)
    expect(TUNING.finance.cashWarningThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashWarningThresholdCents)
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashBankruptThresholdCents)
    expect(TUNING.finance.cashRecoveryThresholdCents).toBe(DEFAULT_FINANCE_TUNING.cashRecoveryThresholdCents)
  })

  it('W5-C1 量级自检：恢复线 $6,000=600_000 cents 严格 > 警告线 $4,000=400_000 cents > 破产线 $0', () => {
    // 单位双写：业务值 $6,000 = 代码值 600_000 cents
    expect(TUNING.finance.cashRecoveryThresholdCents).toBe(600_000) // $6,000
    expect(TUNING.finance.cashWarningThresholdCents).toBe(400_000) // $4,000
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(0) // $0
    expect(TUNING.finance.cashRecoveryThresholdCents).toBeGreaterThan(TUNING.finance.cashWarningThresholdCents)
    // 真实滞后带宽度 = $2,000 = 200_000 cents（非旧"同线零宽度"口径）
    expect(TUNING.finance.cashRecoveryThresholdCents - TUNING.finance.cashWarningThresholdCents).toBe(200_000)
  })
})
