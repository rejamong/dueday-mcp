import { describe, expect, it } from 'vitest'
import { normalizeEnrichmentOutput } from '../src/enrich/schema.js'

const base = {
  tags: ['업무'], goal: null, goal_confidence: 'low', lead_days: null, due: null, area: 'work', size: 3,
  promote_to_goal: null, reason: 'r',
}
const promotion = {
  title: '주 2회 달리기', kind: 'long', period_end: null, tag: 'running', why: '건강',
  metric: { name: '횟수', kind: 'count', direction: 'gte', target_value: 2, unit: '회' },
}

describe('normalizeEnrichmentOutput', () => {
  it('passes a well-formed response through unchanged', () => {
    expect(normalizeEnrichmentOutput({ ...base, promote_to_goal: promotion })).toEqual({ ...base, promote_to_goal: promotion })
  })

  it('drops only the promotion when its tag is not an ascii slug, keeping the rest', () => {
    const out = normalizeEnrichmentOutput({ ...base, promote_to_goal: { ...promotion, tag: '달리기' } })
    expect(out.promote_to_goal).toBeNull()
    expect(out.tags).toEqual(['업무'])
    expect(out.size).toBe(3)
    expect(out.area).toBe('work')
  })

  it('repairs a promotion tag that only needs slugging', () => {
    expect(normalizeEnrichmentOutput({ ...base, promote_to_goal: { ...promotion, tag: ' Weekly Running! ' } }).promote_to_goal?.tag).toBe('weekly-running')
  })

  it('nulls individual fields that are out of range or malformed instead of failing', () => {
    const out = normalizeEnrichmentOutput({
      ...base, due: '10월 7일', size: 9, lead_days: 400, area: 'office', goal_confidence: 'certain',
      tags: ['a', '', 'b', 'c', 'd'], reason: 'x'.repeat(500),
      promote_to_goal: { ...promotion, period_end: 'next month', kind: 'short' },
    })
    expect(out.due).toBeNull()
    expect(out.size).toBeNull()
    expect(out.lead_days).toBeNull()
    expect(out.area).toBeNull()
    expect(out.goal_confidence).toBe('low')
    expect(out.tags).toEqual(['a', 'b', 'c'])
    expect(out.reason).toHaveLength(200)
    expect(out.promote_to_goal).toBeNull()
  })

  it('throws only when the response is not an object at all', () => {
    expect(() => normalizeEnrichmentOutput(null)).toThrow()
    expect(() => normalizeEnrichmentOutput('nope')).toThrow()
  })
})
