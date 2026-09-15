import { monotonicFactory } from 'ulid'
import type { Db } from '../db/connection.js'
import { NotFoundError } from '../errors.js'
import { parseOrThrow } from '../validation.js'
import { disabledBrainSync, type BrainSync, type BrainSyncEvent } from '../brain/sync.js'
import { insertSyncLog } from '../brain/log.js'
import { ensureTags, listTagsWithOpenCount, normalizeTagNames, replaceTodoTags } from '../tags/repository.js'
import { parseDue, todayInSeoul, toSeoulIso } from './dates.js'
import { deleteTodo, findTodo, insertTodo, listOpenTodos, listTodos, updateTodo, type TodoPage, type TodoPatch,
  inferSizeFromTags,
} from './repository.js'
import {
  DEFAULT_LEAD_DAYS,
  addTodoSchema,
  idSchema,
  listTodosSchema,
  updateTodoSchema,
  upcomingSchema,
  type UpdateTodoInput,
} from './schemas.js'
import { groupUpcoming } from './upcoming.js'
import type { EnrichmentApplied, TagSummary, Todo, TodoSource, UpcomingResult } from './types.js'
import { isSize, leadDaysForSize } from './size.js'

export interface Clock {
  now(): Date
}

export interface GoalResolver {
  resolve(ref: string): { readonly id: string }
}

export interface ProvidedFields {
  readonly tags: boolean
  readonly lead_days: boolean
  readonly goal: boolean
  readonly due: boolean
  readonly size: boolean
}

export interface EnrichQueue {
  enqueue(todoId: string, provided: ProvidedFields): void
  waitFor(todoId: string, timeoutMs: number): Promise<void>
}

export interface AddOptions {
  /** Wait up to this long for the classifier so the returned todo already carries tags/goal (MCP clients report it back). */
  readonly awaitEnrichmentMs?: number
}

export interface TodoServiceDeps {
  readonly db: Db
  readonly clock?: Clock
  readonly brainSync?: BrainSync
  /** Resolves goal tags/ids for the `goal` field; without it, goal linking is rejected. */
  readonly goals?: GoalResolver
  /** Optional classifier that fills blank fields after add. */
  readonly enricher?: EnrichQueue
}

const systemClock: Clock = { now: () => new Date() }
const nextUlid = monotonicFactory()

function sameContent(a: Todo, b: Todo): boolean {
  return a.title === b.title && a.note === b.note && a.due_at === b.due_at && a.lead_days === b.lead_days
    && a.size === b.size && a.goal_id === b.goal_id && a.tags.join(',') === b.tags.join(',')
}

function rowPatchFrom(patch: UpdateTodoInput): TodoPatch {
  const out: Record<string, string | number | null> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.due !== undefined) out.due_at = patch.due === null ? null : parseDue(patch.due)
  if (patch.lead_days !== undefined) out.lead_days = patch.lead_days
  if (patch.size !== undefined) out.size = patch.size
  if (patch.note !== undefined) out.note = patch.note
  if (patch.brain_ref !== undefined) out.brain_ref = patch.brain_ref
  return out as TodoPatch
}

const NO_GOALS: GoalResolver = {
  resolve: () => {
    throw new NotFoundError('목표 기능이 설정되지 않았습니다')
  },
}

export class TodoService {
  private readonly db: Db
  private readonly clock: Clock
  private readonly brainSync: BrainSync
  private readonly goals: GoalResolver
  private readonly enricher: EnrichQueue | null

  constructor(deps: TodoServiceDeps) {
    this.db = deps.db
    this.clock = deps.clock ?? systemClock
    this.brainSync = deps.brainSync ?? disabledBrainSync
    this.goals = deps.goals ?? NO_GOALS
    this.enricher = deps.enricher ?? null
  }

  private goalIdOf(ref: string | null | undefined): string | null | undefined {
    if (ref === undefined) return undefined
    if (ref === null) return null
    return this.goals.resolve(ref).id
  }

  today(): string {
    return todayInSeoul(this.clock.now())
  }

  async add(input: unknown, source: TodoSource = 'mcp', options: AddOptions = {}): Promise<Todo> {
    const data = parseOrThrow(addTodoSchema, input)
    const now = toSeoulIso(this.clock.now())
    const id = nextUlid(this.clock.now().getTime())
    const tagNames = normalizeTagNames(data.tags)
    const goalId = this.goalIdOf(data.goal) ?? null
    // Routine work: a tag whose earlier todos share a size gives this one the same size (and lead days) up front.
    const inferredSize = data.size === undefined ? inferSizeFromTags(this.db, tagNames) : null
    const size = data.size ?? inferredSize
    const leadDays = data.lead_days ?? (isSize(size) ? leadDaysForSize(size) : DEFAULT_LEAD_DAYS)
    const inferred: EnrichmentApplied | null = inferredSize === null
      ? null
      : { size: inferredSize, ...(data.lead_days === undefined ? { lead_days: leadDays } : {}) }
    this.transaction(() => {
      insertTodo(this.db, {
        id,
        title: data.title,
        note: data.note ?? null,
        due_at: data.due === undefined ? null : parseDue(data.due),
        lead_days: leadDays,
        status: 'open',
        brain_ref: data.brain_ref ?? null,
        goal_id: goalId,
        size,
        enrichment: inferred ? JSON.stringify(inferred) : null,
        enriched_at: inferred ? now : null,
        source,
        created_at: now,
        updated_at: now,
        done_at: null,
      })
      replaceTodoTags(this.db, id, ensureTags(this.db, tagNames, now))
    })
    const todo = this.get(id)
    await this.syncBrain('created', todo)
    if (!this.enricher) return todo
    this.enricher.enqueue(id, {
      tags: tagNames.length > 0,
      lead_days: data.lead_days !== undefined || inferredSize !== null,
      goal: data.goal !== undefined,
      due: data.due !== undefined,
      size: size !== null,
    })
    if (options.awaitEnrichmentMs === undefined) return todo
    await this.enricher.waitFor(id, options.awaitEnrichmentMs)
    return this.get(id)
  }

