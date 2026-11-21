import { get, set, del } from 'idb-keyval'
import LZString from 'lz-string'
import type { WorldState } from '@simulation/services/world-state'
import { parseSave, SAVE_SCHEMA_VERSION } from './save-schema'
import { backupKeyFor } from './save-migrations'

const SAVE_KEY = 'git_save_v1'

export type LoadGameResult =
  | { status: 'ok'; state: WorldState; migratedFrom?: number; backupWritten?: boolean }
  | { status: 'empty' }
  | { status: 'invalid'; errorCode: string; errorMessage: string }

/** 保存：写入 schemaVersion，便于后续迁移 */
export async function saveGame(world: WorldState): Promise<void> {
  const payload: WorldState = { ...world, schemaVersion: SAVE_SCHEMA_VERSION }
  const compressed = LZString.compressToUTF16(JSON.stringify(payload))
  await set(SAVE_KEY, compressed)
}

/**
 * 读取并校验存档。
 * 无效存档返回 invalid，调用方不得用它覆盖当前运行状态。
 */
export async function loadGame(): Promise<LoadGameResult> {
  const compressed = await get<string>(SAVE_KEY)
  if (!compressed) return { status: 'empty' }

  const json = LZString.decompressFromUTF16(compressed)
  if (!json) {
    return { status: 'invalid', errorCode: 'SAVE_CORRUPTED', errorMessage: '存档数据无法解压，可能已损坏。' }
  }

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { status: 'invalid', errorCode: 'SAVE_CORRUPTED', errorMessage: '存档 JSON 解析失败，可能已损坏。' }
  }

  const parsed = parseSave(raw)
  if (!parsed.ok) {
    return { status: 'invalid', errorCode: parsed.errorCode, errorMessage: parsed.errorMessage }
  }
  if (parsed.migratedFrom === undefined) {
    return { status: 'ok', state: parsed.state }
  }

  // v1 档先备份原始压缩串（按 seed 分开，已存在则跳过）；备份失败不阻断读档（R1 P2-2）
  let backupWritten = false
  try {
    const key = backupKeyFor(parsed.state.saveSeed)
    const existing = await get<string>(key)
    if (existing === undefined || existing === null) {
      await set(key, compressed)
      backupWritten = true
    }
  } catch (error) {
    console.warn('[save] v1 备份写入失败，读档继续', error)
  }
  return { status: 'ok', state: parsed.state, migratedFrom: parsed.migratedFrom, backupWritten }
}

export async function hasSave(): Promise<boolean> {
  const v = await get(SAVE_KEY)
  return v !== undefined && v !== null
}

export async function clearSave(): Promise<void> {
  await del(SAVE_KEY)
}
