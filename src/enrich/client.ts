import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { buildSystemPrompt, buildUserMessage, type EnrichContext } from './prompt.js'
import { enrichmentOutputSchema, type EnrichmentOutput } from './schema.js'

export type { EnrichmentOutput } from './schema.js'

export interface EnrichInput extends EnrichContext {
  readonly title: string
  readonly note: string | null
  readonly provided: { readonly tags: boolean; readonly lead_days: boolean; readonly goal: boolean; readonly due: boolean }
}

export interface EnrichClient {
  classify(input: EnrichInput): Promise<EnrichmentOutput>
}

export interface AnthropicEnrichOptions {
  readonly apiKey: string
  readonly model: string
  readonly timeoutMs?: number
}

const MAX_OUTPUT_TOKENS = 1024
const DEFAULT_TIMEOUT_MS = 20_000

/** Claude-backed classifier: stable rules in a cached system prompt, per-request context in the user turn. */
export function createAnthropicEnrichClient(options: AnthropicEnrichOptions): EnrichClient {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxRetries: 1 })
  return {
    async classify(input) {
      const response = await client.messages.parse({
        model: options.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserMessage(input) }],
        output_config: { format: zodOutputFormat(enrichmentOutputSchema), effort: 'low' },
      })
      if (response.stop_reason === 'refusal' || response.parsed_output === null) {
        throw new Error(`분류 응답을 해석할 수 없습니다 (stop_reason=${response.stop_reason})`)
      }
      return enrichmentOutputSchema.parse(response.parsed_output)
    },
  }
}
