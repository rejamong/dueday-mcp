import { createElement } from '../utils.js'

// Menu contents per todo status — labels are static Korean strings, not user data.
const ITEMS_BY_STATUS = {
  open: [
    { action: 'edit', label: '편집' },
    { action: 'cancel', label: '취소', variant: 'muted', title: '되돌릴 수 있음' },
    { action: 'delete', label: '삭제', variant: 'danger' },
  ],
  done: [
    { action: 'edit', label: '편집' },
    { action: 'delete', label: '삭제', variant: 'danger' },
  ],
  cancelled: [
    { action: 'restore', label: '되살리기' },
    { action: 'delete', label: '삭제', variant: 'danger' },
  ],
}

function menuItemHtml(item) {
  const variantClass = `row-menu-${item.variant || 'ink'}`
  const title = item.title ? ` title="${item.title}"` : ''
  return `<button type="button" role="menuitem" class="row-menu-item ${variantClass}" data-action="${item.action}"${title}>${item.label}</button>`
}

/** Builds the ⋯ row-menu popover for a todo's status. Caller wires up item clicks and dismissal. */
export function renderRowMenu(status) {
  const items = ITEMS_BY_STATUS[status] || ITEMS_BY_STATUS.open
  return createElement(`<div class="row-menu" role="menu">${items.map(menuItemHtml).join('')}</div>`)
}
