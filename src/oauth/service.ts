import { z } from 'zod'
import type { Db } from '../db/connection.js'
import type { Clock } from '../todos/service.js'
import { OAuthError } from './errors.js'
import {
  findCode,
  findToken,
  insertCode,
  insertToken,
  markCodeUsed,
  purgeExpired,
  revokeFamily,
  revokeToken,
  type TokenRecord,
} from './repository.js'
import { randomToken, safeEqual, sha256, verifyPkce } from './tokens.js'

const CODE_TTL_SEC = 600
const ACCESS_TTL_SEC = 24 * 60 * 60
const REFRESH_TTL_SEC = 90 * 24 * 60 * 60
const DAY_MS = 24 * 60 * 60 * 1000
const CHATGPT_CONNECTOR_REDIRECT = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/

/** A pre-registered OAuth client. Without `secret` it is a public PKCE client; with one it must authenticate at /token. */
export interface OAuthClient {
  readonly id: string
  readonly redirectUris: readonly string[]
  readonly secret?: string
}

export interface OAuthOptions {
  readonly db: Db
  readonly clock?: Clock
  /** Public origin, e.g. https://dueday.example.com (no trailing slash). */
  readonly issuer: string
  /** Path of the protected MCP resource, e.g. /mcp. */
  readonly resourcePath: string
  readonly clients: readonly OAuthClient[]
  readonly ownerPassword: string
  readonly scopes?: readonly string[]
}

export interface ClientCredentials {
  readonly client_id: string
  readonly client_secret?: string | undefined
}

export const authorizeRequestSchema = z.object({
  response_type: z.string(),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.string().default('S256'),
  state: z.string().max(512).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().optional(),
})
export type AuthorizeRequest = z.infer<typeof authorizeRequestSchema>

export interface TokenResponse {
  readonly access_token: string
  readonly token_type: 'Bearer'
  readonly expires_in: number
  readonly refresh_token: string
  readonly scope: string
}

export interface AccessGrant {
  readonly client_id: string
  readonly scope: string
}

const systemClock: Clock = { now: () => new Date() }

function isoAfter(base: Date, seconds: number): string {
  return new Date(base.getTime() + seconds * 1000).toISOString()
}

/** Minimal OAuth 2.1 authorization server for a single pre-registered public (PKCE) client. */
export class OAuthService {
  private readonly db: Db
  private readonly clock: Clock
  private readonly opts: OAuthOptions
  private readonly scopes: readonly string[]

  constructor(opts: OAuthOptions) {
    this.db = opts.db
    this.clock = opts.clock ?? systemClock
    this.opts = opts
    this.scopes = opts.scopes ?? ['todo']
  }

  get issuer(): string {
    return this.opts.issuer
  }

  get resourceUrl(): string {
    return `${this.opts.issuer}${this.opts.resourcePath}`
  }

  get resourceMetadataUrl(): string {
    return `${this.opts.issuer}/.well-known/oauth-protected-resource${this.opts.resourcePath}`
  }

