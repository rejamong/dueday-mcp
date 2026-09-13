import { monotonicFactory } from 'ulid'
import type { Db } from '../db/connection.js'
import { NotFoundError } from '../errors.js'
import type { GoalService } from '../goals/service.js'
import type { GoalWithProgress } from '../goals/types.js'
import { addDays, todayInSeoul, toSeoulIso } from '../todos/dates.js'
import type { Clock, TodoService } from '../todos/service.js'
import { DEFAULT_LEAD_DAYS } from '../todos/schemas.js'
import type { Todo } from '../todos/types.js'
import { listTagsWithOpenCount } from '../tags/repository.js'
import type { EnrichClient, EnrichmentOutput } from './client.js'
import {
  countCallsSince, findSuggestion, insertEnrichmentLog, listSuggestions, markSuggestion, type EnrichmentApplied, type EnrichmentLogRow, type SuggestionRow,
} from './repository.js'

export interface ProvidedFields {
  readonly tags: boolean
  readonly lead_days: boolean
  readonly goal: boolean
  readonly due: boolean
}

export interface EnricherDeps {
  readonly db: Db
  readonly clock?: Clock
  readonly client: EnrichClient
  readonly model: string
  readonly dailyCap: number
}

const nextUlid = monotonicFactory()
/** A short-term goal proposed without an end date runs for one quarter. */
const DEFAULT_SHORT_GOAL_DAYS = 90
const systemClock: Clock = { now: () => new Date() }

function nothingBlank(p: ProvidedFields): boolean {
  return p.tags && p.lead_days && p.goal && p.due
}

/**
 * Fills blank fields of newly created todos with a Claude classification, asynchronously and serially.
 * Never overrides values the user provided; goal links are applied only at high confidence;
 * goal-promotion ideas are stored as suggestions for the user to accept or dismiss.
 */
export class Enricher {
  private readonly db: Db
  private readonly clock: Clock
  private readonly client: EnrichClient
  private readonly model: string
  private readonly dailyCap: number
  private todos: TodoService | null = null
  private goals: GoalService | null = null
  private queue: Promise<void> = Promise.resolve()

  constructor(deps: EnricherDeps) {
    this.db = deps.db
    this.clock = deps.clock ?? systemClock
    this.client = deps.client
    this.model = deps.model
    this.dailyCap = deps.dailyCap
  }

  attach(todos: TodoService, goals: GoalService): void {
    this.todos = todos
    this.goals = goals
  }

  enqueue(todoId: string, provided: ProvidedFields): void {
    if (nothingBlank(provided)) return
    this.queue = this.queue.then(() => this.run(todoId, provided)).catch((error) => console.error('enrich 큐 오류:', error))
  }

  /** Waits for every queued classification (tests, graceful shutdown). */
  flush(): Promise<void> {
    return this.queue
  }

  async acceptSuggestion(id: string): Promise<GoalWithProgress> {
    const { todos, goals } = this.services()
    const row = this.pendingSuggestion(id)
    const s = row.suggestion as NonNullable<SuggestionRow['suggestion']>
    const life = (await goals.list({ status: 'active' })).find((g) => g.kind === 'life')
    const goal = await goals.add({
      title: s.title, kind: s.kind, tag: s.tag, why: s.why,
      ...(life ? { parent: life.tag } : {}),
      ...(s.kind === 'annual' ? { year: Number(this.today().slice(0, 4)) } : {}),
      ...(s.kind === 'short' ? { period_end: s.period_end ?? addDays(this.today(), DEFAULT_SHORT_GOAL_DAYS) } : {}),
      metrics: [{ ...s.metric, unit: s.metric.unit ?? undefined }],
    })
    await todos.update(row.todo_id, { goal: goal.tag })
    markSuggestion(this.db, id, 'accepted_at', toSeoulIso(this.clock.now()))
    return goal
  }

  async dismissSuggestion(id: string): Promise<void> {
    this.pendingSuggestion(id)
    markSuggestion(this.db, id, 'dismissed_at', toSeoulIso(this.clock.now()))
  }

  listSuggestions(): SuggestionRow[] {
    return listSuggestions(this.db)
  }

