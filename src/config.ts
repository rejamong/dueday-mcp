import { z } from 'zod'

const NODE_ENVS = ['development', 'test', 'production'] as const
type NodeEnv = (typeof NODE_ENVS)[number]

const MIN_API_TOKEN_LENGTH = 16
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60
const MIN_OWNER_PASSWORD_LENGTH = 12
const MIN_WEB_PASSWORD_LENGTH = 4

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
  GBRAIN_TOKEN_URL: z.string().url().optional(),
  GBRAIN_CLIENT_ID: z.string().optional(),
  GBRAIN_CLIENT_SECRET: z.string().optional(),
  GBRAIN_SCOPE: z.string().default('read write'),
  PUBLIC_URL: z.string().url().optional(),
  OWNER_PASSWORD: z.string().min(MIN_OWNER_PASSWORD_LENGTH, `OWNER_PASSWORD는 ${MIN_OWNER_PASSWORD_LENGTH}자 이상이어야 합니다`).optional(),
  WEB_PASSWORD: z.string().min(MIN_WEB_PASSWORD_LENGTH, `WEB_PASSWORD는 ${MIN_WEB_PASSWORD_LENGTH}자 이상이어야 합니다`).optional(),
  OAUTH_CLIENT_ID: z.string().min(1).default('chatgpt'),
  OAUTH_REDIRECT_URIS: z.string().default('https://chatgpt.com/connector_platform_oauth_redirect'),
})

export interface Config {
  readonly port: number
  readonly nodeEnv: NodeEnv
  readonly dbPath: string
  readonly apiToken: string
  readonly rateLimitPerMinute: number
  readonly gbrain: GbrainConfig | undefined
  readonly brainSyncEnabled: boolean
  /** OAuth consent password; OAuth additionally needs PUBLIC_URL. */
  readonly ownerPassword: string | undefined
  /** Browser login password: WEB_PASSWORD if set, else OWNER_PASSWORD. */
  readonly webPassword: string | undefined
  /** Present only when PUBLIC_URL and OWNER_PASSWORD are both set. */
  readonly oauth: OAuthConfig | undefined
}

export type GbrainConfig =
  | { readonly url: string; readonly mode: 'static'; readonly token: string }
  | {
      readonly url: string
      readonly mode: 'client_credentials'
      readonly tokenUrl: string
      readonly clientId: string
      readonly clientSecret: string
      readonly scope: string
    }

function gbrainConfig(data: z.infer<typeof envSchema>): GbrainConfig | undefined {
  if (data.GBRAIN_URL === undefined) return undefined
  if (data.GBRAIN_CLIENT_ID !== undefined && data.GBRAIN_CLIENT_SECRET !== undefined) {
    const tokenUrl = data.GBRAIN_TOKEN_URL ?? `${new URL(data.GBRAIN_URL).origin}/token`
    return {
      url: data.GBRAIN_URL,
      mode: 'client_credentials',
      tokenUrl,
      clientId: data.GBRAIN_CLIENT_ID,
      clientSecret: data.GBRAIN_CLIENT_SECRET,
      scope: data.GBRAIN_SCOPE,
    }
  }
  if (data.GBRAIN_TOKEN !== undefined) return { url: data.GBRAIN_URL, mode: 'static', token: data.GBRAIN_TOKEN }
  return undefined
}

export interface OAuthConfig {
  readonly issuer: string
  readonly clientId: string
  readonly redirectUris: readonly string[]
  readonly ownerPassword: string
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
  const oauth: OAuthConfig | undefined =
    data.PUBLIC_URL !== undefined && data.OWNER_PASSWORD !== undefined
      ? {
          issuer: data.PUBLIC_URL.replace(/\/+$/, ''),
          clientId: data.OAUTH_CLIENT_ID,
          redirectUris: data.OAUTH_REDIRECT_URIS.split(',').map((u) => u.trim()).filter((u) => u.length > 0),
          ownerPassword: data.OWNER_PASSWORD,
        }
      : undefined
  return Object.freeze({
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    dbPath: data.DB_PATH,
    apiToken: data.API_TOKEN,
    rateLimitPerMinute: data.RATE_LIMIT_PER_MIN,
    gbrain: gbrainConfig(data),
    brainSyncEnabled: gbrainConfig(data) !== undefined,
    ownerPassword: data.OWNER_PASSWORD,
    webPassword: data.WEB_PASSWORD ?? data.OWNER_PASSWORD,
    oauth,
  })
}
