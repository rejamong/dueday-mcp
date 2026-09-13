import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS, runMigrations } from '../src/db/migrations.js'

/** Applies migrations up to and including `version` on a fresh in-memory db. */
function migrateTo(db: DatabaseSync, version: number): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  for (const m of MIGRATIONS) {
    if (m.version > version) break
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, 'x')
  }
}

describe('migrations', () => {
  it('v5 widens goals.kind to include short while keeping rows and foreign keys', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrateTo(db, 4)
    db.prepare("INSERT INTO goals (id, title, tag, kind, status, sort_order, created_at, updated_at) VALUES ('g1', 'life', 'life', 'life', 'active', 0, 't', 't')").run()
    db.prepare("INSERT INTO goals (id, parent_id, title, tag, kind, status, sort_order, created_at, updated_at) VALUES ('g2', 'g1', 'read', 'reading', 'annual', 'active', 0, 't', 't')").run()
    db.prepare("INSERT INTO goal_metrics (id, goal_id, name, kind, direction, target_value, sort_order) VALUES ('m1', 'g2', 'books', 'count', 'gte', 15, 0)").run()
    db.prepare("INSERT INTO todos (id, title, lead_days, status, goal_id, source, created_at, updated_at) VALUES ('t1', 'x', 3, 'open', 'g2', 'mcp', 't', 't')").run()
    expect(() => db.prepare("INSERT INTO goals (id, title, tag, kind, status, sort_order, created_at, updated_at) VALUES ('g3', 's', 's', 'short', 'active', 0, 't', 't')").run()).toThrow()

    runMigrations(db)

    expect((db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>).map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version))
    expect(db.prepare('SELECT COUNT(*) AS n FROM goals').get()).toEqual({ n: 2 })
    expect(db.prepare("SELECT parent_id FROM goals WHERE id = 'g2'").get()).toEqual({ parent_id: 'g1' })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    db.prepare("INSERT INTO goals (id, title, tag, kind, status, sort_order, created_at, updated_at) VALUES ('g3', 's', 's', 'short', 'active', 0, 't', 't')").run()
    // Deleting the parent still cascades through the rebuilt table's references.
    db.prepare("DELETE FROM goals WHERE id = 'g2'").run()
    expect(db.prepare('SELECT COUNT(*) AS n FROM goal_metrics').get()).toEqual({ n: 0 })
    expect(db.prepare("SELECT goal_id FROM todos WHERE id = 't1'").get()).toEqual({ goal_id: null })
  })
})
