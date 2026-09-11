import { escapeHtml, createElement } from '../utils.js'

/** Inline "permanently delete?" confirmation that replaces a row's content. */
export function render(todo, actions) {
  const el = createElement(`
    <div class="todo-row is-deleting" data-id="${escapeHtml(todo.id)}">
      <div class="row-delete-confirm">
        <p class="delete-confirm-text">"${escapeHtml(todo.title)}"를 영구 삭제할까요? 되돌릴 수 없습니다.</p>
        <div class="delete-confirm-actions">
          <button type="button" class="btn btn-ghost delete-keep">유지</button>
          <button type="button" class="btn btn-danger delete-confirm-btn">삭제</button>
        </div>
      </div>
    </div>
  `)

  const buttons = el.querySelectorAll('button')

  el.querySelector('.delete-keep').addEventListener('click', () => {
    actions.cancelDeleteConfirm()
  })

  el.querySelector('.delete-confirm-btn').addEventListener('click', async () => {
    buttons.forEach((b) => (b.disabled = true))
    try {
      await actions.deleteTodo(todo.id)
    } catch {
      buttons.forEach((b) => (b.disabled = false))
    }
  })

  return el
}
