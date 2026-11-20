import { Hono, type MiddlewareHandler } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { feedbackRoutes } from '#api/routes/feedback'
import { errorResponse } from '#errors'
import { DEFAULT_LIMITS, type FeedbackLimits } from '#feedback/limits'
import { demoVideoInfo, demoVideoPath } from '#media/demo-video'
import { PUBLIC_DIR } from '#paths'

export interface AppDeps {
  /** Log each request (the server, not tests). */
  logRequests?: boolean
  limits?: FeedbackLimits
  /** Where the uploaded demo video lives, if a media dir is configured. */
  mediaDir?: string
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
  app.use('*', staticCaching)
  // The uploaded demo video lives in the media dir (the site's volume), not
  // under public/, so it needs a route of its own. Registered after
  // staticCaching so it gets the ETag/304 and the 10-minute cache, and
  // before the public files so a missing video falls through to their 404.
  // serveStatic streams it as video/mp4 with Range support, so a browser
  // can seek.
  if (deps.mediaDir) {
    app.get('/demo-video', honorIfRange(deps.mediaDir), serveStatic({ path: demoVideoPath(deps.mediaDir) }))
  }
  app.use('*', serveStatic({ root: PUBLIC_DIR }))
  return app
}

/**
 * `serveStatic` ignores `If-Range`, so a client resuming a partial copy with
 * a stale validator would be handed a 206 of a file that was replaced under
 * it, splicing new bytes onto old. When `If-Range` names anything but the
 * file's current `Last-Modified`, drop the `Range` so the whole file is sent
 * instead. Our ETags are weak, so an entity-tag `If-Range` can never match
 * (RFC 9110 §13.1.5).
 */
function honorIfRange(mediaDir: string): MiddlewareHandler {
  return async (c, next) => {
    // eslint-disable-next-line no-restricted-syntax -- a cache validator, not API input
    const ifRange = c.req.header('If-Range')
    if (ifRange) {
      const info = await demoVideoInfo(mediaDir)
      if (info && ifRange !== info.modified.toUTCString()) c.req.raw.headers.delete('range')
    }
    await next()
  }
}

/** The page and its scripts, by Content-Type: revalidated on every load. */
const REVALIDATE = /^text\/(html|javascript|css)\b/
/** What a 304 keeps of the response it stands in for. */
const KEPT_ON_304 = new Set(['cache-control', 'etag', 'vary'])

/**
 * Caching for the static files, set on serveStatic's finished response. The
 * page and its scripts are revalidated on every load, so a browser never
 * pairs a fresh page with stale scripts (yaks.js from before a layout
 * change, say). Fonts and images keep GitHub Pages' caching, which the page
 * was tuned under.
 *
 * The ETag is weak, from the file's size and mtime, so GET, HEAD and a range
 * of the file all carry the same one, and a match is answered with a 304
 * without reading the file.
 */
const staticCaching: MiddlewareHandler = async (c, next) => {
  await next()
  if (!c.res.ok) return
  const type = c.res.headers.get('Content-Type') ?? ''
  c.header('Cache-Control', REVALIDATE.test(type) ? 'no-cache' : 'public, max-age=600')

  // A range's Content-Length is the slice's; the file's size ends its
  // Content-Range.
  const size = Number(c.res.headers.get('Content-Range')?.split('/')[1] ?? c.res.headers.get('Content-Length') ?? NaN)
  const modified = Date.parse(c.res.headers.get('Last-Modified') ?? '')
  if (!Number.isInteger(size) || Number.isNaN(modified)) return
  const tag = `W/"${size.toString(16)}-${(modified / 1000).toString(16)}"`
  c.header('ETag', tag)

  // eslint-disable-next-line no-restricted-syntax -- a static file, not API input
  const ifNoneMatch = c.req.header('If-None-Match')
  if (ifNoneMatch !== '*' && !ifNoneMatch?.split(',').some((t) => t.trim().replace(/^W\//, '') === tag.slice(2))) return
  // Close the file stream serveStatic opened, then answer with headers only.
  // Setting c.res merges in the old response's headers, so drop the rest.
  await c.res.body?.cancel()
  c.res = new Response(null, { status: 304 })
  for (const name of [...c.res.headers.keys()]) if (!KEPT_ON_304.has(name)) c.res.headers.delete(name)
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
