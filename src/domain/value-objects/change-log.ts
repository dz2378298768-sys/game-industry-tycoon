/**
 * ChangeLogEntry —— 项目变更日志
 */
export interface ChangeLogEntry {
  id: string
  type: 'add' | 'remove' | 'update'
  timestampDay: number // dayIndex
  details: Record<string, unknown>
}
