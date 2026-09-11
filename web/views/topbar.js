import { createElement } from '../utils.js'
import { formatTodayLine } from '../dates.js'

/** Wordmark + tagline on the left, today's date + logout button on the right. */
export function render(state, actions) {
  const el = createElement(`
    <header class="topbar">
      <div class="container topbar-inner">
        <div class="topbar-left">
          <span class="wordmark">dueday<span class="wordmark-dot"></span></span>
          <span class="tagline">마감보다 준비 시작일을 먼저</span>
        </div>
        <div class="topbar-right">
          <span class="today-line">${formatTodayLine(state.today)}</span>
          <button type="button" class="btn btn-ghost logout-btn">로그아웃</button>
        </div>
      </div>
    </header>
  `)

  el.querySelector('.logout-btn').addEventListener('click', () => {
    void actions.logout()
  })

  return el
}
