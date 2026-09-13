import { monotonicFactory } from 'ulid'
import type { Db } from '../db/connection.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { parseOrThrow } from '../validation.js'
import { parseDue, todayInSeoul, toSeoulIso } from '../todos/dates.js'
import { listOpenTodosForGoal } from '../todos/repository.js'
import type { Clock } from '../todos/service.js'
import { goalStatus, metricProgress, timePercent } from './progress.js'
import {
  deleteMetric, findGoalById, findGoalByTag, insertCheckin, insertGoal, insertMetric, listCheckinsForGoal,
  listGoals, listMetrics, todoCountsByGoal, updateGoal, updateMetric,
} from './repository.js'
import { addGoalSchema, listGoalsSchema, logProgressSchema, updateGoalSchema, type AddGoalInput, type MetricInput, type UpdateGoalInput } from './schemas.js'
import type { CheckinView, GoalDetail, GoalRow, GoalWithProgress, MetricRow, MetricWithProgress } from './types.js'

export interface GoalServiceDeps {
  readonly db: Db
  readonly clock?: Clock
}

const nextUlid = monotonicFactory()
const RECENT_CHECKINS = 30
const systemClock: Clock = { now: () => new Date() }

function periodOf(input: { kind: string; year?: number | undefined; period_start?: string | undefined; period_end?: string | undefined }, today: string): [string | null, string | null] {
  if (input.kind === 'short') {
    if (input.period_end === undefined) throw new ValidationError('단기 목표는 종료일(period_end)이 필요합니다')
    return [input.period_start ?? today, input.period_end]
  }
  if (input.period_start !== undefined || input.period_end !== undefined) return [input.period_start ?? null, input.period_end ?? null]
  if (input.kind === 'annual') {
    const year = input.year ?? Number(today.slice(0, 4))
    return [`${year}-01-01`, `${year}-12-31`]
  }
  return [null, null]
}

function assertPeriodOrder(start: string | null, end: string | null): void {
  if (start !== null && end !== null && end < start) throw new ValidationError('종료일이 시작일보다 앞설 수 없습니다')
}

function metricRow(goalId: string, m: MetricInput, index: number, id = nextUlid()): MetricRow {
  return {
    id, goal_id: goalId, name: m.name, kind: m.kind, direction: m.direction, target_value: m.target_value,
    unit: m.unit ?? null, baseline_value: m.baseline_value ?? null, cadence: m.cadence ?? null, sort_order: index,
  }
}

/** Goals, their metrics and check-ins, plus derived progress. */
export class GoalService {
  private readonly db: Db
  private readonly clock: Clock

  constructor(deps: GoalServiceDeps) {
    this.db = deps.db
    this.clock = deps.clock ?? systemClock
  }

  today(): string {
    return todayInSeoul(this.clock.now())
  }

  /** Accepts an id or a tag; throws NotFoundError otherwise. */
  resolve(ref: string): GoalRow {
    const goal = findGoalById(this.db, ref) ?? findGoalByTag(this.db, ref.trim().toLowerCase())
    if (!goal) throw new NotFoundError(`목표를 찾을 수 없습니다: ${ref}`)
    return goal
  }

  async add(input: unknown): Promise<GoalWithProgress> {
    const data = parseOrThrow(addGoalSchema, input)
    if (findGoalByTag(this.db, data.tag)) throw new ValidationError(`이미 있는 태그입니다: ${data.tag}`)
    const parentId = data.parent === undefined ? null : this.resolve(data.parent).id
    const [start, end] = periodOf(data, this.today())
    assertPeriodOrder(start, end)
    const now = toSeoulIso(this.clock.now())
    const id = nextUlid()
    this.transaction(() => {
      insertGoal(this.db, {
        id, parent_id: parentId, title: data.title, tag: data.tag, kind: data.kind, period_start: start, period_end: end,
        status: 'active', why: data.why ?? null, sort_order: 0, created_at: now, updated_at: now,
      })
      data.metrics.forEach((m, i) => insertMetric(this.db, metricRow(id, m, i)))
    })
    return this.withProgress(findGoalById(this.db, id) as GoalRow)
  }

  async update(ref: string, input: unknown): Promise<GoalWithProgress> {
    const goal = this.resolve(ref)
    const patch = parseOrThrow(updateGoalSchema, input)
    if (patch.tag !== undefined && patch.tag !== goal.tag && findGoalByTag(this.db, patch.tag)) {
      throw new ValidationError(`이미 있는 태그입니다: ${patch.tag}`)
    }
    const parentId = patch.parent === undefined ? undefined : patch.parent === null ? null : this.resolve(patch.parent).id
    const nextEnd = patch.period_end === undefined ? goal.period_end : patch.period_end
    if (goal.kind === 'short' && nextEnd === null) throw new ValidationError('단기 목표의 종료일은 지울 수 없습니다')
    assertPeriodOrder(patch.period_start === undefined ? goal.period_start : patch.period_start, nextEnd)
    this.transaction(() => {
      updateGoal(this.db, goal.id, { ...goalPatch(patch), ...(parentId !== undefined ? { parent_id: parentId } : {}), updated_at: toSeoulIso(this.clock.now()) })
      if (patch.metrics !== undefined) this.replaceMetrics(goal.id, patch.metrics)
    })
    return this.withProgress(findGoalById(this.db, goal.id) as GoalRow)
  }

