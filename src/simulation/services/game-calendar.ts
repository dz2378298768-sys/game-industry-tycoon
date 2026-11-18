import type { CalendarSpeed } from '@domain/enums'
import {
  daysInMonth as daysInMonthHelper,
  isLeapYear as isLeapYearHelper,
  dayIndexToGregorian,
  gregorianToDayIndex,
} from '@domain/value-objects/day-index'

/**
 * GameCalendar —— 模拟日历（1970-01-01 = dayIndex 0）
 * 纯确定性实现。
 */
export class GameCalendar {
  private _currentDayIndex: number
  private _speed: CalendarSpeed

  constructor(startDayIndex = 0) {
    this._currentDayIndex = startDayIndex
    this._speed = 'normal'
  }

  get currentDayIndex(): number {
    return this._currentDayIndex
  }

  advanceDay(): void {
    this._currentDayIndex++
  }

  advanceDays(n: number): void {
    this._currentDayIndex += n
  }

  currentGregorian() {
    return dayIndexToGregorian(this._currentDayIndex)
  }

  setSpeed(speed: CalendarSpeed): void {
    this._speed = speed
  }

  getSpeed(): CalendarSpeed {
    return this._speed
  }

  reset(): void {
    this._currentDayIndex = 0
    this._speed = 'normal'
  }

  isMonthStart(): boolean {
    return this.currentGregorian().day === 1
  }

  isMonthEnd(): boolean {
    const g = this.currentGregorian()
    return g.day === GameCalendar.daysInMonth(g.year, g.month)
  }

  isYearStart(): boolean {
    const g = this.currentGregorian()
    return g.month === 1 && g.day === 1
  }

  /** 某月有多少天（静态，便于外部调用） */
  static daysInMonth(year: number, month: number): number {
    return daysInMonthHelper(year, month)
  }

  static isLeapYear(year: number): boolean {
    return isLeapYearHelper(year)
  }

  static toDayIndex(year: number, month: number, day: number): number {
    return gregorianToDayIndex(year, month, day)
  }

  static fromDayIndex(dayIndex: number) {
    return dayIndexToGregorian(dayIndex)
  }
}
