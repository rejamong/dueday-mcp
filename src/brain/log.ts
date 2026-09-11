import type { Db } from '../db/connection.js'
import type { BrainSyncEvent, BrainSyncOutcome } from './sync.js'

export interface BrainSyncLogEntry {
  readonly id: number
  readonly todo_id: string
  readonly event: BrainSyncEvent
  readonly target_slug: string
  readonly ok: boolean
  readonly error: string | null
  readonly synced_at: string
}

export function insertSyncLog(
  db: Db,
  todoId: string,
  event: BrainSyncEvent,
  outcome: BrainSyncOutcome,
  syncedAt: string,
): void {
  db.prepare(
    'INSERT INTO brain_sync_log (todo_id, event, target_slug, ok, error, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(todoId, event, outcome.target_slug, outcome.ok ? 1 : 0, outcome.error, syncedAt)
}

export function listSyncLog(db: Db, todoId: string): BrainSyncLogEntry[] {
  const rows = db
    .prepare('SELECT * FROM brain_sync_log WHERE todo_id = ? ORDER BY id ASC')
    .all(todoId) as Array<Omit<BrainSyncLogEntry, 'ok'> & { ok: number }>
  return rows.map((r) => ({ ...r, ok: r.ok === 1 }))
}
