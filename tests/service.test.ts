import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/db/connection.js'
import { TodoService } from '../src/todos/service.js'
import { NotFoundError, ValidationError } from '../src/errors.js'
import type { BrainSync } from '../src/brain/sync.js'
import { listSyncLog } from '../src/brain/log.js'

const fixedNow = new Date('2026-09-11T01:00:00Z') // 10:00 KST

function makeService(brainSync?: BrainSync): { service: TodoService; db: Db } {
  const db = openDatabase(':memory:')
  const service = new TodoService({ db, clock: { now: () => fixedNow }, ...(brainSync ? { brainSync } : {}) })
  return { service, db }
}

describe('TodoService.add', () => {
  let service: TodoService
  beforeEach(() => {
    service = makeService().service
  })

  it('creates a todo with normalized, de-duplicated tags and a derived prep_start', async () => {
    const todo = await service.add({
      title: '데이터 리서치 작성',
      due: '2026-09-18',
      tags: ['Research', ' research ', 'Report'],
      lead_days: 4,
    })
    expect(todo.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(todo.due_at).toBe('2026-09-18T18:00:00+09:00')
    expect(todo.prep_start).toBe('2026-09-14')
    expect(todo.tags).toEqual(['report', 'research'])
    expect(todo.status).toBe('open')
    expect(todo.source).toBe('mcp')
    expect(todo.created_at).toBe('2026-09-11T10:00:00+09:00')
  })

  it('strips unknown keys instead of failing (LLM callers add extras)', async () => {
    const todo = await service.add({ title: 'x', unknown: 1 })
    expect(todo.title).toBe('x')
  })

  it('applies defaults: lead_days 3, no due, no tags', async () => {
    const todo = await service.add({ title: '아무 때나' }, 'web')
    expect(todo.lead_days).toBe(3)
    expect(todo.due_at).toBeNull()
    expect(todo.prep_start).toBeNull()
    expect(todo.tags).toEqual([])
    expect(todo.source).toBe('web')
  })

  it('rejects invalid input with a ValidationError', async () => {
    await expect(service.add({ title: '' })).rejects.toThrow(ValidationError)
    await expect(service.add({ title: 'x', due: 'friday' })).rejects.toThrow(ValidationError)
    await expect(service.add({ title: 'x', lead_days: -1 })).rejects.toThrow(ValidationError)
    await expect(service.add({ title: 'x', brain_ref: 'Bad Slug!' })).rejects.toThrow(ValidationError)
  })
})

describe('TodoService.list', () => {
  let service: TodoService
  beforeEach(async () => {
    service = makeService().service
    await service.add({ title: 'ERP 보고', due: '2026-09-15', tags: ['업무', 'erp'] })
    await service.add({ title: '면허 신청', due: '2026-09-14', tags: ['개인'] })
    await service.add({ title: '리서치', due: '2026-09-18', tags: ['research'] })
    const done = await service.add({ title: '끝난 일', due: '2026-09-10' })
    await service.complete(done.id)
    await service.add({ title: '마감 없음' })
  })

  it('defaults to open todos ordered by due date with undated last', async () => {
    const { items, total } = await service.list({})
    expect(total).toBe(4)
    expect(items.map((t) => t.title)).toEqual(['면허 신청', 'ERP 보고', '리서치', '마감 없음'])
  })

  it('filters by status, tag, due range and text', async () => {
    expect((await service.list({ status: 'done' })).items.map((t) => t.title)).toEqual(['끝난 일'])
    expect((await service.list({ status: 'all' })).total).toBe(5)
    expect((await service.list({ tag: '업무' })).items.map((t) => t.title)).toEqual(['ERP 보고'])
    expect((await service.list({ due_before: '2026-09-15' })).items.map((t) => t.title)).toEqual(['면허 신청', 'ERP 보고'])
    expect((await service.list({ due_after: '2026-09-16' })).items.map((t) => t.title)).toEqual(['리서치'])
    expect((await service.list({ q: '리서' })).items.map((t) => t.title)).toEqual(['리서치'])
  })

  it('honors limit and offset while reporting the full total', async () => {
    const first = await service.list({ limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.total).toBe(4)
    const second = await service.list({ limit: 2, offset: 2 })
    expect(second.items.map((t) => t.title)).toEqual(['리서치', '마감 없음'])
  })

  it('keeps insertion order for todos created in the same second (monotonic ULIDs)', async () => {
    const titles = Array.from({ length: 5 }, (_, i) => `same-second-${i}`)
    for (const title of titles) await service.add({ title, due: '2026-09-30' })
    const { items } = await service.list({ due_after: '2026-09-30' })
    expect(items.map((t) => t.title)).toEqual(titles)
  })
})

describe('TodoService.update / complete', () => {
  let service: TodoService
  beforeEach(() => {
    service = makeService().service
  })

  it('patches fields, replaces tags and can clear the due date', async () => {
    const created = await service.add({ title: 'a', due: '2026-09-15', tags: ['x'] })
    const moved = await service.update(created.id, { due: '2026-09-20', tags: ['y', 'z'], note: '메모' })
    expect(moved.due_at).toBe('2026-09-20T18:00:00+09:00')
    expect(moved.prep_start).toBe('2026-09-17')
    expect(moved.tags).toEqual(['y', 'z'])
    expect(moved.note).toBe('메모')
    const cleared = await service.update(created.id, { due: null })
    expect(cleared.due_at).toBeNull()
    expect(cleared.prep_start).toBeNull()
  })

  it('rejects empty patches and unknown ids', async () => {
    const created = await service.add({ title: 'a' })
    await expect(service.update(created.id, {})).rejects.toThrow(ValidationError)
    await expect(service.update('01ARZ3NDEKTSV4RRFFQ69G5FAV', { title: 'b' })).rejects.toThrow(NotFoundError)
    await expect(service.update('not-an-id', { title: 'b' })).rejects.toThrow(ValidationError)
  })

  it('completes and reopens', async () => {
    const created = await service.add({ title: 'a' })
    const done = await service.complete(created.id)
    expect(done.status).toBe('done')
    expect(done.done_at).toBe('2026-09-11T10:00:00+09:00')
    const reopened = await service.complete(created.id, true)
    expect(reopened.status).toBe('open')
    expect(reopened.done_at).toBeNull()
  })
})

describe('TodoService.upcoming / listTags', () => {
  it('groups relative to today in Seoul and counts open todos per tag', async () => {
    const { service } = makeService()
    await service.add({ title: '지남', due: '2026-09-09', tags: ['a'] })
    await service.add({ title: '준비중', due: '2026-09-13', tags: ['a', 'b'] })
    await service.add({ title: '나중', due: '2026-09-17', tags: ['b'] })
    const doneOne = await service.add({ title: '완료', due: '2026-09-12', tags: ['b'] })
    await service.complete(doneOne.id)

    const result = await service.upcoming({ days: 7 })
    expect(result.today).toBe('2026-09-11')
    expect(result.overdue.map((t) => t.title)).toEqual(['지남'])
    expect(result.start_now.map((t) => t.title)).toEqual(['준비중'])
    expect(result.later.map((t) => t.title)).toEqual(['나중'])

    const tags = await service.listTags()
    expect(tags).toEqual([
      { name: 'a', color: null, open_count: 2 },
      { name: 'b', color: null, open_count: 2 },
    ])
  })
})

describe('brain sync', () => {
  it('logs a successful sync on create and done when brain_ref is set', async () => {
    const calls: string[] = []
    const brainSync: BrainSync = {
      enabled: true,
      sync: async (event, todo) => {
        calls.push(`${event}:${todo.brain_ref}`)
        return { target_slug: todo.brain_ref ?? '', ok: true, error: null }
      },
    }
    const { service, db } = makeService(brainSync)
    const todo = await service.add({ title: 'ERP', brain_ref: 'projects/sample-project' })
    await service.complete(todo.id)
    expect(calls).toEqual(['created:projects/sample-project', 'done:projects/sample-project'])
    const log = listSyncLog(db, todo.id)
    expect(log.map((l) => [l.event, l.ok])).toEqual([
      ['created', true],
      ['done', true],
    ])
  })

  it('records failures without failing the todo operation', async () => {
    const brainSync: BrainSync = {
      enabled: true,
      sync: async () => {
        throw new Error('gbrain unreachable')
      },
    }
    const { service, db } = makeService(brainSync)
    const todo = await service.add({ title: 'ERP', brain_ref: 'projects/sample-project' })
    expect(todo.status).toBe('open')
    const [entry] = listSyncLog(db, todo.id)
    expect(entry?.ok).toBe(false)
    expect(entry?.error).toContain('gbrain unreachable')
  })

  it('does nothing when sync is disabled or brain_ref is absent', async () => {
    const { service, db } = makeService()
    const todo = await service.add({ title: 'plain', brain_ref: 'projects/x' })
    expect(listSyncLog(db, todo.id)).toEqual([])
  })
})
