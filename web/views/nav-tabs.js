import { createElement } from '../utils.js'

const TABS = [
  { route: 'today', label: '오늘', hash: '#/' },
  { route: 'goals', label: '목표', hash: '#/goals' },
]

/** Small tab row (오늘 | 목표) shown under the topbar on every page, driven by location.hash. */
export function render(state) {
  const buttons = TABS.map(
    (tab) =>
      `<button type="button" class="btn nav-tab ${state.route === tab.route ? 'btn-primary' : 'btn-ghost'}" data-hash="${tab.hash}">${tab.label}</button>`,
  ).join('')

  const el = createElement(`<nav class="nav-tabs container" aria-label="화면 전환">${buttons}</nav>`)

  el.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.hash
    })
  })

  return el
}
