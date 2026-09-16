// 규모 (size): a 1–6 estimate of how big a todo is. Mirrors src/todos/size.ts on the server.

import { dayDiff } from './dates.js'

export const SIZES = [1, 2, 3, 4, 5, 6]

/** Short label per level, for chips and selects. */
export const SIZE_LABELS = { 1: '한 시간', 2: '반나절', 3: '이틀', 4: '일주일', 5: '2주', 6: '장기' }

/** Longer description per level, for tooltips. */
export const SIZE_DESCRIPTIONS = { 1: '1시간 미만', 2: '하루 미만', 3: '1~2일', 4: '3~7일', 5: '2주', 6: '2주 이상' }

/** Preparation window each size needs, in days before due. Mirrors the server's lead_days derivation. */
export const SIZE_LEAD_DAYS = { 1: 0, 2: 1, 3: 2, 4: 5, 5: 10, 6: 14 }

/** `일주일` for a valid 1–6 size, otherwise null. */
export function sizeLabel(size) {
  return Object.prototype.hasOwnProperty.call(SIZE_LABELS, size) ? SIZE_LABELS[size] : null
}

/**
 * Whether an open todo's remaining time is short relative to its 규모. `null` when not applicable
 * (no due date/size, not open, already overdue, or a size with no prep window). `'critical'` when
 * remaining days are at most half the required window, `'tight'` when still under it.
 */
export function timePressure(todo, today) {
  // The server computes the same rule per request; trust it when present, fall back for older payloads.
  if (todo.time_pressure === 'tight' || todo.time_pressure === 'critical') return todo.time_pressure
  if (todo.time_pressure === null) return null
  if (todo.status !== 'open') return null
  if (!todo.due_at || todo.size === null || todo.size === undefined) return null
  const remaining = dayDiff(today, todo.due_at)
  if (remaining === null || remaining < 0) return null
  const required = SIZE_LEAD_DAYS[todo.size]
  if (!required) return null
  if (remaining <= Math.floor(required / 2)) return 'critical'
  if (remaining < required) return 'tight'
  return null
}

/** `규모 4 · 일주일 걸리는 일인데 3일 남음` — tooltip text for a tight/critical badge. Null when there's no pressure. */
export function pressureText(todo, today) {
  const pressure = timePressure(todo, today)
  if (!pressure) return null
  const remaining = dayDiff(today, todo.due_at)
  return `규모 ${todo.size} · ${sizeLabel(todo.size)} 걸리는 일인데 ${remaining}일 남음`
}
