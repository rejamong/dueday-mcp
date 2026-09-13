import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { disabledBrainSync, type BrainSync } from './brain/sync.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/connection.js'
import { OAuthService } from './oauth/service.js'
import { TodoService } from './todos/service.js'
import { GoalService } from './goals/service.js'
import { Enricher } from './enrich/service.js'
import { createAnthropicEnrichClient } from './enrich/client.js'

async function buildBrainSync(config: ReturnType<typeof loadConfig>): Promise<BrainSync> {
  const gbrain = config.gbrain
  if (gbrain === undefined) return disabledBrainSync
  const { createGbrainSync } = await import('./brain/gbrain.js')
  if (gbrain.mode === 'static') return createGbrainSync({ url: gbrain.url, token: gbrain.token })
  const { createClientCredentialsTokenProvider } = await import('./brain/token.js')
  const token = createClientCredentialsTokenProvider({
    tokenUrl: gbrain.tokenUrl,
    clientId: gbrain.clientId,
    clientSecret: gbrain.clientSecret,
    scope: gbrain.scope,
  })
  return createGbrainSync({ url: gbrain.url, token })
}

async function main(): Promise<void> {
  const config = loadConfig()
  mkdirSync(dirname(config.dbPath), { recursive: true })
  const db = openDatabase(config.dbPath)
  const brainSync = await buildBrainSync(config)
  const goals = new GoalService({ db })
  const enricher = config.enrich
    ? new Enricher({ db, client: createAnthropicEnrichClient({ apiKey: config.enrich.apiKey, model: config.enrich.model }), model: config.enrich.model, dailyCap: config.enrich.dailyCap })
    : undefined
  const service = new TodoService({ db, brainSync, goals, ...(enricher ? { enricher } : {}) })
  enricher?.attach(service, goals)
  const oauth = config.oauth
    ? new OAuthService({ db, resourcePath: '/mcp', ...config.oauth })
    : undefined
  const app = createApp({
    service,
    goals,
    ...(enricher ? { enricher } : {}),
    apiToken: config.apiToken,
    rateLimitPerMinute: config.rateLimitPerMinute,
    ...(oauth ? { oauth } : {}),
    ...(config.ownerPassword !== undefined ? { ownerPassword: config.ownerPassword } : {}),
    ...(config.webPassword !== undefined ? { webPassword: config.webPassword } : {}),
  })

  const server = serve({ fetch: app.fetch, port: config.port })

  process.stdout.write(`dueday-mcp listening on port ${config.port} (${config.nodeEnv}, oauth ${oauth ? 'on' : 'off'}, enrich ${enricher ? config.enrich?.model : 'off'})\n`)

  let shuttingDown = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    process.stdout.write(`${signal} 수신 — 종료합니다\n`)
    server.close(() => {
      db.close()
      process.exit(0)
    })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  console.error('서버 시작 실패:', error)
  process.exit(1)
})
