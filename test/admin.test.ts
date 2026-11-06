import crypto from 'node:crypto'
import net, { type AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildAdminApp } from '#admin/app'
import { buildApp } from '#app'
import { createApiClient } from '#client'
import { blockKey, closeDb, openDb } from '#db'

const PNG = Buffer.from('\x89PNG\r\n\x1a\nrest-of-image', 'latin1')

let id = ''
let key = ''

beforeAll(async () => {
  await openDb('memory://')
  // One report, sent the way yaac sends it.
  const app = buildApp()
  const api = createApiClient('http://yaac.test', async (input, init) => app.request(input, init))
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  key = crypto.createPublicKey(privateKey).export({ format: 'jwk' }).x ?? ''
  const body = {
    message: 'the yaks <script>alert(1)</script> are too fluffy',
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
  id = (await res.json()).id
})

afterAll(async () => {
  await closeDb()
})

const admin = (path: string, host = 'localhost:7777') => buildAdminApp().request(`http://${host}${path}`)

describe('the admin', () => {
  it('lists the reports, escaped', async () => {
    const res = await admin('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    const page = await res.text()
    expect(page).toContain(`/feedback/${id}`)
    expect(page).toContain('Dev &lt;dev@example.com&gt;')
    expect(page).toContain('&lt;script&gt;')
    expect(page).not.toContain('<script>')
    // The stylesheet is not escaped: <style> would not decode it.
    expect(page).toContain('"Segoe UI"')
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

  it('is not served on the public port', async () => {
    expect((await buildApp().request(`http://yaac.test/feedback/${id}`)).status).toBe(404)
  })
})
