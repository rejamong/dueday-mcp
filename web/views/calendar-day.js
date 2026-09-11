import { createElement, escapeHtml } from '../utils.js'
import { formatDayHeading, toDateOnly } from '../dates.js'
import { render as renderRow } from './todo-row.js'

function dueTodosForDay(todos, day) {
  return todos.filter((t) => t.status !== 'cancelled' && toDateOnly(t.due_at) === day)
}

function prepTodosForDay(todos, day) {
  return todos.filter((t) => t.status === 'open' && toDateOnly(t.prep_start) === day)
}

function countsLine(dueTodos, prepTodos) {
  const doneCount = dueTodos.filter((t) => t.status === 'done').length
  return `마감 ${dueTodos.length} · 완료 ${doneCount} · 준비 시작 ${prepTodos.length}`
}

function rowsBlock(todos, state, actions, sectionKey) {
  const wrap = createElement('<div class="calendar-day-rows"></div>')
  for (const todo of todos) wrap.appendChild(renderRow(todo, state, actions, sectionKey))
  return wrap
}

/** Heading + counts + todo rows for the selected calendar day (due that day, then prep-starting that day). */
export function render(state, actions) {
  const day = state.calendar.selectedDay
  const el = createElement('<div class="calendar-day-list"></div>')
  if (!day) return el

  const todos = state.calendar.todos
  const dueTodos = dueTodosForDay(todos, day)
  const prepTodos = prepTodosForDay(todos, day)

  el.appendChild(
    createElement(`
      <div class="calendar-day-heading">
        <h3 class="calendar-day-title">${escapeHtml(formatDayHeading(day))}</h3>
        <span class="calendar-day-counts">${escapeHtml(countsLine(dueTodos, prepTodos))}</span>
      </div>
    `),
  )

  if (dueTodos.length === 0 && prepTodos.length === 0) {
    el.appendChild(createElement('<div class="calendar-day-empty">이 날은 비어 있음</div>'))
    return el
  }

  if (dueTodos.length > 0) el.appendChild(rowsBlock(dueTodos, state, actions, 'day'))

  if (prepTodos.length > 0) {
    el.appendChild(createElement('<div class="calendar-day-subheading">이 날 준비 시작</div>'))
    el.appendChild(rowsBlock(prepTodos, state, actions, 'day-prep'))
  }

  return el
}
