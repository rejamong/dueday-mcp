import { monotonicFactory } from 'ulid'
import type { Db } from '../db/connection.js'
import { NotFoundError } from '../errors.js'
import { parseOrThrow } from '../validation.js'
import { disabledBrainSync, type BrainSync, type BrainSyncEvent } from '../brain/sync.js'
import { insertSyncLog } from '../brain/log.js'
import { ensureTags, listTagsWithOpenCount, normalizeTagNames, replaceTodoTags } from '../tags/repository.js'
import { parseDue, todayInSeoul, toSeoulIso } from './dates.js'
import { deleteTodo, findTodo, insertTodo, listOpenTodos, listTodos, updateTodo, type TodoPage, type TodoPatch } from './repository.js'
import {
  addTodoSchema,
  idSchema,
  listTodosSchema,
  updateTodoSchema,
  upcomingSchema,
  type UpdateTodoInput,
} from './schemas.js'
import { groupUpcoming } from './upcoming.js'
import type { TagSummary, Todo, TodoSource, UpcomingResult } from './types.js'

export interface Clock {
  now(): Date
}

export interface TodoServiceDeps {
  readonly db: Db
  readonly clock?: Clock
  readonly brainSync?: BrainSync
}

const systemClock: Clock = { now: () => new Date() }
const nextUlid = monotonicFactory()

function rowPatchFrom(patch: UpdateTodoInput): TodoPatch {
  const out: Record<string, string | number | null> = {}
  if (patch.title !== undefined) out.title = patch.title
  if (patch.due !== undefined) out.due_at = patch.due === null ? null : parseDue(patch.due)
  if (patch.lead_days !== undefined) out.lead_days = patch.lead_days
  if (patch.note !== undefined) out.note = patch.note
  if (patch.brain_ref !== undefined) out.brain_ref = patch.brain_ref
  return out as TodoPatch
}

export class TodoService {
  private readonly db: Db
  private readonly clock: Clock
  private readonly brainSync: BrainSync

  constructor(deps: TodoServiceDeps) {
    this.db = deps.db
    this.clock = deps.clock ?? systemClock
    this.brainSync = deps.brainSync ?? disabledBrainSync
  }

  today(): string {
    return todayInSeoul(this.clock.now())
  }

  async add(input: unknown, source: TodoSource = 'mcp'): Promise<Todo> {
    const data = parseOrThrow(addTodoSchema, input)
    const now = toSeoulIso(this.clock.now())
    const id = nextUlid(this.clock.now().getTime())
    const tagNames = normalizeTagNames(data.tags)
    this.transaction(() => {
      insertTodo(this.db, {
        id,
        title: data.title,
        note: data.note ?? null,
        due_at: data.due === undefined ? null : parseDue(data.due),
        lead_days: data.lead_days,
        status: 'open',
        brain_ref: data.brain_ref ?? null,
        source,
        created_at: now,
        updated_at: now,
        done_at: null,
      })
      replaceTodoTags(this.db, id, ensureTags(this.db, tagNames, now))
    })
    const todo = this.get(id)
    await this.syncBrain('created', todo)
    return todo
  }

  get(id: string): Todo {
    const todo = findTodo(this.db, parseOrThrow(idSchema, id))
    if (!todo) throw new NotFoundError(`할 일을 찾을 수 없습니다: ${id}`)
    return todo
  }

  async list(input: unknown): Promise<TodoPage> {
    const filter = parseOrThrow(listTodosSchema, input)
    return listTodos(this.db, { ...filter, ...(filter.tag !== undefined ? { tag: normalizeTagNames([filter.tag])[0] ?? '' } : {}) })
  }

  async update(id: string, input: unknown): Promise<Todo> {
    const existing = this.get(id)
    const patch = parseOrThrow(updateTodoSchema, input)
    const now = toSeoulIso(this.clock.now())
    this.transaction(() => {
      updateTodo(this.db, existing.id, { ...rowPatchFrom(patch), updated_at: now })
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
