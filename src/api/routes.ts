import { Hono, type Context } from 'hono'
import { NotFoundError, ValidationError } from '../errors.js'
import type { TodoService } from '../todos/service.js'
import { fail, ok } from './envelope.js'

function toNumber(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value)
}

function buildListQuery(c: Context): Record<string, unknown> {
  const q = c.req.query()
  const out: Record<string, unknown> = { ...q }
  const limit = toNumber(q.limit)
  if (limit !== undefined) out.limit = limit
  return out
}

/** Reads the JSON body, treating an empty body as `{}` rather than a parse error. */
async function readJsonBody(c: Context): Promise<unknown> {
  const text = await c.req.text()
  return text.trim().length === 0 ? {} : JSON.parse(text)
}

export function createApiRoutes(service: TodoService): Hono {
  const app = new Hono()

  app.get('/todos', async (c) => {
    const page = await service.list(buildListQuery(c))
    return ok(c, page.items, service.today(), page.total)
  })

  app.post('/todos', async (c) => {
    const todo = await service.add(await readJsonBody(c), 'web')
    return ok(c, todo, service.today(), undefined, 201)
  })

  app.get('/todos/:id', (c) => {
    const todo = service.get(c.req.param('id'))
    return ok(c, todo, service.today())
  })

  app.patch('/todos/:id', async (c) => {
    const todo = await service.update(c.req.param('id'), await readJsonBody(c))
    return ok(c, todo, service.today())
  })

  app.post('/todos/:id/complete', async (c) => {
    const body = await readJsonBody(c)
    const reopen = typeof body === 'object' && body !== null && 'reopen' in body ? Boolean((body as { reopen?: unknown }).reopen) : false
    const todo = await service.complete(c.req.param('id'), reopen)
    return ok(c, todo, service.today())
  })

  app.post('/todos/:id/cancel', async (c) => {
    const body = await readJsonBody(c)
    const reopen = typeof body === 'object' && body !== null && 'reopen' in body ? Boolean((body as { reopen?: unknown }).reopen) : false
    const todo = await service.cancel(c.req.param('id'), reopen)
    return ok(c, todo, service.today())
  })

  app.delete('/todos/:id', async (c) => {
    const id = c.req.param('id')
    await service.remove(id)
    return ok(c, { id, deleted: true }, service.today())
  })

  app.get('/upcoming', async (c) => {
    const days = toNumber(c.req.query('days'))
    const result = await service.upcoming(days === undefined ? {} : { days })
    return ok(c, result, service.today())
  })

  app.get('/tags', async (c) => {
    const tags = await service.listTags()
    return ok(c, tags, service.today())
  })

  app.onError((err, c) => {
    if (err instanceof ValidationError) return fail(c, 400, err.message)
    if (err instanceof NotFoundError) return fail(c, 404, err.message)
    if (err instanceof SyntaxError) return fail(c, 400, '요청 본문이 올바른 JSON이 아닙니다')
    console.error('API 요청 처리 실패:', err)
    return fail(c, 500, '내부 오류가 발생했습니다')
  })

  return app
}
