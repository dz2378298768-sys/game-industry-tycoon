import { describe, it, expect } from 'vitest'
import {
  refundWindowExpiryDay,
  isRefundWindowElapsed,
  isRefundBatchDue,
  expectedRefundAmountCents,
  nextRefundSeq,
  sumRefundedUnits,
  compareRefundBatchesForPosting,
} from '@domain/value-objects/refund-window'
import { dayIndexToGregorian, gregorianToDayIndex } from '@domain/value-objects/day-index'
import { makeAutoBatch } from '@simulation/__tests__/m2c-fixtures'

describe('M2-C 退款窗口纯规则（DESIGN-M2-001-C R01–R06）', () => {
  it('R01 到期日公式：sale+window，当天视为到期', () => {
    expect(refundWindowExpiryDay(100, 14)).toBe(114)
    expect(refundWindowExpiryDay(30, 14)).toBe(44)
    expect(isRefundWindowElapsed(100, 14, 113)).toBe(false)
    expect(isRefundWindowElapsed(100, 14, 114)).toBe(true)
    expect(isRefundWindowElapsed(100, 14, 115)).toBe(true)
  })

  it('R02 跨月：4772 起 14 天落在 1983-02-08', () => {
    const saleDay = gregorianToDayIndex(1983, 1, 25)
    expect(saleDay).toBe(4772)
    expect(refundWindowExpiryDay(saleDay, 14)).toBe(4786)
    const d4786 = dayIndexToGregorian(4786)
    expect([d4786.year, d4786.month, d4786.day]).toEqual([1983, 2, 8])
  })

  it('R03 跨年：4741 + 14 = 4755 = 1983-01-08', () => {
    const saleDay = gregorianToDayIndex(1982, 12, 25)
    expect(saleDay).toBe(4741)
    expect(refundWindowExpiryDay(saleDay, 14)).toBe(4755)
    const d4755 = dayIndexToGregorian(4755)
    expect([d4755.year, d4755.month, d4755.day]).toEqual([1983, 1, 8])
  })

  it('R04 到期判据边界：只处理 pending 且 ≤ 当日', () => {
    const pending = makeAutoBatch({ status: 'pending', refundDayIndex: 114 })
    expect(isRefundBatchDue(pending, 113)).toBe(false)
    expect(isRefundBatchDue(pending, 114)).toBe(true)
    expect(isRefundBatchDue(pending, 115)).toBe(true)
    expect(isRefundBatchDue({ ...pending, status: 'posted' }, 120)).toBe(false)
    expect(isRefundBatchDue({ ...pending, status: 'rejected' }, 120)).toBe(false)
  })

  it('R05 金额等式：整数乘法，不钳制、不二次舍入', () => {
    expect(expectedRefundAmountCents(31, 2999)).toBe(92_969)
    expect(expectedRefundAmountCents(30, 2000)).toBe(60_000)
    expect(expectedRefundAmountCents(2, 1501)).toBe(3002)
    // 3002 > 3001：整笔收入 3,001 分拆成 2 件单价 1,501 时，退款金额按单价×件数
    expect(expectedRefundAmountCents(2, 1501)).toBeGreaterThan(3001)
  })

  it('R06 守卫/seq/汇总/排序', () => {
    expect(() => refundWindowExpiryDay(-1, 14)).toThrow(RangeError)
    expect(() => refundWindowExpiryDay(100, -1)).toThrow(RangeError)
    expect(() => expectedRefundAmountCents(0, 2000)).toThrow(RangeError)

    const seq1 = makeAutoBatch({ id: 'RB-PROJ-001-100-114-1' })
    const seq2 = makeAutoBatch({ id: 'RB-PROJ-001-100-114-2' })
    expect(nextRefundSeq([seq1, seq2], 'PROJ-001', 100, 114)).toBe(3)
    expect(nextRefundSeq([], 'PROJ-001', 100, 114)).toBe(1)

    const rejected = makeAutoBatch({
      id: 'RB-PROJ-001-100-114-3',
      status: 'rejected',
      refundedUnits: 5,
      refundAmountCents: 10_000,
    })
    expect(sumRefundedUnits([seq1, rejected], 'SR-PROJ-001-100-JP-home_console_g2', 'non-rejected')).toBe(30)
    expect(sumRefundedUnits([seq1, rejected], 'SR-PROJ-001-100-JP-home_console_g2', 'posted')).toBe(0)

    const auto = makeAutoBatch({ id: 'RB-PROJ-001-100-114-1', source: 'auto_window' })
    const player = makeAutoBatch({ id: 'RB-PROJ-001-100-114-2', source: 'player_request' })
    expect(compareRefundBatchesForPosting(auto, player)).toBeLessThan(0)
    expect(compareRefundBatchesForPosting(player, auto)).toBeGreaterThan(0)
    const earlier = makeAutoBatch({ id: 'RB-PROJ-001-100-113-1', refundDayIndex: 113 })
    expect(compareRefundBatchesForPosting(earlier, auto)).toBeLessThan(0)
  })
})
