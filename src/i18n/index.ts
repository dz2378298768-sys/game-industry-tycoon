import en from './en.json'
import zhCN from './zh-CN.json'
import { dayIndexToGregorian, gregorianToDayIndex } from '@domain/value-objects/day-index'

export type Locale = 'en' | 'zh-CN'
const dictionaries: Record<Locale, Record<string, string>> = { en, 'zh-CN': zhCN }

let current: Locale = 'zh-CN'

export function setLocale(loc: Locale): void { current = loc }
export function getLocale(): Locale { return current }

export function t(key: string): string {
  return dictionaries[current][key] ?? dictionaries.en[key] ?? key
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(current === 'zh-CN' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/**
 * 显示纪元：模拟 Day 0 = 2026-01-05（周一，ADJ-12 S1-3 / ADJ-17 §2 裁定）。
 * R-7：日历换算复用内核 day-index.ts 实现，禁止前端自造日历表。
 */
const DISPLAY_EPOCH_OFFSET = gregorianToDayIndex(2026, 1, 5)

export function formatDay(dayIndex: number): string {
  const g = dayIndexToGregorian(dayIndex + DISPLAY_EPOCH_OFFSET)
  return `${String(g.year).padStart(4, '0')}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')} (Day ${dayIndex})`
}
