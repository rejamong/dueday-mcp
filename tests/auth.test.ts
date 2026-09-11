import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { bearerAuth } from '../src/auth/bearer.js'

function appWith(token: string): Hono {
  const app = new Hono()
  app.use('*', bearerAuth(token))
  app.get('/protected', (c) => c.json({ success: true, data: 'ok' }))
  return app
}

describe('bearerAuth', () => {
  it('refuses to be constructed with an empty token', () => {
    expect(() => appWith('')).toThrow(/토큰/)
  })

  it('accepts a case-insensitive auth scheme (RFC 7235)', async () => {
    const app = appWith('secret-token-value')
    const res = await app.request('/protected', { headers: { Authorization: 'bearer secret-token-value' } })
    expect(res.status).toBe(200)
  })

  it('rejects requests with no Authorization header', async () => {
    const app = appWith('secret-token-value')
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(await res.json()).toEqual({ success: false, error: '인증이 필요합니다' })
  })

  it('rejects a malformed Authorization header', async () => {
    const app = appWith('secret-token-value')
    const res = await app.request('/protected', { headers: { Authorization: 'secret-token-value' } })
    expect(res.status).toBe(401)
  })

  it('rejects a wrong token, including one of a different length', async () => {
    const app = appWith('secret-token-value')
    const wrongSameLength = await app.request('/protected', { headers: { Authorization: 'Bearer wrong-token-values' } })
    expect(wrongSameLength.status).toBe(401)
    const wrongShort = await app.request('/protected', { headers: { Authorization: 'Bearer short' } })
    expect(wrongShort.status).toBe(401)
  })

  it('accepts the correct bearer token', async () => {
    const app = appWith('secret-token-value')
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer secret-token-value' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: 'ok' })
  })

  it('rejects an empty bearer token', async () => {
    const app = appWith('secret-token-value')
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer ' } })
    expect(res.status).toBe(401)
  })
})
