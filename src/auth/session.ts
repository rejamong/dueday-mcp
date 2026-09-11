import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SessionCodecOptions {
  readonly secret: string
  readonly ttlSec: number
}

export interface SessionCodec {
  issue(nowMs: number): string
  verify(token: string, nowMs: number): boolean
  readonly ttlSec: number
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/** Stateless HMAC-signed session token: `<base64url(exp)>.<signature>`. No server-side storage needed. */
export function createSessionCodec(options: SessionCodecOptions): SessionCodec {
  const issue = (nowMs: number): string => {
    const payload = Buffer.from(JSON.stringify({ exp: nowMs + options.ttlSec * 1000 })).toString('base64url')
    return `${payload}.${sign(options.secret, payload)}`
  }
  const verify = (token: string, nowMs: number): boolean => {
    const [payload, signature] = token.split('.')
    if (!payload || !signature || !safeEqual(sign(options.secret, payload), signature)) return false
    try {
      const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: unknown }
      return typeof exp === 'number' && exp > nowMs
    } catch {
      return false
    }
  }
  return { issue, verify, ttlSec: options.ttlSec }
}
