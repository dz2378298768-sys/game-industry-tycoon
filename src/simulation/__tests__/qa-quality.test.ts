import { describe, it, expect } from 'vitest'
import {
  computeInitialDefectLevel,
  computeDefectLevel,
  computeFinalQuality,
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
  it('90% 进入 QA 时产生提前进入惩罚（4 点）', () => {
    // 平均质量 60 → 基础缺陷 40；完成度 90% → 惩罚 round(0.1 × 40) = 4
    expect(computeInitialDefectLevel(projectAt(0.9))).toBe(44)
  })

  it('100% 生产完成时惩罚为 0', () => {
    expect(computeInitialDefectLevel(projectAt(1))).toBe(40)
  })

  it('缺陷等级随 QA 进度单调不增', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((p) => computeDefectLevel(projectAt(0.9, p)))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1] as number)
    }
  })

  it('QA 100% 时按修复比例计算最终缺陷', () => {
    const p = projectAt(0.9, 1)
    // 44 × (1 - 0.8) = 8.8 → round = 9
    expect(computeDefectLevel(p)).toBe(9)
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

  it('最终质量随缺陷下降且不超过 100', () => {
    const p = projectAt(1, 1)
    const q0 = computeFinalQuality(p, 0)
    const q50 = computeFinalQuality(p, 50)
    expect(q0.gameplay).toBe(60)
    expect(q50.gameplay).toBe(45)
    expect(Object.values(q50).every((v) => v >= 0 && v <= 100)).toBe(true)
  })
})
