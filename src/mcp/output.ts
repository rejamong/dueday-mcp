import { z } from 'zod'

export const todoOutput = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  due_at: z.string().nullable(),
  lead_days: z.number().int(),
  prep_start: z.string().nullable(),
  status: z.enum(['open', 'done', 'cancelled']),
  tags: z.array(z.string()),
  brain_ref: z.string().nullable(),
  goal_id: z.string().nullable(),
  goal_tag: z.string().nullable(),
  enrichment: z.record(z.string(), z.unknown()).nullable(),
  enriched_at: z.string().nullable(),
  source: z.enum(['mcp', 'web']),
  created_at: z.string(),
  updated_at: z.string(),
  done_at: z.string().nullable(),
})

export const metaOutput = z.object({ today: z.string(), total: z.number().int().optional() })

export function envelope<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data, meta: metaOutput })
}

export const upcomingOutput = z.object({
  today: z.string(),
  overdue: z.array(todoOutput),
  start_now: z.array(todoOutput),
  later: z.array(todoOutput),
  no_due: z.array(todoOutput),
  summary: z.string(),
})

export const tagSummaryOutput = z.object({
  name: z.string(),
  color: z.string().nullable(),
  open_count: z.number().int(),
})

export const goalOutput = z
  .object({
    id: z.string(),
    title: z.string(),
    tag: z.string(),
    kind: z.enum(['life', 'annual', 'short', 'long']),
    status: z.string(),
    percent: z.number(),
    time_percent: z.number().nullable(),
    status_label: z.string(),
    metrics: z.array(z.record(z.string(), z.unknown())),
    todos: z.object({ open: z.number(), done: z.number() }),
  })
  .passthrough()
