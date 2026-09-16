/** 규모 (size): a 1–6 estimate of how big a todo is, used to derive how early preparation should start. */
export type Size = 1 | 2 | 3 | 4 | 5 | 6

export const SIZES: readonly Size[] = [1, 2, 3, 4, 5, 6]

/** Short label per level, for chips and selects. */
export const SIZE_LABELS: Readonly<Record<Size, string>> = { 1: '한 시간', 2: '반나절', 3: '이틀', 4: '일주일', 5: '2주', 6: '장기' }

/** Longer description per level, for tool descriptions and tooltips. */
export const SIZE_DESCRIPTIONS: Readonly<Record<Size, string>> = {
  1: '1시간 미만', 2: '하루 미만', 3: '1~2일', 4: '3~7일', 5: '2주', 6: '2주 이상',
}

/** Size 1 (under an hour) needs no run-up: preparation starts on the due day itself. */
const SIZE_LEAD_DAYS: Readonly<Record<Size, number>> = { 1: 0, 2: 1, 3: 2, 4: 5, 5: 10, 6: 14 }

/** How many days before the due date preparation should start for a todo of this size. */
export function leadDaysForSize(size: Size): number {
  return SIZE_LEAD_DAYS[size]
}

export function isSize(value: unknown): value is Size {
  return typeof value === 'number' && (SIZES as readonly number[]).includes(value)
}

/** `1=1시간 미만 / 2=하루 미만 / …` for schema descriptions. */
export const SIZE_HELP = SIZES.map((s) => `${s}=${SIZE_DESCRIPTIONS[s]}`).join(' / ')

export type TimePressure = 'tight' | 'critical'

/**
 * Whether `remainingDays` (calendar days until due; 0 = due today) is short for a todo of this size:
 * 'tight' when fewer days remain than the size's preparation window, 'critical' at half that or less.
 * Null for overdue (its own state), unknown size, or size 1 (nothing to prepare).
 */
export function timePressure(size: unknown, remainingDays: number): TimePressure | null {
  if (!isSize(size) || remainingDays < 0) return null
  const required = leadDaysForSize(size)
  if (required === 0) return null
  if (remainingDays <= Math.floor(required / 2)) return 'critical'
  if (remainingDays < required) return 'tight'
  return null
}
