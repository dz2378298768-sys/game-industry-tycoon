import { describe, it, expect } from 'vitest'
import { formatDay } from '@i18n'
import { monthKeyOf } from '@domain/value-objects/finance-commitment'
import { yearOfDay } from '@content/queries'

describe('player dates match the simulation calendar', () => {
  it.each([
    [0, '1970-01-01'],
    [1, '1970-01-02'],
    [30, '1970-01-31'],
    [31, '1970-02-01'],
    [364, '1970-12-31'],
    [365, '1971-01-01'],
    [789, '1972-02-29'],
  ])('Day %i displays %s using the ledger month and market year', (day, date) => {
    expect(formatDay(day)).toBe(`${date} (Day ${day})`)
    expect(monthKeyOf(day)).toBe(date.slice(0, 7))
    expect(yearOfDay(day)).toBe(Number(date.slice(0, 4)))
  })
})
