interface OpeningRegion {
  cityId: string
  featuredGenre: string
  genreWeights: Readonly<Record<string, number>>
  priceSensitivity: number
}

/** 1970 launch scenario calibration. Regional preferences apply to the early arcade platform. */
export const OPENING_REGIONS: Readonly<Partial<Record<string, OpeningRegion>>> = {
  north_america: { cityId: 'san_francisco', featuredGenre: 'arcade', genreWeights: { arcade: 1.12, shooter: 0.94 }, priceSensitivity: 1 },
  western_europe: { cityId: 'london', featuredGenre: 'shooter', genreWeights: { shooter: 1.16, arcade: 0.88 }, priceSensitivity: 1.2 },
  japan: { cityId: 'tokyo', featuredGenre: 'fighting', genreWeights: { fighting: 1.32, arcade: 0.88, shooter: 0.88 }, priceSensitivity: 0.85 },
}

export function earlyArcadeDemand(marketId: string | undefined, platformId: string) {
  return marketId && platformId === 'arcade_pre_1975' ? OPENING_REGIONS[marketId] : undefined
}
