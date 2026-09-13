import { Hono, type Context } from 'hono'
import type { GoalService } from '../goals/service.js'
import { ok } from './envelope.js'

async function readJsonBody(c: Context): Promise<unknown> {
  const text = await c.req.text()
  return text.trim().length === 0 ? {} : JSON.parse(text)
}

/** /api/goals — mounted inside the API router, so it shares its auth guard and error mapping. */
export function createGoalRoutes(goals: GoalService): Hono {
  const app = new Hono()

  app.get('/', async (c) => ok(c, await goals.list({ status: c.req.query('status') ?? 'active' }), goals.today()))
  app.post('/', async (c) => ok(c, await goals.add(await readJsonBody(c)), goals.today(), undefined, 201))
  app.get('/:ref', async (c) => ok(c, await goals.get(c.req.param('ref')), goals.today()))
  app.patch('/:ref', async (c) => ok(c, await goals.update(c.req.param('ref'), await readJsonBody(c)), goals.today()))
  app.post('/:ref/checkins', async (c) =>
    ok(c, await goals.logProgress(c.req.param('ref'), await readJsonBody(c), 'web'), goals.today(), undefined, 201),
  )

  return app
}
