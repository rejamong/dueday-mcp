import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js'
import type { Todo } from '../todos/types.js'
import { upsertRemainingRow } from './markdown.js'
import type { BrainSync, BrainSyncEvent, BrainSyncOutcome } from './sync.js'
import { staticTokenProvider, type TokenProvider } from './token.js'

export interface GbrainSyncOptions {
  readonly url: string
  /** Static bearer token, or a provider (e.g. client_credentials) that supplies one per call. */
  readonly token: string | TokenProvider
  /** Per-request timeout; the whole sync (connect + get + put) is bounded by ~3x this. */
  readonly timeoutMs?: number
  readonly clientFactory?: () => Promise<Client>
}

const CLIENT_INFO = { name: 'dueday-mcp', version: '0.1.0' } as const
const DEFAULT_TIMEOUT_MS = 5_000

function defaultClientFactory(url: string, tokenProvider: TokenProvider, timeoutMs: number): () => Promise<Client> {
  return async () => {
    const token = await tokenProvider()
    const client = new Client(CLIENT_INFO)
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) },
    })
    // The SDK's own transport class isn't quite assignable to its Transport interface
    // under exactOptionalPropertyTypes (sessionId is typed `string | undefined` vs `string?`).
    await client.connect(transport as unknown as Transport)
    return client
  }
}

function firstText(result: CallToolResult): string | null {
  const first = result.content.find((item): item is TextContent => item.type === 'text')
  return first?.text ?? null
}

/** Fetches a gbrain page's markdown content, or null when it does not exist / has none. */
async function fetchPageContent(client: Client, slug: string, timeoutMs: number): Promise<string | null> {
  const result = await client.callTool({ name: 'get_page', arguments: { slug, include_content: true } }, undefined, { timeout: timeoutMs })
  if (result.isError) return null
  const text = firstText(result as CallToolResult)
  if (text === null) return null
  try {
    const parsed = JSON.parse(text) as { content?: unknown }
    return typeof parsed.content === 'string' ? parsed.content : null
  } catch {
    return null
  }
}

/** Writes a gbrain page's markdown content. Returns an error message on failure, else null. */
async function putPageContent(client: Client, slug: string, content: string, timeoutMs: number): Promise<string | null> {
  const result = await client.callTool({ name: 'put_page', arguments: { slug, content } }, undefined, { timeout: timeoutMs })
  if (!result.isError) return null
  return firstText(result as CallToolResult) ?? 'put_page 실패'
}

interface SyncJob {
  readonly slug: string
  readonly event: BrainSyncEvent
  readonly todo: Todo
  readonly timeoutMs: number
}

async function runSync(client: Client, job: SyncJob): Promise<BrainSyncOutcome> {
  const { slug, event, todo, timeoutMs } = job
  const content = await fetchPageContent(client, slug, timeoutMs)
  if (content === null) {
    return { target_slug: slug, ok: false, error: `gbrain 페이지 없음: ${slug}` }
  }
  const status = event === 'done' ? '완료' : '진행'
  const newContent = upsertRemainingRow(content, todo, status)
  const putError = await putPageContent(client, slug, newContent, timeoutMs)
  if (putError !== null) {
    return { target_slug: slug, ok: false, error: putError }
  }
  return { target_slug: slug, ok: true, error: null }
}

async function withClient<T>(factory: () => Promise<Client>, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await factory()
  try {
    return await work(client)
  } finally {
    await client.close()
  }
}

/** Selective sync of project-linked todos into the gbrain knowledge base over MCP. */
export function createGbrainSync(options: GbrainSyncOptions): BrainSync {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const tokenProvider = typeof options.token === 'string' ? staticTokenProvider(options.token) : options.token
  const clientFactory = options.clientFactory ?? defaultClientFactory(options.url, tokenProvider, timeoutMs)

  async function sync(event: BrainSyncEvent, todo: Todo): Promise<BrainSyncOutcome> {
    if (todo.brain_ref === null) {
      return { target_slug: '', ok: false, error: 'brain_ref 없음' }
    }
    const slug = todo.brain_ref
    try {
      return await withClient(clientFactory, (client) => runSync(client, { slug, event, todo, timeoutMs }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`gbrain 동기화 실패: ${message}`)
    }
  }

  return { enabled: true, sync }
}
