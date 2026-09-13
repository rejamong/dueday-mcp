import { createElement } from '../../utils.js'

/** One editable row in the metrics editor: name / kind / direction / target / unit / cadence + remove. */
export function renderMetricRow() {
  const row = createElement(`
    <div class="metric-row">
      <input class="mr-name" type="text" placeholder="지표 이름" aria-label="지표 이름" />
      <select class="mr-kind" aria-label="지표 종류">
        <option value="count">count</option>
        <option value="value">value</option>
        <option value="boolean">boolean</option>
      </select>
      <select class="mr-direction" aria-label="방향">
        <option value="gte">gte</option>
        <option value="lte">lte</option>
        <option value="maintain">maintain</option>
      </select>
      <input class="mr-target" type="number" step="any" placeholder="목표값" aria-label="목표값" />
      <input class="mr-unit" type="text" placeholder="단위" aria-label="단위" />
      <select class="mr-cadence" aria-label="주기">
        <option value="">주기 없음</option>
        <option value="monthly">월간</option>
        <option value="weekly">주간</option>
      </select>
      <button type="button" class="btn btn-ghost mr-remove" aria-label="이 지표 삭제">×</button>
    </div>
  `)

  row.querySelector('.mr-remove').addEventListener('click', () => row.remove())
  return row
}

/** Reads one metric row into the `metrics[]` shape POST /api/goals expects, or null when unnamed. */
export function readMetricRow(row) {
  const name = row.querySelector('.mr-name').value.trim()
  if (!name) return null
  const target = row.querySelector('.mr-target').value
  const unit = row.querySelector('.mr-unit').value.trim()
  const cadence = row.querySelector('.mr-cadence').value
  return {
    name,
    kind: row.querySelector('.mr-kind').value,
    direction: row.querySelector('.mr-direction').value,
    target_value: target === '' ? 1 : Number(target),
    ...(unit ? { unit } : {}),
    ...(cadence ? { cadence } : {}),
  }
}
