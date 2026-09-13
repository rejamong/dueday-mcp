// The "+" button / inline quick-add input shown in the corner of a calendar day cell.
// Reuses actions.addTodo (same POST /api/todos + state reload the top quick-add form uses) —
// tags, lead_days and goal are left for the server's classifier, so only { title, due } is sent.

import { createElement, showToast } from '../utils.js'

function renderAddButton(date, actions) {
  const btn = createElement(
    `<button type="button" class="cal-cell-add" data-date="${date}" aria-label="이 날에 할 일 추가">+</button>`,
  )
  btn.addEventListener('click', () => actions.calendarOpenQuickAdd(date))
  return btn
}

function renderInlineForm(date, actions) {
  const form = createElement(`
    <form class="cal-quick-add" data-date="${date}">
      <input type="text" class="cal-quick-add-input" placeholder="할 일 추가" aria-label="할 일 추가" />
    </form>
  `)
  const input = form.querySelector('.cal-quick-add-input')

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') actions.calendarCloseQuickAdd()
  })

  input.addEventListener('blur', () => {
    if (!input.disabled && input.value.trim() === '') actions.calendarCloseQuickAdd()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const title = input.value.trim()
    if (!title) return

    input.disabled = true
    try {
      await actions.addTodo({ title, due: date })
      actions.calendarCloseQuickAdd()
      showToast(`추가됨: ${title}`)
    } catch (err) {
      showToast(err.message || '추가에 실패했습니다', { error: true })
      input.disabled = false
      input.focus()
    }
  })

  queueMicrotask(() => input.focus())

  return form
}

/** The closed (+) or open (inline input) state for one day cell's quick-add control. */
export function renderCellAdd(date, state, actions) {
  return state.calendar.quickAddDay === date ? renderInlineForm(date, actions) : renderAddButton(date, actions)
}
