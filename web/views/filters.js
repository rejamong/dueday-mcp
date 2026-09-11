import { escapeHtml, createElement } from '../utils.js'

function tagChip(name, label, selected) {
  return `<button type="button" class="chip ${selected ? 'chip-selected' : ''}" data-tag="${escapeHtml(name ?? '')}">${escapeHtml(label)}</button>`
}

/** Tag chips + 미완료/완료 toggle + search box for the "전체 목록" section. */
export function render(state, actions) {
  const { filter, tags } = state
  const chips = [tagChip('', '전체', filter.tag === null)]
  for (const tag of tags) chips.push(tagChip(tag.name, tag.name, filter.tag === tag.name))

  const el = createElement(`
    <div class="filters-bar">
      <div class="filters-chips">${chips.join('')}</div>
      <div class="filters-spacer"></div>
      <div class="filters-status">
        <button type="button" class="btn toggle-btn ${filter.status === 'open' ? 'toggle-selected' : ''}" data-status="open">미완료</button>
        <button type="button" class="btn toggle-btn ${filter.status === 'done' ? 'toggle-selected' : ''}" data-status="done">완료</button>
        <button type="button" class="btn toggle-btn ${filter.status === 'cancelled' ? 'toggle-selected' : ''}" data-status="cancelled">취소</button>
      </div>
      <label class="visually-hidden" for="filter-search">검색</label>
      <input id="filter-search" class="filters-search" type="search" placeholder="검색" value="${escapeHtml(filter.q)}" />
    </div>
  `)

  el.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag
      actions.setFilter({ tag: tag === '' ? null : tag })
    })
  })

  el.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      actions.setFilter({ status: btn.dataset.status })
    })
  })

  const search = el.querySelector('.filters-search')
  search.addEventListener('input', () => {
    actions.setFilter({ q: search.value })
  })

  return el
}
