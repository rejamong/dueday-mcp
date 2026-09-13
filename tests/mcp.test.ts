import { beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { openDatabase } from '../src/db/connection.js'
import { createMcpServer } from '../src/mcp/server.js'
import { TodoService } from '../src/todos/service.js'
import { GoalService } from '../src/goals/service.js'

interface Envelope<T> {
  success: boolean
  data: T
  meta: { today: string; total?: number }
}

async function connectedClient(): Promise<Client> {
  const db = openDatabase(':memory:')
  const clock = { now: () => new Date('2026-09-11T01:00:00Z') }
  const goals = new GoalService({ db, clock })
  const service = new TodoService({ db, clock, goals })
  const server = createMcpServer(service, goals)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<Envelope<T>> {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError).toBeFalsy()
  return result.structuredContent as Envelope<T>
}

describe('MCP server', () => {
  let client: Client
  beforeEach(async () => {
    client = await connectedClient()
  })

  it('exposes the six tools with descriptions', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_goal',
      'add_todo',
      'cancel_todo',
      'complete_todo',
      'delete_todo',
      'goal_progress',
      'list_goals',
      'list_tags',
      'list_todos',
      'log_progress',
      'upcoming',
      'update_goal',
      'update_todo',
    ])
    expect(tools.every((t) => (t.description ?? '').length > 10)).toBe(true)
  })

  it('add_todo returns the todo plus meta.today', async () => {
    const res = await call<{ id: string; due_at: string; tags: string[] }>(client, 'add_todo', {
      title: '분기 보고서 작성',
      due: '2026-09-15',
      tags: ['업무', 'ERP'],
    })
    expect(res.success).toBe(true)
    expect(res.meta.today).toBe('2026-09-11')
    expect(res.data.due_at).toBe('2026-09-15T18:00:00+09:00')
    expect(res.data.tags).toEqual(['erp', '업무'])
  })

  it('list_todos, update_todo, complete_todo, list_tags round-trip', async () => {
    const added = await call<{ id: string }>(client, 'add_todo', { title: 'a', due: '2026-09-15', tags: ['x'] })
    const listed = await call<Array<{ id: string }>>(client, 'list_todos', {})
    expect(listed.data.map((t) => t.id)).toEqual([added.data.id])
    expect(listed.meta.total).toBe(1)

    const updated = await call<{ due_at: string }>(client, 'update_todo', { id: added.data.id, due: '2026-09-20' })
    expect(updated.data.due_at).toBe('2026-09-20T18:00:00+09:00')

    const done = await call<{ status: string }>(client, 'complete_todo', { id: added.data.id })
    expect(done.data.status).toBe('done')

    const tags = await call<Array<{ name: string; open_count: number }>>(client, 'list_tags', {})
    expect(tags.data).toEqual([{ name: 'x', color: null, open_count: 0 }])
  })

  it('cancel_todo and delete_todo round-trip', async () => {
    const added = await call<{ id: string }>(client, 'add_todo', { title: 'x' })
    const cancelled = await call<{ status: string }>(client, 'cancel_todo', { id: added.data.id })
    expect(cancelled.data.status).toBe('cancelled')
    const restored = await call<{ status: string }>(client, 'cancel_todo', { id: added.data.id, reopen: true })
    expect(restored.data.status).toBe('open')
    const deleted = await call<{ id: string; deleted: boolean }>(client, 'delete_todo', { id: added.data.id })
    expect(deleted.data).toEqual({ id: added.data.id, deleted: true })
    const gone = await client.callTool({ name: 'delete_todo', arguments: { id: added.data.id } })
    expect(gone.isError).toBe(true)
  })

  it('goal tools: add_goal, log_progress, goal_progress, and add_todo with goal', async () => {
    const goal = await call<{ id: string; tag: string; percent: number }>(client, 'add_goal', {
      title: '15권 이상 독서', kind: 'annual', tag: 'reading', year: 2026,
      metrics: [{ name: '읽은 책', kind: 'count', direction: 'gte', target_value: 15, unit: '권' }],
    })
    expect(goal.data.tag).toBe('reading')
    const logged = await call<{ goal: { percent: number }; metric: { current_value: number } }>(client, 'log_progress', { goal: 'reading', value: 3 })
    expect(logged.data.metric.current_value).toBe(3)
    expect(logged.data.goal.percent).toBe(20)
    const todo = await call<{ goal_tag: string | null }>(client, 'add_todo', { title: '책 주문', goal: 'reading' })
    expect(todo.data.goal_tag).toBe('reading')
    const detail = await call<{ todos: { open: number }; checkins: unknown[]; open_todos: unknown[] }>(client, 'goal_progress', { goal: 'reading' })
    expect(detail.data.todos.open).toBe(1)
    expect(detail.data.checkins).toHaveLength(1)
    expect(detail.data.open_todos).toHaveLength(1)
    const listed = await call<Array<{ tag: string; status_label: string }>>(client, 'list_goals', {})
    expect(listed.data.map((g) => g.tag)).toEqual(['reading'])
    const updated = await call<{ status: string }>(client, 'update_goal', { goal: 'reading', status: 'paused' })
    expect(updated.data.status).toBe('paused')
  })

  it('upcoming groups by today and includes a summary', async () => {
    await call(client, 'add_todo', { title: '지남', due: '2026-09-09' })
    await call(client, 'add_todo', { title: '준비', due: '2026-09-13' })
    const res = await call<{ overdue: unknown[]; start_now: unknown[]; summary: string }>(client, 'upcoming', { days: 7 })
    expect(res.data.overdue).toHaveLength(1)
    expect(res.data.start_now).toHaveLength(1)
    expect(res.data.summary).toContain('준비')
  })

  it('reports validation and not-found errors as isError results', async () => {
    const bad = await client.callTool({ name: 'add_todo', arguments: { title: '', due: 'friday' } })
    expect(bad.isError).toBe(true)
    const missing = await client.callTool({
      name: 'complete_todo',
      arguments: { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    })
    expect(missing.isError).toBe(true)
    expect(String((missing.content as Array<{ text: string }>)[0]?.text)).toContain('찾을 수 없습니다')
  })
})
