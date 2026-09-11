import { escapeHtml, createElement } from '../utils.js'

/**
 * Owner password gate. Calls `actions.login(password)` on submit;
 * `state.loginError` (set by app.js on a 401) renders the inline error.
 */
export function render(state, actions) {
  const errorHtml = state.loginError
    ? `<p class="login-error" role="alert">${escapeHtml(state.loginError)}</p>`
    : ''

  const wrap = createElement(`
    <div class="login-screen">
      <form class="login-card" novalidate>
        <div class="login-brand">dueday</div>
        <p class="login-tagline">마감보다 준비 시작일을 먼저</p>
        <label class="visually-hidden" for="login-password">소유자 비밀번호</label>
        <input
          id="login-password"
          name="password"
          type="password"
          placeholder="소유자 비밀번호"
          autocomplete="current-password"
          required
        />
        ${errorHtml}
        <button type="submit" class="btn btn-primary login-submit">로그인</button>
      </form>
    </div>
  `)

  const form = wrap.querySelector('form')
  const input = wrap.querySelector('#login-password')
  const button = wrap.querySelector('.login-submit')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!input.value) return
    button.disabled = true
    try {
      await actions.login(input.value)
    } finally {
      button.disabled = false
    }
  })

  return wrap
}
