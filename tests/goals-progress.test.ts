import { describe, expect, it } from 'vitest'
import { goalStatus, metricProgress, timePercent } from '../src/goals/progress.js'

const today = '2026-09-13'
const at = (d: string, v: number) => ({ value: v, logged_at: `${d}T10:00:00+09:00` })

describe('metricProgress', () => {
  it('count / gte accumulates increments toward the target', () => {
    const m = { kind: 'count', direction: 'gte', target_value: 15, baseline_value: null, cadence: null } as const
    const p = metricProgress(m, [at('2026-02-01', 1), at('2026-05-01', 3), at('2026-09-01', 2)], today)
    expect(p.current_value).toBe(6)
    expect(p.percent).toBe(40)
    expect(p.on_track).toBe(false)
    expect(metricProgress(m, [at('2026-01-01', 20)], today).percent).toBe(100)
  })

  it('value / gte uses the latest measurement, relative to the baseline when given', () => {
    const m = { kind: 'value', direction: 'gte', target_value: 20000, baseline_value: 12000, cadence: null } as const
    const p = metricProgress(m, [at('2026-03-01', 13000), at('2026-09-01', 16000)], today)
    expect(p.current_value).toBe(16000)
    expect(p.percent).toBe(50)
    const noBase = { ...m, baseline_value: null }
    expect(metricProgress(noBase, [at('2026-09-01', 5000)], today).percent).toBe(25)
    expect(metricProgress(m, [], today)).toMatchObject({ current_value: null, percent: 0, on_track: false })
  })

  it('value / lte is on track while the latest value stays within the limit', () => {
    const m = { kind: 'value', direction: 'lte', target_value: 76, baseline_value: null, cadence: null } as const
    expect(metricProgress(m, [at('2026-09-12', 75.4)], today)).toMatchObject({ current_value: 75.4, percent: 100, on_track: true })
    expect(metricProgress(m, [at('2026-09-12', 77.2)], today)).toMatchObject({ percent: 0, on_track: false })
  })

  it('count / lte is a budget: on track while the total stays within it', () => {
    const m = { kind: 'count', direction: 'lte', target_value: 3, baseline_value: null, cadence: null } as const
    expect(metricProgress(m, [at('2026-04-01', 1)], today)).toMatchObject({ current_value: 1, percent: 100, on_track: true, remaining: 2 })
    expect(metricProgress(m, [at('2026-04-01', 4)], today)).toMatchObject({ on_track: false, percent: 0, remaining: 0 })
  })

  it('boolean is 0 or 100 based on the latest check-in', () => {
    const m = { kind: 'boolean', direction: 'gte', target_value: 1, baseline_value: null, cadence: null } as const
    expect(metricProgress(m, [], today).percent).toBe(0)
    expect(metricProgress(m, [at('2026-05-20', 1)], today)).toMatchObject({ percent: 100, on_track: true })
  })

  it('monthly cadence reports whether this month has a check-in', () => {
    const m = { kind: 'count', direction: 'gte', target_value: 12, baseline_value: null, cadence: 'monthly' } as const
    expect(metricProgress(m, [at('2026-08-30', 1)], today).cadence_met).toBe(false)
    expect(metricProgress(m, [at('2026-09-02', 1)], today).cadence_met).toBe(true)
    expect(metricProgress({ ...m, cadence: null }, [], today).cadence_met).toBeNull()
  })
})

describe('timePercent / goalStatus', () => {
  it('computes elapsed fraction of the period, clamped', () => {
    expect(timePercent('2026-01-01', '2026-12-31', '2026-09-13')).toBe(70)
    expect(timePercent('2026-01-01', '2026-12-31', '2025-06-01')).toBe(0)
    expect(timePercent('2026-01-01', '2026-12-31', '2027-02-01')).toBe(100)
    expect(timePercent(null, null, '2026-09-13')).toBeNull()
  })

  it('derives ahead / on_track / behind / done / none', () => {
    expect(goalStatus({ percent: 100, time_percent: 70, status: 'active', has_signal: true })).toBe('done')
    expect(goalStatus({ percent: 40, time_percent: 70, status: 'done', has_signal: true })).toBe('done')
    expect(goalStatus({ percent: 85, time_percent: 70, status: 'active', has_signal: true })).toBe('ahead')
    expect(goalStatus({ percent: 65, time_percent: 70, status: 'active', has_signal: true })).toBe('on_track')
    expect(goalStatus({ percent: 40, time_percent: 70, status: 'active', has_signal: true })).toBe('behind')
    expect(goalStatus({ percent: 40, time_percent: null, status: 'active', has_signal: true })).toBe('on_track')
    expect(goalStatus({ percent: 0, time_percent: 70, status: 'active', has_signal: false })).toBe('none')
  })
})
