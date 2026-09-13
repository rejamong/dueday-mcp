import type { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDatabase, type Db } from '../src/db/connection.js'
import { TodoService } from '../src/todos/service.js'
import { GoalService } from '../src/goals/service.js'

interface Envelope<T = unknown> {
  success: boolean
  data: T
  error?: string
  meta: { today: string; total?: number }
}

const fixedNow = new Date('2026-09-11T01:00:00Z') // 10:00 KST
const TOKEN = 'test-token-value'

function makeApp(): { app: Hono; db: Db } {
  const db = openDatabase(':memory:')
  const clock = { now: () => fixedNow }
  const goals = new GoalService({ db, clock })
  const service = new TodoService({ db, clock, goals })
  const app = createApp({ service, goals, apiToken: TOKEN })
  return { app, db }
}

function authed(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...init.headers, Authorization: `Bearer ${TOKEN}` } }
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

async function readJson<T = unknown>(res: Response): Promise<Envelope<T>> {
  return (await res.json()) as Envelope<T>
}

describe('GET /health', () => {
  it('responds without auth', async () => {
    const { app } = makeApp()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { status: 'ok', today: '2026-09-11' } })
  })
})

describe('API auth', () => {
  it('rejects /api/* and /mcp without a bearer token', async () => {
    const { app } = makeApp()
    expect((await app.request('/api/todos')).status).toBe(401)
    expect((await app.request('/api/tags')).status).toBe(401)
  })
})

