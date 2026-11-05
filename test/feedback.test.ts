import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type AppDeps } from '#app'
import { createApiClient } from '#client'
import { blockKey, closeDb, getFeedback, openDb } from '#db'
import type { FeedbackReport } from '#feedback/report'

/** A PNG's signature, which is all the magic-byte check reads. */
const PNG = Buffer.from('\x89PNG\r\n\x1a\nrest-of-image', 'latin1')

beforeAll(async () => {
  await openDb('memory://')
})

afterAll(async () => {
  await closeDb()
})

function client(deps?: AppDeps) {
  const app = buildApp(deps)
  return createApiClient('http://yaac.test', async (input, init) => app.request(input, init))
}

/** A yaac install: its key, exported and used to sign as yaac's
 *  packages/server/src/domain/feedback/submit.ts does. */
function install() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const key = crypto.createPublicKey(privateKey).export({ format: 'jwk' }).x ?? ''
  const sign = (body: string) => crypto.sign(null, Buffer.from(body), privateKey).toString('base64url')
  return { key, sign }
}

function report(overrides: Partial<FeedbackReport> = {}): FeedbackReport {
  return {
    message: 'the yaks are too fluffy',
    images: [],
    sentAt: new Date().toISOString(),
    from: { source: 'git', email: 'dev@example.com', name: 'Dev' },
    server: { version: '0.1.2', gitCommit: 'abc123', buildId: 'build-1', driver: 'containerless' },
    client: {
      version: '0.1.2',
      gitCommit: 'abc123',
      userAgent: 'Mozilla/5.0 Electron',
      app: { kind: 'desktop', version: '0.1.2', build: null, gitCommit: 'abc123' },
    },
    ...overrides,
  }
}

/** Send `body` signed by `by`; the client serializes it with
 *  JSON.stringify, as yaac does, so the signature covers those bytes. */
function send(api: ReturnType<typeof client>, by: ReturnType<typeof install>, body: FeedbackReport, signed: FeedbackReport = body) {
  return api.feedback.$post({
    header: { 'x-yaac-key': by.key, 'x-yaac-signature': by.sign(JSON.stringify(signed)) },
    json: body,
  })
}

describe('POST /api/feedback', () => {
  it('stores a signed report with its images', async () => {
    const api = client()
    const by = install()
    const body = report({ images: [{ mimeType: 'image/jpeg', data: PNG.toString('base64') }] })
    const res = await send(api, by, body)
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const row = await getFeedback(id)
    expect(row).toMatchObject({
      key: by.key,
      message: body.message,
      sentAt: new Date(body.sentAt),
      from: body.from,
      server: body.server,
      client: body.client,
    })
    // Typed by its bytes, not the type it declared.
    expect(row?.images).toHaveLength(1)
    expect(row?.images[0]?.mimeType).toBe('image/png')
    expect(Buffer.from(row?.images[0]?.data ?? []).equals(PNG)).toBe(true)
  })

  it('accepts a report with no from or client', async () => {
    const res = await send(client(), install(), report({ from: null, client: null }))
    expect(res.status).toBe(201)
  })

  it('refuses a body the signature does not cover', async () => {
    const body = report()
    const res = await send(client(), install(), body, { ...body, message: 'something else' })
    expect(res.status).toBe(401)
  })

  it('refuses a signature made with another key', async () => {
    const body = report()
    const res = await client().feedback.$post({
      header: { 'x-yaac-key': install().key, 'x-yaac-signature': install().sign(JSON.stringify(body)) },
      json: body,
    })
    expect(res.status).toBe(401)
  })

  it('refuses malformed signing headers', async () => {
    const res = await client().feedback.$post({
      header: { 'x-yaac-key': 'short', 'x-yaac-signature': 'short' },
      json: report(),
    })
    expect(res.status).toBe(400)
  })

  it('caps the body before checking its signature', async () => {
    const big = report({ images: [{ mimeType: 'image/png', data: 'A'.repeat(8 * 1024 * 1024) }] })
    const res = await client().feedback.$post({
      header: { 'x-yaac-key': 'A'.repeat(43), 'x-yaac-signature': 'A'.repeat(86) },
      json: big,
    })
    expect(res.status).toBe(413)
  })

  it('refuses a sentAt far from its clock', async () => {
    const res = await send(client(), install(), report({ sentAt: new Date(Date.now() - 10 * 60_000).toISOString() }))
    expect(res.status).toBe(400)
  })

  it('refuses a replay', async () => {
    const api = client()
    const by = install()
    const body = report()
    expect((await send(api, by, body)).status).toBe(201)
    expect((await send(api, by, body)).status).toBe(409)
  })

  it('refuses the whole report if an image is not one', async () => {
    const api = client()
    const by = install()
    const res = await send(api, by, report({
      images: [
        { mimeType: 'image/png', data: PNG.toString('base64') },
        { mimeType: 'image/png', data: Buffer.from('<html>').toString('base64') },
      ],
    }))
    expect(res.status).toBe(400)
  })

  it('refuses a body that is not the report', async () => {
    const by = install()
    const body = { ...report(), message: '   ' }
    const res = await send(client(), by, body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('refuses a blocked key', async () => {
    const by = install()
    await blockKey(by.key)
    expect((await send(client(), by, report())).status).toBe(403)
  })

  it('rate-limits each key', async () => {
    const api = client({ limits: { windowMs: 60_000, perKey: 2, newKeys: 1000 } })
    const by = install()
    expect((await send(api, by, report({ message: 'one' }))).status).toBe(201)
    expect((await send(api, by, report({ message: 'two' }))).status).toBe(201)
    expect((await send(api, by, report({ message: 'three' }))).status).toBe(429)
    // Another install is not held back by it.
    expect((await send(api, install(), report())).status).toBe(201)
  })

  it('caps the keys it has never seen', async () => {
    // Every key the earlier tests made counts against this window.
    const api = client({ limits: { windowMs: 60_000, perKey: 1000, newKeys: 0 } })
    expect((await send(api, install(), report())).status).toBe(429)
  })
})

describe('the site', () => {
  it('serves the landing page', async () => {
    const res = await buildApp().request('http://yaac.test/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/html/)
    expect(await res.text()).toContain('Yet Another Agent Container')
  })

  it('answers an unknown API route with a JSON 404', async () => {
    const res = await buildApp().request('http://yaac.test/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('answers health through the client', async () => {
    const res = await client().health.$get()
    expect(await res.json()).toEqual({ ok: true })
  })
})
