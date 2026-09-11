import { createElement, escapeHtml } from '../utils.js'
import { monthGrid, formatMonthTitle, toDateOnly } from '../dates.js'
import { badgeVariant } from './todo-row.js'
import { render as renderCalendarDay } from './calendar-day.js'

const WEEKDAY_HEADERS = ['월', '화', '수', '목', '금', '토', '일']
const MAX_CHIPS = 3
const LEGEND = '마감 칩 · ▷ 준비 시작 · 색: 지남 / 준비 시작 / 예정 / 완료'

/** Groups visible todos by due date, dropping cancelled ones (never shown as due chips). */
function groupByDueDate(todos) {
  const map = new Map()
  for (const todo of todos) {
    const date = toDateOnly(todo.due_at)
    if (!date || todo.status === 'cancelled') continue
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(todo)
  }
  return map
}

/** Groups open todos by prep_start date (only open todos get a prep chip). */
function groupByPrepDate(todos) {
  const map = new Map()
  for (const todo of todos) {
    const date = toDateOnly(todo.prep_start)
    if (!date || todo.status !== 'open') continue
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(todo)
  }
  return map
}

function dueChipHtml(today, todo) {
  const variant = badgeVariant(today, todo)
  return `<span class="cal-chip cal-chip-${variant}" title="${escapeHtml(todo.title)}">${escapeHtml(todo.title)}</span>`
}

function prepChipHtml(todo) {
  const text = `▷ 준비 · ${todo.title}`
  return `<span class="cal-chip cal-chip-prep" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`
}

function cellChipsHtml(date, dueMap, prepMap, today) {
  const chips = [...(dueMap.get(date) || []).map((t) => dueChipHtml(today, t)), ...(prepMap.get(date) || []).map(prepChipHtml)]
  const visible = chips.slice(0, MAX_CHIPS)
  const overflow = chips.length - visible.length
  return visible.join('') + (overflow > 0 ? `<span class="cal-chip-more">+${overflow}</span>` : '')
}

function cellHtml(cell, state, dueMap, prepMap) {
  const { date, inMonth } = cell
  const day = Number(date.slice(8, 10))
  const month = Number(date.slice(5, 7))
  const classes = ['cal-cell']
  if (!inMonth) classes.push('cal-cell-outside')
  if (date === state.today) classes.push('cal-cell-today')
  if (date === state.calendar.selectedDay) classes.push('cal-cell-selected')

  return `
    <button type="button" class="${classes.join(' ')}" data-date="${date}" aria-label="${month}월 ${day}일">
      <span class="cal-cell-day">${day}</span>
      <div class="cal-cell-chips">${cellChipsHtml(date, dueMap, prepMap, state.today)}</div>
    </button>
  `
}

/** Toolbar (month nav + legend/오늘) + the Monday-start month grid + the selected-day list. */
export function render(state, actions) {
  const month = state.calendar.month
  const grid = month ? monthGrid(month) : []
  const dueMap = groupByDueDate(state.calendar.todos)
  const prepMap = groupByPrepDate(state.calendar.todos)

  const weekdaysHtml = WEEKDAY_HEADERS.map((w, i) => `<div class="cal-weekday ${i === 6 ? 'cal-weekday-sun' : ''}">${w}</div>`).join('')
  const cellsHtml = grid.map((cell) => cellHtml(cell, state, dueMap, prepMap)).join('')

  const el = createElement(`
    <div class="calendar-block ${state.calendar.loading ? 'is-loading' : ''}">
      <div class="calendar-toolbar">
        <div class="calendar-toolbar-nav">
          <button type="button" class="btn btn-ghost cal-nav-btn" data-nav="prev" aria-label="이전 달">‹</button>
          <span class="calendar-title">${month ? escapeHtml(formatMonthTitle(month)) : ''}</span>
          <button type="button" class="btn btn-ghost cal-nav-btn" data-nav="next" aria-label="다음 달">›</button>
        </div>
        <div class="calendar-toolbar-right">
          <span class="calendar-legend">${escapeHtml(LEGEND)}</span>
          <button type="button" class="btn btn-ghost calendar-today-btn">오늘</button>
        </div>
      </div>
      <div class="calendar-weekdays">${weekdaysHtml}</div>
      <div class="calendar-cells">${cellsHtml}</div>
    </div>
  `)

  el.querySelector('[data-nav="prev"]').addEventListener('click', () => actions.calendarPrevMonth())
  el.querySelector('[data-nav="next"]').addEventListener('click', () => actions.calendarNextMonth())
  el.querySelector('.calendar-today-btn').addEventListener('click', () => actions.calendarGoToday())
  el.querySelectorAll('.cal-cell').forEach((btn) => {
    btn.addEventListener('click', () => actions.calendarSelectDay(btn.dataset.date))
  })

  el.appendChild(renderCalendarDay(state, actions))

  return el
}
