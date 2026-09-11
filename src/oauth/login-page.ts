import type { AuthorizeRequest } from './service.js'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

const STYLE = `
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; background: #f5f5f5; color: #2d3142;
         display: flex; justify-content: center; padding: 4rem 1rem; margin: 0; }
  form { background: #fff; border: 1px solid rgba(45,49,66,.12); border-radius: 8px; padding: 2rem; width: 100%; max-width: 380px; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; } p { margin: 0 0 1rem; color: #4f5d75; font-size: .9rem; }
  label { display: block; font-size: .85rem; margin-bottom: .35rem; }
  input[type=password] { width: 100%; box-sizing: border-box; padding: .6rem .7rem; border: 1px solid #bfc0c0; border-radius: 6px; font-size: 1rem; }
  button { margin-top: 1rem; width: 100%; padding: .7rem; border: 0; border-radius: 6px; background: #2d3142; color: #fff; font-size: 1rem; cursor: pointer; }
  .error { color: #b3261e; font-size: .85rem; margin: .5rem 0 0; }
  code { background: #ececec; padding: .1rem .3rem; border-radius: 3px; }
`

const HIDDEN_FIELDS: ReadonlyArray<keyof AuthorizeRequest> = [
  'response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource',
]

/** Owner-only consent page: a single password gate in front of the authorization code grant. */
export function renderLoginPage(req: AuthorizeRequest, scope: string, error?: string): string {
  const hidden = HIDDEN_FIELDS
    .filter((key) => req[key] !== undefined)
    .map((key) => `<input type="hidden" name="${key}" value="${escapeHtml(String(req[key]))}">`)
    .join('\n      ')
  const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : ''
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>dueday 연결 승인</title><style>${STYLE}</style></head>
<body>
  <form method="post" action="/authorize" autocomplete="off">
    <h1>dueday 연결 승인</h1>
    <p><code>${escapeHtml(req.client_id)}</code> 클라이언트가 <code>${escapeHtml(scope)}</code> 권한으로 할 일 목록에 접근하려 합니다. 소유자 비밀번호를 입력해 승인하세요.</p>
    ${hidden}
    <label for="password">소유자 비밀번호</label>
    <input id="password" name="password" type="password" required autofocus>
    ${errorHtml}
    <button type="submit">승인하고 연결</button>
  </form>
</body></html>`
}
