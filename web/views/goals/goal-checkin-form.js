import { escapeHtml, createElement, showToast } from '../../utils.js'

/** Inline 체크인 form for a goal card: metric select (only if >1 metric), value, note. */
export function render(goal, actions) {
  const metrics = goal.metrics
  const showSelect = metrics.length > 1
  const metricOptions = metrics.map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')

  const el = createElement(`
    <form class="goal-checkin-form">
      ${
        showSelect
          ? `<label class="visually-hidden" for="ci-metric-${goal.id}">지표</label>
             <select id="ci-metric-${goal.id}" class="ci-metric">${metricOptions}</select>`
          : ''
      }
      <label class="visually-hidden" for="ci-value-${goal.id}">값</label>
      <input id="ci-value-${goal.id}" class="ci-value" type="number" step="any" placeholder="값" required />
      <label class="visually-hidden" for="ci-note-${goal.id}">메모</label>
      <input id="ci-note-${goal.id}" class="ci-note" type="text" placeholder="메모 (선택)" />
      <button type="button" class="btn btn-ghost ci-close">닫기</button>
      <button type="submit" class="btn btn-primary ci-submit">기록</button>
    </form>
  `)

  const valueInput = el.querySelector('.ci-value')
  const noteInput = el.querySelector('.ci-note')
  const metricSelect = el.querySelector('.ci-metric')
  const submitBtn = el.querySelector('.ci-submit')

  el.querySelector('.ci-close').addEventListener('click', () => actions.toggleCheckin(goal.id))

  el.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (valueInput.value === '') return
    const metricName = showSelect ? metricSelect.value : metrics[0].name
    const body = { value: Number(valueInput.value), metric: metricName }
    if (noteInput.value.trim()) body.note = noteInput.value.trim()

    submitBtn.disabled = true
    try {
      await actions.submitCheckin(goal, body)
    } catch (err) {
      showToast(err.message || '체크인에 실패했습니다', { error: true })
    } finally {
      submitBtn.disabled = false
    }
  })

  queueMicrotask(() => valueInput.focus())

  return el
}
