import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { serveStatic } from '@hono/node-server/serve-static'
import { feedbackRoutes } from '#api/routes/feedback'
import { ServerError, type ServerErrorBody } from '#errors'
import { DEFAULT_LIMITS, type FeedbackLimits } from '#feedback/limits'
import { PUBLIC_DIR } from '#paths'

export interface AppDeps {
  /** Log each request (the server, not tests). */
  logRequests?: boolean
  limits?: FeedbackLimits
}

/**
 * Build the Hono app: the API under `/api`, and the landing page's static
 * files for everything else. A factory so tests can drive `app.request`
 * without binding a socket.
 */
export function buildApp(deps: AppDeps = {}) {
  const app = new Hono()

  if (deps.logRequests) app.use('*', logger())

  app.onError(errorResponse)
  app.notFound((c) => c.req.path.startsWith('/api/')
    ? c.json({ error: { code: 'NOT_FOUND', message: `no route ${c.req.method} ${c.req.path}` } }, 404)
    : c.text('Not found', 404))

  app.route('/api', apiRoutes(deps.limits ?? DEFAULT_LIMITS))
  app.use('*', serveStatic({
    root: PUBLIC_DIR,
    // GitHub Pages' caching, which the page was tuned under.
    onFound: (_path, c) => { c.header('Cache-Control', 'public, max-age=600') },
  }))
  return app
}

/** The wire form of a thrown error. An unexpected one's message stays in
 *  the log, not the response. */
function errorResponse(err: Error, c: Context): Response {
  const reply = (status: ContentfulStatusCode, error: ServerErrorBody['error']) => c.json({ error }, status)
  if (err instanceof ServerError) return reply(err.httpStatus, { code: err.code, message: err.message })
  // Hono's own validator refusals: malformed JSON, a wrong Content-Type.
  if (err instanceof HTTPException && err.status === 400) return reply(400, { code: 'VALIDATION', message: err.message })
  console.error(`${c.req.method} ${c.req.path} failed:`, err)
  return reply(500, { code: 'INTERNAL', message: 'internal error' })
}

/**
 * Every HTTP route, mounted under `/api`. Chained, so `AppType` carries
 * each route's input and output to the RPC client (src/client.ts).
 */
function apiRoutes(limits: FeedbackLimits) {
  return new Hono()
    .get('/health', (c) => c.json({ ok: true }))
    .route('/feedback', feedbackRoutes(limits))
}

export type AppType = ReturnType<typeof apiRoutes>
