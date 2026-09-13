import { beforeEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'
import { createGbrainSync } from '../src/brain/gbrain.js'
import type { Todo } from '../src/todos/types.js'

interface FakeGbrainState {
  readonly pages: Map<string, string>
  readonly putCalls: Array<{ slug: string; content: string }>
  failPut: boolean
}

function createFakeServer(state: FakeGbrainState): McpServer {
  const server = new McpServer({ name: 'fake-gbrain', version: '0.0.1' })

  server.registerTool(
    'get_page',
    { description: '페이지 조회', inputSchema: z.object({ slug: z.string(), include_content: z.boolean().optional() }) },
    ({ slug }) => {
      const content = state.pages.get(slug)
      if (content === undefined) {
        return { isError: true, content: [{ type: 'text' as const, text: `page not found: ${slug}` }] }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ slug, content }) }] }
    },
  )

  server.registerTool(
    'put_page',
    { description: '페이지 저장', inputSchema: z.object({ slug: z.string(), content: z.string() }) },
    ({ slug, content }) => {
      if (state.failPut) {
        return { isError: true, content: [{ type: 'text' as const, text: '쓰기 권한이 없습니다' }] }
      }
      state.putCalls.push({ slug, content })
      state.pages.set(slug, content)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }] }
    },
  )

  return server
}

async function connectedClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    title: '분기 보고서 작성',
    note: null,
    due_at: '2026-09-15T18:00:00+09:00',
    lead_days: 0,
    prep_start: null,
    status: 'open',
    tags: [],
    brain_ref: 'projects/sample-project',
    goal_id: null,
    goal_tag: null,
    source: 'mcp',
    created_at: '2026-09-11T00:00:00+09:00',
    updated_at: '2026-09-11T00:00:00+09:00',
    done_at: null,
    ...overrides,
  }
}

const HEADER = '| 항목 | 상태 | 담당자 | 마감 | 대기 대상 | 다음 행동 | 출처 |'
const SEPARATOR = '| --- | --- | --- | --- | --- | --- | --- |'
const KNOWN_SLUG = 'projects/sample-project'
const INITIAL_PAGE = `# 샘플 프로젝트\n\n## 남은 일\n${HEADER}\n${SEPARATOR}`

describe('createGbrainSync', () => {
  let state: FakeGbrainState

  beforeEach(() => {
    state = { pages: new Map([[KNOWN_SLUG, INITIAL_PAGE]]), putCalls: [], failPut: false }
  })

  function buildSync() {
    return createGbrainSync({
      url: 'https://gbrain.example/mcp',
      token: 'test-token',
      clientFactory: () => connectedClient(createFakeServer(state)),
    })
  }

  it('is enabled', () => {
    expect(buildSync().enabled).toBe(true)
  })

  it('appends a row to the page on a created event', async () => {
    const outcome = await buildSync().sync('created', makeTodo())

    expect(outcome).toEqual({ target_slug: KNOWN_SLUG, ok: true, error: null })
    expect(state.putCalls).toHaveLength(1)
    expect(state.putCalls[0]?.slug).toBe(KNOWN_SLUG)
    expect(state.putCalls[0]?.content).toContain('todo:01ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(state.putCalls[0]?.content).toContain('| 분기 보고서 작성 | 진행 | — | 2026-09-15 | — | — |')
  })

  it('flips the row status to 완료 on a done event', async () => {
    state.pages.set(
      KNOWN_SLUG,
      `${INITIAL_PAGE}\n| 분기 보고서 작성 | 진행 | 홍길동 | 2026-09-15 | — | — | todo:01ARZ3NDEKTSV4RRFFQ69G5FAV |`,
    )

    const outcome = await buildSync().sync('done', makeTodo())

    expect(outcome.ok).toBe(true)
    expect(state.putCalls[0]?.content).toContain(
      '| 분기 보고서 작성 | 완료 | 홍길동 | 2026-09-15 | — | — | todo:01ARZ3NDEKTSV4RRFFQ69G5FAV |',
    )
  })

  it('returns ok:false and skips put_page for an unknown brain_ref slug', async () => {
    const outcome = await buildSync().sync('created', makeTodo({ brain_ref: 'projects/unknown' }))

    expect(outcome.ok).toBe(false)
    expect(outcome.target_slug).toBe('projects/unknown')
    expect(outcome.error).toContain('projects/unknown')
    expect(state.putCalls).toHaveLength(0)
  })

  it('returns ok:false when put_page fails', async () => {
    state.failPut = true

    const outcome = await buildSync().sync('created', makeTodo())

    expect(outcome.ok).toBe(false)
    expect(outcome.target_slug).toBe(KNOWN_SLUG)
    expect(outcome.error).toBeTruthy()
    expect(state.putCalls).toHaveLength(0)
  })

  it('returns ok:false without contacting the server when brain_ref is null', async () => {
    const outcome = await buildSync().sync('created', makeTodo({ brain_ref: null }))

    expect(outcome).toEqual({ target_slug: '', ok: false, error: 'brain_ref 없음' })
  })
})
