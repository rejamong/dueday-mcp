import type { Context } from 'hono'
import { logLine } from '../logger.js'

interface RpcShape {
  readonly method?: unknown
  readonly params?: { readonly name?: unknown }
}

function describe(rpc: RpcShape): string {
  const method = typeof rpc.method === 'string' ? rpc.method : '?'
  const tool = typeof rpc.params?.name === 'string' ? ` ${rpc.params.name}` : ''
  return `${method}${tool}`
}

/** Logs "tools/call add_todo" style summaries for POST /mcp without consuming the request body. */
export async function logMcpRequest(c: Context): Promise<void> {
  if (c.req.method !== 'POST') {
    logLine('mcp', `${c.req.method}`)
    return
  }
  try {
    const body = (await c.req.raw.clone().json()) as RpcShape | RpcShape[]
    const summary = Array.isArray(body) ? body.map(describe).join(', ') : describe(body)
    logLine('mcp', `POST ${summary} ua=${c.req.header('user-agent') ?? '-'}`)
  } catch {
    logLine('mcp', 'POST <unparseable body>')
  }
}
