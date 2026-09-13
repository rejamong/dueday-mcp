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
  promote_to_goal: promotionSchema.nullable().describe('할 일보다 목표에 가까울 때만 초안, 아니면 null'),
  reason: z.string().max(200),
})
export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>
export type Promotion = z.infer<typeof promotionSchema>
