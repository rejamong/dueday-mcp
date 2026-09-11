import { api, ApiError } from './api.js'
import { getState, subscribe, set, setFilter } from './state.js'
import { todayFromMeta } from './dates.js'
import { showToast } from './utils.js'
import { render as renderLogin } from './views/login.js'
import { render as renderTopbar } from './views/topbar.js'
import { render as renderQuickAdd } from './views/quick-add.js'
import { render as renderStats } from './views/stats.js'
import { render as renderSections } from './views/section.js'

const root = document.getElementById('app')

/** Loads upcoming/todos/tags in parallel and stores the result. */
async function loadData() {
  set({ loading: true, error: null })
  try {
    const [upcomingRes, todosRes, tagsRes] = await Promise.all([
      api('/api/upcoming?days=7'),
      api('/api/todos?status=all&limit=100'),
      api('/api/tags'),
    ])
    set({
      today: todayFromMeta(upcomingRes.meta),
      upcoming: upcomingRes.data,
      todos: todosRes.data,
      tags: tagsRes.data,
      loading: false,
      authenticated: true,
    })
  } catch (err) {
    set({ loading: false, error: err.message })
    if (!(err instanceof ApiError && err.status === 401)) {
      showToast(err.message || '데이터를 불러오지 못했습니다', { error: true })
    }
  }
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
    })
  },

  async addTodo(payload) {
    await api('/api/todos', { method: 'POST', body: payload })
    await loadData()
  },

  async toggleComplete(todo) {
    try {
      await api(`/api/todos/${todo.id}/complete`, {
        method: 'POST',
        body: { reopen: todo.status === 'done' },
      })
      await loadData()
    } catch (err) {
      showToast(err.message || '처리에 실패했습니다', { error: true })
    }
  },

  setFilter(patch) {
    setFilter(patch)
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
    await loadData()
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
      await loadData()
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
      await loadData()
      set({ menuOpenId: null })
      showToast('취소됨 — 전체 목록의 취소 탭에서 되살릴 수 있어요')
    } catch (err) {
      showToast(err.message || '취소에 실패했습니다', { error: true })
    }
  },

  async restoreTodo(id) {
    try {
      await api(`/api/todos/${id}/cancel`, { method: 'POST', body: { reopen: true } })
      await loadData()
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

function renderApp(state) {
  root.innerHTML = ''
  root.classList.toggle('is-loading', state.loading)

  if (!state.authenticated) {
    root.appendChild(renderLogin(state, actions))
    return
  }

  root.appendChild(renderTopbar(state, actions))

  const content = document.createElement('div')
  content.className = 'container main-content'
  content.appendChild(renderQuickAdd(state, actions))
  content.appendChild(renderStats(state, actions))
  content.appendChild(renderSections(state, actions))
  root.appendChild(content)
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

window.addEventListener('pointerdown', handleOutsidePointerDown, true)
window.addEventListener('keydown', handleGlobalEscape)

subscribe(renderApp)
renderApp(getState())
void bootstrap()
