/**
 * 确定性伪随机引擎 —— mulberry32 + fnv1a 混合派生
 * 无 Date.now / Math.random 依赖。
 */

/** mulberry32 PRNG —— seed-based，确定性 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 32-bit 哈希 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 随机上下文 —— 确保确定性：相同 context → 相同种子 */
export interface RngContext {
  subsystemId: string
  entityId: string | null
  dayIndex: number
  purposeId: string
  scopeId?: string
  sampleIndex?: number
}

/** 从全局保存种子 + 算法版本 + context 派生本次随机的种子 */
export function deriveSeed(
  saveSeed: number,
  algorithmVersion: string,
  ctx: RngContext,
): number {
  const scope = ctx.scopeId ?? 'default'
  const sample = ctx.sampleIndex ?? 0
  const raw = [
    algorithmVersion,
    ctx.subsystemId,
    ctx.entityId ?? 'null',
    ctx.dayIndex.toString(),
    ctx.purposeId,
    scope,
    sample.toString(),
  ].join(':')
  const mixed = mixBits((saveSeed ^ 0x9e3779b9) >>> 0)
  return fnv1a(raw) ^ mixed
}

function mixBits(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0
  x = Math.imul(x, 0x85ebca6b) >>> 0
  x = (x ^ (x >>> 13)) >>> 0
  x = Math.imul(x, 0xc2b2ae35) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x
}

/** Box-Muller 高斯 */
export function gauss(
  rng: () => number,
  mean: number,
  stddev: number,
): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  return mean + z * stddev
}
