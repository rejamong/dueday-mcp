import { describe, expect, it } from 'vitest'
import { addDays, parseDue, prepStart, seoulDate, todayInSeoul } from '../src/todos/dates.js'
import { ValidationError } from '../src/errors.js'

describe('dates (Asia/Seoul)', () => {
  it('parseDue turns a date-only input into 18:00 KST', () => {
    expect(parseDue('2026-09-18')).toBe('2026-09-18T18:00:00+09:00')
  })

  it('parseDue normalizes an RFC3339 instant to the +09:00 offset', () => {
    expect(parseDue('2026-09-18T03:30:00Z')).toBe('2026-09-18T12:30:00+09:00')
    expect(parseDue('2026-09-18T23:00:00-05:00')).toBe('2026-09-19T13:00:00+09:00')
  })

  it('parseDue rejects garbage and impossible dates', () => {
    expect(() => parseDue('next friday')).toThrow(ValidationError)
    expect(() => parseDue('2026-02-30')).toThrow(ValidationError)
    expect(() => parseDue('')).toThrow(ValidationError)
  })

  it('seoulDate and todayInSeoul roll the day over at 15:00 UTC', () => {
    expect(seoulDate(new Date('2026-09-11T14:59:59Z'))).toBe('2026-09-11')
    expect(seoulDate(new Date('2026-09-11T15:00:00Z'))).toBe('2026-09-12')
    expect(todayInSeoul(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01')
  })

  it('prepStart subtracts lead_days from the due date', () => {
    expect(prepStart('2026-09-18T18:00:00+09:00', 3)).toBe('2026-09-15')
    expect(prepStart('2026-09-01T18:00:00+09:00', 5)).toBe('2026-08-27')
    expect(prepStart('2026-09-18T18:00:00+09:00', 0)).toBe('2026-09-18')
  })

  it('addDays handles month and year boundaries', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
