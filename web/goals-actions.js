// Data loading + user actions for the 목표 (goals) page. Split out of app.js to keep that
// file focused on the today-screen flow; both modules share the same state.js singleton.

import { api, listSuggestions, acceptSuggestion as acceptSuggestionApi, dismissSuggestion as dismissSuggestionApi } from './api.js'
import { getState, set } from './state.js'
import { showToast } from './utils.js'

/** Refetches just the todos linked to no goal (일상), for the goals page's summary line. */
export async function loadUnlinkedTodos() {
  try {
    const res = await api('/api/todos?goal=none&status=all&limit=100')
    set({ unlinkedTodos: res.data })
  } catch (err) {
    showToast(err.message || '일상 할 일을 불러오지 못했습니다', { error: true })
  }
}

/**
 * Loads AI 목표 제안 목록. The server-side feature is optional (no classifier configured), so a
 * 404 or network error is treated as "no suggestions" rather than surfaced as an error toast.
 */
export async function loadSuggestions() {
  try {
    const res = await listSuggestions()
    set({ suggestions: res.data })
  } catch {
    set({ suggestions: [] })
  }
}

/** On boot/login/tab-switch, loads the goals-page-only data once the 목표 tab is showing. */
export function ensureGoalsPageLoaded() {
  if (getState().route === 'goals') {
    void loadUnlinkedTodos()
    void loadSuggestions()
  }
}

/** Replaces one goal in state.goals with a fresher copy (e.g. after a check-in), immutably. */
function replaceGoal(updatedGoal) {
  const { goals } = getState()
  set({ goals: goals.map((g) => (g.id === updatedGoal.id ? updatedGoal : g)) })
}

/** Fetches a goal's detail (checkins + open todos) and caches it, keyed by id. */
async function loadGoalDetail(goal) {
  try {
    const res = await api(`/api/goals/${encodeURIComponent(goal.tag)}`)
    const { goalDetails } = getState()
    set({ goalDetails: { ...goalDetails, [goal.id]: res.data } })
  } catch (err) {
    showToast(err.message || '목표 상세 정보를 불러오지 못했습니다', { error: true })
  }
}

export const goalActions = {
  /** Switches the 오늘/목표 tab by updating the URL hash; the hashchange listener applies the route. */
  navigate(route) {
    location.hash = route === 'goals' ? '#/goals' : '#/'
  },

  openAddGoalForm(presetKind = null) {
    set({ addGoalFormOpen: true, addGoalPresetKind: presetKind })
  },

  closeAddGoalForm() {
    set({ addGoalFormOpen: false, addGoalPresetKind: null })
  },

  async addGoal(payload) {
    await api('/api/goals', { method: 'POST', body: payload })
    const res = await api('/api/goals?status=active')
    set({ goals: res.data, addGoalFormOpen: false, addGoalPresetKind: null })
    showToast(`목표 추가됨: ${payload.title}`)
  },

  toggleCheckin(goalId) {
    const { checkinOpenGoalId } = getState()
    set({ checkinOpenGoalId: checkinOpenGoalId === goalId ? null : goalId })
  },

  /** POSTs a check-in, swaps the card's goal data for the fresher server copy, and refreshes an open detail panel. */
  async submitCheckin(goal, body) {
    const res = await api(`/api/goals/${encodeURIComponent(goal.tag)}/checkins`, { method: 'POST', body })
    replaceGoal(res.data.goal)
    set({ checkinOpenGoalId: null })
    showToast(`기록됨: ${res.data.metric.name} ${body.value}`)
    if (getState().expandedGoalIds.includes(goal.id)) await loadGoalDetail(res.data.goal)
  },

  /** Toggles a card's 자세히 panel, fetching its detail (checkins + open todos) the first time it opens. */
  toggleGoalDetail(goal) {
    const { expandedGoalIds, goalDetails } = getState()
    const isOpen = expandedGoalIds.includes(goal.id)
    set({ expandedGoalIds: isOpen ? expandedGoalIds.filter((id) => id !== goal.id) : [...expandedGoalIds, goal.id] })
    if (!isOpen && !goalDetails[goal.id]) void loadGoalDetail(goal)
  },

  /** Sends the user to the today screen with this goal preselected in the quick-add chip. */
  startAddTodoForGoal(goal) {
    set({ pendingGoal: { tag: goal.tag, title: goal.title } })
    location.hash = '#/'
  },

  clearPendingGoal() {
    set({ pendingGoal: null })
  },

  /** Accepts an AI suggestion as a new goal, then refreshes both goals and the suggestion list. */
  async acceptSuggestion(id) {
    await acceptSuggestionApi(id)
    const res = await api('/api/goals?status=active')
    set({ goals: res.data })
    await loadSuggestions()
    showToast('목표로 등록했습니다')
  },

  /** Dismisses an AI suggestion, removing it from state immediately. */
  async dismissSuggestion(id) {
    await dismissSuggestionApi(id)
    const { suggestions } = getState()
    set({ suggestions: suggestions.filter((s) => s.id !== id) })
    showToast('제안을 지웠습니다')
  },
}
