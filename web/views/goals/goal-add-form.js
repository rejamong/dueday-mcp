import { createElement, showToast } from '../../utils.js'
import { slugifyTitle, yearOf } from '../../goals-format.js'
import { renderMetricRow, readMetricRow } from './goal-metric-row.js'

function currentYear(state) {
  return yearOf(state.today) ?? new Date().getFullYear()
}

function buildPayload(refs, state) {
  const title = refs.title.value.trim()
  const kind = refs.kind.value
  const tag = refs.tag.value.trim() || slugifyTitle(title)
  const why = refs.why.value.trim()
  const metrics = [...refs.metricsRows.children].map(readMetricRow).filter((m) => m !== null)

  const payload = { title, kind, tag, metrics }
  if (kind === 'annual') payload.year = refs.year.value === '' ? currentYear(state) : Number(refs.year.value)
  if (why) payload.why = why
  return payload
}

function syncYearVisibility(refs) {
  refs.yearWrap.hidden = refs.kind.value !== 'annual'
}

/** Inline "+ 목표 추가" panel: title/kind/tag/year/why plus a metrics editor. */
export function render(state, actions) {
  const el = createElement(`
    <form class="goal-add-form">
      <div class="goal-add-row">
        <label class="visually-hidden" for="ga-title">목표 제목</label>
        <input id="ga-title" class="ga-title" type="text" placeholder="목표 제목" required />
        <label class="visually-hidden" for="ga-kind">종류</label>
        <select id="ga-kind" class="ga-kind">
          <option value="annual">연간</option>
          <option value="long">장기</option>
          <option value="life">인생</option>
        </select>
        <label class="visually-hidden" for="ga-tag">태그</label>
        <input id="ga-tag" class="ga-tag" type="text" placeholder="태그 (비우면 자동 생성)" />
        <span class="ga-year-wrap">
          <label class="visually-hidden" for="ga-year">연도</label>
          <input id="ga-year" class="ga-year" type="number" placeholder="연도" value="${currentYear(state)}" />
        </span>
      </div>
      <label class="visually-hidden" for="ga-why">왜</label>
      <input id="ga-why" class="ga-why" type="text" placeholder="이 목표가 인생 목표에 어떻게 닿는지 (선택)" />
      <div class="metrics-editor">
        <div class="metrics-editor-rows"></div>
        <button type="button" class="btn btn-ghost ga-add-metric">+ 지표</button>
      </div>
      <div class="goal-add-actions">
        <button type="button" class="btn btn-ghost ga-cancel">닫기</button>
        <button type="submit" class="btn btn-primary ga-submit">추가</button>
      </div>
    </form>
  `)

  const refs = {
    title: el.querySelector('.ga-title'),
    kind: el.querySelector('.ga-kind'),
    tag: el.querySelector('.ga-tag'),
    year: el.querySelector('.ga-year'),
    yearWrap: el.querySelector('.ga-year-wrap'),
    why: el.querySelector('.ga-why'),
    metricsRows: el.querySelector('.metrics-editor-rows'),
  }

  if (state.addGoalPresetKind) refs.kind.value = state.addGoalPresetKind
  syncYearVisibility(refs)
  refs.kind.addEventListener('change', () => syncYearVisibility(refs))

  el.querySelector('.ga-add-metric').addEventListener('click', () => {
    refs.metricsRows.appendChild(renderMetricRow())
  })

  el.querySelector('.ga-cancel').addEventListener('click', () => actions.closeAddGoalForm())

  const submitBtn = el.querySelector('.ga-submit')
  el.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!refs.title.value.trim()) return
    submitBtn.disabled = true
    try {
      await actions.addGoal(buildPayload(refs, state))
    } catch (err) {
      showToast(err.message || '목표 추가에 실패했습니다', { error: true })
    } finally {
      submitBtn.disabled = false
    }
  })

  queueMicrotask(() => refs.title.focus())

  return el
}
