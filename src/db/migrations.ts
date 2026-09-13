import type { DatabaseSync } from 'node:sqlite'

interface Migration {
  readonly version: number
  readonly sql: string
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        note TEXT,
        due_at TEXT,
        lead_days INTEGER NOT NULL DEFAULT 3,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
        brain_ref TEXT,
        source TEXT NOT NULL DEFAULT 'mcp' CHECK (source IN ('mcp', 'web')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        done_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos (status, due_at);

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todo_tags (
        todo_id TEXT NOT NULL REFERENCES todos (id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
        PRIMARY KEY (todo_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_todo_tags_tag ON todo_tags (tag_id);

      CREATE TABLE IF NOT EXISTS brain_sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        todo_id TEXT NOT NULL REFERENCES todos (id) ON DELETE CASCADE,
        event TEXT NOT NULL CHECK (event IN ('created', 'done')),
        target_slug TEXT NOT NULL,
        ok INTEGER NOT NULL,
        error TEXT,
        synced_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        scope TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
        client_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        family_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_family ON oauth_tokens (family_id);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES goals (id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        tag TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('life', 'annual', 'long')),
        period_start TEXT,
        period_end TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'paused', 'dropped')),
        why TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goal_metrics (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('count', 'value', 'boolean')),
        direction TEXT NOT NULL CHECK (direction IN ('gte', 'lte', 'maintain')),
        target_value REAL NOT NULL,
        unit TEXT,
        baseline_value REAL,
        cadence TEXT CHECK (cadence IN ('monthly', 'weekly')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE (goal_id, name)
      );
      CREATE TABLE IF NOT EXISTS goal_checkins (
        id TEXT PRIMARY KEY,
        metric_id TEXT NOT NULL REFERENCES goal_metrics (id) ON DELETE CASCADE,
        value REAL NOT NULL,
        note TEXT,
        source TEXT NOT NULL DEFAULT 'mcp' CHECK (source IN ('mcp', 'web')),
        logged_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_goal_checkins_metric ON goal_checkins (metric_id, logged_at);
      ALTER TABLE todos ADD COLUMN goal_id TEXT REFERENCES goals (id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_todos_goal ON todos (goal_id);
    `,
  },
]

export function runMigrations(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map((r) => r.version),
  )
  const insert = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    db.exec('BEGIN')
    try {
      db.exec(migration.sql)
      insert.run(migration.version, new Date().toISOString())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`마이그레이션 v${migration.version} 실패: ${(error as Error).message}`)
    }
  }
}
