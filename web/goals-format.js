// Pure formatting/derivation helpers for the 목표 (goals) page. No DOM here.

import { monthDay } from './dates.js'

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** `14200` -> `14,200`, `75.4` -> `75.4`. */
export function formatNumber(value) {
  return numberFormatter.format(value)
}

/** Year (as a number) that a 'YYYY-MM-DD' `today` string falls in, or null. */
export function yearOf(today) {
  return today ? Number(today.slice(0, 4)) : null
}

/** Annual goals whose period falls in the same calendar year as `today`. */
export function annualGoalsForYear(goals, today) {
  const year = yearOf(today)
  if (year === null) return []
  return goals.filter((g) => g.kind === 'annual' && g.period_start && Number(g.period_start.slice(0, 4)) === year)
}

export function shortTermGoals(goals) {
  return goals.filter((g) => g.kind === 'short')
}

export function longTermGoals(goals) {
  return goals.filter((g) => g.kind === 'long')
}

export function lifeGoal(goals) {
  return goals.find((g) => g.kind === 'life') ?? null
}

/** `2026년 목표 9개 · 평균 달성 52% · 연간 기간 70% 경과`, or null when there are no annual goals yet. */
export function heroSummaryLine(annualGoals, today) {
  const year = yearOf(today)
  if (year === null || annualGoals.length === 0) return null
  const avgPercent = Math.round(annualGoals.reduce((sum, g) => sum + g.percent, 0) / annualGoals.length)
  // Elapsed share of the calendar year itself (not an average of goal periods, which may be shorter).
  const start = Date.UTC(year, 0, 1)
  const end = Date.UTC(year + 1, 0, 1)
  const now = Date.parse(`${today}T00:00:00Z`)
  const yearElapsed = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)))
  const elapsedPart = ` · 연간 기간 ${yearElapsed}% 경과`
  return `${year}년 목표 ${annualGoals.length}개 · 평균 달성 ${avgPercent}%${elapsedPart}`
}

export const STATUS_ORDER = ['ahead', 'on_track', 'behind', 'done']
const STATUS_WORD = { ahead: '앞섬', on_track: '순항', behind: '뒤처짐', done: '달성' }

/** `{ ahead, on_track, behind, done }` counts by status_label. */
export function statusCounts(goals) {
  const counts = { ahead: 0, on_track: 0, behind: 0, done: 0 }
  for (const g of goals) if (g.status_label in counts) counts[g.status_label] += 1
  return counts
}

/** `[{ key: 'ahead', label: '앞섬 2', count: 2 }, …]` in display order, for the clickable status filter. */
export function statusCountItems(goals) {
  const counts = statusCounts(goals)
  return STATUS_ORDER.map((key) => ({ key, label: `${STATUS_WORD[key]} ${counts[key]}`, count: counts[key] }))
}

/** `9 · 앞섬 2 · 순항 4 · 뒤처짐 2 · 달성 1` counts by status_label. */
export function statusCountsLine(goals) {
  return `${goals.length} · ${statusCountItems(goals).map((i) => i.label).join(' · ')}`
}

/** Goals matching a status filter; null/unknown filter returns all. */
export function filterGoalsByStatus(goals, statusFilter) {
  if (!statusFilter) return goals
  return goals.filter((g) => g.status_label === statusFilter)
}

const STATUS_PILL = {
  ahead: { label: '앞섬', className: 'status-pill-ahead' },
  on_track: { label: '순항', className: 'status-pill-on_track' },
  behind: { label: '뒤처짐', className: 'status-pill-behind' },
  done: { label: '달성', className: 'status-pill-done' },
}

/** `{ label, className }` for a status pill, or null when the goal has no signal yet ('none'). */
export function statusPill(statusLabel) {
  return STATUS_PILL[statusLabel] ?? null
}

/** Appends the cadence suffix (`· 이번 달 완료`/`아직`) to `text` when the metric has a cadence. */
function appendCadence(text, metric) {
  if (!metric.cadence || metric.cadence_met === null || metric.cadence_met === undefined) return text
  const label = metric.cadence === 'monthly' ? '이번 달' : '이번 주'
  return `${text} · ${label} ${metric.cadence_met ? '완료' : '아직'}`
}

function formatBoolean(metric) {
  const done = metric.current_value !== null && metric.current_value >= 1
  const base = done ? `완료 · ${monthDay(metric.last_logged_at) ?? ''}` : '미완료'
  return appendCadence(base, metric)
}

function formatCountLte(metric) {
  const remaining = metric.remaining ?? 0
  const base = `${formatNumber(metric.current_value)} / ${formatNumber(metric.target_value)} 사용 · 여유 ${formatNumber(remaining)}`
  return appendCadence(base, metric)
}

function formatMaintainOrLte(metric) {
  const unit = metric.unit ? ` ${metric.unit}` : ''
  const base = `${formatNumber(metric.current_value)}${unit} · ${metric.on_track ? '유지 중' : '초과'}`
  return appendCadence(base, metric)
}

function formatGte(metric) {
  const unit = metric.unit ? ` ${metric.unit}` : ''
  const base = `${formatNumber(metric.current_value)} / ${formatNumber(metric.target_value)}${unit} · ${metric.percent}%`
  return appendCadence(base, metric)
}

/** Renders a metric's `current_value`/progress as the one-line text described in the design spec. */
export function formatMetricValue(metric) {
  if (metric.kind === 'boolean') return formatBoolean(metric)
  // A count naturally starts at 0 (nothing logged yet = zero so far), so it's real data, not
  // "no data" — unlike `value`, where the server can't assume a starting point.
  if (metric.kind === 'count') {
    const counted = { ...metric, current_value: metric.current_value ?? 0 }
    return metric.direction === 'lte' ? formatCountLte(counted) : formatGte(counted)
  }
  if (metric.current_value === null) return '기록 없음'
  if (metric.direction === 'lte' || metric.direction === 'maintain') return formatMaintainOrLte(metric)
  return formatGte(metric)
}

/** Best-effort ascii slug from a (likely Korean) title, matching the server's tag regex. */
export function slugifyTitle(title) {
  let base = title
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
    .replace(/^[-_]+/, '')
  if (!/^[a-z0-9]/.test(base)) base = `g${base}`
  if (base.length === 0) base = `goal-${Date.now().toString(36)}`
  return base.slice(0, 32)
}
