// 규모 (size): a 1–6 estimate of how big a todo is. Mirrors src/todos/size.ts on the server.

export const SIZES = [1, 2, 3, 4, 5, 6]

/** Short label per level, for chips and selects. */
export const SIZE_LABELS = { 1: '한 시간', 2: '반나절', 3: '이틀', 4: '일주일', 5: '2주', 6: '장기' }

/** Longer description per level, for tooltips. */
export const SIZE_DESCRIPTIONS = { 1: '1시간 미만', 2: '하루 미만', 3: '1~2일', 4: '3~7일', 5: '2주', 6: '2주 이상' }

/** `일주일` for a valid 1–6 size, otherwise null. */
export function sizeLabel(size) {
  return Object.prototype.hasOwnProperty.call(SIZE_LABELS, size) ? SIZE_LABELS[size] : null
}
