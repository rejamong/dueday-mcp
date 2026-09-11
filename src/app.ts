import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { StreamableHTTPTransport } from '@hono/mcp'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { bearerAuth } from './auth/bearer.js'
import { rateLimit } from './auth/rate-limit.js'
import { createApiRoutes } from './api/routes.js'
import { createMcpServer } from './mcp/server.js'
import type { TodoService } from './todos/service.js'

export interface AppDeps {
  readonly service: TodoService
  readonly apiToken: string
  readonly rateLimitPerMinute?: number
}

const MAX_BODY_BYTES = 64 * 1024
const DEFAULT_RATE_LIMIT = 60

/** Tears the per-request MCP server down once the (possibly streamed) response body has been fully sent. */
function closeWhenDone(res: Response, server: McpServer): Response {
  const close = (): void => void server.close().catch(() => undefined)
  if (res.body === null) {
    close()
    return res
  }
  const closer = new TransformStream<Uint8Array, Uint8Array>({ flush: close })
  return new Response(res.body.pipeThrough(closer), res)
}

/**
 * Wires the health check plus the bearer-protected REST API and MCP endpoint.
 * The MCP endpoint is stateless: every request gets its own McpServer + transport pair,
 * because @hono/mcp's transport keys in-flight responses by the client-chosen JSON-RPC id,
 * so a shared transport would cross-deliver responses between concurrent requests.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono()
  const guard = [
    rateLimit({ limitPerMinute: deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT }),
    bearerAuth(deps.apiToken),
    bodyLimit({ maxSize: MAX_BODY_BYTES }),
  ] as const

  app.get('/health', (c) => c.json({ success: true, data: { status: 'ok', today: deps.service.today() } }))

  app.use('/api/*', ...guard)
  app.route('/api', createApiRoutes(deps.service))

  app.all('/mcp', ...guard, async (c) => {
    const server = createMcpServer(deps.service)
    const transport = new StreamableHTTPTransport()
    await server.connect(transport)
    const res = await transport.handleRequest(c)
    if (res === undefined) throw new Error('MCP transport가 응답을 만들지 못했습니다')
    return closeWhenDone(res, server)
  })

  return app
}
