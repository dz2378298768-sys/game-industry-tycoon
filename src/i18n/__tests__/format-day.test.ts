import { describe, it, expect } from 'vitest'
import { formatDay } from '@i18n'
import { gregorianToDayIndex, dayIndexToGregorian } from '@domain/value-objects/day-index'

/**
 * R-7（FIX-7）：formatDay 的 dayIndex→日期换算必须复用内核 day-index.ts，
 * 显示纪元 Day 0 = 2026-01-05（周一，ADJ-12 S1-3 / ADJ-17 §2）。
 */
describe('formatDay（2026-01-05 纪元，复用内核 day-index）', () => {
  it('Day 0 = 2026-01-05（周一）', () => {
    expect(formatDay(0)).toBe('2026-01-05 (Day 0)')
    expect(dayIndexToGregorian(gregorianToDayIndex(2026, 1, 5)).dayOfWeek).toBe(1)
  })

  it('Day 1 = 2026-01-06', () => {
    expect(formatDay(1)).toBe('2026-01-06 (Day 1)')
  })

  it('跨月：2026-01-31 是 Day 26，Day 27 = 2026-02-01', () => {
    expect(formatDay(26)).toBe('2026-01-31 (Day 26)')
    expect(formatDay(27)).toBe('2026-02-01 (Day 27)')
  })

  it('平年跨年：Day 360 = 2026-12-31，Day 361 = 2027-01-01', () => {
    expect(formatDay(360)).toBe('2026-12-31 (Day 360)')
    expect(formatDay(361)).toBe('2027-01-01 (Day 361)')
  })

  it('闰年：Day 785 = 2028-02-29（与内核交叉验证）', () => {
    const offset = gregorianToDayIndex(2026, 1, 5)
    const d785 = dayIndexToGregorian(785 + offset)
    expect(`${d785.year}-${String(d785.month).padStart(2, '0')}-${String(d785.day).padStart(2, '0')}`).toBe('2028-02-29')
    expect(formatDay(785)).toBe('2028-02-29 (Day 785)')
  })
})
