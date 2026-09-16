import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/connection.js'
import { Enricher } from '../src/enrich/service.js'
import type { EnrichmentOutput } from '../src/enrich/client.js'
import { GoalService } from '../src/goals/service.js'
import { TodoService } from '../src/todos/service.js'

const fixedNow = new Date('2026-09-16T01:00:00Z')

function make(): { todos: TodoService; db: Db } {
  const db = openDatabase(':memory:')
  return { todos: new TodoService({ db, clock: { now: () => fixedNow } }), db }
}

describe('area (일상/업무)', () => {
  let todos: TodoService
  let db: Db
  beforeEach(() => {
    ;({ todos, db } = make())
  })

  it('stores, updates, clears and filters by area', async () => {
    const work = await todos.add({ title: '보고서', area: 'work' })
    const life = await todos.add({ title: '장보기', area: 'personal' })
    const none = await todos.add({ title: '미정' })
    expect(work.area).toBe('work')
    expect(none.area).toBeNull()
    expect((await todos.list({ area: 'work' })).items.map((t) => t.id)).toEqual([work.id])
    expect((await todos.list({ area: 'personal' })).items.map((t) => t.id)).toEqual([life.id])
    const changed = await todos.update(none.id, { area: 'work' })
    expect(changed.area).toBe('work')
    expect((await todos.update(none.id, { area: null })).area).toBeNull()
    await expect(todos.add({ title: 'x', area: 'office' })).rejects.toThrow()
    expect(db.prepare('SELECT area FROM todos WHERE id = ?').get(work.id)).toEqual({ area: 'work' })
  })
})

describe('area via the classifier', () => {
  function output(overrides: Partial<EnrichmentOutput> = {}): EnrichmentOutput {
    return { tags: [], goal: null, goal_confidence: 'low', lead_days: null, due: null, size: null, area: null, promote_to_goal: null, reason: 'r', ...overrides }
  }
  function makeWithClassifier(next: () => EnrichmentOutput, seen: EnrichmentOutput[] = []): { todos: TodoService; provided: Array<Record<string, boolean>> } {
    const db = openDatabase(':memory:')
    const clock = { now: () => fixedNow }
    const goals = new GoalService({ db, clock })
    const provided: Array<Record<string, boolean>> = []
    const enricher = new Enricher({ db, clock, client: { classify: async (input) => { provided.push({ ...input.provided }); return next() } }, model: 'fake', dailyCap: 10 })
    const todos = new TodoService({ db, clock, goals, enricher })
    enricher.attach(todos, goals)
    void seen
    return { todos, provided }
  }

  it('fills a blank area but never overrides one the user gave', async () => {
    const { todos, provided } = makeWithClassifier(() => output({ area: 'work' }))
    const blank = await todos.add({ title: '분기 보고서' }, 'web', { awaitEnrichmentMs: 2000 })
    expect(blank.area).toBe('work')
    expect(blank.enrichment).toEqual({ area: 'work' })
    expect(provided[0]?.area).toBe(false)
    const given = await todos.add({ title: '장보기', area: 'personal' }, 'web', { awaitEnrichmentMs: 2000 })
    expect(given.area).toBe('personal')
    expect(provided[1]?.area).toBe(true)
  })
})
