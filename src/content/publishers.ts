/**
 * 发行商内容表（DECISION-M3-P0-CONTRACT-004 R2 N-3）。
 * `partnerId` 只能来自本表，禁止自由生成。
 */
import publishersRaw from './publishers.json'
export interface PublisherSpec {
  id: string
  name: string
  markets: string[]
  specialties: ('channel' | 'co_marketing' | 'advance')[]
}

export const PUBLISHERS: readonly PublisherSpec[] = publishersRaw as PublisherSpec[]

export function getPublisherSpec(partnerId: string): PublisherSpec | undefined {
  return PUBLISHERS.find((p) => p.id === partnerId)
}

export function isKnownPublisher(partnerId: string): boolean {
  return getPublisherSpec(partnerId) !== undefined
}