describe('/api/todos', () => {
  let app: Hono

  beforeEach(() => {
    app = makeApp().app
  })

  it('creates a todo and returns 201 with the envelope', async () => {
    const res = await app.request('/api/todos', authed(json({ title: '분기 보고서', due: '2026-09-15', tags: ['ERP'] })))
    expect(res.status).toBe(201)
    const body = await readJson<{ title: string; tags: string[] }>(res)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('분기 보고서')
    expect(body.data.tags).toEqual(['erp'])
    expect(body.meta.today).toBe('2026-09-11')
  })

  it('returns 400 for invalid input', async () => {
    const res = await app.request('/api/todos', authed(json({ title: '' })))
    expect(res.status).toBe(400)
    const body = await readJson(res)
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe('string')
  })

  it('returns 400 for malformed JSON body', async () => {
    const res = await app.request(
      '/api/todos',
      authed({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' }),
    )
    expect(res.status).toBe(400)
  })

  it('lists todos with meta.total and supports query filters', async () => {
    await app.request('/api/todos', authed(json({ title: 'a', due: '2026-09-15' })))
    await app.request('/api/todos', authed(json({ title: 'b', due: '2026-09-20' })))

    const all = await app.request('/api/todos', authed())
    const allBody = await readJson<Array<{ title: string }>>(all)
    expect(allBody.meta.total).toBe(2)
    expect(allBody.data).toHaveLength(2)

    const limited = await app.request('/api/todos?limit=1', authed())
    const limitedBody = await readJson<Array<{ title: string }>>(limited)
    expect(limitedBody.data).toHaveLength(1)
    expect(limitedBody.meta.total).toBe(2)

    const filtered = await app.request('/api/todos?due_before=2026-09-16', authed())
    const filteredBody = await readJson<Array<{ title: string }>>(filtered)
    expect(filteredBody.data.map((t) => t.title)).toEqual(['a'])
  })

  it('returns 400 for an invalid limit query param', async () => {
    const res = await app.request('/api/todos?limit=abc', authed())
    expect(res.status).toBe(400)
  })

  it('gets a single todo by id, 404 when missing', async () => {
    const created = await app.request('/api/todos', authed(json({ title: 'a' })))
    const { data } = await readJson<{ id: string }>(created)

    const found = await app.request(`/api/todos/${data.id}`, authed())
    expect(found.status).toBe(200)
    expect((await readJson<{ id: string }>(found)).data.id).toBe(data.id)

    const missing = await app.request('/api/todos/01ARZ3NDEKTSV4RRFFQ69G5FAV', authed())
    expect(missing.status).toBe(404)
  })

  it('patches a todo, 404 when missing, 400 on empty patch', async () => {
    const created = await app.request('/api/todos', authed(json({ title: 'a', due: '2026-09-15' })))
    const { data } = await readJson<{ id: string }>(created)

    const patched = await app.request(`/api/todos/${data.id}`, authed({ ...json({ due: '2026-09-20' }), method: 'PATCH' }))
    expect(patched.status).toBe(200)
    expect((await readJson<{ due_at: string }>(patched)).data.due_at).toBe('2026-09-20T18:00:00+09:00')

    const missing = await app.request(
      '/api/todos/01ARZ3NDEKTSV4RRFFQ69G5FAV',
      authed({ ...json({ title: 'x' }), method: 'PATCH' }),
    )
    expect(missing.status).toBe(404)

    const empty = await app.request(`/api/todos/${data.id}`, authed({ ...json({}), method: 'PATCH' }))
    expect(empty.status).toBe(400)
  })

  it('completes and reopens a todo', async () => {
    const created = await app.request('/api/todos', authed(json({ title: 'a' })))
    const { data } = await readJson<{ id: string }>(created)

    const done = await app.request(`/api/todos/${data.id}/complete`, authed(json({})))
    expect(done.status).toBe(200)
    expect((await readJson<{ status: string }>(done)).data.status).toBe('done')

    const reopened = await app.request(`/api/todos/${data.id}/complete`, authed(json({ reopen: true })))
    expect((await readJson<{ status: string }>(reopened)).data.status).toBe('open')
  })

  it('completes with no request body at all', async () => {
    const created = await app.request('/api/todos', authed(json({ title: 'a' })))
    const { data } = await readJson<{ id: string }>(created)
    const done = await app.request(`/api/todos/${data.id}/complete`, authed({ method: 'POST' }))
    expect(done.status).toBe(200)
    expect((await readJson<{ status: string }>(done)).data.status).toBe('done')
  })

  it('404s completing a missing todo', async () => {
    const res = await app.request('/api/todos/01ARZ3NDEKTSV4RRFFQ69G5FAV/complete', authed(json({})))
    expect(res.status).toBe(404)
  })
})

describe('/api/upcoming', () => {
  it('groups todos and defaults days when omitted', async () => {
    const { app } = makeApp()
    await app.request('/api/todos', authed(json({ title: '지남', due: '2026-09-09' })))
    await app.request('/api/todos', authed(json({ title: '준비', due: '2026-09-13' })))

    const res = await app.request('/api/upcoming', authed())
    expect(res.status).toBe(200)
    const body = await readJson<{ overdue: unknown[]; start_now: unknown[]; summary: string }>(res)
    expect(body.data.overdue).toHaveLength(1)
    expect(body.data.start_now).toHaveLength(1)
    expect(typeof body.data.summary).toBe('string')
  })

  it('respects a days query param', async () => {
    const { app } = makeApp()
    const res = await app.request('/api/upcoming?days=3', authed())
    expect(res.status).toBe(200)
  })
})

describe('/api/tags', () => {
  it('lists tags with open counts', async () => {
    const { app } = makeApp()
    await app.request('/api/todos', authed(json({ title: 'a', tags: ['x'] })))
    const res = await app.request('/api/tags', authed())
    expect(res.status).toBe(200)
    expect((await readJson<Array<{ name: string; color: null; open_count: number }>>(res)).data).toEqual([
      { name: 'x', color: null, open_count: 1 },
    ])
  })

  it('POST /todos/:id/cancel toggles cancelled/open and DELETE /todos/:id removes', async () => {
    const { app } = makeApp()
    const created = await app.request('/api/todos', authed(json({ title: '취소 대상', due: '2026-09-15' })))
    const { data } = (await created.json()) as { data: { id: string } }
    const cancelled = await app.request(`/api/todos/${data.id}/cancel`, authed(json({})))
    expect(cancelled.status).toBe(200)
    expect(((await cancelled.json()) as { data: { status: string } }).data.status).toBe('cancelled')
    const restored = await app.request(`/api/todos/${data.id}/cancel`, authed(json({ reopen: true })))
    expect(((await restored.json()) as { data: { status: string } }).data.status).toBe('open')
    const removed = await app.request(`/api/todos/${data.id}`, authed({ method: 'DELETE' }))
    expect(removed.status).toBe(200)
    expect(((await removed.json()) as { data: { id: string } }).data.id).toBe(data.id)
    expect((await app.request(`/api/todos/${data.id}`, authed({}))).status).toBe(404)
    expect((await app.request(`/api/todos/${data.id}`, authed({ method: 'DELETE' }))).status).toBe(404)
  })

  it('GET /todos coerces limit and offset query strings for paging', async () => {
    const { app } = makeApp()
    for (const title of ['p1', 'p2', 'p3']) await app.request('/api/todos', authed(json({ title, due: '2026-09-20' })))
    const page = await app.request('/api/todos?limit=2&offset=2', authed({}))
    expect(page.status).toBe(200)
    const body = (await page.json()) as { data: Array<{ title: string }>; meta: { total: number } }
    expect(body.meta.total).toBe(3)
    expect(body.data.map((t) => t.title)).toEqual(['p3'])
  })

  it('goal routes: create, list, detail, patch, checkins, and todo goal filter', async () => {
    const { app } = makeApp()
    const created = await app.request('/api/goals', authed(json({ title: '독서', kind: 'annual', tag: 'reading', year: 2026, metrics: [{ name: '읽은 책', kind: 'count', target_value: 15 }] })))
    expect(created.status).toBe(201)
    const list = (await (await app.request('/api/goals', authed({}))).json()) as { data: Array<{ tag: string }> }
    expect(list.data.map((g) => g.tag)).toEqual(['reading'])
    const checkin = await app.request('/api/goals/reading/checkins', authed(json({ value: 5, note: '9월' })))
    expect(checkin.status).toBe(201)
    const detail = (await (await app.request('/api/goals/reading', authed({}))).json()) as { data: { percent: number; checkins: unknown[] } }
    expect(detail.data.percent).toBe(33)
    expect(detail.data.checkins).toHaveLength(1)
    await app.request('/api/todos', authed(json({ title: '책 주문', goal: 'reading' })))
    await app.request('/api/todos', authed(json({ title: '세탁' })))
    const linked = (await (await app.request('/api/todos?goal=reading', authed({}))).json()) as { data: Array<{ title: string; goal_tag: string }> }
    expect(linked.data.map((t) => [t.title, t.goal_tag])).toEqual([['책 주문', 'reading']])
    const daily = (await (await app.request('/api/todos?goal=none', authed({}))).json()) as { data: Array<{ title: string }> }
    expect(daily.data.map((t) => t.title)).toEqual(['세탁'])
    const patched = await app.request('/api/goals/reading', authed({ ...json({ status: 'done' }), method: 'PATCH' }))
    expect(((await patched.json()) as { data: { status_label: string } }).data.status_label).toBe('done')
    expect((await app.request('/api/goals/nope', authed({}))).status).toBe(404)
  })
})
