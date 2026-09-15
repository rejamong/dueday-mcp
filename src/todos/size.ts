/** 규모 (size): a 1–5 estimate of how big a todo is, used to derive how early preparation should start. */
export type Size = 1 | 2 | 3 | 4 | 5

export const SIZES: readonly Size[] = [1, 2, 3, 4, 5]

/** Short label per level, for chips and selects. */
export const SIZE_LABELS: Readonly<Record<Size, string>> = { 1: '반나절', 2: '이틀', 3: '일주일', 4: '2주', 5: '장기' }

/** Longer description per level, for tool descriptions and tooltips. */
export const SIZE_DESCRIPTIONS: Readonly<Record<Size, string>> = {
  1: '하루 미만', 2: '1~2일', 3: '3~7일', 4: '2주', 5: '2주 이상',
}

const SIZE_LEAD_DAYS: Readonly<Record<Size, number>> = { 1: 1, 2: 2, 3: 5, 4: 10, 5: 14 }

/** How many days before the due date preparation should start for a todo of this size. */
export function leadDaysForSize(size: Size): number {
  return SIZE_LEAD_DAYS[size]
}

export function isSize(value: unknown): value is Size {
  return typeof value === 'number' && (SIZES as readonly number[]).includes(value)
}

/** `1=하루 미만 / 2=1~2일 / …` for schema descriptions. */
export const SIZE_HELP = SIZES.map((s) => `${s}=${SIZE_DESCRIPTIONS[s]}`).join(' / ')
