import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import zhCN from '../../i18n/zh-CN.json'

// V14：i18n 键一致性 —— 防止缺翻译导致用户看到原始键，或单侧遗留废键
const enDict = en as Record<string, string>
const zhDict = zhCN as Record<string, string>

describe('i18n 键一致性（DESIGN-UI-LAYER §8 V14）', () => {
  const enKeys = Object.keys(enDict).sort()
  const zhKeys = Object.keys(zhDict).sort()

  it('en 与 zh-CN 键集合完全一致（无缺失 / 无多余翻译键）', () => {
    expect(zhKeys).toEqual(enKeys)
  })

  it('所有翻译值均为非空字符串', () => {
    for (const k of enKeys) {
      const ev = enDict[k]
      const zv = zhDict[k]
      expect(ev).toEqual(expect.any(String))
      expect((ev ?? '').length).toBeGreaterThan(0)
      expect(zv).toEqual(expect.any(String))
      expect((zv ?? '').length).toBeGreaterThan(0)
    }
  })
})
