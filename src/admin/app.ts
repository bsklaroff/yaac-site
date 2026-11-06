import crypto from 'node:crypto'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { zv } from '#api/validator'
import { getFeedback, getFeedbackImage, listFeedback, setFeedbackArchived } from '#db'
import { errorResponse, ServerError } from '#errors'
import { feedbackDetailPage, feedbackListPage, listUrl, SCRIPT } from './views'

const PAGE_SIZE = 50

/** The pages' own CSP: no script but the list's select-all box, images
 *  and forms only from here. */
const PAGE_CSP = `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${crypto.createHash('sha256').update(SCRIPT).digest('base64')}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`

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

/**
 * The Host check lets through a form another site's page makes the browser
 * post here (CSRF), so a POST must come from one of these pages: by
 * `Sec-Fetch-Site`, or by `Origin` from a browser too old to send it.
 */
const sameOriginPosts = createMiddleware(async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    // eslint-disable-next-line no-restricted-syntax -- who sent it, not input
    const site = c.req.header('sec-fetch-site')
    // eslint-disable-next-line no-restricted-syntax -- who sent it, not input
    const origin = c.req.header('origin')
    if (site ? site !== 'same-origin' : origin !== new URL(c.req.url).origin) {
      console.warn(`admin: refused ${c.req.method} ${c.req.path} from ${origin ?? 'no origin'} (${site ?? 'no Sec-Fetch-Site'})`)
      throw new ServerError('FORBIDDEN', 'the admin takes posts only from its own pages')
    }
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

/** Which of the list's pages: `archived` shows the archived reports too. */
const listView = z.object({
  page: z.coerce.number().int().min(1).default(1),
  archived: z.stringbool().default(false),
})

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
  app.use('*', loopbackOnly, sameOriginPosts, noStore)

  return app
    .get('/', zv('query', listView), async (c) => {
      const view = c.req.valid('query')
      const { reports, more } = await listFeedback({
        limit: PAGE_SIZE,
        offset: (view.page - 1) * PAGE_SIZE,
        archived: view.archived,
      })
      return c.html(feedbackListPage(reports, { ...view, more }))
    })
    // The list's checked reports, archived or unarchived by the button
    // pressed, then back to the page they were on.
    .post(
      '/archive',
      zv('form', listView.extend({
        // A form sends one checked box as a string, several as an array,
        // and never more than the page it came from shows.
        id: z.union([z.uuid(), z.array(z.uuid()).max(PAGE_SIZE)]).default([]).transform((ids) => [ids].flat()),
        archive: z.stringbool(),
      })),
      async (c) => {
        const { id, archive, ...view } = c.req.valid('form')
        await setFeedbackArchived(id, archive)
        return c.redirect(listUrl(view), 303)
      },
    )
    .get('/feedback/:id', zv('param', reportId), async (c) => {
      const report = await getFeedback(c.req.valid('param').id) ?? notFound()
      return c.html(feedbackDetailPage(report))
    })
    .post('/feedback/:id/archive', zv('param', reportId), zv('form', z.object({ archive: z.stringbool() })), async (c) => {
      const { id } = c.req.valid('param')
      const [found] = await setFeedbackArchived([id], c.req.valid('form').archive)
      if (!found) notFound()
      return c.redirect(`/feedback/${id}`, 303)
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
