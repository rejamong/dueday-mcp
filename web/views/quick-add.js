import { createElement, escapeHtml, showToast } from '../utils.js'

function parseTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** 목표 select options: every non-일상, non-life goal, defaulting to 일상. */
function goalSelectHtml(goals) {
  const options = goals
    .filter((g) => g.kind !== 'life')
    .map((g) => `<option value="${escapeHtml(g.tag)}">${escapeHtml(g.title)}</option>`)
    .join('')
  return `
    <label class="visually-hidden" for="qa-goal">목표</label>
    <select id="qa-goal" class="qa-goal">
      <option value="">일상</option>
      ${options}
    </select>
  `
}

/** Shown instead of the select once a goal was preselected from the 목표 page's "+ 할 일 추가". */
function pendingGoalChipHtml(pendingGoal) {
  return `
    <span class="pending-goal-chip">
      목표: ${escapeHtml(pendingGoal.title)}
      <button type="button" class="pending-goal-clear" aria-label="목표 선택 해제">×</button>
    </span>
  `
}

/** The add-todo card: title, due date, tags, lead days, goal, submit. Enter in the title submits. */
export function render(state, actions) {
  const { pendingGoal } = state

  const el = createElement(`
    <form class="quick-add" novalidate>
      <label class="visually-hidden" for="qa-title">할 일 제목</label>
      <input
        id="qa-title"
        class="qa-title"
        type="text"
        placeholder="할 일 제목 — 예: 다음주 화요일까지 ERP 개발 보고"
        required
      />
      <label class="visually-hidden" for="qa-due">마감일</label>
      <input id="qa-due" class="qa-due" type="date" />
      <label class="visually-hidden" for="qa-tags">태그</label>
      <input id="qa-tags" class="qa-tags" type="text" placeholder="태그 (쉼표로 구분)" />
      <label class="qa-lead-wrap" for="qa-lead" title="마감 며칠 전부터 준비를 시작할지">
        <span class="qa-lead-prefix">준비</span>
        <input id="qa-lead" class="qa-lead" type="number" min="0" max="60" value="3" aria-label="준비 시작 리드타임(일)" />
        <span class="qa-lead-suffix">일 전</span>
      </label>
      ${pendingGoal ? pendingGoalChipHtml(pendingGoal) : goalSelectHtml(state.goals)}
      <button type="submit" class="btn btn-primary qa-submit">추가</button>
    </form>
  `)

  const titleInput = el.querySelector('.qa-title')
  const dueInput = el.querySelector('.qa-due')
  const tagsInput = el.querySelector('.qa-tags')
  const leadInput = el.querySelector('.qa-lead')
  const goalSelect = el.querySelector('.qa-goal')
  const submitBtn = el.querySelector('.qa-submit')

  const pendingClearBtn = el.querySelector('.pending-goal-clear')
  if (pendingClearBtn) pendingClearBtn.addEventListener('click', () => actions.clearPendingGoal())

  el.addEventListener('submit', async (event) => {
    event.preventDefault()
    const title = titleInput.value.trim()
    if (!title) return

    const payload = { title }
    if (dueInput.value) payload.due = dueInput.value
    const tags = parseTags(tagsInput.value)
    if (tags.length > 0) payload.tags = tags
    if (leadInput.value !== '') payload.lead_days = Number(leadInput.value)
    if (pendingGoal) payload.goal = pendingGoal.tag
    else if (goalSelect && goalSelect.value) payload.goal = goalSelect.value

    submitBtn.disabled = true
    try {
      await actions.addTodo(payload)
      titleInput.value = ''
      tagsInput.value = ''
      if (pendingGoal) actions.clearPendingGoal()
      showToast(`추가됨: ${title}`)
    } catch (err) {
      showToast(err.message || '추가에 실패했습니다', { error: true })
    } finally {
      submitBtn.disabled = false
      titleInput.focus()
    }
  })

  return el
}
