import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { NotFoundError, ValidationError } from '../errors.js'
import { addTodoSchema, idSchema, listTodosSchema, updateTodoFields, upcomingSchema } from '../todos/schemas.js'
import type { TodoService } from '../todos/service.js'
import { envelope, tagSummaryOutput, todoOutput, upcomingOutput } from './output.js'
import { registerGoalTools } from './goal-tools.js'
import type { GoalService } from '../goals/service.js'

export const SERVER_INFO = { name: 'dueday-mcp', version: '0.1.0' } as const

const DATE_HINT =
  '상대 날짜(이번주 금요일 등)는 응답의 meta.today(Asia/Seoul 기준 오늘)를 써서 호출 전에 YYYY-MM-DD로 바꿔 넘긴다.'

function ok(data: unknown, today: string, total?: number): CallToolResult {
  const body = { success: true as const, data, meta: total === undefined ? { today } : { today, total } }
  return { content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body }
}

function fail(error: unknown): CallToolResult {
  const known = error instanceof ValidationError || error instanceof NotFoundError
  const message = known ? error.message : '내부 오류가 발생했습니다'
  if (!known) console.error('MCP tool 실패:', error)
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }] }
}

async function run(work: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await work()
  } catch (error) {
    return fail(error)
  }
}

export function createMcpServer(service: TodoService, goals?: GoalService): McpServer {
  const server = new McpServer(SERVER_INFO)
  if (goals) registerGoalTools(server, goals, ok, run)

  server.registerTool(
    'add_todo',
    {
      title: '할 일 추가',
      description: `새 할 일을 등록한다. ${DATE_HINT} 기존 태그를 재사용하려면 먼저 list_tags를 본다. 할 일이 어떤 목표(list_goals)에 분명히 속하면 goal에 그 목표 태그를 넣고, 아니면 비워 일상으로 둔다. brain_ref를 주면 gbrain 프로젝트 허브에 동기화된다.`,
      inputSchema: addTodoSchema,
      outputSchema: envelope(todoOutput),
    },
    (args) => run(async () => ok(await service.add(args, 'mcp'), service.today())),
  )

  server.registerTool(
    'list_todos',
    {
      title: '할 일 조회',
      description: '조건으로 할 일을 조회한다. 기본은 미완료(open), 마감 오름차순, 마감 없는 항목은 뒤. due_before/due_after는 YYYY-MM-DD, 경계 포함.',
      inputSchema: listTodosSchema,
      outputSchema: envelope(z.array(todoOutput)),
    },
    (args) =>
      run(async () => {
        const page = await service.list(args)
        return ok(page.items, service.today(), page.total)
      }),
  )

  server.registerTool(
    'update_todo',
    {
      title: '할 일 수정',
      description: `id로 지정한 할 일의 제목, 마감(due), 태그(전체 교체), 준비 기간(lead_days), 메모, brain_ref를 부분 수정한다. 바꿀 필드만 넘긴다. due에 null을 주면 마감을 제거한다. 마감 미루기에 사용. ${DATE_HINT}`,
      inputSchema: z.object({ id: idSchema, ...updateTodoFields.shape }),
      outputSchema: envelope(todoOutput),
    },
    ({ id, ...patch }) => run(async () => ok(await service.update(id, patch), service.today())),
  )

  server.registerTool(
    'complete_todo',
    {
      title: '할 일 완료',
      description: '할 일을 완료 처리한다. brain_ref가 있으면 gbrain 허브의 상태도 갱신한다. 되돌리려면 reopen=true.',
      inputSchema: z.object({ id: idSchema, reopen: z.boolean().default(false).describe('true면 완료 취소') }),
      outputSchema: envelope(todoOutput),
    },
    ({ id, reopen }) => run(async () => ok(await service.complete(id, reopen), service.today())),
  )

  server.registerTool(
    'cancel_todo',
    {
      title: '할 일 취소',
      description: '할 일을 취소 상태로 바꾼다(목록·알림에서 빠지지만 기록은 남음). 되돌리려면 reopen=true. 완전히 지우려면 delete_todo.',
      inputSchema: z.object({ id: idSchema, reopen: z.boolean().default(false).describe('true면 취소를 되돌려 open으로') }),
      outputSchema: envelope(todoOutput),
    },
    ({ id, reopen }) => run(async () => ok(await service.cancel(id, reopen), service.today())),
  )

  server.registerTool(
    'delete_todo',
    {
      title: '할 일 삭제',
      description: '할 일을 영구 삭제한다. 되돌릴 수 없으므로 사용자가 명시적으로 삭제를 요청했을 때만 쓴다. 단순히 안 하기로 한 일은 cancel_todo.',
      inputSchema: z.object({ id: idSchema }),
      outputSchema: envelope(z.object({ id: z.string(), deleted: z.literal(true) })),
    },
    ({ id }) =>
      run(async () => {
        await service.remove(id)
        return ok({ id, deleted: true as const }, service.today())
      }),
  )

  server.registerTool(
    'upcoming',
    {
      title: '다가올 할 일',
      description:
        '일 단위 알림용. 오늘(Asia/Seoul) 기준으로 미완료 할 일을 overdue(마감 지남), start_now(준비 시작일이 오늘 이전), later(days 이내 예정), no_due(마감 없음)로 나누고 한국어 한 줄 summary를 준다.',
      inputSchema: upcomingSchema,
      outputSchema: envelope(upcomingOutput),
    },
    (args) => run(async () => ok(await service.upcoming(args), service.today())),
  )

  server.registerTool(
    'list_tags',
    {
      title: '태그 목록',
      description: '태그 목록과 태그별 미완료 개수. add_todo 전에 기존 태그를 재사용하기 위해 호출한다.',
      inputSchema: z.object({}),
      outputSchema: envelope(z.array(tagSummaryOutput)),
    },
    () => run(async () => ok(await service.listTags(), service.today())),
  )

  return server
}
