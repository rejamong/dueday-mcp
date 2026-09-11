import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { createLoginLockout } from './login-lockout.js'
import { clientKey, rateLimit } from './rate-limit.js'
import type { SessionCodec } from './session.js'
import { safeEqual } from '../oauth/tokens.js'

export const SESSION_COOKIE = 'dueday_session'
const LOGIN_ATTEMPTS_PER_MINUTE = 10
const LOCKOUT = { maxPerClient: 5, maxGlobal: 30, windowMs: 15 * 60 * 1000 } as const

const loginSchema = z.object({ password: z.string().min(1) })

export interface SessionRouteDeps {
  readonly codec: SessionCodec
  /** Web login password. Undefined disables web login (503). May be a short PIN — the lockout below covers it. */
  readonly webPassword: string | undefined
  readonly now?: () => number
}

/**
 * POST /login and POST /logout for the browser UI. The cookie is HttpOnly and Secure behind HTTPS.
 * Brute force is bounded twice: a per-minute rate limit, and a 15-minute lockout after 5 failures
 * per client (30 across all clients) so even a short PIN cannot be enumerated.
 */
export function createSessionRoutes(deps: SessionRouteDeps): Hono {
  const app = new Hono()
  const now = deps.now ?? Date.now
  const lockout = createLoginLockout({ ...LOCKOUT, now })

  app.post('/login', rateLimit({ limitPerMinute: LOGIN_ATTEMPTS_PER_MINUTE, now }), async (c) => {
    if (deps.webPassword === undefined) {
      return c.json({ success: false, error: '웹 로그인이 설정되지 않았습니다 (WEB_PASSWORD 또는 OWNER_PASSWORD)' }, 503)
    }
    const key = clientKey(c)
    const status = lockout.check(key)
    if (status.locked) {
      c.header('Retry-After', String(status.retryAfterSec))
      return c.json({ success: false, error: `실패가 많아 잠겼습니다. ${Math.ceil(status.retryAfterSec / 60)}분 후 다시 시도하세요` }, 429)
    }
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ success: false, error: 'password가 필요합니다' }, 400)
    if (!safeEqual(parsed.data.password, deps.webPassword)) {
      lockout.fail(key)
      return c.json({ success: false, error: '비밀번호가 올바르지 않습니다' }, 401)
    }
    lockout.succeed(key)
    const secure = (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')) === 'https'
    setCookie(c, SESSION_COOKIE, deps.codec.issue(now()), {
      httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: deps.codec.ttlSec,
    })
    return c.json({ success: true, data: { authenticated: true } })
  })

  app.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ success: true, data: { authenticated: false } })
  })

  return app
}
