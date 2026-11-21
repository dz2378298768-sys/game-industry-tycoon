/**
 * QualityProfile —— 游戏质量五维描述（0-100）
 */
export interface QualityProfile {
  gameplay: number   // 0-100
  technical: number  // 0-100
  content: number    // 0-100
  art: number        // 0-100
  innovation: number // 0-100
}

export function averageQuality(q: QualityProfile): number {
  return (q.gameplay + q.technical + q.content + q.art + q.innovation) / 5
}

export function clampQuality(q: QualityProfile): QualityProfile {
  return {
    gameplay: Math.max(0, Math.min(100, q.gameplay)),
    technical: Math.max(0, Math.min(100, q.technical)),
    content: Math.max(0, Math.min(100, q.content)),
    art: Math.max(0, Math.min(100, q.art)),
    innovation: Math.max(0, Math.min(100, q.innovation)),
  }
}
