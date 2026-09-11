import type { Db } from '../db/connection.js'
import type { TagSummary } from '../todos/types.js'

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeTagNames(names: readonly string[]): string[] {
  return [...new Set(names.map(normalizeTagName).filter((n) => n.length > 0))].sort()
}

/** Creates any missing tags and returns their ids in the order of `names`. */
export function ensureTags(db: Db, names: readonly string[], now: string): number[] {
  const insert = db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)')
  const select = db.prepare('SELECT id FROM tags WHERE name = ?')
  return names.map((name) => {
    insert.run(name, now)
    const row = select.get(name) as { id: number } | undefined
    if (!row) throw new Error(`태그 생성 실패: ${name}`)
    return row.id
  })
}

export function replaceTodoTags(db: Db, todoId: string, tagIds: readonly number[]): void {
  db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId)
  const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
  for (const tagId of tagIds) insert.run(todoId, tagId)
}

export function listTagsWithOpenCount(db: Db): TagSummary[] {
  const rows = db
    .prepare(
      `SELECT tg.name, tg.color,
              (SELECT COUNT(*) FROM todo_tags tt JOIN todos t ON t.id = tt.todo_id
                WHERE tt.tag_id = tg.id AND t.status = 'open') AS open_count
         FROM tags tg ORDER BY tg.name`,
    )
    .all() as Array<{ name: string; color: string | null; open_count: number }>
  return rows.map((r) => ({ name: r.name, color: r.color, open_count: r.open_count }))
}
