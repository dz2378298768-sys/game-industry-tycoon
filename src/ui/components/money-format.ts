import { formatMoney, getLocale } from '@i18n'

/** Unit prices should retain cents so nearby price choices stay distinguishable. */
export function formatUnitPrice(cents: number): string {
  const locale = getLocale() === 'zh-CN' ? 'zh-CN' : 'en-US'
  const value = (Math.abs(cents) / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${cents < 0 ? '-' : ''}$${value}`
}

/**
 * 金额展示（DESIGN-UI-LAYER §5.5 / REV R-13）：
 * 0 → `$0`；0 < |值| < $1 → `<$1` / `-<$1`（避免出现 `-$0`）；其余委托既有 formatMoney。
 */
export function formatMoneyDisplay(cents: number): string {
  if (cents === 0) return '$0'
  if (Math.abs(cents) < 100) return cents < 0 ? '-<$1' : '<$1'
  return formatMoney(cents)
}
