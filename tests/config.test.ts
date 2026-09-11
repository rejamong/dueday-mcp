import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const TOKEN = 'a'.repeat(32)

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { API_TOKEN: TOKEN, ...overrides }
}

describe('loadConfig', () => {
  it('applies defaults when only API_TOKEN is set', () => {
    const config = loadConfig(env({}))
    expect(config.port).toBe(3000)
    expect(config.nodeEnv).toBe('development')
    expect(config.dbPath).toBe('./data/todo.db')
    expect(config.rateLimitPerMinute).toBe(60)
    expect(config.brainSyncEnabled).toBe(false)
  })

  it('coerces numbers and treats empty-string env vars as unset', () => {
    const config = loadConfig(env({ PORT: '4321', DB_PATH: '', RATE_LIMIT_PER_MIN: '10', GBRAIN_URL: '' }))
    expect(config.port).toBe(4321)
    expect(config.dbPath).toBe('./data/todo.db')
    expect(config.rateLimitPerMinute).toBe(10)
    expect(config.gbrain).toBeUndefined()
  })

  it('rejects an out-of-range PORT and an unknown NODE_ENV', () => {
    expect(() => loadConfig(env({ PORT: '70000' }))).toThrow(/환경 변수/)
    expect(() => loadConfig(env({ NODE_ENV: 'staging' }))).toThrow(/환경 변수/)
  })

  it('requires an API_TOKEN of at least 16 chars in every environment', () => {
    expect(() => loadConfig({})).toThrow(/API_TOKEN/)
    expect(() => loadConfig({ API_TOKEN: '' })).toThrow(/API_TOKEN/)
    expect(() => loadConfig({ NODE_ENV: 'development', API_TOKEN: 'short' })).toThrow(/API_TOKEN/)
    expect(() => loadConfig({ NODE_ENV: 'test', API_TOKEN: 'short' })).toThrow(/API_TOKEN/)
  })

  it('enables brain sync with a static token or with client credentials', () => {
    expect(loadConfig(env({ GBRAIN_URL: 'https://brain.example/mcp' })).brainSyncEnabled).toBe(false)
    expect(loadConfig(env({ GBRAIN_TOKEN: 'x' })).brainSyncEnabled).toBe(false)
    const fixed = loadConfig(env({ GBRAIN_URL: 'https://brain.example/mcp', GBRAIN_TOKEN: 'x' }))
    expect(fixed.gbrain).toEqual({ url: 'https://brain.example/mcp', mode: 'static', token: 'x' })
    const cc = loadConfig(env({ GBRAIN_URL: 'http://host.docker.internal:3131/mcp', GBRAIN_CLIENT_ID: 'dueday', GBRAIN_CLIENT_SECRET: 'sec' }))
    expect(cc.gbrain).toEqual({
      url: 'http://host.docker.internal:3131/mcp',
      mode: 'client_credentials',
      tokenUrl: 'http://host.docker.internal:3131/token',
      clientId: 'dueday',
      clientSecret: 'sec',
      scope: 'read write',
    })
  })

  it('rejects a malformed GBRAIN_URL', () => {
    expect(() => loadConfig(env({ GBRAIN_URL: 'not a url' }))).toThrow(/환경 변수/)
  })

  it('returns an immutable config object', () => {
    const config = loadConfig(env({}))
    expect(Object.isFrozen(config)).toBe(true)
  })
})
