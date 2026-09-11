// Data loading for the month calendar view — covers /api/todos?due_after&due_before over a date range.
//
// NOTE: this deliberately never sends an `offset` query param. The backend's REST query parser
// (src/api/routes.ts buildListQuery) only coerces `limit` to a number before validation; `offset`
// arrives as a string and the schema (offset: z.number()) rejects it outright — even `offset=0`
// fails with "offset: Invalid input: expected number, received string". Until that's fixed
// server-side, pagination here is done by bisecting the date range instead of paging by offset.

import { api } from './api.js'
import { addDays } from './dates.js'

const PAGE_LIMIT = 100

function toUtcMillis(dateOnly) {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Midpoint day (floor) between two inclusive 'YYYY-MM-DD' bounds. */
function midpointDate(dueAfter, dueBefore) {
  const midMs = Math.floor((toUtcMillis(dueAfter) + toUtcMillis(dueBefore)) / 2 / 86400000) * 86400000
  return new Date(midMs).toISOString().slice(0, 10)
}

function dedupeById(todos) {
  return [...new Map(todos.map((t) => [t.id, t])).values()]
}

/**
 * Fetches every todo (any status) whose due date falls in [dueAfter, dueBefore] (both inclusive).
 * When a single page can't hold `meta.total` rows, the date range is bisected and each half is
 * fetched recursively (see the note above for why this isn't offset-based paging).
 */
export async function fetchTodosInRange(dueAfter, dueBefore) {
  const res = await api(`/api/todos?status=all&due_after=${dueAfter}&due_before=${dueBefore}&limit=${PAGE_LIMIT}`)
  const total = res.meta.total ?? res.data.length
  if (total <= res.data.length || dueAfter === dueBefore) return res.data

  const mid = midpointDate(dueAfter, dueBefore)
  const [left, right] = await Promise.all([
    fetchTodosInRange(dueAfter, mid),
    fetchTodosInRange(addDays(mid, 1), dueBefore),
  ])
  return dedupeById([...left, ...right])
}
