import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/connection.js'
import { Enricher } from '../src/enrich/service.js'
import type { EnrichClient, EnrichmentOutput } from '../src/enrich/client.js'
import { listEnrichmentLog, listSuggestions } from '../src/enrich/repository.js'
import { GoalService } from '../src/goals/service.js'
import { TodoService } from '../src/todos/service.js'

const fixedNow = new Date('2026-09-13T01:00:00Z')

function output(overrides: Partial<EnrichmentOutput> = {}): EnrichmentOutput {
  return {
    tags: ['업무'], goal: null, goal_confidence: 'low', lead_days: 5, due: null, promote_to_goal: null, reason: 'test', ...overrides,
  }
}

function make(client: EnrichClient, dailyCap = 100): { todos: TodoService; goals: GoalService; enricher: Enricher; db: Db } {
  const db = openDatabase(':memory:')
  const clock = { now: () => fixedNow }
  const goals = new GoalService({ db, clock })
  const enricher = new Enricher({ db, clock, client, dailyCap, model: 'fake-model' })
  const todos = new TodoService({ db, clock, goals, enricher })
  enricher.attach(todos, goals)
  return { todos, goals, enricher, db }
}

describe('Enricher', () => {
  let calls: Array<{ title: string; provided: Record<string, boolean> }>
  let next: EnrichmentOutput
  const client: EnrichClient = {
    classify: async (input) => {
      calls.push({ title: input.title, provided: { ...input.provided } })
      return next
    },
  }
  beforeEach(() => {
    calls = []
    next = output()
  })

  it('fills only blank fields after add and records what it applied', async () => {
    const { todos, enricher, db } = make(client)
    await todos.add({ title: '주간 리포트 작성', tags: ['리서치'] }, 'web')
    await enricher.flush()
    const [todo] = (await todos.list({})).items
    expect(todo?.tags).toEqual(['리서치'])
    expect(todo?.lead_days).toBe(5)
    expect(todo?.enrichment).toEqual({ lead_days: 5 })
    expect(todo?.enriched_at).toBe('2026-09-13T10:00:00+09:00')
    expect(calls[0]?.provided).toEqual({ tags: true, lead_days: false, goal: false, due: false })
    const log = listEnrichmentLog(db, todo?.id ?? '')
    expect(log[0]?.status).toBe('ok')
  })

  it('links a goal only with high confidence, otherwise leaves it 일상', async () => {
    const { todos, goals, enricher } = make(client)
    await goals.add({ title: '독서', kind: 'annual', tag: 'reading', year: 2026 })
    next = output({ goal: 'reading', goal_confidence: 'medium', tags: ['개인'] })
    const low = await todos.add({ title: '책 주문' }, 'web')
    await enricher.flush()
    expect(todos.get(low.id).goal_tag).toBeNull()
    next = output({ goal: 'reading', goal_confidence: 'high', tags: ['개인'] })
    const high = await todos.add({ title: '독서 노트 정리' }, 'web')
    await enricher.flush()
    expect(todos.get(high.id).goal_tag).toBe('reading')
    expect(todos.get(high.id).enrichment).toEqual({ tags: ['개인'], goal: 'reading', lead_days: 5 })
  })

  it('skips the call entirely when nothing is blank, and never overrides provided values', async () => {
    const { todos, goals, enricher } = make(client)
    await goals.add({ title: '독서', kind: 'annual', tag: 'reading', year: 2026 })
    next = output({ tags: ['업무'], goal: 'reading', goal_confidence: 'high', lead_days: 1, due: '2026-12-01' })
    const full = await todos.add({ title: 'x', tags: ['개인'], lead_days: 2, goal: 'reading', due: '2026-10-01' }, 'mcp')
    await enricher.flush()
    expect(calls).toHaveLength(0)
    const t = todos.get(full.id)
    expect(t.tags).toEqual(['개인'])
    expect(t.lead_days).toBe(2)
    expect(t.due_at).toBe('2026-10-01T18:00:00+09:00')
    expect(t.enrichment).toBeNull()
  })

  it('parses a due date from the title when none was given', async () => {
    const { todos, enricher } = make(client)
    next = output({ due: '2026-09-16', lead_days: 3, tags: ['업무'] })
    const todo = await todos.add({ title: '수요일까지 발표자료 전달' }, 'web')
    await enricher.flush()
    expect(todos.get(todo.id).due_at).toBe('2026-09-16T18:00:00+09:00')
    expect(todos.get(todo.id).prep_start).toBe('2026-09-13')
  })

  it('stores goal-promotion suggestions for review, and accept creates the goal and links the todo', async () => {
    const { todos, goals, enricher, db } = make(client)
    await goals.add({ title: '인생', kind: 'life', tag: 'life' })
    next = output({
      tags: ['건강'],
      promote_to_goal: { title: '매주 두 번 달리기', kind: 'annual', period_end: null, tag: 'running', why: '건강', metric: { name: '달린 횟수', kind: 'count', direction: 'gte', target_value: 100, unit: '회' } },
    })
    const todo = await todos.add({ title: '매주 두 번 달리기 시작' }, 'web')
    await enricher.flush()
    const pending = listSuggestions(db)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.suggestion?.tag).toBe('running')
    const goal = await enricher.acceptSuggestion(pending[0]?.id ?? '')
    expect(goal.tag).toBe('running')
    expect(goal.parent_id).toBe((await goals.get('life')).id)
    expect(todos.get(todo.id).goal_tag).toBe('running')
    expect(listSuggestions(db)).toHaveLength(0)
    await expect(enricher.acceptSuggestion(pending[0]?.id ?? '')).rejects.toThrow()
  })

  it('logs failures without touching the todo and honors the daily cap', async () => {
    const failing: EnrichClient = { classify: async () => { throw new Error('boom') } }
    const { todos, enricher, db } = make(failing, 1)
    const a = await todos.add({ title: 'a' }, 'web')
    const b = await todos.add({ title: 'b' }, 'web')
    await enricher.flush()
    expect(todos.get(a.id).enrichment).toBeNull()
    expect(listEnrichmentLog(db, a.id)[0]?.status).toBe('failed')
    expect(listEnrichmentLog(db, b.id)[0]?.status).toBe('skipped')
  })

  it('a manual edit clears the auto-classified marker', async () => {
    const { todos, enricher } = make(client)
    const todo = await todos.add({ title: '보고서' }, 'web')
    await enricher.flush()
    expect(todos.get(todo.id).enrichment).not.toBeNull()
    await todos.update(todo.id, { title: '보고서 v2' })
    expect(todos.get(todo.id).enrichment).toBeNull()
  })
})

