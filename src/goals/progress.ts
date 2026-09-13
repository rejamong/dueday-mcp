import { seoulDate } from '../todos/dates.js'

export type MetricKind = 'count' | 'value' | 'boolean'
export type MetricDirection = 'gte' | 'lte' | 'maintain'
export type Cadence = 'monthly' | 'weekly' | null
export type GoalStatus = 'active' | 'done' | 'paused' | 'dropped'
export type StatusLabel = 'ahead' | 'on_track' | 'behind' | 'done' | 'none'

export interface MetricShape {
  readonly kind: MetricKind
  readonly direction: MetricDirection
  readonly target_value: number
  readonly baseline_value: number | null
  readonly cadence: Cadence
}

export interface CheckinPoint {
  readonly value: number
  readonly logged_at: string
}

export interface MetricProgress {
  readonly current_value: number | null
  readonly percent: number
  readonly on_track: boolean
  readonly remaining: number | null
  readonly cadence_met: boolean | null
  readonly last_logged_at: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const AHEAD_MARGIN = 10
const BEHIND_MARGIN = 15

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)))

function currentOf(metric: MetricShape, sorted: readonly CheckinPoint[]): number | null {
  // A count with no check-ins is genuinely zero; a measurement with none is unknown.
  if (metric.kind === 'count') return sorted.reduce((sum, c) => sum + c.value, 0)
  return sorted[sorted.length - 1]?.value ?? null
}

function percentOf(metric: MetricShape, current: number | null): { percent: number; on_track: boolean; remaining: number | null } {
  if (current === null) return { percent: 0, on_track: false, remaining: metric.kind === 'count' ? metric.target_value : null }
  if (metric.kind === 'boolean') return { percent: current >= 1 ? 100 : 0, on_track: current >= 1, remaining: null }
  if (metric.direction === 'gte') {
    const base = metric.baseline_value ?? 0
    const span = metric.target_value - base
    const percent = span <= 0 ? 100 : clamp(((current - base) / span) * 100)
    return { percent, on_track: percent >= 100, remaining: Math.max(0, metric.target_value - current) }
  }
  const within = current <= metric.target_value
  const remaining = metric.kind === 'count' ? Math.max(0, metric.target_value - current) : null
  return { percent: within ? 100 : 0, on_track: within, remaining }
}

function cadenceMet(cadence: Cadence, sorted: readonly CheckinPoint[], today: string): boolean | null {
  if (cadence === null) return null
  if (cadence === 'monthly') return sorted.some((c) => seoulDate(new Date(c.logged_at)).slice(0, 7) === today.slice(0, 7))
  const weekAgo = new Date(new Date(`${today}T00:00:00+09:00`).getTime() - 6 * DAY_MS)
  return sorted.some((c) => new Date(c.logged_at).getTime() >= weekAgo.getTime())
}

/** Pure progress of one metric from its check-ins; `today` is a Seoul calendar date. */
export function metricProgress(metric: MetricShape, checkins: readonly CheckinPoint[], today: string): MetricProgress {
  const sorted = [...checkins].sort((a, b) => a.logged_at.localeCompare(b.logged_at))
  const current = currentOf(metric, sorted)
  const { percent, on_track, remaining } = percentOf(metric, current)
  return {
    current_value: current,
    percent,
    on_track,
    remaining,
    cadence_met: cadenceMet(metric.cadence, sorted, today),
    last_logged_at: sorted[sorted.length - 1]?.logged_at ?? null,
  }
}

/** Elapsed share of a goal period, 0–100, or null when the goal has no period. */
export function timePercent(start: string | null, end: string | null, today: string): number | null {
  if (start === null || end === null) return null
  const s = Date.parse(`${start}T00:00:00Z`)
  const e = Date.parse(`${end}T00:00:00Z`) + DAY_MS
  const t = Date.parse(`${today}T00:00:00Z`)
  return clamp(((t - s) / (e - s)) * 100)
}

export interface StatusInput {
  readonly percent: number
  readonly time_percent: number | null
  readonly status: GoalStatus
  /** At least one metric has data (or the goal has todos); otherwise progress is unknown. */
  readonly has_signal: boolean
  /** False when the goal only has limit-type metrics (lte/maintain): staying within budget is not "achieved" until the period ends. */
  readonly completable?: boolean
}

export function goalStatus(input: StatusInput): StatusLabel {
  if (input.status === 'done') return 'done'
  if (!input.has_signal) return 'none'
  if (input.percent >= 100) return input.completable === false ? 'on_track' : 'done'
  if (input.time_percent === null) return 'on_track'
  if (input.percent >= input.time_percent + AHEAD_MARGIN) return 'ahead'
  if (input.percent < input.time_percent - BEHIND_MARGIN) return 'behind'
  return 'on_track'
}
