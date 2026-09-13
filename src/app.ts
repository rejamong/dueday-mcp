import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { StreamableHTTPTransport } from '@hono/mcp'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { bearerAuth } from './auth/bearer.js'
import { rateLimit } from './auth/rate-limit.js'
import { createSessionCodec } from './auth/session.js'
import { createSessionRoutes, SESSION_COOKIE } from './auth/session-routes.js'
import { createApiRoutes } from './api/routes.js'
import { logMcpRequest } from './mcp/access-log.js'
import { createMcpServer } from './mcp/server.js'
import { createOAuthRoutes } from './oauth/routes.js'
import type { OAuthService } from './oauth/service.js'
import type { TodoService } from './todos/service.js'
import type { GoalService } from './goals/service.js'
import type { Enricher } from './enrich/service.js'

export interface AppDeps {
  readonly service: TodoService
  readonly goals?: GoalService
  readonly enricher?: Enricher
  readonly apiToken: string
  readonly rateLimitPerMinute?: number
  /** When present, OAuth 2.1 endpoints are mounted and OAuth access tokens are accepted alongside apiToken. */
  readonly oauth?: OAuthService
  /** OAuth consent password; also the web login fallback when webPassword is not set. */
  readonly ownerPassword?: string
  /** Dedicated browser login password (may be a short PIN; lockout-protected). */
  readonly webPassword?: string
  /** Directory of static web assets served at /. Default: ./web */
  readonly webRoot?: string
}

const MAX_BODY_BYTES = 64 * 1024
const DEFAULT_RATE_LIMIT = 240
const SESSION_TTL_SEC = 30 * 24 * 60 * 60
const DEFAULT_WEB_ROOT = './web'

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
  const oauth = deps.oauth
  const limiter = rateLimit({ limitPerMinute: deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT })
  const limitBody = bodyLimit({ maxSize: MAX_BODY_BYTES })
  const oauthOptions = oauth
    ? { verify: (t: string) => oauth.verifyAccessToken(t) !== null, resourceMetadataUrl: oauth.resourceMetadataUrl }
    : {}
  const codec = createSessionCodec({ secret: createHash('sha256').update(`dueday-session:${deps.apiToken}`).digest('hex'), ttlSec: SESSION_TTL_SEC })
  const apiGuard = [limiter, bearerAuth({ staticToken: deps.apiToken, ...oauthOptions, cookie: { name: SESSION_COOKIE, verify: (t) => codec.verify(t, Date.now()) } }), limitBody] as const
  const mcpGuard = [limiter, bearerAuth({ staticToken: deps.apiToken, ...oauthOptions }), limitBody] as const
  if (oauth) app.route('/', createOAuthRoutes(oauth))

  app.get('/health', (c) => c.json({ success: true, data: { status: 'ok', today: deps.service.today() } }))
  app.route('/', createSessionRoutes({ codec, webPassword: deps.webPassword ?? deps.ownerPassword }))

  app.use('/api/*', ...apiGuard)
  app.get('/api/session', (c) => c.json({ success: true, data: { authenticated: true }, meta: { today: deps.service.today() } }))
  app.route('/api', createApiRoutes(deps.service, deps.goals, deps.enricher))

  app.all('/mcp', ...mcpGuard, async (c) => {
    await logMcpRequest(c)
    const server = createMcpServer(deps.service, deps.goals, deps.enricher)
    const transport = new StreamableHTTPTransport()
    await server.connect(transport)
    const res = await transport.handleRequest(c)
    if (res === undefined) throw new Error('MCP transport가 응답을 만들지 못했습니다')
    return closeWhenDone(res, server)
  })

  // Personal app behind Cloudflare: always revalidate static assets so deploys show up immediately.
  // (serveStatic builds its Response before onFound runs, so the header is set after next().)
  app.use('/*', async (c, next) => {
    await next()
    if (!c.res.headers.has('Last-Modified')) return
    c.res.headers.set('Cache-Control', 'no-cache')
    // Cloudflare honors CDN-Cache-Control over Cache-Control at the edge, even when a zone rule sets a browser TTL.
    c.res.headers.set('CDN-Cache-Control', 'no-store')
  })
  app.use('/*', serveStatic({ root: deps.webRoot ?? DEFAULT_WEB_ROOT }))

  return app
}
