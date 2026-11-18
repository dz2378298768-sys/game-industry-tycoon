import cities from '@content/cities.json'
import genres from '@content/genres.json'
import platforms from '@content/platforms.json'
import marketRegions from '@content/market_regions.json'
import consumerSegments from '@content/consumer_segments.json'
import { TUNING } from '@content/tuning'

export const content = {
  cities,
  genres,
  platforms,
  marketRegions,
  consumerSegments,
  /** 唯一 TUNING 入口，见 src/content/tuning.ts */
  tuning: TUNING,
}
