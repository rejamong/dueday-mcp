// Minimal observable store. Every update creates a brand-new state object (no mutation).

import { loadView } from './utils.js'

/** Maps the current URL hash to a route name. Only '#/goals' is special; anything else is 'today'. */
export function routeFromHash() {
  return location.hash === '#/goals' ? 'goals' : 'today'
}

function initialState() {
  return {
    route: routeFromHash(),
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
    view: loadView(),
    calendar: { month: null, todos: [], selectedDay: null, loading: false },
    goals: [],
    goalsLoading: false,
    goalDetails: {},
    expandedGoalIds: [],
    checkinOpenGoalId: null,
    addGoalFormOpen: false,
    addGoalPresetKind: null,
    unlinkedTodos: null,
    pendingGoal: null,
    suggestions: [],
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
