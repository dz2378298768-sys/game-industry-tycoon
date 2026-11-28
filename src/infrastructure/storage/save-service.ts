import { get, set, del } from 'idb-keyval'
import LZString from 'lz-string'
import type { WorldState } from '@simulation/services/world-state'
import { parseSave, SAVE_SCHEMA_VERSION } from './save-schema'
import { backupKeyFor } from './save-migrations'

const SAVE_KEY = 'git_save_v1'
const RECOVERY_KEY = 'git_save_previous'
let pendingWrite: Promise<void> = Promise.resolve()

function queueWrite(write: () => Promise<void>): Promise<void> {
  const operation = pendingWrite.then(write)
  pendingWrite = operation.catch(() => undefined)
  return operation
}

export type LoadGameResult =
  | { status: 'ok'; state: WorldState; migratedFrom?: number; backupWritten?: boolean; recovered?: boolean }
  | { status: 'empty' }
  | { status: 'invalid'; errorCode: string; errorMessage: string }

/** 保存：写入 schemaVersion，便于后续迁移 */
export async function saveGame(world: WorldState): Promise<void> {
  const payload: WorldState = { ...world, schemaVersion: SAVE_SCHEMA_VERSION }
  const compressed = LZString.compressToUTF16(JSON.stringify(payload))
  await queueWrite(async () => {
    const previous = await get<unknown>(SAVE_KEY)
    if (typeof previous === 'string' && decodeSave(previous).status === 'ok') {
      await set(RECOVERY_KEY, previous)
    }
    await set(SAVE_KEY, compressed)
  })
}

/**
 * 读取并校验存档。
 * 无效存档返回 invalid，调用方不得用它覆盖当前运行状态。
 */
function decodeSave(compressed: unknown): LoadGameResult {
  if (compressed == null) return { status: 'empty' }
  if (typeof compressed !== 'string') {
    return { status: 'invalid', errorCode: 'SAVE_CORRUPTED', errorMessage: '存档格式无效。' }
  }

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
  return parsed.migratedFrom === undefined
    ? { status: 'ok', state: parsed.state }
    : { status: 'ok', state: parsed.state, migratedFrom: parsed.migratedFrom }
}

export async function loadGame(): Promise<LoadGameResult> {
  await pendingWrite
  const primary = await get<unknown>(SAVE_KEY)
  const result = decodeSave(primary)
  if (result.status !== 'ok') {
    if (result.status === 'invalid' && result.errorCode === 'SAVE_VERSION_UNSUPPORTED') return result
    const backup = decodeSave(await get<unknown>(RECOVERY_KEY))
    return backup.status === 'ok' ? { ...backup, recovered: true } : result
  }
  if (result.migratedFrom === undefined) return result

  // v1 档先备份原始压缩串（按 seed 分开，已存在则跳过）；备份失败不阻断读档（R1 P2-2）
  let backupWritten = false
  try {
    const key = backupKeyFor(result.state.saveSeed)
    const existing = await get<string>(key)
    if (existing === undefined || existing === null) {
      await set(key, primary)
      backupWritten = true
    }
  } catch (error) {
    console.warn('[save] v1 备份写入失败，读档继续', error)
  }
  return { ...result, backupWritten }
}

export async function hasSave(): Promise<boolean> {
  await pendingWrite
  return (await get(SAVE_KEY)) != null || (await get(RECOVERY_KEY)) != null
}

export async function clearSave(): Promise<void> {
  await queueWrite(async () => {
    await del(RECOVERY_KEY)
    await del(SAVE_KEY)
  })
}