  authorizationServerMetadata(): Record<string, unknown> {
    return {
      issuer: this.opts.issuer,
      authorization_endpoint: `${this.opts.issuer}/authorize`,
      token_endpoint: `${this.opts.issuer}/token`,
      revocation_endpoint: `${this.opts.issuer}/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: this.scopes,
    }
  }

  protectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: this.resourceUrl,
      authorization_servers: [this.opts.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: this.scopes,
    }
  }

  private findClient(clientId: string): OAuthClient | undefined {
    return this.opts.clients.find((c) => safeEqual(c.id, clientId))
  }

  /** Client identity and redirect target must be valid before anything is sent back to the browser. */
  isTrustedClient(clientId: string, redirectUri: string): boolean {
    const client = this.findClient(clientId)
    if (client === undefined) return false
    if (client.redirectUris.includes(redirectUri)) return true
    const isChatGpt = client.redirectUris.some((u) => u.startsWith('https://chatgpt.com/'))
    return isChatGpt && CHATGPT_CONNECTOR_REDIRECT.test(redirectUri)
  }

  /** Confidential clients must present their secret; public clients must not need one. */
  private authenticateClient(creds: ClientCredentials): OAuthClient {
    const client = this.findClient(creds.client_id)
    if (client === undefined) throw new OAuthError('invalid_client', '등록되지 않은 클라이언트입니다', 401)
    if (client.secret !== undefined && (creds.client_secret === undefined || !safeEqual(creds.client_secret, client.secret))) {
      throw new OAuthError('invalid_client', '클라이언트 인증에 실패했습니다', 401)
    }
    return client
  }

  /** Validates the remaining request parameters; errors here are safe to redirect back to the client. */
  validateAuthorizeRequest(req: AuthorizeRequest): string {
    if (req.response_type !== 'code') throw new OAuthError('invalid_request', 'response_type은 code여야 합니다')
    if (req.code_challenge_method !== 'S256') throw new OAuthError('invalid_request', 'code_challenge_method는 S256만 지원합니다')
    if (req.resource !== undefined && req.resource !== this.resourceUrl) {
      throw new OAuthError('invalid_request', `resource는 ${this.resourceUrl}여야 합니다`)
    }
    const requested = (req.scope ?? '').split(/\s+/).filter((s) => s.length > 0)
    const unknown = requested.filter((s) => !this.scopes.includes(s))
    if (unknown.length > 0) throw new OAuthError('invalid_scope', `알 수 없는 scope: ${unknown.join(', ')}`)
    return (requested.length > 0 ? requested : this.scopes).join(' ')
  }

  checkOwnerPassword(password: string): boolean {
    return safeEqual(password, this.opts.ownerPassword)
  }

  issueCode(req: AuthorizeRequest, scope: string): string {
    const code = randomToken(32)
    insertCode(this.db, {
      code_hash: sha256(code),
      client_id: req.client_id,
      redirect_uri: req.redirect_uri,
      code_challenge: req.code_challenge,
      scope,
      expires_at: isoAfter(this.clock.now(), CODE_TTL_SEC),
    })
    return code
  }

  exchangeCode(params: ClientCredentials & { code: string; code_verifier: string; redirect_uri: string }): TokenResponse {
    this.authenticateClient(params)
    const now = this.clock.now()
    const record = findCode(this.db, sha256(params.code))
    const valid =
      record !== undefined &&
      record.used_at === null &&
      record.expires_at > now.toISOString() &&
      safeEqual(record.client_id, params.client_id) &&
      safeEqual(record.redirect_uri, params.redirect_uri) &&
      verifyPkce(params.code_verifier, record.code_challenge)
    if (record !== undefined && record.used_at === null) markCodeUsed(this.db, record.code_hash, now.toISOString())
    if (!valid || record === undefined) throw new OAuthError('invalid_grant', '인가 코드가 유효하지 않습니다')
    return this.issueTokenPair(record.client_id, record.scope, randomToken(16), now)
  }

  refresh(params: ClientCredentials & { refresh_token: string }): TokenResponse {
    this.authenticateClient(params)
    const now = this.clock.now()
    const record = findToken(this.db, sha256(params.refresh_token))
    if (record === undefined || record.kind !== 'refresh' || !safeEqual(record.client_id, params.client_id)) {
      throw new OAuthError('invalid_grant', '리프레시 토큰이 유효하지 않습니다')
    }
    if (record.revoked_at !== null) {
      revokeFamily(this.db, record.family_id, now.toISOString())
      throw new OAuthError('invalid_grant', '리프레시 토큰 재사용이 감지되어 세션을 폐기했습니다')
    }
    if (record.expires_at <= now.toISOString()) throw new OAuthError('invalid_grant', '리프레시 토큰이 만료되었습니다')
    revokeFamily(this.db, record.family_id, now.toISOString())
    return this.issueTokenPair(record.client_id, record.scope, record.family_id, now)
  }

  verifyAccessToken(token: string): AccessGrant | null {
    const record = findToken(this.db, sha256(token))
    if (!this.isLive(record, 'access')) return null
    return { client_id: record.client_id, scope: record.scope }
  }

  revoke(token: string, creds: ClientCredentials): void {
    this.authenticateClient(creds)
    const now = this.clock.now().toISOString()
    const record = findToken(this.db, sha256(token))
    if (record === undefined || !safeEqual(record.client_id, creds.client_id)) return
    if (record.kind === 'refresh') revokeFamily(this.db, record.family_id, now)
    else revokeToken(this.db, record.token_hash, now)
  }

  private isLive(record: TokenRecord | undefined, kind: TokenRecord['kind']): record is TokenRecord {
    return (
      record !== undefined &&
      record.kind === kind &&
      record.revoked_at === null &&
      record.expires_at > this.clock.now().toISOString()
    )
  }

  private issueTokenPair(clientId: string, scope: string, familyId: string, now: Date): TokenResponse {
    purgeExpired(this.db, new Date(now.getTime() - DAY_MS).toISOString())
    const access = randomToken(32)
    const refresh = randomToken(32)
    const created = now.toISOString()
    insertToken(this.db, {
      token_hash: sha256(access), kind: 'access', client_id: clientId, scope, family_id: familyId,
      expires_at: isoAfter(now, ACCESS_TTL_SEC), created_at: created,
    })
    insertToken(this.db, {
      token_hash: sha256(refresh), kind: 'refresh', client_id: clientId, scope, family_id: familyId,
      expires_at: isoAfter(now, REFRESH_TTL_SEC), created_at: created,
    })
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope }
  }
}
