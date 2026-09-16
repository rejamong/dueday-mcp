import { createElement } from '../../utils.js'

function countsText(unlinkedTodos, today) {
  if (!unlinkedTodos) return ''
  const open = unlinkedTodos.filter((t) => t.status === 'open')
  const personal = open.filter((t) => t.area === 'personal').length
  const work = open.filter((t) => t.area === 'work').length
  const unset = open.filter((t) => !t.area).length
  const month = today ? today.slice(0, 7) : ''
  const doneThisMonth = unlinkedTodos.filter((t) => t.status === 'done' && (t.done_at || '').slice(0, 7) === month).length
  return ` — 일상 ${personal} · 업무 ${work} · 미구분 ${unset} (열림 기준) · 이번 달 완료 ${doneThisMonth}`
}

/** "목표 없음" summary line: todos not linked to any goal, split by 구분, with a shortcut back to the today screen. */
export function render(state, actions) {
  const el = createElement(`
    <p class="daily-line">
      <span class="daily-line-text">목표 없음${countsText(state.unlinkedTodos, state.today)}</span>
      <button type="button" class="btn btn-ghost daily-line-link">오늘 화면에서 보기</button>
    </p>
  `)

  el.querySelector('.daily-line-link').addEventListener('click', () => actions.navigate('today'))

  return el
}
