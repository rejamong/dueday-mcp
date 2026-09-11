import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

const SCHEME = /^bearer\s+(.+)$/i

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

/** Requires `Authorization: Bearer <token>` (scheme case-insensitive per RFC 7235) matching `expectedToken`. */
export function bearerAuth(expectedToken: string): MiddlewareHandler {
  if (expectedToken.length === 0) throw new Error('bearerAuth: 빈 토큰은 허용되지 않습니다')
  return async (c, next) => {
    const provided = extractToken(c.req.header('Authorization'))
    if (provided === null || !safeEqual(provided, expectedToken)) {
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ success: false, error: '인증이 필요합니다' }, 401)
    }
    await next()
    return
  }
}