  async list(input: unknown): Promise<GoalWithProgress[]> {
    const { status } = parseOrThrow(listGoalsSchema, input ?? {})
    const goals = listGoals(this.db, status).map((g) => this.withProgress(g))
    return goals.map((g) => (g.kind === 'life' ? this.rollUp(g, goals) : g))
  }

  async get(ref: string): Promise<GoalDetail> {
    const goal = this.resolve(ref)
    const base = this.withProgress(goal)
    const checkins = listCheckinsForGoal(this.db, goal.id).slice(-RECENT_CHECKINS).reverse()
    return { ...base, checkins, open_todos: listOpenTodosForGoal(this.db, goal.id) }
  }

  async logProgress(ref: string, input: unknown, source: 'mcp' | 'web' = 'mcp'): Promise<{ checkin: CheckinView; metric: MetricWithProgress; goal: GoalWithProgress }> {
    const goal = this.resolve(ref)
    const data = parseOrThrow(logProgressSchema, input)
    const metrics = listMetrics(this.db, goal.id)
    const metric = pickMetric(metrics, data.metric)
    const loggedAt = data.logged_at === undefined ? toSeoulIso(this.clock.now()) : parseDue(data.logged_at)
    const row = { id: nextUlid(), metric_id: metric.id, value: data.value, note: data.note ?? null, source, logged_at: loggedAt }
    insertCheckin(this.db, row)
    const progressed = this.withProgress(goal)
    const metricView = progressed.metrics.find((m) => m.id === metric.id) as MetricWithProgress
    return { checkin: { ...row, metric_name: metric.name }, metric: metricView, goal: progressed }
  }

  private replaceMetrics(goalId: string, inputs: readonly MetricInput[]): void {
    const existing = listMetrics(this.db, goalId)
    const keep = new Set<string>()
    inputs.forEach((m, i) => {
      const found = existing.find((e) => e.name === m.name)
      const row = metricRow(goalId, m, i, found?.id)
      if (found) updateMetric(this.db, found.id, row)
      else insertMetric(this.db, row)
      keep.add(row.id)
    })
    for (const e of existing) if (!keep.has(e.id)) deleteMetric(this.db, e.id)
  }

  private withProgress(goal: GoalRow): GoalWithProgress {
    const today = this.today()
    const checkins = listCheckinsForGoal(this.db, goal.id)
    const metrics = listMetrics(this.db, goal.id).map((m) => ({
      ...m,
      ...metricProgress(m, checkins.filter((c) => c.metric_id === m.id), today),
    }))
    const todos = todoCountsByGoal(this.db, goal.id)
    const total = todos.open + todos.done
    const percent = metrics.length > 0
      ? Math.round(metrics.reduce((s, m) => s + m.percent, 0) / metrics.length)
      : total > 0 ? Math.round((todos.done / total) * 100) : 0
    const time_percent = timePercent(goal.period_start, goal.period_end, today)
    const has_signal = metrics.some((m) => m.current_value !== null) || total > 0
    const completable = metrics.length === 0 || metrics.some((m) => m.direction === 'gte')
    const status_label = goalStatus({ percent, time_percent, status: goal.status, has_signal, completable })
    return { ...goal, metrics, todos, percent, time_percent, status_label, checkin_count: checkins.length }
  }

  private rollUp(life: GoalWithProgress, all: readonly GoalWithProgress[]): GoalWithProgress {
    const children = all.filter((g) => g.parent_id === life.id && g.status === 'active' && g.status_label !== 'none')
    if (children.length === 0) return life
    const percent = Math.round(children.reduce((s, g) => s + g.percent, 0) / children.length)
    return { ...life, percent, status_label: goalStatus({ percent, time_percent: null, status: life.status, has_signal: true }) }
  }

  private transaction(work: () => void): void {
    this.db.exec('BEGIN')
    try {
      work()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

function goalPatch(patch: UpdateGoalInput): Partial<GoalRow> {
  const out: Record<string, string | number | null> = {}
  for (const key of ['title', 'tag', 'status', 'period_start', 'period_end', 'why', 'sort_order'] as const) {
    const value = patch[key]
    if (value !== undefined) out[key] = value
  }
  return out as Partial<GoalRow>
}

function pickMetric(metrics: readonly MetricRow[], name: string | undefined): MetricRow {
  if (metrics.length === 0) throw new ValidationError('이 목표에는 지표가 없습니다. update_goal로 지표를 먼저 추가하세요')
  if (name === undefined) {
    if (metrics.length === 1) return metrics[0] as MetricRow
    throw new ValidationError(`지표를 지정하세요: ${metrics.map((m) => m.name).join(', ')}`)
  }
  const found = metrics.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
  if (!found) throw new ValidationError(`지표가 없습니다: ${name} (가능: ${metrics.map((m) => m.name).join(', ')})`)
  return found
}