  private today(): string {
    return todayInSeoul(this.clock.now())
  }

  private services(): { todos: TodoService; goals: GoalService } {
    if (!this.todos || !this.goals) throw new Error('Enricher.attach()가 먼저 호출되어야 합니다')
    return { todos: this.todos, goals: this.goals }
  }

  private pendingSuggestion(id: string): SuggestionRow {
    const row = findSuggestion(this.db, id)
    if (!row || row.suggestion === null || row.accepted_at !== null || row.dismissed_at !== null) {
      throw new NotFoundError(`처리할 제안이 없습니다: ${id}`)
    }
    return row
  }

  private async run(todoId: string, provided: ProvidedFields): Promise<void> {
    const { todos, goals } = this.services()
    const todo = todos.find(todoId)
    if (!todo) return
    const now = toSeoulIso(this.clock.now())
    const log = (row: Pick<EnrichmentLogRow, 'status' | 'applied' | 'suggestion' | 'reason' | 'error'>): void =>
      insertEnrichmentLog(this.db, { id: nextUlid(), todo_id: todoId, model: this.model, created_at: now, ...row })
    // A field the user filled in after add (before we got here) counts as provided too.
    const effective = effectiveProvided(provided, todo)
    if (nothingBlank(effective)) {
      log({ status: 'skipped', applied: null, suggestion: null, reason: '채울 빈 필드 없음', error: null })
      return
    }
    const dayStart = `${this.today()}T00:00:00+09:00`
    if (countCallsSince(this.db, dayStart) >= this.dailyCap) {
      log({ status: 'skipped', applied: null, suggestion: null, reason: '일일 호출 상한', error: null })
      return
    }
    const allGoals = await goals.list({ status: 'all' })
    const activeGoals = allGoals.filter((g) => g.status === 'active' && g.kind !== 'life')
    let output: EnrichmentOutput
    try {
      output = await this.client.classify({
        title: todo.title, note: todo.note, provided: effective,
        today: this.today(),
        existingTags: listTagsWithOpenCount(this.db).map((t) => t.name),
        goals: activeGoals.map((g) => ({ tag: g.tag, title: g.title, kind: g.kind })),
      })
    } catch (error) {
      log({ status: 'failed', applied: null, suggestion: null, reason: null, error: error instanceof Error ? error.message : String(error) })
      return
    }
    // The todo may have been edited or deleted while the API call was in flight; never clobber that.
    if (!todos.find(todoId)) return
    const applied = buildPatch(output, effective, activeGoals.map((g) => g.tag))
    const promotion = output.promote_to_goal
    const suggestion = promotion && !allGoals.some((g) => g.tag === promotion.tag) ? promotion : null
    try {
      const hasPatch = Object.keys(applied).length > 0
      const result = hasPatch ? await todos.applyEnrichment(todoId, applied, todo) : todo
      if (result === null) {
        log({ status: 'skipped', applied: null, suggestion, reason: '분류 중 직접 수정됨', error: null })
        return
      }
      log({ status: 'ok', applied: hasPatch ? applied : null, suggestion, reason: output.reason, error: null })
    } catch (error) {
      log({ status: 'failed', applied: null, suggestion, reason: null, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function effectiveProvided(provided: ProvidedFields, todo: Todo): ProvidedFields {
  return {
    tags: provided.tags || todo.tags.length > 0,
    lead_days: provided.lead_days || todo.lead_days !== DEFAULT_LEAD_DAYS,
    goal: provided.goal || todo.goal_id !== null,
    due: provided.due || todo.due_at !== null,
  }
}

function buildPatch(out: EnrichmentOutput, provided: ProvidedFields, goalTags: readonly string[]): EnrichmentApplied {
  const patch: Record<string, unknown> = {}
  if (!provided.tags && out.tags.length > 0) patch.tags = out.tags
  if (!provided.lead_days && out.lead_days !== null) patch.lead_days = out.lead_days
  if (!provided.due && out.due !== null) patch.due = out.due
  if (!provided.goal && out.goal !== null && out.goal_confidence === 'high' && goalTags.includes(out.goal)) patch.goal = out.goal
  return patch as EnrichmentApplied
}
