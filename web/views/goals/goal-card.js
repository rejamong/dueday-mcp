import { escapeHtml, createElement } from '../../utils.js'
import { statusPill } from '../../goals-format.js'
import { renderMetricBlock } from './goal-metric.js'
import { render as renderCheckinForm } from './goal-checkin-form.js'
import { render as renderDetail } from './goal-detail.js'

function pillHtml(statusLabel) {
  const pill = statusPill(statusLabel)
  if (!pill) return ''
  return `<span class="status-pill ${pill.className}">${pill.label}</span>`
}

function footerText(goal) {
  const base = `할 일 ${goal.todos.open} 열림 · ${goal.todos.done} 완료`
  if (goal.time_percent === null) return base
  return `${base} · 기간 ${goal.time_percent}% 경과`
}

/** One goal card: head + optional why + metric blocks + footer, with inline checkin/detail toggles. */
export function render(goal, state, actions) {
  const isCheckinOpen = state.checkinOpenGoalId === goal.id
  const isExpanded = state.expandedGoalIds.includes(goal.id)
  const whyHtml = goal.why ? `<p class="goal-why">${escapeHtml(goal.why)}</p>` : ''
  const metricsHtml = goal.metrics.length === 0 ? '<p class="goal-detail-empty">등록된 지표가 없음</p>' : ''

  const el = createElement(`
    <div class="goal-card" data-id="${escapeHtml(goal.id)}" data-tag="${escapeHtml(goal.tag)}">
      <div class="goal-card-head">
        <span class="goal-card-title">${escapeHtml(goal.title)}</span>
        <span class="tag-chip">${escapeHtml(goal.tag)}</span>
        <span class="goal-card-spacer"></span>
        ${pillHtml(goal.status_label)}
      </div>
      ${whyHtml}
      <div class="goal-metrics">${metricsHtml}</div>
      <div class="goal-card-footer">
        <span class="goal-footer-text">${escapeHtml(footerText(goal))}</span>
        <div class="goal-footer-actions">
          <button type="button" class="btn btn-ghost goal-checkin-btn">체크인</button>
          <button type="button" class="btn btn-ghost goal-detail-btn" aria-expanded="${isExpanded}">자세히</button>
        </div>
      </div>
    </div>
  `)

  const metricsWrap = el.querySelector('.goal-metrics')
  for (const metric of goal.metrics) metricsWrap.appendChild(renderMetricBlock(metric, goal.time_percent))

  el.querySelector('.goal-checkin-btn').addEventListener('click', () => actions.toggleCheckin(goal.id))
  el.querySelector('.goal-detail-btn').addEventListener('click', () => actions.toggleGoalDetail(goal))

  if (isCheckinOpen) el.appendChild(renderCheckinForm(goal, actions))
  if (isExpanded) el.appendChild(renderDetail(goal, state, actions))

  return el
}
