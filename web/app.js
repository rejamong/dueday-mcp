import { api, ApiError } from './api.js'
import { getState, subscribe, set, setFilter, routeFromHash } from './state.js'
import { todayFromMeta, monthGrid, addDays, addMonths, defaultSelectedDay } from './dates.js'
import { showToast, saveView } from './utils.js'
import { fetchTodosInRange } from './calendar-data.js'
import { render as renderLogin } from './views/login.js'
import { render as renderTopbar } from './views/topbar.js'
import { render as renderNavTabs } from './views/nav-tabs.js'
import { render as renderQuickAdd } from './views/quick-add.js'
import { render as renderStats } from './views/stats.js'
import { render as renderSections } from './views/section.js'
import { render as renderGoalsPage } from './views/goals/goals-page.js'
import { goalActions, ensureGoalsPageLoaded } from './goals-actions.js'

const CALENDAR_TRAILING_DAYS = 60 // matches lead_days' max, so every prep_start inside the grid is fetched

const root = document.getElementById('app')

/** Loads upcoming/todos/tags/goals in parallel and stores the result. */
async function loadData() {
  set({ loading: true, error: null })
  try {
    const [upcomingRes, todosRes, tagsRes, goalsRes] = await Promise.all([
      api('/api/upcoming?days=7'),
      api('/api/todos?status=all&limit=100'),
      api('/api/tags'),
      api('/api/goals?status=active'),
    ])
    set({
      today: todayFromMeta(upcomingRes.meta),
      upcoming: upcomingRes.data,
      todos: todosRes.data,
      tags: tagsRes.data,
      goals: goalsRes.data,
      loading: false,
      authenticated: true,
    })
    ensureCalendarLoaded()
    ensureGoalsPageLoaded()
  } catch (err) {
    set({ loading: false, error: err.message })
    if (!(err instanceof ApiError && err.status === 401)) {
      showToast(err.message || '데이터를 불러오지 못했습니다', { error: true })
    }
  }
}

/** Reloads both the plain lists and (when a month is showing) the calendar's month. */
async function reloadAfterMutation() {
  await loadData()
  const { calendar } = getState()
  if (calendar.month) await loadCalendarMonth(calendar.month)
  ensureGoalsPageLoaded()
}

function calendarMonthFromToday() {
  const { today } = getState()
  return today ? today.slice(0, 7) : null
}

/** Fetches every todo whose due date could produce a chip anywhere in `month`'s grid. */
async function loadCalendarMonth(month) {
  const grid = monthGrid(month)
  const dueAfter = grid[0].date
  const dueBefore = addDays(grid[grid.length - 1].date, CALENDAR_TRAILING_DAYS)
  set({ calendar: { ...getState().calendar, loading: true } })
  try {
    const todos = await fetchTodosInRange(dueAfter, dueBefore)
    if (getState().calendar.month !== month) return // a later navigation superseded this fetch
    set({ calendar: { ...getState().calendar, todos, loading: false } })
  } catch (err) {
    set({ calendar: { ...getState().calendar, loading: false } })
    showToast(err.message || '달력 데이터를 불러오지 못했습니다', { error: true })
  }
}

/** Switches the visible calendar month, resetting the selected day, and (re)loads its data. */
function setCalendarMonth(month) {
  if (!month) return
  const { calendar, today } = getState()
  set({ calendar: { ...calendar, month, selectedDay: defaultSelectedDay(month, today) } })
  void loadCalendarMonth(month)
}

/** On boot/login, if 달력 was the persisted view, load its month now that `today` is known. */
function ensureCalendarLoaded() {
  const { view, calendar } = getState()
  if (view === '달력' && !calendar.month) setCalendarMonth(calendarMonthFromToday())
}

