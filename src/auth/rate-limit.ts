import type { Context, MiddlewareHandler } from 'hono'

const WINDOW_MS = 60_000
const SWEEP_EVERY = 256

interface Bucket {
  readonly windowStart: number
  readonly count: number
}

export interface RateLimitOptions {
  readonly limitPerMinute: number
  readonly now?: () => number
}

/** Client identity: tunnel-provided client IP first, then the bearer token, then a shared bucket. */
export function clientKey(c: Context): string {
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  if (ip) return `ip:${ip}`
  const auth = c.req.header('Authorization')
  return auth ? `auth:${auth}` : 'anonymous'
}

/** Fixed-window in-memory limiter. Adequate for a single-process personal service. */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const now = options.now ?? Date.now
  const buckets = new Map<string, Bucket>()
  let calls = 0

  const sweep = (at: number): void => {
    for (const [key, bucket] of buckets) {
      if (at - bucket.windowStart >= WINDOW_MS) buckets.delete(key)
    }
  }

  return async (c, next) => {
    const at = now()
    if (++calls % SWEEP_EVERY === 0) sweep(at)
    const key = clientKey(c)
    const current = buckets.get(key)
    const fresh = current === undefined || at - current.windowStart >= WINDOW_MS
    const bucket: Bucket = fresh ? { windowStart: at, count: 1 } : { ...current, count: current.count + 1 }
    buckets.set(key, bucket)
    if (bucket.count > options.limitPerMinute) {
      const retryAfter = Math.ceil((bucket.windowStart + WINDOW_MS - at) / 1000)
      c.header('Retry-After', String(Math.max(1, retryAfter)))
      return c.json({ success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요' }, 429)
    }
    await next()
    return
  }
}
