// Minimal observable store. Every update creates a brand-new state object (no mutation).

function initialState() {
  return {
    today: null,
    upcoming: null,
    todos: [],
    tags: [],
    filter: { tag: null, status: 'open', q: '' },
    loading: false,
    error: null,
    authenticated: null,
    loginError: null,
    menuOpenId: null,
    editingId: null,
    confirmDeleteId: null,
    focusMenuId: null,
  }
}

let state = initialState()
const listeners = new Set()

export function getState() {
  return state
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Shallow-merges `patch` into state and notifies subscribers. Always produces a new object. */
export function set(patch) {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

/** Convenience for updating the nested `filter` object immutably. */
export function setFilter(patch) {
  set({ filter: { ...state.filter, ...patch } })
}
