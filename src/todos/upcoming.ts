import { addDays, seoulDate } from './dates.js'
import type { Todo, UpcomingResult } from './types.js'

const NO_DUE_CAP = 10
const SUMMARY_TITLE_CAP = 3

function byDue(a: Todo, b: Todo): number {
  return (a.due_at ?? '').localeCompare(b.due_at ?? '')
}

function summarize(today: string, days: number, groups: Omit<UpcomingResult, 'today' | 'summary'>, noDueTotal: number): string {
  const shown = noDueTotal > groups.no_due.length ? ` (${groups.no_due.length}건 표시)` : ''
  const head = `오늘 ${today} 기준: 마감 지남 ${groups.overdue.length}, 지금 준비 시작 ${groups.start_now.length}, ${days}일 내 예정 ${groups.later.length}, 마감 없음 ${noDueTotal}${shown}`
  if (groups.start_now.length === 0) return head
  const titles = groups.start_now.slice(0, SUMMARY_TITLE_CAP).map((t) => t.title)
  const more = groups.start_now.length > SUMMARY_TITLE_CAP ? ` 외 ${groups.start_now.length - SUMMARY_TITLE_CAP}건` : ''
  return `${head}. 준비 시작: ${titles.join(', ')}${more}`
}

/** Pure grouping of open todos relative to `today` (Seoul calendar date). */
export function groupUpcoming(todos: readonly Todo[], today: string, days: number): UpcomingResult {
  const horizon = addDays(today, days)
  const overdue: Todo[] = []
  const startNow: Todo[] = []
  const later: Todo[] = []
  const noDue: Todo[] = []

  for (const todo of todos) {
    if (todo.status !== 'open') continue
    if (!todo.due_at) {
      noDue.push(todo)
      continue
    }
    const dueDate = seoulDate(new Date(todo.due_at))
    if (dueDate < today) overdue.push(todo)
    else if (todo.prep_start !== null && todo.prep_start <= today) startNow.push(todo)
    else if (dueDate <= horizon) later.push(todo)
  }

  const groups = {
    overdue: [...overdue].sort(byDue),
    start_now: [...startNow].sort(byDue),
    later: [...later].sort(byDue),
    no_due: noDue.slice(0, NO_DUE_CAP),
  }
  return { today, ...groups, summary: summarize(today, days, groups, noDue.length) }
}
