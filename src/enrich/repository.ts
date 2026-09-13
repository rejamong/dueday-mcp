import type { Db } from '../db/connection.js'
import type { Promotion } from './schema.js'
import { parseJsonColumn } from '../todos/repository.js'

export type EnrichStatus = 'ok' | 'failed' | 'skipped'

export interface EnrichmentApplied {
  readonly tags?: readonly string[]
  readonly goal?: string
  readonly lead_days?: number
  readonly due?: string
}

export interface EnrichmentLogRow {
  readonly id: string
  readonly todo_id: string
  readonly status: EnrichStatus
  readonly model: string
  readonly applied: EnrichmentApplied | null
  readonly suggestion: Promotion | null
  readonly reason: string | null
  readonly error: string | null
  readonly dismissed_at: string | null
  readonly accepted_at: string | null
  readonly created_at: string
}

type Raw = Omit<EnrichmentLogRow, 'applied' | 'suggestion'> & { applied: string | null; suggestion: string | null }

function parse(row: Raw): EnrichmentLogRow {
  return {
    ...row,
    applied: parseJsonColumn<EnrichmentApplied>(row.applied, 'enrichment_log.applied'),
    suggestion: parseJsonColumn<Promotion>(row.suggestion, 'enrichment_log.suggestion'),
  }
}

export function insertEnrichmentLog(db: Db, row: Omit<EnrichmentLogRow, 'dismissed_at' | 'accepted_at'>): void {
  db.prepare(
    `INSERT INTO enrichment_log (id, todo_id, status, model, applied, suggestion, reason, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.todo_id, row.status, row.model, row.applied ? JSON.stringify(row.applied) : null,
    row.suggestion ? JSON.stringify(row.suggestion) : null, row.reason, row.error, row.created_at)
}

export function listEnrichmentLog(db: Db, todoId: string): EnrichmentLogRow[] {
  return (db.prepare('SELECT * FROM enrichment_log WHERE todo_id = ? ORDER BY created_at DESC').all(todoId) as unknown as Raw[]).map(parse)
}

export function countCallsSince(db: Db, sinceIso: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM enrichment_log WHERE status IN ('ok', 'failed') AND created_at >= ?").get(sinceIso) as { n: number }
  return row.n
}

export interface SuggestionRow extends EnrichmentLogRow {
  readonly todo_title: string
}

/** Goal-promotion suggestions not yet accepted or dismissed. */
export function listSuggestions(db: Db): SuggestionRow[] {
  const rows = db
    .prepare(
      `SELECT e.*, t.title AS todo_title FROM enrichment_log e JOIN todos t ON t.id = e.todo_id
        WHERE e.suggestion IS NOT NULL AND e.dismissed_at IS NULL AND e.accepted_at IS NULL ORDER BY e.created_at DESC`,
    )
    .all() as unknown as Array<Raw & { todo_title: string }>
  return rows.map((r) => ({ ...parse(r), todo_title: r.todo_title }))
}

export function findSuggestion(db: Db, id: string): SuggestionRow | undefined {
  const row = db.prepare('SELECT e.*, t.title AS todo_title FROM enrichment_log e JOIN todos t ON t.id = e.todo_id WHERE e.id = ?').get(id) as (Raw & { todo_title: string }) | undefined
  return row ? { ...parse(row), todo_title: row.todo_title } : undefined
}

export function markSuggestion(db: Db, id: string, field: 'dismissed_at' | 'accepted_at', at: string): void {
  db.prepare(`UPDATE enrichment_log SET ${field} = ? WHERE id = ?`).run(at, id)
}
