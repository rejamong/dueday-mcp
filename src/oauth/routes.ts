import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { rateLimit } from '../auth/rate-limit.js'
import { OAuthError } from './errors.js'
import { renderLoginPage } from './login-page.js'
import { authorizeRequestSchema, type AuthorizeRequest, type OAuthService } from './service.js'

const LOGIN_ATTEMPTS_PER_MINUTE = 10

const clientFields = { client_id: z.string().min(1), client_secret: z.string().min(1).optional() }
const codeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().min(1),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().url(),
  ...clientFields,
})
const refreshGrantSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string().min(1),
  ...clientFields,
})

/** RFC 6749 §2.3.1: `Authorization: Basic base64(client_id:client_secret)` overrides body credentials. */
function basicClientCredentials(c: Context): Record<string, string> {
  const header = c.req.header('Authorization') ?? ''
  const match = /^basic\s+(.+)$/i.exec(header.trim())
  if (match?.[1] === undefined) return {}
  const decoded = Buffer.from(match[1], 'base64').toString()
  const idx = decoded.indexOf(':')
  if (idx <= 0) return {}
  return { client_id: decodeURIComponent(decoded.slice(0, idx)), client_secret: decodeURIComponent(decoded.slice(idx + 1)) }
}

async function readParams(c: Context): Promise<Record<string, string>> {
  const type = c.req.header('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = (await c.req.json()) as Record<string, unknown>
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
  }
  const form = await c.req.parseBody()
  return Object.fromEntries(Object.entries(form).filter((e): e is [string, string] => typeof e[1] === 'string'))
}

async function readTokenParams(c: Context): Promise<Record<string, string>> {
  return { ...(await readParams(c)), ...basicClientCredentials(c) }
}

function redirectWithError(c: Context, req: AuthorizeRequest, error: OAuthError): Response {
  const url = new URL(req.redirect_uri)
  url.searchParams.set('error', error.error)
  url.searchParams.set('error_description', error.message)
  if (req.state !== undefined) url.searchParams.set('state', req.state)
  return c.redirect(url.toString(), 302)
}

function parseAuthorize(oauth: OAuthService, raw: Record<string, string>): AuthorizeRequest {
  const parsed = authorizeRequestSchema.safeParse(raw)
  if (!parsed.success) throw new OAuthError('invalid_request', '인가 요청 파라미터가 올바르지 않습니다')
  if (!oauth.isTrustedClient(parsed.data.client_id, parsed.data.redirect_uri)) {
    throw new OAuthError('unauthorized_client', '등록되지 않은 클라이언트 또는 리다이렉트 URI입니다')
  }
  return parsed.data
}

function handleAuthorizeError(c: Context, error: unknown, req: AuthorizeRequest | undefined): Response {
  if (!(error instanceof OAuthError)) throw error
  if (req !== undefined && error.error !== 'unauthorized_client') return redirectWithError(c, req, error)
  return c.text(`${error.error}: ${error.message}`, 400)
}

function metadataRoutes(app: Hono, oauth: OAuthService): void {
  const as = (c: Context) => c.json(oauth.authorizationServerMetadata())
  app.get('/.well-known/oauth-authorization-server', as)
  app.get('/.well-known/openid-configuration', as)
  const pr = (c: Context) => c.json(oauth.protectedResourceMetadata())
  app.get('/.well-known/oauth-protected-resource', pr)
  app.get(`/.well-known/oauth-protected-resource${new URL(oauth.resourceUrl).pathname}`, pr)
}

function authorizeRoutes(app: Hono, oauth: OAuthService): void {
  app.get('/authorize', (c) => {
    let req: AuthorizeRequest | undefined
    try {
      req = parseAuthorize(oauth, c.req.query())
      return c.html(renderLoginPage(req, oauth.validateAuthorizeRequest(req)))
    } catch (error) {
      return handleAuthorizeError(c, error, req)
    }
  })

  app.post('/authorize', rateLimit({ limitPerMinute: LOGIN_ATTEMPTS_PER_MINUTE }), async (c) => {
    let req: AuthorizeRequest | undefined
    try {
      const { password, ...rest } = await readParams(c)
      req = parseAuthorize(oauth, rest)
      const scope = oauth.validateAuthorizeRequest(req)
      if (password === undefined || !oauth.checkOwnerPassword(password)) {
        return c.html(renderLoginPage(req, scope, '비밀번호가 올바르지 않습니다'), 401)
      }
      const url = new URL(req.redirect_uri)
      url.searchParams.set('code', oauth.issueCode(req, scope))
      if (req.state !== undefined) url.searchParams.set('state', req.state)
      return c.redirect(url.toString(), 302)
    } catch (error) {
      return handleAuthorizeError(c, error, req)
    }
  })
}

function tokenRoutes(app: Hono, oauth: OAuthService): void {
  app.post('/token', async (c) => {
    c.header('Cache-Control', 'no-store')
    c.header('Pragma', 'no-cache')
    try {
      const params = await readTokenParams(c)
      if (params.grant_type === 'authorization_code') {
        const parsed = codeGrantSchema.safeParse(params)
        if (!parsed.success) throw new OAuthError('invalid_request', '토큰 요청 파라미터가 올바르지 않습니다')
        return c.json(oauth.exchangeCode(parsed.data))
      }
      if (params.grant_type === 'refresh_token') {
        const parsed = refreshGrantSchema.safeParse(params)
        if (!parsed.success) throw new OAuthError('invalid_request', '토큰 요청 파라미터가 올바르지 않습니다')
        return c.json(oauth.refresh(parsed.data))
      }
      throw new OAuthError('unsupported_grant_type', '지원하지 않는 grant_type입니다')
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error
      if (error.error === 'invalid_client') c.header('WWW-Authenticate', 'Basic realm="dueday"')
      return c.json(error.toJSON(), error.status as 400)
    }
  })

  app.post('/revoke', async (c) => {
    const params = await readTokenParams(c)
    try {
      if (params.token !== undefined && params.client_id !== undefined) {
        oauth.revoke(params.token, { client_id: params.client_id, client_secret: params.client_secret })
      }
      return c.body(null, 200)
    } catch (error) {
      if (error instanceof OAuthError) return c.json(error.toJSON(), error.status as 400)
      throw error
    }
  })
}

/** Mounts discovery, authorization, token and revocation endpoints at the app root. */
export function createOAuthRoutes(oauth: OAuthService): Hono {
  const app = new Hono()
  metadataRoutes(app, oauth)
  authorizeRoutes(app, oauth)
  tokenRoutes(app, oauth)
  return app
}
