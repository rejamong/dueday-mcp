// 구분 (area): personal ("일상") vs work ("업무") classification for todos not tied to a goal.
// Mirrors src/todos/schemas.ts's areaSchema on the server.

export const AREA_LABELS = { personal: '일상', work: '업무' }

/** `일상`/`업무` for a valid area, otherwise null. */
export function areaLabel(area) {
  return Object.prototype.hasOwnProperty.call(AREA_LABELS, area) ? AREA_LABELS[area] : null
}
