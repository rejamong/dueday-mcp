import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDatabase } from '../src/db/connection.js'
import { TodoService } from '../src/todos/service.js'

const TOKEN = 'test-token-value'
const ACCEPT = 'application/json, text/event-stream'

function makeApp() {
  const db = openDatabase(':memory:')
  const service = new TodoService({ db, clock: { now: () => new Date('2026-09-11T01:00:00Z') } })
  return createApp({ service, apiToken: TOKEN })
}

function rpc(method: string, params: Record<string, unknown>, id: number) {
  return { jsonrpc: '2.0' as const, id, method, params }
}

interface RpcResponse {
  result?: { tools?: Array<{ name: string }> }
  error?: unknown
}

async function readRpcResponse(res: Response): Promise<RpcResponse> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    const text = await res.text()
    const dataLine = text
      .split('\n')
      .find((line) => line.startsWith('data:'))
    if (!dataLine) throw new Error(`SSE 응답에 data 라인이 없습니다: ${text}`)
    return JSON.parse(dataLine.slice('data:'.length).trim()) as RpcResponse
  }
  return (await res.json()) as RpcResponse
}

function post(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: ACCEPT,
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  }
}

describe('POST /mcp', () => {
  it('rejects requests without a valid bearer token', async () => {
    const app = makeApp()
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
      body: JSON.stringify(rpc('initialize', {}, 1)),
    })
    expect(res.status).toBe(401)
  })

  it('handles two sequential initialize + tools/list JSON-RPC requests', async () => {
    const app = makeApp()

    const init1 = await app.request(
      '/mcp',
      post(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, 1)),
    )
    expect(init1.status).toBe(200)
    const initBody1 = await readRpcResponse(init1)
    expect(initBody1.error).toBeUndefined()

    const list1 = await app.request('/mcp', post(rpc('tools/list', {}, 2)))
    expect(list1.status).toBe(200)
    const listBody1 = await readRpcResponse(list1)
    expect(listBody1.error).toBeUndefined()
    expect(listBody1.result?.tools?.map((t) => t.name)).toContain('add_todo')

    // A second, independent request cycle against the same app instance must also succeed.
    const init2 = await app.request(
      '/mcp',
      post(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, 1)),
    )
    expect(init2.status).toBe(200)
    const initBody2 = await readRpcResponse(init2)
    expect(initBody2.error).toBeUndefined()

    const list2 = await app.request('/mcp', post(rpc('tools/list', {}, 2)))
    expect(list2.status).toBe(200)
    const listBody2 = await readRpcResponse(list2)
    expect(listBody2.error).toBeUndefined()
    expect(listBody2.result?.tools?.map((t) => t.name)).toContain('upcoming')
  })

  it('keeps concurrent requests with the same JSON-RPC id isolated (per-request transport)', async () => {
    const app = makeApp()
    const init = (name: string) =>
      app.request('/mcp', post(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name, version: '1' } }, 7)))
    const add = (title: string) =>
      app.request('/mcp', post(rpc('tools/call', { name: 'add_todo', arguments: { title } }, 99)))
    await Promise.all([init('a'), init('b')])
    const [resA, resB] = await Promise.all([add('AAA-first'), add('BBB-second')])
    const [bodyA, bodyB] = await Promise.all([readRpcResponse(resA), readRpcResponse(resB)])
    const titleOf = (body: RpcResponse) =>
      ((body.result as { structuredContent?: { data?: { title?: string } } } | undefined)?.structuredContent?.data?.title)
    expect(titleOf(bodyA)).toBe('AAA-first')
    expect(titleOf(bodyB)).toBe('BBB-second')
  })

  it('rejects oversized bodies with 413', async () => {
    const app = makeApp()
    const res = await app.request('/mcp', post({ jsonrpc: '2.0', id: 1, method: 'x', params: { pad: 'y'.repeat(70 * 1024) } }))
    expect(res.status).toBe(413)
  })
})
