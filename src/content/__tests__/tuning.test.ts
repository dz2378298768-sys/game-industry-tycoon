import { describe, it, expect } from 'vitest'
import { TUNING } from '@content/tuning'

describe('TUNING finance 阈值（T-FIX-3）', () => {
  it('cashWarningThresholdCents 为 400_000（$4,000），cashBankruptThresholdCents 为 0', () => {
    expect(TUNING.finance.cashWarningThresholdCents).toBe(400_000)
    expect(TUNING.finance.cashBankruptThresholdCents).toBe(0)
  })
})