const actions = {
  async login(password) {
    try {
      await api('/login', { method: 'POST', body: { password } })
      set({ loginError: null, authenticated: true })
      await loadData()
    } catch (err) {
      const message = err instanceof ApiError && err.status === 401 ? '비밀번호가 올바르지 않습니다' : err.message
      set({ loginError: message })
    }
  },

  async logout() {
    try {
      await api('/logout', { method: 'POST' })
    } catch (err) {
      showToast(err.message || '로그아웃에 실패했습니다', { error: true })
    }
    set({
      authenticated: false,
      upcoming: null,
      todos: [],
      tags: [],
      menuOpenId: null,
      editingId: null,
      confirmDeleteId: null,
      focusMenuId: null,
      goals: [],
      goalDetails: {},
      expandedGoalIds: [],
      checkinOpenGoalId: null,
      addGoalFormOpen: false,
      unlinkedTodos: null,
      pendingGoal: null,
    })
  },

  async addTodo(payload) {
    await api('/api/todos', { method: 'POST', body: payload })
    await reloadAfterMutation()
  },

  async toggleComplete(todo) {
    try {
      await api(`/api/todos/${todo.id}/complete`, {
        method: 'POST',
        body: { reopen: todo.status === 'done' },
      })
      await reloadAfterMutation()
    } catch (err) {
      showToast(err.message || '처리에 실패했습니다', { error: true })
    }
  },

  setFilter(patch) {
    setFilter(patch)
  },

  /** Switches between 목록/달력, persisting the choice and loading the month the first time. */
  setView(view) {
    saveView(view)
    set({ view })
    ensureCalendarLoaded()
  },

  ...goalActions,

  calendarPrevMonth() {
    setCalendarMonth(addMonths(getState().calendar.month, -1))
  },

  calendarNextMonth() {
    setCalendarMonth(addMonths(getState().calendar.month, 1))
  },

  calendarGoToday() {
    setCalendarMonth(calendarMonthFromToday())
  },

  calendarSelectDay(date) {
    set({ calendar: { ...getState().calendar, selectedDay: date } })
  },

  toggleMenu(id) {
    const { menuOpenId } = getState()
    set({ menuOpenId: menuOpenId === id ? null : id })
  },

  closeMenu() {
    set({ menuOpenId: null })
  },

  startEdit(id) {
    set({ menuOpenId: null, editingId: id })
  },

  cancelEdit() {
    const { editingId } = getState()
    set({ editingId: null, focusMenuId: editingId })
  },

  /** PATCHes only the changed fields, reloads, then closes the editor and returns focus to ⋯. */
  async saveEdit(id, patch) {
    const { editingId } = getState()
    await api(`/api/todos/${id}`, { method: 'PATCH', body: patch })
    await reloadAfterMutation()
    set({ editingId: null, focusMenuId: editingId })
    showToast('저장됨')
  },

  clearFocusMenu() {
    set({ focusMenuId: null })
  },

  startDelete(id) {
    set({ menuOpenId: null, confirmDeleteId: id })
  },

  cancelDeleteConfirm() {
    set({ confirmDeleteId: null })
  },

  async deleteTodo(id) {
    try {
      await api(`/api/todos/${id}`, { method: 'DELETE' })
      await reloadAfterMutation()
      set({ confirmDeleteId: null })
      showToast('삭제됨')
    } catch (err) {
      showToast(err.message || '삭제에 실패했습니다', { error: true })
      throw err
    }
  },

  async cancelTodo(id) {
    try {
      await api(`/api/todos/${id}/cancel`, { method: 'POST', body: {} })
      await reloadAfterMutation()
      set({ menuOpenId: null })
      showToast('취소됨 — 전체 목록의 취소 탭에서 되살릴 수 있어요')
    } catch (err) {
      showToast(err.message || '취소에 실패했습니다', { error: true })
    }
  },

  async restoreTodo(id) {
    try {
      await api(`/api/todos/${id}/cancel`, { method: 'POST', body: { reopen: true } })
      await reloadAfterMutation()
      set({ menuOpenId: null })
      showToast('되살림')
    } catch (err) {
      showToast(err.message || '되살리기에 실패했습니다', { error: true })
    }
  },
}

/** Closes the open row menu when a pointerdown lands outside its popover. */
function handleOutsidePointerDown(event) {
  const { menuOpenId } = getState()
  if (!menuOpenId) return
  const wrap = document.querySelector(`.todo-row[data-row-key="${menuOpenId}"] .row-menu-wrap`)
  if (wrap && !wrap.contains(event.target)) actions.closeMenu()
}

/** Esc dismisses the open row menu or an open delete-confirmation (the inline editor handles its own Esc). */
function handleGlobalEscape(event) {
  if (event.key !== 'Escape') return
  const { menuOpenId, confirmDeleteId } = getState()
  if (menuOpenId) actions.closeMenu()
  else if (confirmDeleteId) actions.cancelDeleteConfirm()
}

function renderTodayContent(state) {
  const content = document.createElement('div')
  content.className = 'container main-content'
  content.appendChild(renderQuickAdd(state, actions))
  content.appendChild(renderStats(state, actions))
  content.appendChild(renderSections(state, actions))
  return content
}

function renderGoalsContent(state) {
  const content = document.createElement('div')
  content.className = 'container main-content'
  content.appendChild(renderGoalsPage(state, actions))
  return content
}

function renderApp(state) {
  root.innerHTML = ''
  root.classList.toggle('is-loading', state.loading)

  if (!state.authenticated) {
    root.appendChild(renderLogin(state, actions))
    return
  }

  root.appendChild(renderTopbar(state, actions))
  root.appendChild(renderNavTabs(state))
  root.appendChild(state.route === 'goals' ? renderGoalsContent(state) : renderTodayContent(state))
}

/** Checks the session cookie and, when present, loads the initial dataset. */
async function bootstrap() {
  try {
    const res = await api('/api/session')
    set({ authenticated: Boolean(res.data && res.data.authenticated), today: todayFromMeta(res.meta) })
    if (getState().authenticated) await loadData()
  } catch {
    set({ authenticated: false })
  }
}

window.addEventListener('dueday:unauthorized', () => {
  set({ authenticated: false, loginError: null })
})

/** Applies a hash change to state.route, loading that tab's data the first time it's shown. */
function handleHashChange() {
  set({ route: routeFromHash() })
  ensureGoalsPageLoaded()
}

window.addEventListener('pointerdown', handleOutsidePointerDown, true)
window.addEventListener('keydown', handleGlobalEscape)
window.addEventListener('hashchange', handleHashChange)

subscribe(renderApp)
renderApp(getState())
void bootstrap()
