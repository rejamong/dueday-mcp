// Small shared helpers used across every view module.

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes any user-provided string before it is interpolated into an HTML template literal. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch])
}

/** Builds a single detached DOM element from an HTML string (the string's outer tag must be one element). */
export function createElement(html) {
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  return template.content.firstElementChild
}

let toastTimer = null

/** Shows a bottom-center toast for 3s. Pass `{ error: true }` for the danger styling. */
export function showToast(message, { error = false } = {}) {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.toggle('toast-error', error)
  toast.classList.add('toast-visible')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('toast-visible'), 3000)
}
