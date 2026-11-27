import en from './en.json'
import zhCN from './zh-CN.json'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'

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

/** Present the calendar used for platform availability and ledger settlement. */
export function formatDay(dayIndex: number): string {
  const g = dayIndexToGregorian(dayIndex)
  return `${String(g.year).padStart(4, '0')}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')} (Day ${dayIndex})`
}
