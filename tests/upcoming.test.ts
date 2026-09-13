import { describe, expect, it } from 'vitest'
import { groupUpcoming } from '../src/todos/upcoming.js'
import type { Todo } from '../src/todos/types.js'

function todo(overrides: Partial<Todo> & { id: string }): Todo {
  const due_at = overrides.due_at ?? null
  return {
    title: overrides.id,
    note: null,
    due_at,
    lead_days: 3,
    prep_start: null,
    status: 'open',
    tags: [],
    brain_ref: null,
    goal_id: null,
    goal_tag: null,
    source: 'mcp',
    created_at: '2026-09-01T09:00:00+09:00',
    updated_at: '2026-09-01T09:00:00+09:00',
    done_at: null,
    ...overrides,
  }
}

const today = '2026-09-11'

describe('groupUpcoming', () => {
  it('splits open todos into overdue / start_now / later / no_due', () => {
    const items = [
      todo({ id: 'overdue', due_at: '2026-09-10T18:00:00+09:00', prep_start: '2026-09-07' }),
      todo({ id: 'startNow', due_at: '2026-09-13T18:00:00+09:00', prep_start: '2026-09-10' }),
      todo({ id: 'startToday', due_at: '2026-09-14T18:00:00+09:00', prep_start: '2026-09-11' }),
      todo({ id: 'later', due_at: '2026-09-17T18:00:00+09:00', prep_start: '2026-09-14' }),
      todo({ id: 'farAway', due_at: '2026-10-30T18:00:00+09:00', prep_start: '2026-10-27' }),
      todo({ id: 'noDue' }),
    ]
    const result = groupUpcoming(items, today, 7)
    expect(result.overdue.map((t) => t.id)).toEqual(['overdue'])
    expect(result.start_now.map((t) => t.id)).toEqual(['startNow', 'startToday'])
    expect(result.later.map((t) => t.id)).toEqual(['later'])
    expect(result.no_due.map((t) => t.id)).toEqual(['noDue'])
    expect(result.today).toBe(today)
  })

  it('puts long-lead items in start_now even beyond the horizon', () => {
    const items = [todo({ id: 'visa', due_at: '2026-10-20T18:00:00+09:00', lead_days: 45, prep_start: '2026-09-05' })]
    const result = groupUpcoming(items, today, 7)
    expect(result.start_now.map((t) => t.id)).toEqual(['visa'])
    expect(result.later).toEqual([])
  })

  it('ignores done and cancelled todos and caps no_due at 10', () => {
    const items = [
      todo({ id: 'done', status: 'done', due_at: '2026-09-10T18:00:00+09:00', prep_start: '2026-09-07' }),
      todo({ id: 'cancelled', status: 'cancelled' }),
      ...Array.from({ length: 12 }, (_, i) => todo({ id: `nd${i}` })),
    ]
    const result = groupUpcoming(items, today, 7)
    expect(result.overdue).toEqual([])
    expect(result.no_due).toHaveLength(10)
    expect(result.summary).toContain('마감 없음 12 (10건 표시)')
  })

  it('sorts each group by due date ascending', () => {
    const items = [
      todo({ id: 'b', due_at: '2026-09-09T18:00:00+09:00', prep_start: '2026-09-06' }),
      todo({ id: 'a', due_at: '2026-09-08T18:00:00+09:00', prep_start: '2026-09-05' }),
    ]
    expect(groupUpcoming(items, today, 7).overdue.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('writes a Korean one-line summary with counts and start_now titles', () => {
    const items = [
      todo({ id: 'x', title: '데이터 리서치', due_at: '2026-09-12T18:00:00+09:00', prep_start: '2026-09-09' }),
      todo({ id: 'y', title: '지난 것', due_at: '2026-09-01T18:00:00+09:00', prep_start: '2026-08-29' }),
    ]
    const { summary } = groupUpcoming(items, today, 7)
    expect(summary).toContain('2026-09-11')
    expect(summary).toContain('마감 지남 1')
    expect(summary).toContain('지금 준비 시작 1')
    expect(summary).toContain('데이터 리서치')
  })
})
