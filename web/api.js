// Thin fetch wrapper around the dueday-mcp REST API's JSON envelope.

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseEnvelope(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * @param {string} path relative API path, e.g. '/api/todos'
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<{ success: true, data: any, meta: { today: string, total?: number } }>}
 */
export async function api(path, options = {}) {
  const { method = 'GET', body } = options
  const init = { method, credentials: 'same-origin', headers: {} }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, '네트워크 오류가 발생했습니다')
  }

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('dueday:unauthorized'))
  }

  const envelope = await parseEnvelope(res)
  if (!res.ok || !envelope || envelope.success !== true) {
    const message = (envelope && envelope.error) || `요청이 실패했습니다 (${res.status})`
    throw new ApiError(res.status, message)
  }
  return envelope
}
