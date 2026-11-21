import { describe, it, expect } from 'vitest'
import {
  deriveUnitPriceAtSaleCents,
  makeSalesRecordId,
} from '@domain/entities/sales-record'

describe('SalesRecord 构造与派生纯函数（DESIGN-M2-001-A §10.5）', () => {
  it('T01 makeSalesRecordId 生成规范化 ID', () => {
    expect(makeSalesRecordId('PROJ-001', 100, 'JP', 'home_console_g2')).toBe(
      'SR-PROJ-001-100-JP-home_console_g2',
    )
  })

  it('T02 makeSalesRecordId 参数守卫：空字符串 TypeError，日索引非法 RangeError', () => {
    expect(() => makeSalesRecordId('', 100, 'JP', 'home_console_g2')).toThrow(TypeError)
    expect(() => makeSalesRecordId('PROJ-001', 100, '', 'home_console_g2')).toThrow(TypeError)
    expect(() => makeSalesRecordId('PROJ-001', 100, 'JP', '')).toThrow(TypeError)
    expect(() => makeSalesRecordId('PROJ-001', -1, 'JP', 'home_console_g2')).toThrow(RangeError)
    expect(() => makeSalesRecordId('PROJ-001', 1.5, 'JP', 'home_console_g2')).toThrow(RangeError)
  })

  it('T03 单价派生整除：3,000,000 分 / 1500 件 = 2000 分（$20.00/件）', () => {
    expect(deriveUnitPriceAtSaleCents(3_000_000, 1500)).toBe(2000)
  })

  it('T04 单价派生舍入：3001 / 2 = 1500.5 → 1501', () => {
    expect(deriveUnitPriceAtSaleCents(3001, 2)).toBe(1501)
  })

  it('T05 单价派生参数守卫：非法输入抛 RangeError', () => {
    expect(() => deriveUnitPriceAtSaleCents(3_000_000, 0)).toThrow(RangeError)
    expect(() => deriveUnitPriceAtSaleCents(3_000_000, 1.5)).toThrow(RangeError)
    expect(() => deriveUnitPriceAtSaleCents(-1, 1500)).toThrow(RangeError)
    expect(() => deriveUnitPriceAtSaleCents(1.5, 1500)).toThrow(RangeError)
  })
})
