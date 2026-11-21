import { describe, it, expect } from 'vitest'
import { estimateDaysToFinish } from '@simulation/systems/project-progress'
import { makeProject } from '../../__tests__/helpers'

const ZERO = { design: 0, programming: 0, art: 0, qa: 0 }

describe('A5 预计完成时间（计划日期不是强制失败日期）', () => {
  it('按最慢学科估算剩余天数', () => {
    const p = makeProject({
      workRemainingByDiscipline: { design: 50, programming: 100, art: 80, qa: 0 },
    })
    const days = estimateDaysToFinish(p, { ...ZERO, design: 10, programming: 20, art: 25 })
    // max(ceil(50/10), ceil(100/20), ceil(80/25)) = max(5, 5, 4) = 5
    expect(days).toBe(5)
  })

  it('缺少任一未完成学科的产能时无法估算', () => {
    const p = makeProject({
      workRemainingByDiscipline: { design: 50, programming: 100, art: 0, qa: 0 },
    })
    expect(estimateDaysToFinish(p, { ...ZERO, design: 10 })).toBeNull()
  })

  it('全部完成后为 0 天', () => {
    const p = makeProject({
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 0 },
    })
    expect(estimateDaysToFinish(p, ZERO)).toBe(0)
  })

  it('QA 阶段可按 QA 产能估算', () => {
    const p = makeProject({
      phase: 'QA',
      workTotalByDiscipline: { design: 100, programming: 100, art: 100, qa: 100 },
      workRemainingByDiscipline: { design: 0, programming: 0, art: 0, qa: 30 },
    })
    expect(estimateDaysToFinish(p, { ...ZERO, qa: 6 }, ['qa'])).toBe(5)
  })

  it('产能为 NaN / Infinity 时返回 null，不会产生 NaN 天数', () => {
    const p = makeProject({
      workRemainingByDiscipline: { design: 10, programming: 0, art: 0, qa: 0 },
    })
    expect(estimateDaysToFinish(p, { ...ZERO, design: NaN })).toBeNull()
    expect(estimateDaysToFinish(p, { ...ZERO, design: Infinity })).toBeNull()
  })
})
