import { createElement, escapeHtml } from '../utils.js'
import { render as renderRow } from './todo-row.js'
import { render as renderFilters } from './filters.js'
import { render as renderViewToggle } from './view-toggle.js'
import { render as renderCalendar } from './calendar.js'

/** Reusable heading + count + rows block, shared by all three list sections below. */
function buildSectionBlock({ heading, countHtml = '', rowElements = null, emptyText = '', extraEl, toggleEl }) {
  const section = createElement(`
    <section class="section">
      <div class="section-header">
        <div class="section-header-left">
          <h2 class="section-heading">${heading}</h2>
        </div>
        <span class="section-count">${countHtml}</span>
      </div>
      <div class="section-extra"></div>
    </section>
  `)

  if (toggleEl) section.querySelector('.section-header-left').appendChild(toggleEl)
  if (extraEl) section.querySelector('.section-extra').appendChild(extraEl)

  if (rowElements !== null) {
    const rowsContainer = createElement('<div class="section-rows"></div>')
    if (rowElements.length === 0) {
      rowsContainer.appendChild(createElement(`<div class="section-empty">${escapeHtml(emptyText)}</div>`))
    } else {
      for (const el of rowElements) rowsContainer.appendChild(el)
    }
    section.appendChild(rowsContainer)
  }
  return section
}

function matchesFilters(todo, filter) {
  if (filter.tag && !(todo.tags || []).includes(filter.tag)) return false
  if (filter.size !== null && filter.size !== undefined && todo.size !== filter.size) return false
  if (filter.q) {
    const q = filter.q.toLowerCase()
    const haystack = `${todo.title} ${todo.note ?? ''}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

function sortForStatus(todos, status) {
  const copy = [...todos]
  if (status === 'done') {
    copy.sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
  } else {
    copy.sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0
      if (!a.due_at) return 1
      if (!b.due_at) return -1
      return a.due_at.localeCompare(b.due_at)
    })
  }
  return copy
}

function startNowSection(state, actions) {
  const upcoming = state.upcoming || { overdue: [], start_now: [] }
  const rows = [...upcoming.overdue, ...upcoming.start_now]
  return buildSectionBlock({
    heading: '지금 준비 시작',
    countHtml: `${rows.length} · 마감 지남 ${upcoming.overdue.length}`,
    rowElements: rows.map((todo) => renderRow(todo, state, actions, 'startnow')),
    emptyText: '오늘 준비 시작할 일이 없음',
  })
}

function laterSection(state, actions) {
  const upcoming = state.upcoming || { later: [] }
  return buildSectionBlock({
    heading: '7일 내 예정',
    countHtml: `${upcoming.later.length} · 아직 준비 시작 전`,
    rowElements: upcoming.later.map((todo) => renderRow(todo, state, actions, 'later')),
    emptyText: '7일 내 예정된 일이 없음',
  })
}

function allListSection(state, actions) {
  const toggleEl = renderViewToggle(state, actions)

  if (state.view === '달력') {
    return buildSectionBlock({
      heading: '전체 목록',
      toggleEl,
      extraEl: renderCalendar(state, actions),
    })
  }

  const base = state.todos.filter((t) => matchesFilters(t, state.filter))
  const openCount = base.filter((t) => t.status === 'open').length
  const doneCount = base.filter((t) => t.status === 'done').length
  const cancelledCount = base.filter((t) => t.status === 'cancelled').length
  const visible = sortForStatus(
    base.filter((t) => t.status === state.filter.status),
    state.filter.status,
  )

  return buildSectionBlock({
    heading: '전체 목록',
    countHtml: `미완료 ${openCount} · 완료 ${doneCount} · 취소 ${cancelledCount}`,
    rowElements: visible.map((todo) => renderRow(todo, state, actions, 'all')),
    emptyText: '표시할 항목이 없음',
    extraEl: renderFilters(state, actions),
    toggleEl,
  })
}

/** Renders all three list sections (지금 준비 시작 / 7일 내 예정 / 전체 목록) as one fragment. */
export function render(state, actions) {
  const wrap = document.createElement('div')
  wrap.className = 'sections'
  wrap.appendChild(startNowSection(state, actions))
  wrap.appendChild(laterSection(state, actions))
  wrap.appendChild(allListSection(state, actions))
  return wrap
}
