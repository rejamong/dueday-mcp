import { escapeHtml, createElement } from '../../utils.js'
import { monthDay } from '../../dates.js'
import { render as renderTodoRow } from '../todo-row.js'

function checkinItemHtml(checkin) {
  const parts = [monthDay(checkin.logged_at) ?? '', checkin.metric_name, String(checkin.value)]
  if (checkin.note) parts.push(checkin.note)
  return `<li class="goal-checkin-item">${parts.map(escapeHtml).join(' · ')}</li>`
}

function checkinsBlock(detail) {
  if (detail.checkins.length === 0) {
    return createElement('<p class="goal-detail-empty">아직 체크인이 없음</p>')
  }
  return createElement(`<ul class="goal-detail-checkins">${detail.checkins.map(checkinItemHtml).join('')}</ul>`)
}

function todosBlock(detail, state, actions) {
  const wrap = createElement('<div class="goal-detail-todos"></div>')
  if (detail.open_todos.length === 0) {
    wrap.appendChild(createElement('<p class="goal-detail-empty">열린 할 일이 없음</p>'))
  } else {
    for (const todo of detail.open_todos) wrap.appendChild(renderTodoRow(todo, state, actions, 'goal'))
  }
  return wrap
}

/** Expanded 자세히 panel: recent check-ins + open todos + a shortcut to add a todo for this goal. */
export function render(goal, state, actions) {
  const detail = state.goalDetails[goal.id]

  const el = createElement(`
    <div class="goal-detail">
      <div class="goal-detail-checkins-wrap">
        <h4 class="goal-detail-heading">최근 체크인</h4>
      </div>
      <div class="goal-detail-todos-wrap">
        <h4 class="goal-detail-heading">할 일</h4>
      </div>
      <button type="button" class="btn btn-ghost goal-detail-add-todo">+ 할 일 추가</button>
    </div>
  `)

  if (!detail) {
    el.querySelector('.goal-detail-checkins-wrap').appendChild(createElement('<p class="goal-detail-empty">불러오는 중…</p>'))
  } else {
    el.querySelector('.goal-detail-checkins-wrap').appendChild(checkinsBlock(detail))
    el.querySelector('.goal-detail-todos-wrap').appendChild(todosBlock(detail, state, actions))
  }

  el.querySelector('.goal-detail-add-todo').addEventListener('click', () => {
    actions.startAddTodoForGoal(goal)
  })

  return el
}
