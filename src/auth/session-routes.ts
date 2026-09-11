import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { rateLimit } from './rate-limit.js'
import type { SessionCodec } from './session.js'
import { safeEqual } from '../oauth/tokens.js'

export const SESSION_COOKIE = 'dueday_session'
const LOGIN_ATTEMPTS_PER_MINUTE = 10

const loginSchema = z.object({ password: z.string().min(1) })

export interface SessionRouteDeps {
  readonly codec: SessionCodec
  /** Undefined disables web login (503). */
  readonly ownerPassword: string | undefined
  readonly now?: () => number
}

/** POST /login and POST /logout for the browser UI. The cookie is HttpOnly and Secure behind HTTPS. */
export function createSessionRoutes(deps: SessionRouteDeps): Hono {
  const app = new Hono()
  const now = deps.now ?? Date.now

  app.post('/login', rateLimit({ limitPerMinute: LOGIN_ATTEMPTS_PER_MINUTE }), async (c) => {
    if (deps.ownerPassword === undefined) {
      return c.json({ success: false, error: '웹 로그인이 설정되지 않았습니다 (OWNER_PASSWORD)' }, 503)
    }
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ success: false, error: 'password가 필요합니다' }, 400)
    if (!safeEqual(parsed.data.password, deps.ownerPassword)) {
      return c.json({ success: false, error: '비밀번호가 올바르지 않습니다' }, 401)
    }
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