  /** Like get(), but returns undefined instead of throwing (for background work on possibly-deleted todos). */
  find(id: string): Todo | undefined {
    return findTodo(this.db, id)
  }

  /**
   * Applies classifier output to blank fields and records it; separate from update() so the marker is not cleared.
   * Returns null without writing when the todo's content differs from `snapshot` (a manual edit raced the classifier).
   * Timestamps are second-resolution, so the comparison is on content rather than updated_at.
   */
  async applyEnrichment(id: string, applied: EnrichmentApplied, snapshot: Todo): Promise<Todo | null> {
    const existing = this.get(id)
    if (!sameContent(existing, snapshot)) return null
    const now = toSeoulIso(this.clock.now())
    const goalId = applied.goal === undefined ? undefined : this.goals.resolve(applied.goal).id
    this.transaction(() => {
      updateTodo(this.db, existing.id, {
        ...(applied.lead_days !== undefined ? { lead_days: applied.lead_days } : {}),
        ...(applied.due !== undefined ? { due_at: parseDue(applied.due) } : {}),
        ...(applied.size !== undefined ? { size: applied.size } : {}),
        ...(goalId !== undefined ? { goal_id: goalId } : {}),
        enrichment: JSON.stringify({ ...existing.enrichment, ...applied }),
        enriched_at: now,
        updated_at: now,
      })
      if (applied.tags !== undefined) {
        replaceTodoTags(this.db, existing.id, ensureTags(this.db, normalizeTagNames(applied.tags), now))
      }
    })
    return this.get(existing.id)
  }

  get(id: string): Todo {
    const todo = findTodo(this.db, parseOrThrow(idSchema, id))
    if (!todo) throw new NotFoundError(`할 일을 찾을 수 없습니다: ${id}`)
    return todo
  }

  async list(input: unknown): Promise<TodoPage> {
    const filter = parseOrThrow(listTodosSchema, input)
    const goal = filter.goal === undefined ? undefined : filter.goal === 'none' ? null : this.goals.resolve(filter.goal).id
    return listTodos(this.db, { ...filter, ...(filter.tag !== undefined ? { tag: normalizeTagNames([filter.tag])[0] ?? '' } : {}) }, goal)
  }

  async update(id: string, input: unknown): Promise<Todo> {
    const existing = this.get(id)
    const patch = parseOrThrow(updateTodoSchema, input)
    const now = toSeoulIso(this.clock.now())
    const goalId = this.goalIdOf(patch.goal)
    this.transaction(() => {
      updateTodo(this.db, existing.id, { ...rowPatchFrom(patch), ...(goalId !== undefined ? { goal_id: goalId } : {}), enrichment: null, enriched_at: null, updated_at: now })
      if (patch.tags !== undefined) {
        replaceTodoTags(this.db, existing.id, ensureTags(this.db, normalizeTagNames(patch.tags), now))
      }
    })
    return this.get(existing.id)
  }

  async complete(id: string, reopen = false): Promise<Todo> {
    const existing = this.get(id)
    const now = toSeoulIso(this.clock.now())
    updateTodo(this.db, existing.id, reopen
      ? { status: 'open', done_at: null, updated_at: now }
      : { status: 'done', done_at: now, updated_at: now })
    const todo = this.get(existing.id)
    if (!reopen) await this.syncBrain('done', todo)
    return todo
  }

  /** Soft cancel (status = cancelled). `reopen` puts it back to open. Never touches brain sync. */
  async cancel(id: string, reopen = false): Promise<Todo> {
    const existing = this.get(id)
    const now = toSeoulIso(this.clock.now())
    updateTodo(this.db, existing.id, reopen
      ? { status: 'open', done_at: null, updated_at: now }
      : { status: 'cancelled', done_at: null, updated_at: now })
    return this.get(existing.id)
  }

  /** Permanent delete. Tag links and sync log rows cascade. */
  async remove(id: string): Promise<void> {
    const existing = this.get(id)
    if (!deleteTodo(this.db, existing.id)) throw new NotFoundError(`할 일을 찾을 수 없습니다: ${id}`)
  }

  async upcoming(input: unknown): Promise<UpcomingResult> {
    const { days } = parseOrThrow(upcomingSchema, input ?? {})
    return groupUpcoming(listOpenTodos(this.db), this.today(), days)
  }

  async listTags(): Promise<TagSummary[]> {
    return listTagsWithOpenCount(this.db)
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

  private async syncBrain(event: BrainSyncEvent, todo: Todo): Promise<void> {
    if (!this.brainSync.enabled || todo.brain_ref === null) return
    const syncedAt = toSeoulIso(this.clock.now())
    try {
      const outcome = await this.brainSync.sync(event, todo)
      insertSyncLog(this.db, todo.id, event, outcome, syncedAt)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      insertSyncLog(this.db, todo.id, event, { target_slug: todo.brain_ref, ok: false, error: message }, syncedAt)
    }
  }
}
