import { ValidationError } from '../errors.js'

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const SEOUL_SUFFIX = '+09:00'
const DEFAULT_DUE_TIME = 'T18:00:00'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Calendar date (YYYY-MM-DD) of an instant, as seen in Seoul. */
export function seoulDate(instant: Date): string {
  return new Date(instant.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10)
}

export function todayInSeoul(now: Date = new Date()): string {
  return seoulDate(now)
}

/** RFC3339 with a fixed +09:00 offset — the canonical storage form. */
export function toSeoulIso(instant: Date): string {
  return `${new Date(instant.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 19)}${SEOUL_SUFFIX}`
}

/** Accepts YYYY-MM-DD (→ 18:00 KST) or any RFC3339 instant; returns the canonical +09:00 form. */
export function parseDue(input: string): string {
  const value = input.trim()
  if (isDateOnly(value)) return `${value}${DEFAULT_DUE_TIME}${SEOUL_SUFFIX}`
  if (DATE_ONLY.test(value)) throw new ValidationError(`존재하지 않는 날짜입니다: ${value}`)
  const instant = new Date(value)
  if (value === '' || Number.isNaN(instant.getTime())) {
    throw new ValidationError('due는 YYYY-MM-DD 또는 RFC3339 형식이어야 합니다')
  }
  return toSeoulIso(instant)
}

export function addDays(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00Z`)
  instant.setUTCDate(instant.getUTCDate() + days)
  return instant.toISOString().slice(0, 10)
}

/** Seoul calendar date on which preparation should begin. */
export function prepStart(dueAt: string, leadDays: number): string {
  return seoulDate(new Date(new Date(dueAt).getTime() - leadDays * DAY_MS))
}
