// 규모 (size): a 1–5 estimate of how big a todo is. Mirrors src/todos/size.ts on the server.

export const SIZES = [1, 2, 3, 4, 5]

/** Short label per level, for chips and selects. */
export const SIZE_LABELS = { 1: '반나절', 2: '이틀', 3: '일주일', 4: '2주', 5: '장기' }

/** Longer description per level, for tooltips. */
export const SIZE_DESCRIPTIONS = { 1: '하루 미만', 2: '1~2일', 3: '3~7일', 4: '2주', 5: '2주 이상' }

/** `일주일` for a valid 1–5 size, otherwise null. */
export function sizeLabel(size) {
  return Object.prototype.hasOwnProperty.call(SIZE_LABELS, size) ? SIZE_LABELS[size] : null
}
