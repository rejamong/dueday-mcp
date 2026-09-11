import { createElement } from '../utils.js'

const VIEWS = ['목록', '달력']

/** Segmented 목록/달력 control shown in the "전체 목록" section header. */
export function render(state, actions) {
  const buttons = VIEWS.map(
    (v) =>
      `<button type="button" class="btn toggle-btn view-toggle-btn ${state.view === v ? 'toggle-selected' : ''}" data-view="${v}">${v}</button>`,
  ).join('')

  const el = createElement(`<div class="view-toggle" role="group" aria-label="보기 전환">${buttons}</div>`)

  el.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => actions.setView(btn.dataset.view))
  })

  return el
}
