import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createSessionCodec } from '../src/auth/session.js'
import { openDatabase } from '../src/db/connection.js'
import { TodoService } from '../src/todos/service.js'

const API_TOKEN = 'static-api-token-value'
const PASSWORD = 'owner-password-123'

function makeApp(opts: { ownerPassword?: string; webPassword?: string; webRoot?: string } = {}) {
  const db = openDatabase(':memory:')
  const service = new TodoService({ db, clock: { now: () => new Date('2026-09-11T01:00:00Z') } })
  return createApp({
    service,
    apiToken: API_TOKEN,
    rateLimitPerMinute: 1000,
    ...(opts.ownerPassword !== undefined ? { ownerPassword: opts.ownerPassword } : {}),
    ...(opts.webPassword !== undefined ? { webPassword: opts.webPassword } : {}),
    ...(opts.webRoot !== undefined ? { webRoot: opts.webRoot } : {}),
  })
}

function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }
}

function cookieOf(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? ''
  return raw.split(';')[0] ?? ''
}

describe('session codec', () => {
  it('issues tokens that verify until expiry and rejects tampering', () => {
    const codec = createSessionCodec({ secret: 'k', ttlSec: 60 })
    const token = codec.issue(1_000_000)
    expect(codec.verify(token, 1_000_000 + 59_000)).toBe(true)
    expect(codec.verify(token, 1_000_000 + 61_000)).toBe(false)
    expect(codec.verify(`${token}x`, 1_000_000)).toBe(false)
    expect(codec.verify('garbage', 1_000_000)).toBe(false)
    expect(createSessionCodec({ secret: 'other', ttlSec: 60 }).verify(token, 1_000_000)).toBe(false)
  })
})

describe('web session routes', () => {
  it('logs in with the owner password, sets an HttpOnly cookie, and unlocks /api', async () => {
    const app = makeApp({ ownerPassword: PASSWORD })
    expect((await app.request('/api/session')).status).toBe(401)

    const wrong = await app.request('/login', json({ password: 'nope' }))
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()

    const ok = await app.request('/login', json({ password: PASSWORD }, { 'x-forwarded-proto': 'https' }))
    expect(ok.status).toBe(200)
    const setCookie = ok.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('dueday_session=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')

    const cookie = cookieOf(ok)
    const session = await app.request('/api/session', { headers: { Cookie: cookie } })
    expect(session.status).toBe(200)
    const body = (await session.json()) as { data: { authenticated: boolean }; meta: { today: string } }
    expect(body.data.authenticated).toBe(true)
    expect(body.meta.today).toBe('2026-09-11')

    const todos = await app.request('/api/todos', { headers: { Cookie: cookie } })
    expect(todos.status).toBe(200)

    const mcp = await app.request('/mcp', json({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Cookie: cookie, Accept: 'application/json, text/event-stream' }))
    expect(mcp.status).toBe(401)
  })

  it('logs out by clearing the cookie', async () => {
    const app = makeApp({ ownerPassword: PASSWORD })
    const cookie = cookieOf(await app.request('/login', json({ password: PASSWORD })))
    const out = await app.request('/logout', { method: 'POST', headers: { Cookie: cookie } })
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('refuses to log in when no password is configured', async () => {
    const app = makeApp()
    const res = await app.request('/login', json({ password: 'anything' }))
    expect(res.status).toBe(503)
  })

  it('uses a dedicated web password when configured, keeping the owner password for OAuth only', async () => {
    const app = makeApp({ ownerPassword: PASSWORD, webPassword: '6848' })
    expect((await app.request('/login', json({ password: PASSWORD }))).status).toBe(401)
    expect((await app.request('/login', json({ password: '6848' }))).status).toBe(200)
  })

  it('locks out a client after 5 failed attempts with Retry-After', async () => {
    const app = makeApp({ ownerPassword: PASSWORD, webPassword: '6848' })
    const headers = { 'cf-connecting-ip': '203.0.113.9' }
    for (let i = 0; i < 5; i++) {
      expect((await app.request('/login', json({ password: 'wrong' }, headers))).status).toBe(401)
    }
    const locked = await app.request('/login', json({ password: '6848' }, headers))
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await app.request('/login', json({ password: '6848' }, { 'cf-connecting-ip': '203.0.113.10' }))).status).toBe(200)
  })

  it('rejects malformed login bodies', async () => {
    const app = makeApp({ ownerPassword: PASSWORD })
    expect((await app.request('/login', json({}))).status).toBe(400)
    expect((await app.request('/login', { method: 'POST', body: 'not json', headers: { 'Content-Type': 'application/json' } })).status).toBe(400)
  })
})

describe('static web root', () => {
  it('serves index.html at / and falls back to it for unknown paths, but never for /api or /mcp', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dueday-web-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>dueday</title>')
    writeFileSync(join(dir, 'app.js'), 'export const x = 1')
    const app = makeApp({ ownerPassword: PASSWORD, webRoot: dir })
    const home = await app.request('/')
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('dueday')
    const js = await app.request('/app.js')
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(js.headers.get('cache-control')).toBe('no-cache')
    expect((await app.request('/api/nope')).status).toBe(401)
    expect((await app.request('/definitely-missing.png')).status).toBe(404)
  })
})
