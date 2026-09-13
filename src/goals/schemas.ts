import { z } from 'zod'
import { dateOnlySchema } from '../todos/schemas.js'

export const goalTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, '태그는 영문 소문자·숫자·-·_ 1~32자여야 합니다')
  .describe('목표 태그(슬러그). 할 일을 연결할 때 이 값을 goal에 넣는다. 예: reading')

export const metricInputSchema = z.object({
  name: z.string().trim().min(1).max(40).describe('지표 이름. 예: 읽은 책, btc, 몸무게'),
  kind: z.enum(['count', 'value', 'boolean']).describe('count=증분 누적(권, 회), value=측정값(kg, 명, BTC), boolean=달성 여부'),
  direction: z.enum(['gte', 'lte', 'maintain']).default('gte').describe('gte=목표 이상, lte=목표 이하(다툼 ≤3, 몸무게 ≤76), maintain=유지'),
  target_value: z.number().positive().describe('목표값. boolean은 1'),
  unit: z.string().trim().max(16).optional().describe('단위 표시용. 권, kg, BTC, 회'),
  baseline_value: z.number().optional().describe('시작값(value/gte에서 진행률 기준점)'),
  cadence: z.enum(['monthly', 'weekly']).optional().describe('주기 목표면 지정. 본가 월 1회 → monthly'),
})

export const addGoalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(['life', 'annual', 'short', 'long']).describe('life=인생 목표(하나), annual=연간(year), short=단기(몇 주~몇 달, period_end 필수), long=기간 없는 장기'),
  tag: goalTagSchema,
  parent: z.string().trim().optional().describe('상위 목표 태그 또는 id (보통 인생 목표 태그)'),
  year: z.number().int().min(2000).max(2100).optional().describe('annual일 때 연도. period_start/end 대신 사용'),
  period_start: dateOnlySchema.optional(),
  period_end: dateOnlySchema.optional().describe('short는 필수. 없으면 period_start는 오늘'),
  why: z.string().trim().max(300).optional().describe('이 목표가 인생 목표에 어떻게 닿는지 한 줄'),
  metrics: z.array(metricInputSchema).max(8).default([]),
})

export const updateGoalFields = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    tag: goalTagSchema.optional(),
    parent: z.string().trim().nullable().optional(),
    status: z.enum(['active', 'done', 'paused', 'dropped']).optional(),
    period_start: dateOnlySchema.nullable().optional(),
    period_end: dateOnlySchema.nullable().optional(),
    why: z.string().trim().max(300).nullable().optional(),
    sort_order: z.number().int().optional(),
    metrics: z.array(metricInputSchema).max(8).optional().describe('지표 전체 교체. 이름이 같은 지표의 체크인은 유지'),
})

export const updateGoalSchema = updateGoalFields.refine((p) => Object.values(p).some((v) => v !== undefined), '수정할 필드가 없습니다')

export const listGoalsSchema = z.object({
  status: z.enum(['active', 'all']).default('active'),
})

export const logProgressSchema = z.object({
  value: z.number().describe('count면 증분(+1), value면 측정값, boolean이면 1 또는 0'),
  metric: z.string().trim().min(1).optional().describe('지표 이름. 목표에 지표가 하나면 생략 가능'),
  note: z.string().trim().max(300).optional(),
  logged_at: z.string().trim().optional().describe('기록 시각(RFC3339 또는 YYYY-MM-DD). 기본 지금'),
})

export type AddGoalInput = z.infer<typeof addGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
export type MetricInput = z.infer<typeof metricInputSchema>
export type LogProgressInput = z.infer<typeof logProgressSchema>
