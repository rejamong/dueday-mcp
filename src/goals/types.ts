import type { Cadence, GoalStatus, MetricDirection, MetricKind, MetricProgress, StatusLabel } from './progress.js'
import type { Todo } from '../todos/types.js'

export type GoalKind = 'life' | 'annual' | 'short' | 'long'

export interface GoalRow {
  readonly id: string
  readonly parent_id: string | null
  readonly title: string
  readonly tag: string
  readonly kind: GoalKind
  readonly period_start: string | null
  readonly period_end: string | null
  readonly status: GoalStatus
  readonly why: string | null
  readonly sort_order: number
  readonly created_at: string
  readonly updated_at: string
}

export interface MetricRow {
  readonly id: string
  readonly goal_id: string
  readonly name: string
  readonly kind: MetricKind
  readonly direction: MetricDirection
  readonly target_value: number
  readonly unit: string | null
  readonly baseline_value: number | null
  readonly cadence: Cadence
  readonly sort_order: number
}

export interface CheckinRow {
  readonly id: string
  readonly metric_id: string
  readonly value: number
  readonly note: string | null
  readonly source: 'mcp' | 'web'
  readonly logged_at: string
}

export interface MetricWithProgress extends MetricRow, MetricProgress {}

export interface GoalWithProgress extends GoalRow {
  readonly metrics: readonly MetricWithProgress[]
  readonly todos: { readonly open: number; readonly done: number }
  readonly percent: number
  readonly time_percent: number | null
  readonly status_label: StatusLabel
  readonly checkin_count: number
}

export interface CheckinView extends CheckinRow {
  readonly metric_name: string
}

export interface GoalDetail extends GoalWithProgress {
  readonly checkins: readonly CheckinView[]
  readonly open_todos: readonly Todo[]
  /** Recently completed todos (newest first, capped) so they can be reviewed or reopened. */
  readonly done_todos: readonly Todo[]
}
