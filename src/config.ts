import { z } from 'zod'

const NODE_ENVS = ['development', 'test', 'production'] as const
type NodeEnv = (typeof NODE_ENVS)[number]

const MIN_API_TOKEN_LENGTH = 16
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  DB_PATH: z.string().min(1).default('./data/todo.db'),
  API_TOKEN: z
    .string({ error: 'API_TOKEN은 필수입니다 (openssl rand -hex 32 로 생성)' })
    .min(MIN_API_TOKEN_LENGTH, `API_TOKEN은 ${MIN_API_TOKEN_LENGTH}자 이상이어야 합니다`),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(10000).default(DEFAULT_RATE_LIMIT_PER_MINUTE),
  GBRAIN_URL: z.string().url().optional(),
  GBRAIN_TOKEN: z.string().optional(),
})

export interface Config {
  readonly port: number
  readonly nodeEnv: NodeEnv
  readonly dbPath: string
  readonly apiToken: string
  readonly rateLimitPerMinute: number
  readonly gbrainUrl: string | undefined
  readonly gbrainToken: string | undefined
  readonly brainSyncEnabled: boolean
}

/** `.env` files (and shells) often leave unset vars as empty strings rather than absent keys. */
function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === '' ? undefined : value]))
}

/**
 * Loads and validates configuration. API_TOKEN is mandatory in every environment:
 * the server is designed to sit behind a public tunnel, so there is no "safe" unauthenticated mode.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(normalizeEnv(env))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`환경 변수 설정이 올바르지 않습니다 — ${issues.join('; ')}`)
  }
  const data = parsed.data
  return Object.freeze({
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    dbPath: data.DB_PATH,
    apiToken: data.API_TOKEN,
    rateLimitPerMinute: data.RATE_LIMIT_PER_MIN,
    gbrainUrl: data.GBRAIN_URL,
    gbrainToken: data.GBRAIN_TOKEN,
    brainSyncEnabled: data.GBRAIN_URL !== undefined && data.GBRAIN_TOKEN !== undefined,
  })
}
