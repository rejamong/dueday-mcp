// Pure date helpers for the dueday UI. No libraries, Asia/Seoul only.
// Dates flowing through this module are plain 'YYYY-MM-DD' strings unless noted.

const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토']

/** Trims an RFC3339 due_at ('2026-09-16T18:00:00+09:00') down to its date part. */
function toDateOnly(value) {
  return value === null || value === undefined ? null : String(value).slice(0, 10)
}

function parseParts(dateOnly) {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return { y, m, d }
}

/** Milliseconds-since-epoch for a Y-M-D string, anchored at UTC midnight so DST never matters. */
function toUtcMillis(dateOnly) {
  const { y, m, d } = parseParts(dateOnly)
  return Date.UTC(y, m - 1, d)
}

function weekdayKr(dateOnly) {
  const { y, m, d } = parseParts(dateOnly)
  return WEEKDAYS_KR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** `9/16` — no leading zeros. */
function shortDate(dateOnly) {
  const { m, d } = parseParts(dateOnly)
  return `${m}/${d}`
}

/** Public `M/D` formatter for any RFC3339-or-date-only string, e.g. done_at → `9/10`. */
export function monthDay(value) {
  const dateOnly = toDateOnly(value)
  return dateOnly ? shortDate(dateOnly) : null
}

/** Reads `meta.today` (already a 'YYYY-MM-DD' string) from an API envelope's meta object. */
export function todayFromMeta(meta) {
  return meta ? meta.today : null
}

/** Calendar days between two 'YYYY-MM-DD' strings: dueAt - today. Positive = in the future. */
export function dayDiff(today, dueAt) {
  const dueDateOnly = toDateOnly(dueAt)
  if (!today || !dueDateOnly) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((toUtcMillis(dueDateOnly) - toUtcMillis(today)) / msPerDay)
}

/**
 * `D-5 · 9/16 (화)` when due in 5 days, `D+2 · 9/9 (화)` when 2 days overdue,
 * `D-DAY · 9/11 (목)` when due today. Returns null when there is no due date.
 */
export function ddayLabel(today, dueAt) {
  const dueDateOnly = toDateOnly(dueAt)
  if (!today || !dueDateOnly) return null
  const diff = dayDiff(today, dueAt)
  const marker = diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
  return `${marker} · ${shortDate(dueDateOnly)} (${weekdayKr(dueDateOnly)})`
}

/** `준비 9/12` — prep start date, no weekday. Returns null when there is no prep date. */
export function prepLabel(prepStart) {
  const dateOnly = toDateOnly(prepStart)
  return dateOnly ? `준비 ${shortDate(dateOnly)}` : null
}

/** `TODAY 2026-09-11 (목) · Asia/Seoul` */
export function formatTodayLine(today) {
  if (!today) return ''
  return `TODAY ${today} (${weekdayKr(today)}) · Asia/Seoul`
}
