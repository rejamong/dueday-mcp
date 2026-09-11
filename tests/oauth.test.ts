import { createHash, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDatabase } from '../src/db/connection.js'
import { OAuthService } from '../src/oauth/service.js'
import { TodoService } from '../src/todos/service.js'

const ISSUER = 'https://dueday.example.com'
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect'
const PASSWORD = 'correct horse battery'
const API_TOKEN = 'static-api-token-value'

interface Fixture {
  app: ReturnType<typeof createApp>
  oauth: OAuthService
  clock: { now: Date }
}

function makeFixture(): Fixture {
  const db = openDatabase(':memory:')
  const clock = { now: new Date('2026-09-11T01:00:00Z') }
  const clockFn = { now: () => clock.now }
  const service = new TodoService({ db, clock: clockFn })
  const oauth = new OAuthService({
    db,
    clock: clockFn,
    issuer: ISSUER,
    resourcePath: '/mcp',
    clientId: 'chatgpt',
    redirectUris: [REDIRECT],
    ownerPassword: PASSWORD,
  })
  const app = createApp({ service, apiToken: API_TOKEN, oauth, rateLimitPerMinute: 1000 })
  return { app, oauth, clock }
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function authorizeUrl(challenge: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'chatgpt',
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'todo',
    ...extra,
  })
  return `/authorize?${params.toString()}`
}