describe('Enricher races', () => {
  it('does not overwrite a manual edit made while the classifier call is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const client: EnrichClient = {
      classify: async () => {
        await gate
        return { tags: ['업무'], goal: null, goal_confidence: 'low', lead_days: 5, due: '2026-09-20', promote_to_goal: null, reason: 'r' }
      },
    }
    const { todos, enricher, db } = make(client)
    const created = await todos.add({ title: '보고서' }, 'web')
    await todos.update(created.id, { due: '2026-09-30', lead_days: 1 })
    release?.()
    await enricher.flush()
    const todo = todos.get(created.id)
    expect(todo.due_at).toBe('2026-09-30T18:00:00+09:00')
    expect(todo.lead_days).toBe(1)
    expect(todo.tags).toEqual([])
    expect(todo.enrichment).toBeNull()
    expect(listEnrichmentLog(db, created.id)[0]?.status).toBe('skipped')
  })

  it('logs a skipped call when the todo is deleted before the result arrives', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const client: EnrichClient = { classify: async () => { await gate; return output() } }
    const { todos, enricher, db } = make(client)
    const created = await todos.add({ title: '지울 것' }, 'web')
    await todos.remove(created.id)
    release?.()
    await enricher.flush()
    expect(db.prepare('SELECT COUNT(*) AS n FROM enrichment_log').get()).toEqual({ n: 0 })
  })

  it('drops a promotion whose tag collides with a paused or done goal', async () => {
    const { todos, goals, enricher, db } = make({
      classify: async () => output({ promote_to_goal: { title: '달리기', kind: 'long', period_end: null, tag: 'running', why: 'w', metric: { name: '회', kind: 'count', direction: 'gte', target_value: 10, unit: null } } }),
    })
    await goals.add({ title: '옛 달리기', kind: 'long', tag: 'running' })
    await goals.update('running', { status: 'paused' })
    await todos.add({ title: '달리기' }, 'web')
    await enricher.flush()
    expect(listSuggestions(db)).toEqual([])
  })
})
