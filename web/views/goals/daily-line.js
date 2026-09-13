import { createElement } from '../../utils.js'

function countsText(unlinkedTodos, today) {
  if (!unlinkedTodos) return ''
  const open = unlinkedTodos.filter((t) => t.status === 'open').length
  const month = today ? today.slice(0, 7) : ''
  const doneThisMonth = unlinkedTodos.filter((t) => t.status === 'done' && (t.done_at || '').slice(0, 7) === month).length
  return `: 열림 ${open} · 이번 달 완료 ${doneThisMonth}`
}

/** "일상" summary line: todos not linked to any goal, with a shortcut back to the today screen. */
export function render(state, actions) {
  const el = createElement(`
    <p class="daily-line">
      <span class="daily-line-text">일상 (목표에 연결되지 않은 할 일)${countsText(state.unlinkedTodos, state.today)}</span>
      <button type="button" class="btn btn-ghost daily-line-link">오늘 화면에서 보기</button>
    </p>
  `)

  el.querySelector('.daily-line-link').addEventListener('click', () => actions.navigate('today'))

  return el
}
