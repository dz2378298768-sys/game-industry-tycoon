/**
 * DayIndex —— 以 1970-01-01 为 0 的整数日索引值对象。
 * 纯确定性实现，不依赖 Date.now / Math.random。
 */

export interface GregorianDate {
  year: number
  month: number // 1-12
  day: number   // 1-31
  dayOfWeek: number // 0 (周日) - 6 (周六)
  isLeapYear: boolean
}

/** 判断闰年 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** 返回某月的天数 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29
  if (month === 1) return 31
  if (month === 2) return 28
  if (month === 3) return 31
  if (month === 4) return 30
  if (month === 5) return 31
  if (month === 6) return 30
  if (month === 7) return 31
  if (month === 8) return 31
  if (month === 9) return 30
  if (month === 10) return 31
  if (month === 11) return 30
  if (month === 12) return 31
  return 30
}

/** 计算某日在年内的第几天 (1-366) */
export function dayOfYear(year: number, month: number, day: number): number {
  let doy = 0
  for (let m = 1; m < month; m++) {
    doy += daysInMonth(year, m)
  }
  return doy + day
}

/** 从格里高利日换算为 dayIndex（1970-01-01 = 0） */
export function gregorianToDayIndex(year: number, month: number, day: number): number {
  if (year < 1970) {
    throw new Error('DayIndex only supports years >= 1970')
  }
  let totalDays = 0
  for (let y = 1970; y < year; y++) {
    totalDays += isLeapYear(y) ? 366 : 365
  }
  totalDays += dayOfYear(year, month, day) - 1
  return totalDays
}

/** 从 dayIndex 换算为格里高利日 */
export function dayIndexToGregorian(dayIndex: number): GregorianDate {
  if (dayIndex < 0) {
    throw new Error('DayIndex must be non-negative')
  }
  let year = 1970
  let remaining = dayIndex
  let yearDays = isLeapYear(year) ? 366 : 365
  while (remaining >= yearDays) {
    remaining -= yearDays
    year++
    yearDays = isLeapYear(year) ? 366 : 365
  }
  let month = 1
  let md = daysInMonth(year, month)
  while (remaining >= md) {
    remaining -= md
    month++
    md = daysInMonth(year, month)
  }
  const day = remaining + 1
  // 1970-01-01 是星期四 (dayOfWeek = 4)
  const baseDayOfWeek = 4
  const dayOfWeek = ((baseDayOfWeek + dayIndex) % 7 + 7) % 7
  return {
    year,
    month,
    day,
    dayOfWeek,
    isLeapYear: isLeapYear(year),
  }
}

export class DayIndex {
  public readonly value: number

  constructor(value: number) {
    if (!Number.isInteger(value)) {
      throw new Error('DayIndex value must be integer')
    }
    if (value < 0) {
      throw new Error('DayIndex must be non-negative')
    }
    this.value = value
  }

  static fromGregorian(year: number, month: number, day: number): DayIndex {
    return new DayIndex(gregorianToDayIndex(year, month, day))
  }

  toGregorian(): GregorianDate {
    return dayIndexToGregorian(this.value)
  }

  addDays(n: number): DayIndex {
    return new DayIndex(this.value + n)
  }

  subtract(other: DayIndex): number {
    return this.value - other.value
  }

  equals(other: DayIndex): boolean {
    return this.value === other.value
  }

  /** 是否某月的第一天 */
  isMonthStart(): boolean {
    return this.toGregorian().day === 1
  }

  /** 是否某月的最后一天 */
  isMonthEnd(): boolean {
    const g = this.toGregorian()
    return g.day === daysInMonth(g.year, g.month)
  }

  /** 是否每年的第一天 */
  isYearStart(): boolean {
    const g = this.toGregorian()
    return g.month === 1 && g.day === 1
  }
}
