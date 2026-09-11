import { escapeHtml, createElement } from '../utils.js'
import { ddayLabel, prepLabel, monthDay, dayDiff } from '../dates.js'

/** Which badge variant a todo falls into, per the "지금 준비 시작"/"7일 내" rules. */
function badgeVariant(today, todo) {
  if (todo.status === 'done') return 'done'
  if (!todo.due_at) return 'none'
  const diff = dayDiff(today, todo.due_at)
  if (diff !== null && diff < 0) return 'overdue'
  if (todo.prep_start && todo.prep_start <= today) return 'start_now'
  return 'later'
}

function badgeText(today, todo, variant) {
  if (variant === 'done') return `완료 · ${monthDay(todo.done_at) ?? ''}`
  if (variant === 'none') return '마감 없음'
  return ddayLabel(today, todo.due_at)
}

function tagChips(tags) {
  if (!tags || tags.length === 0) return ''
  return `<div class="row-tags">${tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
}

/**
 * Renders one todo row. Unlike the other views this takes the specific `todo`
 * as its first argument (`state`/`actions` are still needed for today + the toggle action).
 */
export function render(todo, state, actions) {
  const variant = badgeVariant(state.today, todo)
  const prep = todo.status !== 'done' && todo.due_at ? prepLabel(todo.prep_start) : null
  const isDone = todo.status === 'done'

  const el = createElement(`
    <div class="todo-row" data-id="${escapeHtml(todo.id)}">
      <button
        type="button"
        class="row-check"
        aria-pressed="${isDone}"
        aria-label="${isDone ? '완료됨, 되돌리기' : '완료로 표시'}"
      ></button>
      <div class="row-text">
        <div class="row-title ${isDone ? 'is-done' : ''}">${escapeHtml(todo.title)}</div>
        ${tagChips(todo.tags)}
      </div>
      ${prep ? `<span class="row-prep">${escapeHtml(prep)}</span>` : '<span class="row-prep row-prep-empty"></span>'}
      <span class="due-badge badge-${variant}">${escapeHtml(badgeText(state.today, todo, variant))}</span>
      <button type="button" class="btn btn-ghost row-toggle">${isDone ? '되돌리기' : '완료'}</button>
    </div>
  `)

  const toggle = async () => {
    el.querySelectorAll('button').forEach((b) => (b.disabled = true))
    try {
      await actions.toggleComplete(todo)
    } finally {
      el.querySelectorAll('button').forEach((b) => (b.disabled = false))
    }
  }

  el.querySelector('.row-check').addEventListener('click', toggle)
  el.querySelector('.row-toggle').addEventListener('click', toggle)

  return el
}
