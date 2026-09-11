/** Supplies a bearer token for gbrain calls; implementations decide how it is obtained. */
export type TokenProvider = () => Promise<string>

export function staticTokenProvider(token: string): TokenProvider {
  return () => Promise.resolve(token)
}

export interface ClientCredentialsOptions {
  readonly tokenUrl: string
  readonly clientId: string
  readonly clientSecret: string
  readonly scope?: string
  readonly fetch?: typeof fetch
  readonly now?: () => number
  readonly timeoutMs?: number
}

interface CachedToken {
  readonly value: string
  readonly expiresAtMs: number
}

const REFRESH_MARGIN_MS = 60_000
const DEFAULT_TTL_SEC = 3600
const DEFAULT_TIMEOUT_MS = 5_000

async function requestToken(opts: ClientCredentialsOptions, nowMs: number): Promise<CachedToken> {
  const fetchFn = opts.fetch ?? fetch
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    ...(opts.scope ? { scope: opts.scope } : {}),
  })
  const res = await fetchFn(opts.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })
  const json = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown }
  if (!res.ok || typeof json.access_token !== 'string') {
    throw new Error(`gbrain 토큰 발급 실패 (${res.status}): ${String(json.error ?? 'unknown')}`)
  }
  const ttlSec = typeof json.expires_in === 'number' ? json.expires_in : DEFAULT_TTL_SEC
  return { value: json.access_token, expiresAtMs: nowMs + ttlSec * 1000 }
}

/**
 * OAuth 2.1 client_credentials: fetches a token on demand and caches it until shortly before expiry.
 * Failures are not cached, so the next call retries.
 */
export function createClientCredentialsTokenProvider(opts: ClientCredentialsOptions): TokenProvider {
  const now = opts.now ?? Date.now
  let cached: CachedToken | null = null
  let inflight: Promise<CachedToken> | null = null

  return async () => {
    const at = now()
    if (cached !== null && cached.expiresAtMs - REFRESH_MARGIN_MS > at) return cached.value
    inflight ??= requestToken(opts, at).finally(() => {
      inflight = null
    })
    cached = await inflight
    return cached.value
  }
}
