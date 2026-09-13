import type { Db } from '../db/connection.js'
import { prepStart } from './dates.js'
import type { ListTodosInput } from './schemas.js'
import type { EnrichmentApplied, Todo, TodoRow } from './types.js'

type RawRow = TodoRow & { tag_csv: string | null; goal_tag: string | null }

const SELECT_TODO = `
  SELECT t.*,
         (SELECT group_concat(name, ',') FROM (
            SELECT tg.name FROM todo_tags tt JOIN tags tg ON tg.id = tt.tag_id
             WHERE tt.todo_id = t.id ORDER BY tg.name)) AS tag_csv,
         (SELECT g.tag FROM goals g WHERE g.id = t.goal_id) AS goal_tag
    FROM todos t`

/** Stored JSON should always be well-formed; a corrupt cell degrades that one field instead of the whole list. */
export function parseJsonColumn<T>(raw: string | null, where: string): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`${where} JSON 파싱 실패:`, error)
    return null
  }
}

function toTodo(row: RawRow): Todo {
  const { tag_csv, enrichment, ...rest } = row
  return {
    ...rest,
    prep_start: rest.due_at ? prepStart(rest.due_at, rest.lead_days) : null,
    tags: tag_csv ? tag_csv.split(',') : [],
    enrichment: parseJsonColumn<EnrichmentApplied>(enrichment, 'todos.enrichment'),
  }
}

/** `undefined` = no goal filter, `null` = only unlinked (일상), string = that goal id. */
export type GoalFilter = string | null | undefined

export function insertTodo(db: Db, row: TodoRow): void {
  db.prepare(
    `INSERT INTO todos (id, title, note, due_at, lead_days, status, brain_ref, goal_id, enrichment, enriched_at, source, created_at, updated_at, done_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.title,
    row.note,
    row.due_at,
    row.lead_days,
    row.status,
    row.brain_ref,
    row.goal_id,
    row.enrichment,
    row.enriched_at,
    row.source,
    row.created_at,
    row.updated_at,
    row.done_at,
  )
}

export function findTodo(db: Db, id: string): Todo | undefined {
  const row = db.prepare(`${SELECT_TODO} WHERE t.id = ?`).get(id) as RawRow | undefined
  return row ? toTodo(row) : undefined
}

interface WhereClause {
  readonly sql: string
  readonly params: ReadonlyArray<string | number>
}

function buildWhere(filter: ListTodosInput, goal: GoalFilter): WhereClause {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (goal === null) clauses.push('t.goal_id IS NULL')
  else if (goal !== undefined) {
    clauses.push('t.goal_id = ?')
    params.push(goal)
  }
  if (filter.status !== 'all') {
    clauses.push('t.status = ?')
    params.push(filter.status)
  }
  if (filter.tag !== undefined) {
    clauses.push('EXISTS (SELECT 1 FROM todo_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.todo_id = t.id AND tg.name = ?)')
    params.push(filter.tag)
  }
  if (filter.due_before !== undefined) {
    clauses.push("t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) <= ?")
    params.push(filter.due_before)
  }
  if (filter.due_after !== undefined) {
    clauses.push("t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) >= ?")
    params.push(filter.due_after)
  }
  if (filter.q !== undefined) {
    clauses.push("(t.title LIKE ? ESCAPE '\\' OR t.note LIKE ? ESCAPE '\\')")
    const like = `%${filter.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    params.push(like, like)
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export interface TodoPage {
  readonly items: Todo[]
  readonly total: number
}

export function listTodos(db: Db, filter: ListTodosInput, goal: GoalFilter = undefined): TodoPage {
  const where = buildWhere(filter, goal)
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM todos t ${where.sql}`).get(...where.params) as { n: number }
  ).n
  const rows = db
    .prepare(`${SELECT_TODO} ${where.sql} ORDER BY t.due_at IS NULL, t.due_at ASC, t.id ASC LIMIT ? OFFSET ?`)
    .all(...where.params, filter.limit, filter.offset) as unknown as RawRow[]
  return { items: rows.map(toTodo), total }
}

export function listOpenTodos(db: Db): Todo[] {
  const rows = db.prepare(`${SELECT_TODO} WHERE t.status = 'open' ORDER BY t.due_at IS NULL, t.due_at ASC, t.id ASC`).all() as unknown as RawRow[]
  return rows.map(toTodo)
}

export function listOpenTodosForGoal(db: Db, goalId: string): Todo[] {
  const rows = db.prepare(`${SELECT_TODO} WHERE t.goal_id = ? AND t.status = 'open' ORDER BY t.due_at IS NULL, t.due_at ASC, t.id ASC`).all(goalId) as unknown as RawRow[]
  return rows.map(toTodo)
}

export type TodoPatch = Partial<Omit<TodoRow, 'id' | 'created_at' | 'source'>>

const UPDATABLE_COLUMNS: ReadonlySet<string> = new Set([
  'title', 'note', 'due_at', 'lead_days', 'status', 'brain_ref', 'goal_id', 'enrichment', 'enriched_at', 'updated_at', 'done_at',
])

export function updateTodo(db: Db, id: string, patch: TodoPatch): void {
  const entries = Object.entries(patch).filter(([key, v]) => v !== undefined && UPDATABLE_COLUMNS.has(key))
  if (entries.length === 0) return
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ')
  const values = entries.map(([, value]) => value as string | number | null)
  db.prepare(`UPDATE todos SET ${assignments} WHERE id = ?`).run(...values, id)
}

/** Hard delete; todo_tags and brain_sync_log rows cascade via foreign keys. Returns whether a row was removed. */
export function deleteTodo(db: Db, id: string): boolean {
  const result = db.prepare('DELETE FROM todos WHERE id = ?').run(id)
  return Number(result.changes) > 0
}
