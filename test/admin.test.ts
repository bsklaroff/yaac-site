import crypto from 'node:crypto'
import net, { type AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAdminApp } from '#admin/app'
import { SCRIPT } from '#admin/views'
import { buildApp } from '#app'
import { createApiClient } from '#client'
import { blockKey, closeDb, getFeedback, openDb, setFeedbackArchived } from '#db'

const PNG = Buffer.from('\x89PNG\r\n\x1a\nrest-of-image', 'latin1')

let id = ''
let key = ''

/** Send a report the way yaac sends it, from an install of its own. */
async function send(message: string): Promise<{ id: string; key: string }> {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  const key = crypto.createPublicKey(privateKey).export({ format: 'jwk' }).x ?? ''
  const app = buildApp()
  const api = createApiClient('http://yaac.test', async (input, init) => app.request(input, init))
  const body = {
    message,
    images: [{ mimeType: 'image/png', data: PNG.toString('base64') }],
    sentAt: new Date().toISOString(),
    from: { source: 'git', email: 'dev@example.com', name: 'Dev' },
    server: { version: '0.1.2', gitCommit: 'abc123', buildId: 'build-1', driver: 'containerless' },
    client: null,
  }
  const res = await api.feedback.$post({
    header: { 'x-yaac-key': key, 'x-yaac-signature': crypto.sign(null, Buffer.from(JSON.stringify(body)), privateKey).toString('base64url') },
    json: body,
  })
  return { id: (await res.json()).id, key }
}

beforeAll(async () => {
  await openDb('memory://')
  ;({ id, key } = await send('the yaks <script>alert(1)</script> are too fluffy'))
})

afterAll(async () => {
  await closeDb()
})

const admin = (path: string, host = 'localhost:7777') => buildAdminApp().request(`http://${host}${path}`)

