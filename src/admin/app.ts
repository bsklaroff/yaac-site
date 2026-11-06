import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { zv } from '#api/validator'
import { getFeedback, getFeedbackImage, listFeedback } from '#db'
import { errorResponse, ServerError } from '#errors'
import { feedbackDetailPage, feedbackListPage } from './views'

const PAGE_SIZE = 50

/** The pages' own CSP: no script at all, images only from here. */
const PAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/** A report's images only had their magic bytes checked, so one may be a
 *  polyglot: fixed type, no sniffing, downloaded rather than opened, and
 *  sandboxed if a browser renders it anyway (src/db/schema.ts). */
const IMAGE_CSP = "default-src 'none'; sandbox"

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/**
 * The admin has no login: it is for whoever can reach its port, which binds
 * loopback by default. A page elsewhere that rebinds its own name to
 * 127.0.0.1 could still read it, so refuse any Host that is not loopback
 * too. Browsers resolve `*.localhost` to loopback themselves (RFC 6761),
 * so those names can't be rebound, and yaac's preview uses one
 * (`7777.<workspace>.localhost`). Reach it through an SSH tunnel or port
 * forward.
 */
const loopbackOnly = createMiddleware(async (c, next) => {
  // node-server passes some Hosts through unparsed (`127.0.0.256`); refuse,
  // rather than throw on, one that is not a URL host.
  const host = URL.parse(c.req.url)?.hostname ?? ''
  if (!/^(([a-z0-9-]+\.)*localhost|127(\.\d{1,3}){3}|\[::1\])$/.test(host)) {
    console.warn(`admin: refused ${c.req.method} ${c.req.path} for Host ${host}`)
    throw new ServerError('FORBIDDEN', `the admin answers only to localhost, not ${host}`)
  }
  await next()
})

const noStore = createMiddleware(async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', PAGE_CSP)
})

const reportId = z.object({ id: z.uuid() })

function notFound(): never {
  throw new ServerError('NOT_FOUND', 'no such report')
}

export interface AdminAppDeps {
  /** Log each request (the server, not tests). */
  logRequests?: boolean
}

/**
 * Build the admin app, which `main.ts` serves on its own port so the
 * public one never routes to it: the received feedback, newest first, each
 * report on its own page with its screenshots.
 */
export function buildAdminApp(deps: AdminAppDeps = {}) {
  const app = new Hono()

  if (deps.logRequests) app.use('*', logger())

  app.onError(errorResponse)
  app.use('*', loopbackOnly, noStore)

  return app
    .get('/', zv('query', z.object({ page: z.coerce.number().int().min(1).default(1) })), async (c) => {
      const { page } = c.req.valid('query')
      const { reports, more } = await listFeedback({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      return c.html(feedbackListPage(reports, { page, more }))
    })
    .get('/feedback/:id', zv('param', reportId), async (c) => {
      const report = await getFeedback(c.req.valid('param').id) ?? notFound()
      return c.html(feedbackDetailPage(report))
    })
    .get(
      '/feedback/:id/images/:position',
      zv('param', reportId.extend({ position: z.coerce.number().int().min(0).max(2 ** 31 - 1) })),
      async (c) => {
        const { id, position } = c.req.valid('param')
        const image = await getFeedbackImage(id, position) ?? notFound()
        const extension = EXTENSIONS[image.mimeType] ?? notFound()
        return c.body(new Uint8Array(image.data), 200, {
          'Content-Type': image.mimeType,
          'Content-Disposition': `attachment; filename="feedback-${id}-${position.toString()}.${extension}"`,
          'Content-Security-Policy': IMAGE_CSP,
        })
      },
    )
}
