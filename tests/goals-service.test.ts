import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/connection.js'
import { NotFoundError, ValidationError } from '../src/errors.js'
import { GoalService } from '../src/goals/service.js'
import { TodoService } from '../src/todos/service.js'

const fixedNow = new Date('2026-09-13T01:00:00Z')

function make(): { goals: GoalService; todos: TodoService; db: Db } {
  const db = openDatabase(':memory:')
  const clock = { now: () => fixedNow }
  const goals = new GoalService({ db, clock })
  const todos = new TodoService({ db, clock, goals })
  return { goals, todos, db }
}

describe('GoalService', () => {
  let goals: GoalService
  let todos: TodoService
  beforeEach(() => {
    ;({ goals, todos } = make())
  })

  it('creates a life goal and annual goals with metrics, resolving parent by tag', async () => {
    const life = await goals.add({ title: '나와 가족의 자유와 행복', kind: 'life', tag: 'life' })
    expect(life.kind).toBe('life')
    const reading = await goals.add({
      title: '15권 이상 독서', kind: 'annual', tag: 'Reading', parent: 'life', year: 2026, why: '생각의 재료',
      metrics: [{ name: '읽은 책', kind: 'count', direction: 'gte', target_value: 15, unit: '권' }],
    })
    expect(reading.tag).toBe('reading')
    expect(reading.parent_id).toBe(life.id)
    expect(reading.period_start).toBe('2026-01-01')
    expect(reading.period_end).toBe('2026-12-31')
    expect(reading.metrics).toHaveLength(1)
    expect(reading.metrics[0]?.percent).toBe(0)
    expect(reading.status_label).toBe('behind')
    expect(reading.time_percent).toBe(70)
  })

  it('rejects duplicate tags, unknown parents, and invalid metrics', async () => {
    await goals.add({ title: 'a', kind: 'annual', tag: 'dup', year: 2026 })
    await expect(goals.add({ title: 'b', kind: 'annual', tag: 'dup', year: 2026 })).rejects.toThrow(ValidationError)
    await expect(goals.add({ title: 'c', kind: 'annual', tag: 'x', year: 2026, parent: 'nope' })).rejects.toThrow(NotFoundError)
    await expect(goals.add({ title: 'd', kind: 'annual', tag: 'y', year: 2026, metrics: [{ name: 'm', kind: 'count', direction: 'gte', target_value: 0 }] })).rejects.toThrow(ValidationError)
    await expect(goals.add({ title: 'e', kind: 'annual', tag: 'bad tag!', year: 2026 })).rejects.toThrow(ValidationError)
  })

  it('logs progress by metric name (or the only metric) and recomputes progress', async () => {
    const crypto = await goals.add({
      title: '크립토 자산', kind: 'annual', tag: 'crypto', year: 2026,
      metrics: [
        { name: 'btc', kind: 'value', direction: 'gte', target_value: 3, unit: 'BTC' },
        { name: 'eth', kind: 'value', direction: 'gte', target_value: 100, unit: 'ETH' },
      ],
    })
    await expect(goals.logProgress('crypto', { value: 1.5 })).rejects.toThrow(ValidationError)
    const logged = await goals.logProgress('crypto', { metric: 'btc', value: 1.5, note: '9월 스냅샷' })
    expect(logged.metric.current_value).toBe(1.5)
    expect(logged.metric.percent).toBe(50)
    const detail = await goals.get(crypto.id)
    expect(detail.metrics.find((m) => m.name === 'btc')?.percent).toBe(50)
    expect(detail.percent).toBe(25)
    expect(detail.checkins).toHaveLength(1)

    const reading = await goals.add({ title: '독서', kind: 'annual', tag: 'reading', year: 2026, metrics: [{ name: '읽은 책', kind: 'count', direction: 'gte', target_value: 15 }] })
    await goals.logProgress('reading', { value: 1 })
    await goals.logProgress(reading.id, { value: 2 })
    expect((await goals.get('reading')).metrics[0]?.current_value).toBe(3)
  })

  it('links todos to goals by tag, counts them, and treats unlinked todos as daily life', async () => {
    await goals.add({ title: '독서', kind: 'annual', tag: 'reading', year: 2026 })
    const t1 = await todos.add({ title: '책 주문', goal: 'reading' })
    const t2 = await todos.add({ title: '독서 노트', goal: 'reading' })
    const plain = await todos.add({ title: '세탁' })
    expect(t1.goal_tag).toBe('reading')
    expect(plain.goal_id).toBeNull()
    await todos.complete(t2.id)
    const g = await goals.get('reading')
    expect(g.todos.open).toBe(1)
    expect(g.todos.done).toBe(1)
    expect((await todos.list({ goal: 'reading' })).items.map((t) => t.title).sort()).toEqual(['책 주문'])
    expect((await todos.list({ goal: 'none' })).items.map((t) => t.title)).toEqual(['세탁'])
    const moved = await todos.update(plain.id, { goal: 'reading' })
    expect(moved.goal_tag).toBe('reading')
    const cleared = await todos.update(plain.id, { goal: null })
    expect(cleared.goal_id).toBeNull()
    await expect(todos.add({ title: 'x', goal: 'missing' })).rejects.toThrow(NotFoundError)
  })

  it('treats limit goals as on track (not done) and unmeasured value goals as no signal', async () => {
    const fights = await goals.add({ title: '다툼 3회 이하', kind: 'annual', tag: 'marriage', year: 2026, metrics: [{ name: '다툼', kind: 'count', direction: 'lte', target_value: 3 }] })
    expect(fights.status_label).toBe('on_track')
    const followers = await goals.add({ title: '팔로워', kind: 'annual', tag: 'twitter', year: 2026, metrics: [{ name: '팔로워', kind: 'value', direction: 'gte', target_value: 20000 }] })
    expect(followers.status_label).toBe('none')
    await goals.logProgress('twitter', { value: 5000 })
    expect((await goals.get('twitter')).status_label).toBe('behind')
  })

  it('lists active goals with progress, rolling children up into the life goal', async () => {
    await goals.add({ title: '인생', kind: 'life', tag: 'life' })
    await goals.add({ title: 'a', kind: 'annual', tag: 'a', parent: 'life', year: 2026, metrics: [{ name: 'm', kind: 'count', direction: 'gte', target_value: 10 }] })
    const b = await goals.add({ title: 'b', kind: 'long', tag: 'b', parent: 'life', metrics: [{ name: 'm', kind: 'boolean', direction: 'gte', target_value: 1 }] })
    await goals.logProgress('a', { value: 5 })
    await goals.logProgress('b', { value: 1 })
    const list = await goals.list({ status: 'active' })
    const life = list.find((g) => g.kind === 'life')
    expect(life?.percent).toBe(75)
    expect(list.find((g) => g.tag === 'b')?.status_label).toBe('done')
    expect(list.find((g) => g.tag === 'b')?.time_percent).toBeNull()
    await goals.update(b.id, { status: 'paused' })
    expect((await goals.list({ status: 'active' })).map((g) => g.tag)).toEqual(['life', 'a'])
    expect((await goals.list({ status: 'all' })).map((g) => g.tag)).toEqual(['life', 'a', 'b'])
  })

  it('updates goal fields and replaces metrics without losing check-ins of kept metrics', async () => {
    const g = await goals.add({ title: '몸무게', kind: 'annual', tag: 'weight', year: 2026, metrics: [{ name: 'kg', kind: 'value', direction: 'lte', target_value: 76 }] })
    await goals.logProgress('weight', { value: 75.4 })
    const updated = await goals.update('weight', { title: '몸무게 76kg 이하 유지', metrics: [{ name: 'kg', kind: 'value', direction: 'lte', target_value: 75 }, { name: 'runs', kind: 'count', direction: 'gte', target_value: 50 }] })
    expect(updated.title).toBe('몸무게 76kg 이하 유지')
    expect(updated.metrics.map((m) => m.name)).toEqual(['kg', 'runs'])
    expect(updated.metrics[0]?.current_value).toBe(75.4)
    expect(updated.metrics[0]?.on_track).toBe(false)
    await expect(goals.update('nope', { title: 'x' })).rejects.toThrow(NotFoundError)
    expect(g.id).toBe(updated.id)
  })
})

