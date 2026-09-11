import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { rateLimit } from '../src/auth/rate-limit.js'

function appWith(limit: number, clock: { t: number }): Hono {
  const app = new Hono()
  app.use('*', rateLimit({ limitPerMinute: limit, now: () => clock.t }))
  app.get('/x', (c) => c.json({ success: true }))
  return app
}

describe('rateLimit', () => {
  it('allows up to the limit per minute per client and then returns 429 with Retry-After', async () => {
    const clock = { t: 1_000_000 }
    const app = appWith(2, clock)
    const headers = { 'cf-connecting-ip': '203.0.113.5' }
    expect((await app.request('/x', { headers })).status).toBe(200)
    expect((await app.request('/x', { headers })).status).toBe(200)
    const blocked = await app.request('/x', { headers })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('tracks clients separately and resets after the window', async () => {
    const clock = { t: 1_000_000 }
    const app = appWith(1, clock)
    expect((await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } })).status).toBe(200)
    expect((await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.2' } })).status).toBe(200)
    expect((await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(429)
    clock.t += 60_001
    expect((await app.request('/x', { headers: { 'x-forwarded-for': '198.51.100.1' } })).status).toBe(200)
  })

  it('falls back to the Authorization header, then a shared anonymous bucket', async () => {
    const clock = { t: 1_000_000 }
    const app = appWith(1, clock)
    expect((await app.request('/x', { headers: { Authorization: 'Bearer t1' } })).status).toBe(200)
    expect((await app.request('/x', { headers: { Authorization: 'Bearer t2' } })).status).toBe(200)
    expect((await app.request('/x')).status).toBe(200)
    expect((await app.request('/x')).status).toBe(429)
  })
})
