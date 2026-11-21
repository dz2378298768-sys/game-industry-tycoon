import cities from './cities.json'
import platforms from './platforms.json'
import consumerSegments from './consumer_segments.json'
import { dayIndexToGregorian } from '@domain/value-objects/day-index'

export type CityContent = (typeof cities)[number]
export type PlatformContent = (typeof platforms)[number]
export type ConsumerSegmentContent = (typeof consumerSegments)[number]

/** dayIndex → 公历年 */
export function yearOfDay(dayIndex: number): number {
  return dayIndexToGregorian(dayIndex).year
}

export function getCity(cityId: string): CityContent | null {
  return cities.find((c) => c.id === cityId) ?? null
}

/** 城市工资系数（应用于员工基础月薪） */
export function citySalaryMultiplier(cityId: string): number {
  return getCity(cityId)?.avgSalaryMultiplier ?? 1
}

/** 城市办公室租金系数 */
export function cityRentMultiplier(cityId: string): number {
  return getCity(cityId)?.officeRentMultiplier ?? 1
}

export function getPlatform(platformId: string): PlatformContent | null {
  return platforms.find((p) => p.id === platformId) ?? null
}

/** 平台在该日期是否已上市可用 */
export function isPlatformAvailable(platformId: string, dayIndex: number): boolean {
  const p = getPlatform(platformId)
  if (!p) return false
  return p.earliestAvailabilityYear <= yearOfDay(dayIndex)
}

export function getConsumerSegment(segmentId: string): ConsumerSegmentContent | null {
  return consumerSegments.find((s) => s.id === segmentId) ?? null
}

/** 受众群体在该日期是否已存在 */
export function isSegmentAvailable(segmentId: string, dayIndex: number): boolean {
  const s = getConsumerSegment(segmentId)
  if (!s) return false
  return s.availableYearStart <= yearOfDay(dayIndex)
}

/** 当前年代可用的平台列表 */
export function availablePlatforms(dayIndex: number): PlatformContent[] {
  return platforms.filter((p) => p.earliestAvailabilityYear <= yearOfDay(dayIndex))
}

/** 当前年代可用的受众列表 */
export function availableSegments(dayIndex: number): ConsumerSegmentContent[] {
  return consumerSegments.filter((s) => s.availableYearStart <= yearOfDay(dayIndex))
}
