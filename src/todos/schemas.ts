import { z } from 'zod'
import { isDateOnly } from './dates.js'
import { SIZE_HELP } from './size.js'

const DUE_MESSAGE = 'due는 YYYY-MM-DD 또는 RFC3339 형식이어야 합니다'

function isValidDue(value: string): boolean {
  if (isDateOnly(value)) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(new Date(value).getTime())
}

export const idSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'id는 ULID 형식이어야 합니다')
  .describe('할 일 ID (ULID, 26자)')
export const dateOnlySchema = z.string().refine(isDateOnly, '날짜는 YYYY-MM-DD 형식이어야 합니다')
export const dueSchema = z
  .string()
  .trim()
  .refine(isValidDue, DUE_MESSAGE)
  .describe('마감. YYYY-MM-DD(그날 18:00 KST로 저장) 또는 RFC3339. 상대 표현("이번주 금요일")은 meta.today 기준으로 먼저 변환할 것')
export const tagNameSchema = z.string().trim().min(1, '태그는 비어 있을 수 없습니다').max(40)
export const brainRefSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9/_-]*$/, 'brain_ref는 gbrain 페이지 슬러그 형식이어야 합니다')
  .describe('연결할 gbrain 프로젝트 페이지 슬러그 (예: projects/my-project). 설정 시 생성·완료가 허브에 동기화됨')
const titleSchema = z.string().trim().min(1, '제목은 비어 있을 수 없습니다').max(200).describe('할 일 제목')
const noteSchema = z.string().trim().max(2000).describe('메모')
const leadDaysSchema = z.number().int().min(0).max(60).describe('마감 며칠 전부터 준비를 시작할지 (기본 3)')
export const sizeSchema = z.number().int().min(1).max(5).describe(`규모(예상 소요): ${SIZE_HELP}. 비우면 서버가 태그 이력·분류기로 추정하고, 있으면 준비 기간(lead_days)이 이에 맞춰 정해진다`)
const tagsSchema = z.array(tagNameSchema).max(10).describe('태그 목록. 소문자로 정규화되며 없는 태그는 자동 생성')

/** Inputs are intentionally non-strict: LLM callers occasionally add keys, and stripping beats failing. */
export const goalRefSchema = z
  .string()
  .trim()
  .min(1)
  .describe('연결할 목표의 태그(또는 id). 먼저 list_goals로 활성 목표 태그를 보고, 분명히 속하는 목표가 있을 때만 넣는다. 없으면 비워 두면 일상으로 분류된다')

export const addTodoSchema = z.object({
  title: titleSchema,
  due: dueSchema.optional(),
  tags: tagsSchema.default([]),
  lead_days: leadDaysSchema.optional(),
  size: sizeSchema.optional(),
  note: noteSchema.optional(),
  brain_ref: brainRefSchema.optional(),
  goal: goalRefSchema.optional(),
})

export const DEFAULT_LEAD_DAYS = 3

export const updateTodoFields = z.object({
  title: titleSchema.optional(),
  due: dueSchema.nullable().optional().describe('새 마감. null이면 마감 제거'),
  tags: tagsSchema.optional().describe('태그 전체 교체'),
  lead_days: leadDaysSchema.optional(),
  size: sizeSchema.nullable().optional().describe('규모 1~5, null이면 제거'),
  note: noteSchema.nullable().optional(),
  brain_ref: brainRefSchema.nullable().optional(),
  goal: goalRefSchema.nullable().optional().describe('목표 태그로 연결, null이면 연결 해제(일상)'),
})

export const updateTodoSchema = updateTodoFields.refine(
  (patch) => Object.values(patch).some((v) => v !== undefined),
  '수정할 필드가 없습니다',
)

export const listTodosSchema = z.object({
  status: z.enum(['open', 'done', 'cancelled', 'all']).default('open').describe('상태 필터 (기본 open)'),
  tag: tagNameSchema.optional().describe('이 태그가 붙은 항목만'),
  due_before: dateOnlySchema.optional().describe('마감이 이 날짜(YYYY-MM-DD) 이하인 항목만, 경계 포함'),
  due_after: dateOnlySchema.optional().describe('마감이 이 날짜(YYYY-MM-DD) 이상인 항목만, 경계 포함'),
  q: z.string().trim().min(1).max(100).optional().describe('제목/메모 부분 일치 검색'),
  goal: z.string().trim().min(1).optional().describe('목표 태그로 필터. "none"이면 목표에 연결되지 않은 일상 항목만'),
  size: sizeSchema.optional().describe('이 규모(1~5)인 항목만'),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0).describe('건너뛸 개수 (페이지네이션)'),
})

export const upcomingSchema = z.object({
  days: z.number().int().min(1).max(60).default(7).describe('later 그룹으로 볼 기간(일). 기본 7'),
})

export const completeTodoSchema = z.object({
  id: idSchema,
  reopen: z.boolean().default(false).describe('true면 완료를 취소하고 다시 open으로'),
})

export type AddTodoInput = z.infer<typeof addTodoSchema>
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>
export type ListTodosInput = z.infer<typeof listTodosSchema>
export type UpcomingInput = z.infer<typeof upcomingSchema>
