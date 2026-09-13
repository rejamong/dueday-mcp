import { escapeHtml, createElement } from '../utils.js'
import { ddayLabel, prepLabel, monthDay, dayDiff } from '../dates.js'
import { renderRowMenu } from './row-menu.js'
import { render as renderEditor } from './row-editor.js'
import { render as renderDeleteConfirm } from './row-delete-confirm.js'

/** Which badge variant a todo falls into, per the "지금 준비 시작"/"7일 내" rules. */
export function badgeVariant(today, todo) {
  if (todo.status === 'cancelled') return 'cancelled'
  if (todo.status === 'done') return 'done'
  if (!todo.due_at) return 'none'
  const diff = dayDiff(today, todo.due_at)
  if (diff !== null && diff < 0) return 'overdue'
  if (todo.prep_start && todo.prep_start <= today) return 'start_now'
  return 'later'
}

function badgeText(today, todo, variant) {
  if (variant === 'cancelled') return '취소'
  if (variant === 'done') return `완료 · ${monthDay(todo.done_at) ?? ''}`
  if (variant === 'none') return '마감 없음'
  return ddayLabel(today, todo.due_at)
}

/** Small `◎ tag` chip shown after the tag chips when a todo is linked to a goal. */
function goalChipHtml(goalTag) {
  if (!goalTag) return ''
  return `<button type="button" class="goal-chip" data-goal-tag="${escapeHtml(goalTag)}">◎ ${escapeHtml(goalTag)}</button>`
}

const ENRICHMENT_TOOLTIP_PARTS = [
  ['tags', (v) => (Array.isArray(v) && v.length > 0 ? `태그 ${v.join('·')}` : null)],
  ['goal', (v) => (v ? `목표 ${v}` : null)],
  ['lead_days', (v) => (v !== null && v !== undefined ? `준비 ${v}일` : null)],
  ['due', (v) => (v ? `마감 ${v}` : null)],
]

/** `자동 분류: 태그 업무·개인 · 목표 reading · 준비 5일 · 마감 2026-09-18` — only keys present in `enrichment`. */
function enrichmentTooltip(enrichment) {
  const parts = ENRICHMENT_TOOLTIP_PARTS.map(([key, format]) => format(enrichment[key])).filter(Boolean)
  return `자동 분류: ${parts.join(' · ')}`
}

/** Small muted "AI" chip shown when the server's classifier auto-filled this todo's fields. */
function aiChipHtml(enrichment) {
  if (!enrichment) return ''
  return `<span class="chip-ai" title="${escapeHtml(enrichmentTooltip(enrichment))}">AI</span>`
}

function tagChips(tags, goalTag, enrichment) {
  const chips = (tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('') + goalChipHtml(goalTag) + aiChipHtml(enrichment)
  if (!chips) return ''
  return `<div class="row-tags">${chips}</div>`
}

function wireGoalChip(el, actions) {
  const chip = el.querySelector('.goal-chip')
  if (chip) chip.addEventListener('click', () => actions.navigate('goals'))
}

function completeControlsHtml(isDone) {
  return `
    <button
      type="button"
      class="row-check"
      aria-pressed="${isDone}"
      aria-label="${isDone ? '완료됨, 되돌리기' : '완료로 표시'}"
    ></button>
  `
}

function wireCompleteToggle(el, todo, actions) {
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
}

function wireRowMenu(el, todo, state, actions, rowKey) {
  const menuBtn = el.querySelector('.row-menu-btn')
  const menuWrap = el.querySelector('.row-menu-wrap')
  menuBtn.addEventListener('click', () => actions.toggleMenu(rowKey))

  if (state.menuOpenId === rowKey) {
    const menu = renderRowMenu(todo.status)
    menuWrap.appendChild(menu)
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]')
      if (!button) return
      const { action } = button.dataset
      if (action === 'edit') actions.startEdit(rowKey)
      else if (action === 'cancel') void actions.cancelTodo(todo.id)
      else if (action === 'restore') void actions.restoreTodo(todo.id)
      else if (action === 'delete') actions.startDelete(rowKey)
    })
  }

  if (state.focusMenuId === rowKey) {
    queueMicrotask(() => {
      menuBtn.focus()
      actions.clearFocusMenu()
    })
  }
}

function renderNormalRow(todo, state, actions, rowKey) {
  const variant = badgeVariant(state.today, todo)
  const isDone = todo.status === 'done'
  const isCancelled = todo.status === 'cancelled'
  const prep = !isDone && !isCancelled && todo.due_at ? prepLabel(todo.prep_start) : null

  const el = createElement(`
    <div class="todo-row" data-id="${escapeHtml(todo.id)}" data-row-key="${escapeHtml(rowKey)}">
      ${isCancelled ? '' : completeControlsHtml(isDone)}
      <div class="row-text">
        <div class="row-title ${isDone ? 'is-done' : ''} ${isCancelled ? 'is-cancelled' : ''}">${escapeHtml(todo.title)}</div>
        ${tagChips(todo.tags, todo.goal_tag, todo.enrichment)}
      </div>
      ${prep ? `<span class="row-prep">${escapeHtml(prep)}</span>` : '<span class="row-prep row-prep-empty"></span>'}
      <span class="due-badge badge-${variant}">${escapeHtml(badgeText(state.today, todo, variant))}</span>
      ${isCancelled ? '' : '<button type="button" class="btn btn-ghost row-toggle">' + (isDone ? '되돌리기' : '완료') + '</button>'}
      <div class="row-menu-wrap">
        <button type="button" class="btn btn-ghost row-menu-btn" aria-label="더 보기" aria-haspopup="true" aria-expanded="${state.menuOpenId === rowKey}">⋯</button>
      </div>
    </div>
  `)

  if (!isCancelled) wireCompleteToggle(el, todo, actions)
  wireRowMenu(el, todo, state, actions, rowKey)
  wireGoalChip(el, actions)

  return el
}

/**
 * Renders one todo row. Unlike the other views this takes the specific `todo`
 * as its first argument (`state`/`actions` are still needed for today + row actions).
 * Delegates to the inline editor or delete-confirmation when the row is in that mode.
 */
export function render(todo, state, actions, sectionKey = 'all') {
  // The same todo can appear in several sections; UI modes are keyed per section row, not per todo.
  const rowKey = `${sectionKey}:${todo.id}`
  if (state.confirmDeleteId === rowKey) return renderDeleteConfirm(todo, actions)
  if (state.editingId === rowKey) return renderEditor(todo, state, actions)
  return renderNormalRow(todo, state, actions, rowKey)
}
