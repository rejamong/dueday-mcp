import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/connection.js'
import { Enricher } from '../src/enrich/service.js'
import type { EnrichmentOutput } from '../src/enrich/client.js'
import { GoalService } from '../src/goals/service.js'
import { TodoService } from '../src/todos/service.js'
import { SIZES, SIZE_LABELS, leadDaysForSize } from '../src/todos/size.js'

const fixedNow = new Date('2026-09-15T01:00:00Z')

function make(): { todos: TodoService; db: Db } {
  const db = openDatabase(':memory:')
  const todos = new TodoService({ db, clock: { now: () => fixedNow } })
  return { todos, db }
}

describe('size (규모)', () => {
  let todos: TodoService
  let db: Db
  beforeEach(() => {
    ;({ todos, db } = make())
  })

  it('maps the five levels to lead days and labels', () => {
    expect(SIZES.map((s) => leadDaysForSize(s))).toEqual([1, 2, 5, 10, 14])
    expect(SIZE_LABELS[3]).toBe('일주일')
  })

  it('derives lead_days from size unless lead_days was given', async () => {
    const derived = await todos.add({ title: '보고서', size: 3 })
    expect(derived.size).toBe(3)
    expect(derived.lead_days).toBe(5)
    const explicit = await todos.add({ title: '보고서', size: 3, lead_days: 1 })
    expect(explicit.lead_days).toBe(1)
    await expect(todos.add({ title: 'x', size: 6 })).rejects.toThrow()
    await expect(todos.add({ title: 'x', size: 0 })).rejects.toThrow()
  })

  it('infers size from tags once two or more earlier todos with that tag have a size', async () => {
    await todos.add({ title: '주차비 정산', tags: ['경비'], size: 1 })
    const one = await todos.add({ title: '택시비 정산', tags: ['경비'] })
    expect(one.size).toBeNull()
    expect(one.lead_days).toBe(3)
    await todos.add({ title: '식비 정산', tags: ['경비'], size: 1 })
    const inferred = await todos.add({ title: '출장비 정산', tags: ['경비'] })
    expect(inferred.size).toBe(1)
    expect(inferred.lead_days).toBe(1)
    expect(inferred.enrichment).toEqual({ size: 1, lead_days: 1 })
    const keepsLead = await todos.add({ title: '회식비 정산', tags: ['경비'], lead_days: 2 })
    expect(keepsLead.size).toBe(1)
    expect(keepsLead.lead_days).toBe(2)
    expect(keepsLead.enrichment).toEqual({ size: 1 })
  })

  it('uses the most common size among the tag history and ignores cancelled todos', async () => {
    for (const size of [2, 2, 4]) await todos.add({ title: 's', tags: ['리서치'], size })
    const cancelled = await todos.add({ title: 'c', tags: ['리서치'], size: 5 })
    await todos.cancel(cancelled.id)
    const t = await todos.add({ title: '새 리서치', tags: ['리서치'] })
    expect(t.size).toBe(2)
  })

  it('updates size, filters by size, and keeps size in the row after manual edits', async () => {
    const a = await todos.add({ title: 'a', size: 2 })
    const b = await todos.add({ title: 'b', size: 4 })
    const updated = await todos.update(a.id, { size: 5 })
    expect(updated.size).toBe(5)
    expect(updated.lead_days).toBe(2) // lead_days is not silently rewritten on edit
    expect((await todos.list({ size: 4 })).items.map((t) => t.id)).toEqual([b.id])
    expect((await todos.list({})).items).toHaveLength(2)
    const cleared = await todos.update(a.id, { size: null })
    expect(cleared.size).toBeNull()
    expect(db.prepare('SELECT size FROM todos WHERE id = ?').get(a.id)).toEqual({ size: null })
  })
})

describe('size via the classifier', () => {
  function output(overrides: Partial<EnrichmentOutput> = {}): EnrichmentOutput {
    return { tags: [], goal: null, goal_confidence: 'low', lead_days: null, due: null, size: null, promote_to_goal: null, reason: 'r', ...overrides }
  }

  function makeWithClassifier(next: () => EnrichmentOutput): TodoService {
    const db = openDatabase(':memory:')
    const clock = { now: () => fixedNow }
    const goals = new GoalService({ db, clock })
    const enricher = new Enricher({ db, clock, client: { classify: async () => next() }, model: 'fake', dailyCap: 10 })
    const todos = new TodoService({ db, clock, goals, enricher })
    enricher.attach(todos, goals)
    return todos
  }

  it('applies the classifier size and derives lead_days from it when neither was given', async () => {
    const todos = makeWithClassifier(() => output({ size: 4 }))
    const t = await todos.add({ title: '분기 보고서' }, 'web', { awaitEnrichmentMs: 2000 })
    expect(t.size).toBe(4)
    expect(t.lead_days).toBe(10)
    expect(t.enrichment).toEqual({ size: 4, lead_days: 10 })
  })

  it('prefers an explicit lead_days from the classifier over the size-derived one, and never overrides a user size', async () => {
    const todos = makeWithClassifier(() => output({ size: 4, lead_days: 3 }))
    const t = await todos.add({ title: '분기 보고서' }, 'web', { awaitEnrichmentMs: 2000 })
    expect(t.lead_days).toBe(3)
    const fixed = await todos.add({ title: '작은 일', size: 1 }, 'web', { awaitEnrichmentMs: 2000 })
    expect(fixed.size).toBe(1)
    expect(fixed.lead_days).toBe(1)
  })

  it('keeps a tag-inferred size instead of the classifier size', async () => {
    const todos = makeWithClassifier(() => output({ size: 5 }))
    await todos.add({ title: 'a', tags: ['경비'], size: 1 })
    await todos.add({ title: 'b', tags: ['경비'], size: 1 })
    const t = await todos.add({ title: 'c', tags: ['경비'] }, 'web', { awaitEnrichmentMs: 2000 })
    expect(t.size).toBe(1)
    expect(t.enrichment).toEqual({ size: 1, lead_days: 1 })
  })
})
