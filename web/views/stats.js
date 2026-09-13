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

/**
 * Overdue / start-now / later counts from the /api/upcoming payload: three cards on wide screens,
 * a single compact line on phones (CSS picks which one shows).
 */
export function render(state) {
  const upcoming = state.upcoming || { overdue: [], start_now: [], later: [] }
  const counts = [
    ['overdue', upcoming.overdue.length, '마감 지남'],
    ['start_now', upcoming.start_now.length, '지금 준비 시작'],
    ['later', upcoming.later.length, '7일 내 예정'],
  ]
  return createElement(`
    <div class="stats">
      <div class="stat-strip">${counts.map(([v, n, l]) => statCard(v, n, l)).join('')}</div>
      <p class="stat-line">${counts.map(([v, n, l]) => `<span class="stat-line-item stat-line-${v}">${l} <b>${n}</b></span>`).join('<span class="stat-line-sep">·</span>')}</p>
    </div>
  `)
}
