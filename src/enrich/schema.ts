import { z } from 'zod'

export const promotionSchema = z.object({
  title: z.string().min(1).max(120),
  kind: z.enum(['annual', 'short', 'long']),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('short일 때 종료일, 그 외 null'),
  tag: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/),
  why: z.string().max(200),
  metric: z.object({
    name: z.string().min(1).max(40),
    kind: z.enum(['count', 'value', 'boolean']),
    direction: z.enum(['gte', 'lte', 'maintain']),
    target_value: z.number().positive(),
    unit: z.string().max(16).nullable(),
  }),
})

/** What the classifier returns. Every field is a proposal; the service decides what to apply. */
export const enrichmentOutputSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(3).describe('기존 태그 우선, 없으면 짧은 한글 명사 하나'),
  goal: z.string().nullable().describe('활성 목표 태그, 없으면 null'),
  goal_confidence: z.enum(['high', 'medium', 'low']),
  lead_days: z.number().int().min(0).max(60).nullable().describe('준비 기간. 판단 불가면 null'),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe('제목에 날짜 표현이 있을 때만 YYYY-MM-DD'),
  area: z.enum(['personal', 'work']).nullable().describe('personal=일상, work=업무. 판단 불가면 null'),
  size: z.number().int().min(1).max(6).nullable().describe('규모 1=1시간 미만 2=하루 미만 3=1~2일 4=3~7일 5=2주 6=2주 이상. 판단 불가면 null'),
  promote_to_goal: promotionSchema.nullable().describe('할 일보다 목표에 가까울 때만 초안, 아니면 null'),
  reason: z.string().max(200),
})
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>
export type Promotion = z.infer<typeof promotionSchema>

/**
 * The shape sent to the API as the structured-output format. Constrained decoding guarantees the keys and
 * enums but not regex patterns, lengths or numeric ranges, so those are checked afterwards field by field
 * (see normalizeEnrichmentOutput) instead of rejecting the whole response over one bad value.
 */
export const enrichmentWireSchema = z.object({
  tags: z.array(z.string()).describe('기존 태그 우선, 없으면 짧은 한글 명사 하나. 최대 3개'),
  goal: z.string().nullable().describe('활성 목표 태그, 없으면 null'),
  goal_confidence: z.enum(['high', 'medium', 'low']),
  lead_days: z.number().nullable().describe('준비 기간(0~60 정수). 판단 불가면 null'),
  due: z.string().nullable().describe('제목에 날짜 표현이 있을 때만 YYYY-MM-DD'),
  area: z.enum(['personal', 'work']).nullable().describe('personal=일상, work=업무. 판단 불가면 null'),
  size: z.number().nullable().describe('규모 1=1시간 미만 2=하루 미만 3=1~2일 4=3~7일 5=2주 6=2주 이상. 판단 불가면 null'),
  promote_to_goal: z
    .object({
      title: z.string(),
      kind: z.enum(['annual', 'short', 'long']),
      period_end: z.string().nullable().describe('short일 때 종료일 YYYY-MM-DD, 그 외 null'),
      tag: z.string().describe('영문 소문자 슬러그(a-z, 0-9, -). 한글 금지. 예: running, jlpt-n3'),
      why: z.string(),
      metric: z.object({
        name: z.string(),
        kind: z.enum(['count', 'value', 'boolean']),
        direction: z.enum(['gte', 'lte', 'maintain']),
        target_value: z.number(),
        unit: z.string().nullable(),
      }),
    })
    .nullable()
    .describe('할 일보다 목표에 가까울 때만 초안, 아니면 null'),
  reason: z.string(),
})

const MAX_TAGS = 3
const MAX_REASON = 200

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function slugifyTag(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
}

/** A promotion survives only if, after slugging its tag, it satisfies the strict schema; otherwise it is dropped. */
function normalizePromotion(raw: unknown): Promotion | null {
  const record = asRecord(raw)
  if (!record) return null
  const parsed = promotionSchema.safeParse({ ...record, tag: slugifyTag(record.tag) })
  return parsed.success ? parsed.data : null
}

function fieldOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

/**
 * Turns a raw classifier response into a valid EnrichmentOutput, salvaging every field that is well-formed:
 * a malformed promotion tag or an out-of-range size nulls that one field, not the whole classification.
 */
export function normalizeEnrichmentOutput(raw: unknown): EnrichmentOutput {
  const record = asRecord(raw)
  if (!record) throw new Error('분류 응답이 객체가 아닙니다')
  const shape = enrichmentOutputSchema.shape
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0 && t.length <= 40).slice(0, MAX_TAGS)
    : []
  return {
    tags,
    goal: fieldOr(shape.goal, record.goal, null),
    goal_confidence: fieldOr(shape.goal_confidence, record.goal_confidence, 'low'),
    lead_days: fieldOr(shape.lead_days, record.lead_days, null),
    due: fieldOr(shape.due, record.due, null),
    area: fieldOr(shape.area, record.area, null),
    size: fieldOr(shape.size, record.size, null),
    promote_to_goal: normalizePromotion(record.promote_to_goal),
    reason: typeof record.reason === 'string' ? record.reason.slice(0, MAX_REASON) : '',
  }
}
