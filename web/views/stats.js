import { createElement } from '../utils.js'

function statCard(variant, count, label) {
  return `
    <div class="stat-card stat-${variant}">
      <span class="stat-eyebrow">${variant.toUpperCase().replace('_', ' ')}</span>
      <span class="stat-number">${count}</span>
      <span class="stat-label">${label}</span>
    </div>
  `
}

/** Three-card strip: overdue / start-now / later counts, from the /api/upcoming payload. */
export function render(state) {
  const upcoming = state.upcoming || { overdue: [], start_now: [], later: [] }
  return createElement(`
    <div class="stat-strip">
      ${statCard('overdue', upcoming.overdue.length, '마감 지남')}
      ${statCard('start_now', upcoming.start_now.length, '지금 준비 시작')}
      ${statCard('later', upcoming.later.length, '7일 내 예정')}
    </div>
  `)
}
