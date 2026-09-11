import { describe, expect, it } from 'vitest'
import { createClientCredentialsTokenProvider, staticTokenProvider } from '../src/brain/token.js'

function fakeFetch(responses: Array<{ status: number; body: unknown }>): { fetch: typeof fetch; calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = []
  const queue = [...responses]
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? '') })
    const next = queue.shift() ?? { status: 500, body: { error: 'exhausted' } }
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { fetch: fetchFn, calls }
}

describe('token providers', () => {
  it('staticTokenProvider always returns the configured token', async () => {
    const provider = staticTokenProvider('abc')
    expect(await provider()).toBe('abc')
  })

  it('client_credentials provider posts credentials, caches until near expiry, then re-fetches', async () => {
    const clock = { t: 1_000_000 }
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 } },
      { status: 200, body: { access_token: 'tok-2', token_type: 'Bearer', expires_in: 3600 } },
    ])
    const provider = createClientCredentialsTokenProvider({
      tokenUrl: 'http://brain.local/token',
      clientId: 'dueday',
      clientSecret: 's3cret',
      scope: 'read write',
      fetch,
      now: () => clock.t,
    })
    expect(await provider()).toBe('tok-1')
    expect(await provider()).toBe('tok-1')
    expect(calls).toHaveLength(1)
    const params = new URLSearchParams(calls[0]?.body)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('dueday')
    expect(params.get('client_secret')).toBe('s3cret')
    expect(params.get('scope')).toBe('read write')

    clock.t += (3600 - 30) * 1000
    expect(await provider()).toBe('tok-2')
    expect(calls).toHaveLength(2)
  })

  it('surfaces token endpoint failures with a clear message and does not cache them', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 401, body: { error: 'invalid_client' } },
      { status: 200, body: { access_token: 'tok-ok', expires_in: 60 } },
    ])
    const provider = createClientCredentialsTokenProvider({ tokenUrl: 'http://brain.local/token', clientId: 'd', clientSecret: 's', fetch, now: () => 0 })
    await expect(provider()).rejects.toThrow(/invalid_client/)
    expect(await provider()).toBe('tok-ok')
    expect(calls).toHaveLength(2)
  })
})
