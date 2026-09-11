import { timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'

const SCHEME = /^bearer\s+(.+)$/i

export interface BearerAuthOptions {
  /** Static machine token (API_TOKEN). */
  readonly staticToken: string
  /** Optional second acceptor, e.g. OAuth access tokens. */
  readonly verify?: (token: string) => boolean
  /** RFC 9728 pointer advertised on 401 so MCP clients can discover the authorization server. */
  readonly resourceMetadataUrl?: string
  /** Optional browser session: cookie name + verifier. Only for same-site UI routes, never for /mcp. */
  readonly cookie?: { readonly name: string; readonly verify: (token: string) => boolean }
}

function cookieAccepted(c: Context, cookie: BearerAuthOptions['cookie']): boolean {
  if (cookie === undefined) return false
  const token = getCookie(c, cookie.name)
  return token !== undefined && cookie.verify(token)
}

function extractToken(header: string | undefined): string | null {
  const match = header === undefined ? null : SCHEME.exec(header.trim())
  const token = match?.[1]?.trim() ?? ''
  return token.length > 0 ? token : null
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Requires `Authorization: Bearer <token>` (scheme case-insensitive per RFC 7235). */
export function bearerAuth(options: BearerAuthOptions): MiddlewareHandler {
  if (options.staticToken.length === 0) throw new Error('bearerAuth: 빈 토큰은 허용되지 않습니다')
  const challenge = options.resourceMetadataUrl
    ? `Bearer resource_metadata="${options.resourceMetadataUrl}"`
    : 'Bearer'
  return async (c, next) => {
    const provided = extractToken(c.req.header('Authorization'))
    const bearerAccepted =
      provided !== null && (safeEqual(provided, options.staticToken) || (options.verify?.(provided) ?? false))
    if (!bearerAccepted && !cookieAccepted(c, options.cookie)) {
      c.header('WWW-Authenticate', challenge)
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }
    await next()
    return
  }
}