/** Post a form the way one of the admin's own pages does. */
const post = (path: string, form: Array<[string, string]>, headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) =>
  buildAdminApp().request(`http://localhost:7777${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(form).toString(),
  })

describe('the admin', () => {
  it('lists the reports, escaped', async () => {
    const res = await admin('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    const page = await res.text()
    expect(page).toContain(`/feedback/${id}`)
    expect(page).toContain('Dev &lt;dev@example.com&gt;')
    expect(page).toContain('&lt;script&gt;')
    expect(page).not.toContain('<script>alert')
    // The stylesheet is not escaped: <style> would not decode it.
    expect(page).toContain('"Segoe UI"')
  })

  it('runs only its own select-all script', async () => {
    const res = await admin('/')
    const hash = crypto.createHash('sha256').update(SCRIPT).digest('base64')
    expect(res.headers.get('content-security-policy')).toContain(`script-src 'sha256-${hash}';`)
    const page = await res.text()
    expect(page).toContain(`<script>${SCRIPT}</script>`)
    expect(page).toContain('id="select-all"')
    expect(page.match(/<script>/g)).toHaveLength(1)
  })

  it('shows a report with its key and images', async () => {
    await blockKey(key)
    const page = await (await admin(`/feedback/${id}`)).text()
    expect(page).toContain(key)
    expect(page).toContain('blocked')
    expect(page).toContain(`<img src="/feedback/${id}/images/0"`)
    expect(page).toContain('containerless')
  })

  it('serves an image as a download it cannot sniff', async () => {
    const res = await admin(`/feedback/${id}/images/0`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
  })

  it('answers a missing report or image with 404', async () => {
    expect((await admin(`/feedback/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await admin(`/feedback/${id}/images/1`)).status).toBe(404)
    expect((await admin('/feedback/not-a-uuid')).status).toBe(400)
  })

  it('answers only to a loopback Host', async () => {
    expect((await admin('/', '127.0.0.1:7777')).status).toBe(200)
    expect((await admin('/', '[::1]:7777')).status).toBe(200)
    // yaac's preview.
    expect((await admin('/', '7777.ab4c3948.localhost')).status).toBe(200)
    for (const host of [
      'evil.example:7777',
      'localhost.evil.example',
      'evil.localhost.attacker.com',
      '127.0.0.1.evil.com',
      'localhost.',
      '0.0.0.0',
    ]) {
      expect((await admin('/', host)).status, host).toBe(403)
    }
  })

  it('refuses a foreign Host on every route', async () => {
    for (const path of [`/feedback/${id}`, `/feedback/${id}/images/0`, '/nope']) {
      expect((await admin(path, 'evil.example')).status, path).toBe(403)
    }
  })

  it('refuses a Host that is not a URL host, rather than failing', async () => {
    // app.request would refuse to build the URL, so this needs a socket.
    const server = serve({ fetch: buildAdminApp().fetch, port: 0, hostname: '127.0.0.1' })
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo
    try {
      const status = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          socket.end('GET / HTTP/1.1\r\nHost: 127.0.0.256\r\nConnection: close\r\n\r\n')
        })
        let reply = ''
        socket.on('data', (chunk: Buffer) => { reply += chunk.toString() })
        socket.on('end', () => { resolve(reply.split('\r\n')[0] ?? '') })
        socket.on('error', reject)
      })
      expect(status).toBe('HTTP/1.1 403 Forbidden')
    } finally {
      server.close()
    }
  })

  it('refuses an image position past the column', async () => {
    expect((await admin(`/feedback/${id}/images/2147483647`)).status).toBe(404)
    expect((await admin(`/feedback/${id}/images/2147483648`)).status).toBe(400)
  })

  it('archives the checked reports, and shows them only when asked', async () => {
    const { id: other } = await send('another report')
    const { id: third } = await send('one left alone')
    const res = await post('/archive', [['id', id], ['id', other], ['archive', '1'], ['archived', '1'], ['page', '2']])
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/?archived=1&page=2')

    const list = await (await admin('/')).text()
    expect(list).not.toContain(`/feedback/${id}`)
    expect(list).not.toContain(`/feedback/${other}`)
    expect(list).toContain(`/feedback/${third}`)
    expect(list).toContain('href="/?archived=1">Show archived')

    const all = await (await admin('/?archived=1')).text()
    expect(all).toContain(`/feedback/${id}`)
    expect(all).toContain(`/feedback/${other}`)
    expect(all).toContain('<tr class="archived">')
    expect(all).toContain('Unarchive selected')
    expect(all).toContain('href="/">Hide archived')

    expect(await (await admin(`/feedback/${id}`)).text()).toContain('>Unarchive</button>')
    // One box checked arrives as a string; none, as nothing.
    expect((await post('/archive', [['id', other], ['archive', '0']])).headers.get('location')).toBe('/')
    expect((await post('/archive', [['archive', '1']])).status).toBe(303)
    expect(await (await admin('/')).text()).toContain(`/feedback/${other}`)
  })

  it('archives and unarchives one report from its page', async () => {
    const res = await post(`/feedback/${id}/archive`, [['archive', '0']])
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`/feedback/${id}`)
    expect(await (await admin('/')).text()).toContain(`/feedback/${id}`)
    expect(await (await admin(`/feedback/${id}`)).text()).toContain('>Archive</button>')
    expect((await post(`/feedback/${crypto.randomUUID()}/archive`, [['archive', '1']])).status).toBe(404)
    expect((await post('/archive', [['id', 'not-a-uuid'], ['archive', '1']])).status).toBe(400)
    // No page shows more than 50, and more than 65,535 would overflow the
    // query's parameters.
    const many = Array.from({ length: 51 }, (): [string, string] => ['id', crypto.randomUUID()])
    expect((await post('/archive', [...many, ['archive', '1']])).status).toBe(400)
  })

  it('takes posts only from its own pages', async () => {
    const archive = (headers: Record<string, string>) => post(`/feedback/${id}/archive`, [['archive', '1']], headers)
    expect((await archive({ 'Sec-Fetch-Site': 'cross-site', 'Origin': 'http://localhost:7777' })).status).toBe(403)
    expect((await archive({ 'Sec-Fetch-Site': 'same-site', 'Origin': 'http://8000.ab4c3948.localhost' })).status).toBe(403)
    expect((await archive({ 'Origin': 'http://evil.example' })).status).toBe(403)
    expect((await archive({})).status).toBe(403)
    expect(await (await admin('/')).text()).toContain(`/feedback/${id}`)
    // A browser too old to send Sec-Fetch-Site still sends Origin.
    expect((await archive({ 'Origin': 'http://localhost:7777' })).status).toBe(303)
    expect(await (await admin('/')).text()).not.toContain(`/feedback/${id}`)
  })

  it('keeps when a report was first archived, until it is unarchived', async () => {
    const { id: first } = await send('archived twice')
    const { id: second } = await send('archived once')
    const earlier = new Date('2026-11-06T17:09:32Z')
    const later = new Date('2026-11-06T17:09:34Z')
    expect(await setFeedbackArchived([first], true, earlier)).toEqual([first])
    expect((await setFeedbackArchived([first, second], true, later)).sort()).toEqual([first, second].sort())
    expect((await getFeedback(first))?.archivedAt).toEqual(earlier)
    expect((await getFeedback(second))?.archivedAt).toEqual(later)
    expect(await (await admin(`/feedback/${first}`)).text()).toContain('<th>archived</th><td>2026-11-06 17:09:32 UTC</td>')

    await setFeedbackArchived([first, second], false)
    expect((await getFeedback(first))?.archivedAt).toBeNull()
    expect((await getFeedback(second))?.archivedAt).toBeNull()
    expect(await (await admin(`/feedback/${first}`)).text()).toContain('<th>archived</th><td>—</td>')
  })

  it('is not served on the public port', async () => {
    expect((await buildApp().request(`http://yaac.test/feedback/${id}`)).status).toBe(404)
  })
})
