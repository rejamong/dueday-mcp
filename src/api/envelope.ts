import type { Context } from 'hono'

type StatusCode = 200 | 201 | 400 | 401 | 404 | 500

interface Meta {
  readonly today: string
  readonly total?: number
}

function buildMeta(today: string, total: number | undefined): Meta {
  return total === undefined ? { today } : { today, total }
}

/** Success envelope: `{ success: true, data, meta: { today, total? } }`. */
export function ok<T>(c: Context, data: T, today: string, total?: number, status: StatusCode = 200) {
  return c.json({ success: true, data, meta: buildMeta(today, total) }, status)
}

/** Failure envelope: `{ success: false, error }`. */
export function fail(c: Context, status: StatusCode, message: string) {
  return c.json({ success: false, error: message }, status)
}
