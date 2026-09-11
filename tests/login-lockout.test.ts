import { describe, expect, it } from 'vitest'
import { createLoginLockout } from '../src/auth/login-lockout.js'

describe('createLoginLockout', () => {
  it('locks a client after maxPerClient failures within the window and frees it afterwards', () => {
    const clock = { t: 1_000_000 }
    const lock = createLoginLockout({ maxPerClient: 3, maxGlobal: 100, windowMs: 60_000, now: () => clock.t })
    for (let i = 0; i < 3; i++) {
      expect(lock.check('ip:a').locked).toBe(false)
      lock.fail('ip:a')
    }
    const status = lock.check('ip:a')
    expect(status.locked).toBe(true)
    expect(status.retryAfterSec).toBeGreaterThan(0)
    expect(lock.check('ip:b').locked).toBe(false)
    clock.t += 60_001
    expect(lock.check('ip:a').locked).toBe(false)
  })

  it('locks everyone after maxGlobal failures (distributed guessing)', () => {
    const clock = { t: 0 }
    const lock = createLoginLockout({ maxPerClient: 100, maxGlobal: 4, windowMs: 60_000, now: () => clock.t })
    for (let i = 0; i < 4; i++) lock.fail(`ip:${i}`)
    expect(lock.check('ip:new').locked).toBe(true)
    clock.t += 60_001
    expect(lock.check('ip:new').locked).toBe(false)
  })

  it('a successful login clears that client counter', () => {
    const lock = createLoginLockout({ maxPerClient: 2, maxGlobal: 100, windowMs: 60_000, now: () => 0 })
    lock.fail('ip:a')
    lock.succeed('ip:a')
    lock.fail('ip:a')
    expect(lock.check('ip:a').locked).toBe(false)
  })
})
