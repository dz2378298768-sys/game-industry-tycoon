import {
  deriveSeed,
  mulberry32,
  gauss as gaussRaw,
  type RngContext,
} from '@simulation/deterministic/prng'

interface RngInternalState {
  saveSeed: number
  algorithmVersion: string
  currentDayIndex: number
}

/**
 * RandomService —— 确定性随机门面
 * 相同 context → 相同随机值；保存/恢复状态完全可重现。
 */
export class RandomService {
  private saveSeed: number
  private algorithmVersion: string
  /**
   * 当前模拟日索引。
   * 仅影响派生种子；不参与 mulberry32 内部状态。
   */
  private currentDayIndex: number

  constructor(saveSeed = 42) {
    this.saveSeed = saveSeed >>> 0
    this.algorithmVersion = 'mulberry32-v1'
    this.currentDayIndex = 0
  }

  /** 显式推进日索引 —— 应在每次 advanceDay 后调用 */
  setCurrentDayIndex(dayIndex: number): void {
    this.currentDayIndex = dayIndex
  }

  private makeRng(ctx: RngContext): () => number {
    const seed = deriveSeed(this.saveSeed, this.algorithmVersion, ctx)
    return mulberry32(seed)
  }

  float(ctx: RngContext): number {
    return this.makeRng(ctx)()
  }

  floatRange(min: number, max: number, ctx: RngContext): number {
    if (max <= min) return min
    return min + this.makeRng(ctx)() * (max - min)
  }

  int(min: number, max: number, ctx: RngContext): number {
    if (max <= min) return min
    const r = this.makeRng(ctx)()
    return Math.floor(r * (max - min + 1)) + min
  }

  choice<T>(items: T[], ctx: RngContext): T {
    if (items.length === 0) {
      throw new Error('choice: items must not be empty')
    }
    const idx = this.int(0, items.length - 1, ctx)
    const result = items[idx]
    if (result === undefined) throw new Error('choice: undefined result')
    return result
  }

  gauss(mean: number, stddev: number, ctx: RngContext): number {
    return gaussRaw(this.makeRng(ctx), mean, stddev)
  }

  chance(probability: number, ctx: RngContext): boolean {
    if (probability <= 0) return false
    if (probability >= 1) return true
    return this.makeRng(ctx)() < probability
  }

  state(): RngInternalState {
    return {
      saveSeed: this.saveSeed,
      algorithmVersion: this.algorithmVersion,
      currentDayIndex: this.currentDayIndex,
    }
  }

  restoreState(state: RngInternalState): void {
    this.saveSeed = state.saveSeed >>> 0
    this.algorithmVersion = state.algorithmVersion
    this.currentDayIndex = state.currentDayIndex
  }

  reset(seed: number): void {
    this.saveSeed = seed >>> 0
    this.algorithmVersion = 'mulberry32-v1'
    this.currentDayIndex = 0
  }
}
