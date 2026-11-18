import { get, set, del } from 'idb-keyval'
import LZString from 'lz-string'
import type { WorldState } from '@simulation/services/world-state'

const SAVE_KEY = 'git_save_v1'

export async function saveGame(world: WorldState, _label?: string): Promise<void> {
  const compressed = LZString.compressToUTF16(JSON.stringify(world))
  await set(SAVE_KEY, compressed)
}

export async function loadGame(): Promise<WorldState | null> {
  const compressed = await get<string>(SAVE_KEY)
  if (!compressed) return null
  const json = LZString.decompressFromUTF16(compressed)
  if (!json) return null
  return JSON.parse(json) as WorldState
}

export async function hasSave(): Promise<boolean> {
  const v = await get(SAVE_KEY)
  return v !== undefined && v !== null
}

export async function clearSave(): Promise<void> {
  await del(SAVE_KEY)
}