describe('GoalService short-term goals', () => {
  let goals: GoalService
  beforeEach(() => {
    ;({ goals } = make())
  })

  it('requires an end date and defaults the start to today', async () => {
    await expect(goals.add({ title: '이사 준비', kind: 'short', tag: 'moving' })).rejects.toThrow(ValidationError)
    const g = await goals.add({ title: '이사 준비', kind: 'short', tag: 'moving', period_end: '2026-10-31' })
    expect(g.kind).toBe('short')
    expect(g.period_start).toBe('2026-09-13')
    expect(g.period_end).toBe('2026-10-31')
    expect(g.time_percent).not.toBeNull()
  })

  it('rejects an end date before the start date and removing the end date later', async () => {
    await expect(goals.add({ title: 'x', kind: 'short', tag: 'x', period_start: '2026-10-01', period_end: '2026-09-01' })).rejects.toThrow(ValidationError)
    await goals.add({ title: 'y', kind: 'short', tag: 'y', period_end: '2026-10-01' })
    await expect(goals.update('y', { period_end: null })).rejects.toThrow(ValidationError)
  })

  it('lists kinds in life, annual, short, long order', async () => {
    await goals.add({ title: 'l', kind: 'long', tag: 'l' })
    await goals.add({ title: 's', kind: 'short', tag: 's', period_end: '2026-12-01' })
    await goals.add({ title: 'a', kind: 'annual', tag: 'a', year: 2026 })
    await goals.add({ title: 'life', kind: 'life', tag: 'life' })
    expect((await goals.list({})).map((g) => g.kind)).toEqual(['life', 'annual', 'short', 'long'])
  })
})
