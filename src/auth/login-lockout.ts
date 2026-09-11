export interface LockoutOptions {
  readonly maxPerClient: number
  readonly maxGlobal: number
  readonly windowMs: number
  readonly now?: () => number
}

export interface LockoutStatus {
  readonly locked: boolean
  readonly retryAfterSec: number
}

export interface LoginLockout {
  check(key: string): LockoutStatus
  fail(key: string): void
  succeed(key: string): void
}

/** Failure counter with a per-client and a global cap; both reset after `windowMs` of the first failure. */
export function createLoginLockout(options: LockoutOptions): LoginLockout {
  const now = options.now ?? Date.now
  const perClient = new Map<string, { readonly since: number; readonly count: number }>()
  let global = { since: 0, count: 0 }

  const expired = (since: number, at: number): boolean => at - since >= options.windowMs
  const retryAfter = (since: number, at: number): number => Math.max(1, Math.ceil((since + options.windowMs - at) / 1000))

  return {
    check(key) {
      const at = now()
      if (!expired(global.since, at) && global.count >= options.maxGlobal) {
        return { locked: true, retryAfterSec: retryAfter(global.since, at) }
      }
      const entry = perClient.get(key)
      if (entry !== undefined && !expired(entry.since, at) && entry.count >= options.maxPerClient) {
        return { locked: true, retryAfterSec: retryAfter(entry.since, at) }
      }
      return { locked: false, retryAfterSec: 0 }
    },
    fail(key) {
      const at = now()
      const entry = perClient.get(key)
      perClient.set(key, entry === undefined || expired(entry.since, at) ? { since: at, count: 1 } : { ...entry, count: entry.count + 1 })
      global = expired(global.since, at) ? { since: at, count: 1 } : { ...global, count: global.count + 1 }
    },
    succeed(key) {
      perClient.delete(key)
    },
  }
}
