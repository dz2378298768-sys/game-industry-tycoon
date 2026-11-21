import en from './en.json'
import zhCN from './zh-CN.json'

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

export function formatDay(dayIndex: number): string {
  const year = 1970 + Math.floor(dayIndex / 365.25)
  const ms = dayIndex * 86400000
  const localDay = new Date(ms).getDate()
  const localMonth = new Date(ms).getMonth() + 1
  return `${year}-${String(localMonth).padStart(2, '0')}-${String(localDay).padStart(2, '0')} (Day ${dayIndex})`
}
