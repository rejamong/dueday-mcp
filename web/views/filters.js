import { escapeHtml, createElement } from '../utils.js'
import { SIZES } from '../size.js'

function tagChip(name, label, selected) {
  return `<button type="button" class="chip ${selected ? 'chip-selected' : ''}" data-tag="${escapeHtml(name ?? '')}">${escapeHtml(label)}</button>`
}

function sizeChip(value, label, selected) {
  return `<button type="button" class="chip ${selected ? 'chip-selected' : ''}" data-size="${escapeHtml(value)}">${escapeHtml(label)}</button>`
}

/** Tag chips + 규모 chips + 미완료/완료 toggle + search box for the "전체 목록" section. */
export function render(state, actions) {
  const { filter, tags } = state
  const chips = [tagChip('', '전체', filter.tag === null)]
  for (const tag of tags) chips.push(tagChip(tag.name, tag.name, filter.tag === tag.name))

  const sizeChips = [sizeChip('', '전체', filter.size === null)]
  for (const s of SIZES) sizeChips.push(sizeChip(String(s), String(s), filter.size === s))

  const el = createElement(`
    <div class="filters-bar">
      <div class="filters-chips">${chips.join('')}</div>
      <div class="filters-size">
        <span class="filters-size-label">규모</span>
        <div class="filters-chips">${sizeChips.join('')}</div>
      </div>
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

  el.querySelectorAll('.chip[data-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag
      actions.setFilter({ tag: tag === '' ? null : tag })
    })
  })

  el.querySelectorAll('.chip[data-size]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const size = chip.dataset.size
      actions.setFilter({ size: size === '' ? null : Number(size) })
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
