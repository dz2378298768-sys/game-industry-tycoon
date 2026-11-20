import { GameWorld } from '@application/mediators/game-world'
import { createContentMarketInputProvider } from '@content/market-inputs'

/**
 * 生产唯一构造入口（DESIGN-M2-001-H v1.1 §4.1 / P2-1）：
 * 注入内容层市场输入；测试仍可直接 `new GameWorld(seed)` 得到 NULL provider。
 */
export function createGameWorld(
  seed = 42,
  options: { aiCompetition?: boolean } = {},
): GameWorld {
  return new GameWorld(seed, createContentMarketInputProvider(), options)
}
