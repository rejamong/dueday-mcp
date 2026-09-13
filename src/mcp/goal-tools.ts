import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { addGoalSchema, listGoalsSchema, logProgressSchema, updateGoalFields } from '../goals/schemas.js'
import type { GoalService } from '../goals/service.js'
import { envelope, goalOutput } from './output.js'

type Ok = (data: unknown, today: string) => CallToolResult
type Run = (work: () => Promise<CallToolResult>) => Promise<CallToolResult>

const GOAL_REF = z.string().trim().min(1).describe('목표 태그 또는 id')

/** Goal tools: list/add/update goals, log check-ins, read detailed progress. */
export function registerGoalTools(server: McpServer, goals: GoalService, ok: Ok, run: Run): void {
  server.registerTool(
    'list_goals',
    {
      title: '목표 목록',
      description:
        '인생 목표와 연간·장기 목표를 진행률과 함께 돌려준다. 대화에서 처음 할 일을 등록하기 전에 한 번 호출해 목표 태그를 파악하고, 할 일이 분명히 속하는 목표가 있으면 add_todo의 goal에 그 태그를 넣는다. 각 목표는 percent(달성률), time_percent(기간 경과율), status_label(ahead/on_track/behind/done/none), metrics(지표별 current/target)를 가진다.',
      inputSchema: listGoalsSchema,
      outputSchema: envelope(z.array(goalOutput)),
    },
    (args) => run(async () => ok(await goals.list(args), goals.today())),
  )

  server.registerTool(
    'add_goal',
    {
      title: '목표 추가',
      description:
        '목표를 만든다. kind=life는 인생 목표(하나), annual은 연간(year 지정), short는 단기(몇 주~몇 달, period_end 필수, period_start 기본 오늘), long은 기간 없는 장기. tag는 짧은 영문 슬러그(예: reading, weight). metrics에 지표를 넣는다: count(누적, 독서 15권·일기 100일·본가 12회), value(측정값, 팔로워 20000·몸무게 76 lte·BTC 3), boolean(취업 여부). 한 목표에 지표 여러 개 가능(크립토: btc, eth, stable).',
      inputSchema: addGoalSchema,
      outputSchema: envelope(goalOutput),
    },
    (args) => run(async () => ok(await goals.add(args), goals.today())),
  )

  server.registerTool(
    'update_goal',
    {
      title: '목표 수정',
      description: '목표의 제목·태그·상태(active/done/paused/dropped)·기간·why·지표를 부분 수정한다. metrics를 주면 전체 교체하되 이름이 같은 지표의 체크인은 유지된다.',
      inputSchema: z.object({ goal: GOAL_REF, ...updateGoalFields.shape }),
      outputSchema: envelope(goalOutput),
    },
    ({ goal, ...patch }) => run(async () => ok(await goals.update(goal, patch), goals.today())),
  )

  server.registerTool(
    'log_progress',
    {
      title: '목표 체크인',
      description:
        '지표에 기록을 남긴다. "책 한 권 끝냈어" → reading에 value 1(count는 증분). "몸무게 75.8" → weight에 value 75.8(value는 측정값). "취업했어" → job에 value 1(boolean). 지표가 여러 개인 목표는 metric 이름을 지정한다(크립토: btc/eth/stable). 응답에 지표의 갱신된 current/percent와 목표 전체 진행률이 온다.',
      inputSchema: z.object({ goal: GOAL_REF, ...logProgressSchema.shape }),
      outputSchema: envelope(z.object({ checkin: z.record(z.string(), z.unknown()), metric: z.record(z.string(), z.unknown()), goal: goalOutput })),
    },
    ({ goal, ...input }) => run(async () => ok(await goals.logProgress(goal, input, 'mcp'), goals.today())),
  )

  server.registerTool(
    'goal_progress',
    {
      title: '목표 상세 진행',
      description: '목표 하나의 지표별 진행, 최근 체크인 30건, 열린 할 일 목록을 돌려준다. 주간 목표 리뷰나 "독서 목표 어때?" 같은 질문에 쓴다.',
      inputSchema: z.object({ goal: GOAL_REF }),
      outputSchema: envelope(goalOutput.extend({ checkins: z.array(z.record(z.string(), z.unknown())), open_todos: z.array(z.record(z.string(), z.unknown())), done_todos: z.array(z.record(z.string(), z.unknown())) })),
    },
    ({ goal }) => run(async () => ok(await goals.get(goal), goals.today())),
  )
}
