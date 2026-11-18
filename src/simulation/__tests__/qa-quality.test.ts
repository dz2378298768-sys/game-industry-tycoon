import { describe, it, expect } from 'vitest'
import {
  computeInitialDefectLevel,
  computeDefectLevel,
  computeFinalQualityScore,
  computeEarlyEntryPenalty,
  averageRemainingProductionRatio,
} from '@simulation/systems/qa-quality'
import { makeProject } from '../../__tests__/helpers'

function projectAt(completion: number, qaProgress = 0) {
  return makeProject({
    phase: 'QA',
    workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
    workRemainingByDiscipline: {
      design: 100 * (1 - completion),
      programming: 100 * (1 - completion),
      art: 100 * (1 - completion),
      qa: 100 * (1 - qaProgress),
    },
  })
}

describe('QA 质量机制 (B7/B8)', () => {
  it('提前惩罚 = 平均剩余生产完成度 × 50', () => {
    const p = projectAt(0.9)
    expect(averageRemainingProductionRatio(p)).toBeCloseTo(0.1, 5)
    expect(computeEarlyEntryPenalty(p)).toBeCloseTo(5, 5)
  })

  it('90% 进入 QA 时初始缺陷为 45（基础 40 + 惩罚 5）', () => {
    expect(computeInitialDefectLevel(projectAt(0.9))).toBe(45)
  })

  it('100% 生产完成时惩罚为 0', () => {
    expect(computeEarlyEntryPenalty(projectAt(1))).toBe(0)
    expect(computeInitialDefectLevel(projectAt(1))).toBe(40)
  })

  it('缺陷等级随 QA 进度单调不增', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((p) => computeDefectLevel(projectAt(0.9, p)))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1] as number)
    }
  })

  it('QA 100% 时按 70% 修复比例计算最终缺陷', () => {
    const p = projectAt(0.9, 1)
    // 45 × (1 - 0.7) = 13.5 → round = 14
    expect(computeDefectLevel(p)).toBe(14)
  })

  it('生产 100% 且 QA 100% 时最终缺陷为 12', () => {
    // 40 × (1 - 0.7) = 12
    expect(computeDefectLevel(projectAt(1, 1))).toBe(12)
  })

  it('缺陷等级始终在 0-100', () => {
    for (const qa of [0, 0.5, 1]) {
      for (const prod of [0.9, 1]) {
        const d = computeDefectLevel(projectAt(prod, qa))
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(100)
      }
    }
  })

  it('最终总质量 = 100 - 最终缺陷等级', () => {
    expect(computeFinalQualityScore(0)).toBe(100)
    expect(computeFinalQualityScore(14)).toBe(86)
    expect(computeFinalQualityScore(100)).toBe(0)
    expect(computeFinalQualityScore(140)).toBe(0)
    expect(computeFinalQualityScore(-5)).toBe(100)
  })
})
