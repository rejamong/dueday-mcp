import type { Db } from '../db/connection.js'
import type { CheckinRow, CheckinView, GoalRow, MetricRow } from './types.js'

type Bind = string | number | null

export function insertGoal(db: Db, row: GoalRow): void {
  db.prepare(
    `INSERT INTO goals (id, parent_id, title, tag, kind, period_start, period_end, status, why, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.parent_id, row.title, row.tag, row.kind, row.period_start, row.period_end, row.status, row.why, row.sort_order, row.created_at, row.updated_at)
}

const GOAL_COLUMNS: ReadonlySet<string> = new Set(['parent_id', 'title', 'tag', 'period_start', 'period_end', 'status', 'why', 'sort_order', 'updated_at'])

export function updateGoal(db: Db, id: string, patch: Partial<GoalRow>): void {
  const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && GOAL_COLUMNS.has(k))
  if (entries.length === 0) return
  db.prepare(`UPDATE goals SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...entries.map(([, v]) => v as Bind), id)
}

export function findGoalById(db: Db, id: string): GoalRow | undefined {
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined
}

export function findGoalByTag(db: Db, tag: string): GoalRow | undefined {
  return db.prepare('SELECT * FROM goals WHERE tag = ?').get(tag) as GoalRow | undefined
}

export function listGoals(db: Db, status: 'active' | 'all'): GoalRow[] {
  const where = status === 'active' ? "WHERE status = 'active'" : ''
  return db.prepare(`SELECT * FROM goals ${where} ORDER BY CASE kind WHEN 'life' THEN 0 WHEN 'annual' THEN 1 ELSE 2 END, sort_order, created_at`).all() as unknown as GoalRow[]
}

export function insertMetric(db: Db, row: MetricRow): void {
  db.prepare(
    `INSERT INTO goal_metrics (id, goal_id, name, kind, direction, target_value, unit, baseline_value, cadence, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.goal_id, row.name, row.kind, row.direction, row.target_value, row.unit, row.baseline_value, row.cadence, row.sort_order)
}

export function updateMetric(db: Db, id: string, row: Omit<MetricRow, 'id' | 'goal_id' | 'name'>): void {
  db.prepare('UPDATE goal_metrics SET kind = ?, direction = ?, target_value = ?, unit = ?, baseline_value = ?, cadence = ?, sort_order = ? WHERE id = ?')
    .run(row.kind, row.direction, row.target_value, row.unit, row.baseline_value, row.cadence, row.sort_order, id)
}

export function deleteMetric(db: Db, id: string): void {
  db.prepare('DELETE FROM goal_metrics WHERE id = ?').run(id)
}

export function listMetrics(db: Db, goalId: string): MetricRow[] {
  return db.prepare('SELECT * FROM goal_metrics WHERE goal_id = ? ORDER BY sort_order, rowid').all(goalId) as unknown as MetricRow[]
}

export function listCheckinsForGoal(db: Db, goalId: string): CheckinView[] {
  return db
    .prepare(
      `SELECT c.*, m.name AS metric_name FROM goal_checkins c JOIN goal_metrics m ON m.id = c.metric_id
        WHERE m.goal_id = ? ORDER BY c.logged_at ASC`,
    )
    .all(goalId) as unknown as CheckinView[]
}

export function insertCheckin(db: Db, row: CheckinRow): void {
  db.prepare('INSERT INTO goal_checkins (id, metric_id, value, note, source, logged_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.id, row.metric_id, row.value, row.note, row.source, row.logged_at)
}

export function todoCountsByGoal(db: Db, goalId: string): { open: number; done: number } {
  const row = db
    .prepare(`SELECT SUM(status = 'open') AS open, SUM(status = 'done') AS done FROM todos WHERE goal_id = ?`)
    .get(goalId) as { open: number | null; done: number | null }
  return { open: row.open ?? 0, done: row.done ?? 0 }
}