async function login(app: Fixture['app'], challenge: string, password = PASSWORD): Promise<Response> {
  const form = new URLSearchParams({
    response_type: 'code',
    client_id: 'chatgpt',
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'todo',
    password,
  })
  return app.request('/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
}

async function token(app: Fixture['app'], params: Record<string, string>): Promise<Response> {
  return app.request('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
}

async function obtainTokens(app: Fixture['app']): Promise<{ access_token: string; refresh_token: string }> {
  const { verifier, challenge } = pkce()
  const res = await login(app, challenge)
  const code = new URL(res.headers.get('location') ?? '').searchParams.get('code') ?? ''
  const tok = await token(app, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT,
    client_id: 'chatgpt',
  })
  return (await tok.json()) as { access_token: string; refresh_token: string }
}

describe('OAuth discovery', () => {
  it('serves authorization-server and protected-resource metadata', async () => {
    const { app } = makeFixture()
    const as = (await (await app.request('/.well-known/oauth-authorization-server')).json()) as Record<string, unknown>
    expect(as.issuer).toBe(ISSUER)
    expect(as.authorization_endpoint).toBe(`${ISSUER}/authorize`)
    expect(as.token_endpoint).toBe(`${ISSUER}/token`)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(as.registration_endpoint).toBeUndefined()

    const pr = (await (await app.request('/.well-known/oauth-protected-resource/mcp')).json()) as Record<string, unknown>
    expect(pr.resource).toBe(`${ISSUER}/mcp`)
    expect(pr.authorization_servers).toEqual([ISSUER])
  })

  it('points unauthenticated /mcp callers at the resource metadata', async () => {
    const { app } = makeFixture()
    const res = await app.request('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/mcp"`)
  })
})

describe('GET /authorize', () => {
  it('renders the owner login form for a valid request', async () => {
    const { app } = makeFixture()
    const res = await app.request(authorizeUrl(pkce().challenge))
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('type="password"')
    expect(html).toContain('chatgpt')
  })

  it('refuses unknown clients and redirect URIs without redirecting', async () => {
    const { app } = makeFixture()
    expect((await app.request(authorizeUrl(pkce().challenge, { client_id: 'evil' }))).status).toBe(400)
    expect((await app.request(authorizeUrl(pkce().challenge, { redirect_uri: 'https://evil.example/cb' }))).status).toBe(400)
  })

  it('redirects with an error for a bad PKCE method or response_type', async () => {
    const { app } = makeFixture()
    const res = await app.request(authorizeUrl(pkce().challenge, { code_challenge_method: 'plain' }))
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location') ?? '')
    expect(loc.origin + loc.pathname).toBe(REDIRECT)
    expect(loc.searchParams.get('error')).toBe('invalid_request')
    expect(loc.searchParams.get('state')).toBe('xyz')
  })
})

describe('POST /authorize + /token', () => {
  let fx: Fixture
  beforeEach(() => {
    fx = makeFixture()
  })

  it('rejects a wrong password without issuing a code', async () => {
    const res = await login(fx.app, pkce().challenge, 'nope')
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('비밀번호')
  })

  it('completes the PKCE flow and the access token unlocks /mcp', async () => {
    const { verifier, challenge } = pkce()
    const res = await login(fx.app, challenge)
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location') ?? '')
    expect(loc.searchParams.get('state')).toBe('xyz')
    const code = loc.searchParams.get('code') ?? ''
    expect(code.length).toBeGreaterThan(20)

    const tok = await token(fx.app, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: 'chatgpt',
    })
    expect(tok.status).toBe(200)
    expect(tok.headers.get('Cache-Control')).toBe('no-store')
    const body = (await tok.json()) as Record<string, unknown>
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBeGreaterThan(0)
    expect(body.scope).toBe('todo')
    expect(typeof body.refresh_token).toBe('string')

    const mcp = await fx.app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${body.access_token as string}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(mcp.status).toBe(200)
  })

  it('burns a code on a wrong verifier, rejects a mismatched redirect_uri, and refuses reuse', async () => {
    const freshCode = async (challenge: string) =>
      new URL((await login(fx.app, challenge)).headers.get('location') ?? '').searchParams.get('code') ?? ''
    const base = { grant_type: 'authorization_code', redirect_uri: REDIRECT, client_id: 'chatgpt' }

    const first = pkce()
    const burned = await freshCode(first.challenge)
    const wrong = await token(fx.app, { ...base, code: burned, code_verifier: 'x'.repeat(43) })
    expect(wrong.status).toBe(400)
    expect(((await wrong.json()) as { error: string }).error).toBe('invalid_grant')
    const afterWrong = await token(fx.app, { ...base, code: burned, code_verifier: first.verifier })
    expect(afterWrong.status).toBe(400)

    const second = pkce()
    const code = await freshCode(second.challenge)
    const mismatched = await token(fx.app, { ...base, code, code_verifier: second.verifier, redirect_uri: 'https://evil.example/cb' })
    expect(mismatched.status).toBe(400)

    const third = pkce()
    const good = await freshCode(third.challenge)
    const ok = await token(fx.app, { ...base, code: good, code_verifier: third.verifier })
    expect(ok.status).toBe(200)
    const reused = await token(fx.app, { ...base, code: good, code_verifier: third.verifier })
    expect(reused.status).toBe(400)
  })

  it('expires codes and access tokens, and rotates refresh tokens with reuse detection', async () => {
    const { access_token, refresh_token } = await obtainTokens(fx.app)
    expect(fx.oauth.verifyAccessToken(access_token)).not.toBeNull()

    fx.clock.now = new Date(fx.clock.now.getTime() + 25 * 60 * 60 * 1000)
    expect(fx.oauth.verifyAccessToken(access_token)).toBeNull()

    const rotated = await token(fx.app, { grant_type: 'refresh_token', refresh_token, client_id: 'chatgpt' })
    expect(rotated.status).toBe(200)
    const next = (await rotated.json()) as { access_token: string; refresh_token: string }
    expect(next.refresh_token).not.toBe(refresh_token)
    expect(fx.oauth.verifyAccessToken(next.access_token)).not.toBeNull()

    const replay = await token(fx.app, { grant_type: 'refresh_token', refresh_token, client_id: 'chatgpt' })
    expect(replay.status).toBe(400)
    expect(fx.oauth.verifyAccessToken(next.access_token)).toBeNull()
  })

  it('revokes tokens and rejects unsupported grants', async () => {
    const { access_token } = await obtainTokens(fx.app)
    const rev = await fx.app.request('/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: access_token, client_id: 'chatgpt' }).toString(),
    })
    expect(rev.status).toBe(200)
    expect(fx.oauth.verifyAccessToken(access_token)).toBeNull()

    const bad = await token(fx.app, { grant_type: 'password', client_id: 'chatgpt' })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { error: string }).error).toBe('unsupported_grant_type')
  })

  it('still accepts the static API token alongside OAuth tokens', async () => {
    const res = await fx.app.request('/api/tags', { headers: { Authorization: `Bearer ${API_TOKEN}` } })
    expect(res.status).toBe(200)
  })
})
