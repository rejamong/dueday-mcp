import { escapeHtml, createElement, showToast } from '../../utils.js'
import { formatNumber } from '../../goals-format.js'

const KIND_LABEL = { annual: '연간', short: '단기', long: '장기' }
const DIRECTION_WORD = { gte: '이상', lte: '이하', maintain: '유지' }

/** `연간` / `단기 ~ 2026-12-31` / `장기` pill text for a suggestion's kind. */
function kindPillText(suggestion) {
  const label = KIND_LABEL[suggestion.kind] ?? suggestion.kind
  if (suggestion.kind === 'short' && suggestion.period_end) return `${label} ~ ${suggestion.period_end}`
  return label
}

/** `읽은 책 15권 이상` style one-liner: name + target + unit + direction word. */
function metricLine(metric) {
  const unit = metric.unit ?? ''
  const direction = DIRECTION_WORD[metric.direction] ?? metric.direction
  return `${metric.name} ${formatNumber(metric.target_value)}${unit} ${direction}`
}

function cardHtml(item) {
  const s = item.suggestion
  return `
    <div class="suggestion-card" data-id="${escapeHtml(item.id)}">
      <div class="suggestion-card-head">
        <span class="suggestion-card-title">${escapeHtml(s.title)}</span>
        <span class="suggestion-kind-pill">${escapeHtml(kindPillText(s))}</span>
        <span class="tag-chip">${escapeHtml(s.tag)}</span>
      </div>
      <p class="suggestion-metric">${escapeHtml(metricLine(s.metric))}</p>
      ${s.why ? `<p class="suggestion-why">${escapeHtml(s.why)}</p>` : ''}
      <p class="suggestion-origin">할 일 「${escapeHtml(item.todo_title)}」에서 제안</p>
      <div class="suggestion-actions">
        <button type="button" class="btn btn-primary suggestion-accept">목표로 등록</button>
        <button type="button" class="btn btn-ghost suggestion-dismiss">무시</button>
      </div>
    </div>
  `
}

function setBusy(el, busy) {
  el.querySelectorAll('button').forEach((b) => (b.disabled = busy))
}

function wireCard(el, item, actions) {
  el.querySelector('.suggestion-accept').addEventListener('click', async () => {
    setBusy(el, true)
    try {
      await actions.acceptSuggestion(item.id)
    } catch (err) {
      setBusy(el, false)
      showToast(err.message || '목표 등록에 실패했습니다', { error: true })
    }
  })
  el.querySelector('.suggestion-dismiss').addEventListener('click', async () => {
    setBusy(el, true)
    try {
      await actions.dismissSuggestion(item.id)
    } catch (err) {
      setBusy(el, false)
      showToast(err.message || '제안을 지우지 못했습니다', { error: true })
    }
  })
}

/**
 * `AI 제안` section: one card per pending goal-promotion suggestion.
 * Callers should only render this when `state.suggestions.length > 0`.
 */
export function render(state, actions) {
  const wrap = createElement(`
    <section class="goal-suggestions">
      <div class="goals-section-header">
        <h2 class="goals-section-heading">AI 제안</h2>
        <span class="goals-section-count">${state.suggestions.length}</span>
      </div>
      <div class="suggestions-list"></div>
    </section>
  `)

  const list = wrap.querySelector('.suggestions-list')
  for (const item of state.suggestions) {
    const card = createElement(cardHtml(item))
    wireCard(card, item, actions)
    list.appendChild(card)
  }

  return wrap
}
