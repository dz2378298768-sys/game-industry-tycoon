import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A-20 词表守卫（批次 07A）：UI 层（src/ui + src/app）禁止转发质量合成词表。
 * 内核 / application 接入层的公式实现（如质量分数计算）不在守卫范围；
 * 本守卫防的是 UI 层自造合成均值 / 质量上限展示（FIX-1/2/6 回归）。
 * 例外：注释中引用词表名做"禁用说明"的行不算违规 → 守卫允许含 FIX-/A-20/U5 说明的行。
 */

const UI_ROOTS = [
  join(__dirname, '..', '..'),
]
const FORBIDDEN = [
  /qualityScore/,
  /finalQualityScore/,
  /qualityCeilingBand/,
  /qualityCeiling/,
  // A-20 终版词表（M-05/UI-04 扩展，规格 §2 P-08 验收）：禁合成均值/综合评分/总评/加权平均
  /mean\(/,
  /overall/,
  /综合/,
  /总评/,
  /加权平均/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

/** 注释行（含禁用说明关键词）不判违规 */
function isGuardComment(line: string): boolean {
  const t = line.trim()
  const isComment = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
  const explainsGuard = /FIX-[0-9]|A-20|U5|不合成|禁止|fail-closed|守卫|禁用|删|hidden|隐藏|R-3/.test(line)
  return isComment && explainsGuard
}

describe('A-20 词表守卫（UI 层禁转发质量合成词表）', () => {
  it('src/ui 与 src/app 源码无质量合成词表（qualityScore/finalQualityScore/qualityCeiling/mean(/overall/综合/总评/加权平均）转发', () => {
    const violations: string[] = []
    for (const root of UI_ROOTS) {
      for (const sub of ['ui', 'app']) {
        for (const file of walk(join(root, sub))) {
          const lines = readFileSync(file, 'utf-8').split('\n')
          lines.forEach((line, i) => {
            if (isGuardComment(line)) return
            for (const pat of FORBIDDEN) {
              if (pat.test(line)) {
                violations.push(`${file}:${i + 1}: ${line.trim()}`)
              }
            }
          })
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('i18n 双语（zh-CN + en）文案无质量合成/质量上限展示键（FIX-6 / U5 / A-20 联动；禁用说明除外）', () => {
    for (const locale of ['zh-CN', 'en']) {
      const dict = readFileSync(join(__dirname, '..', '..', 'i18n', `${locale}.json`), 'utf-8')
      for (const [idx, line] of dict.split('\n').entries()) {
        // 中文合成词 + 英文合成词均禁（禁用说明/待裁定/OPEN 注释行豁免）
        const hit = /质量上限|综合评分|总评|加权平均|qualityCeiling|finalQualityScore|overall score|weighted average/.test(line)
        if (hit && !/禁|不|待裁定|OPEN|forbid|deprecated|disabled|not used/.test(line)) {
          expect.fail(`i18n/${locale}.json:${idx + 1} 含质量合成展示文案: ${line.trim()}`)
        }
      }
    }
  })
})
