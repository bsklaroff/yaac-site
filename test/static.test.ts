import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '#app'

const app = buildApp()
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => app.request(path, { method, headers })

describe('static files', () => {
  it('revalidates the page and its scripts on every load', async () => {
    for (const path of ['/', '/index.html', '/yaks.js', '/swarm.js']) {
      const res = await get(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('Cache-Control'), path).toBe('no-cache')
      await res.body?.cancel()
    }
  })

  it('keeps fonts and images cached for 10 minutes', async () => {
    for (const path of ['/assets/fonts/geist-latin-wght-normal.woff2', '/assets/show-chat-dark.webp', '/assets/wordmark.svg']) {
      const res = await get(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('Cache-Control'), path).toBe('public, max-age=600')
      await res.body?.cancel()
    }
  })

  it('gives GET, HEAD and a range of a file the same ETag', async () => {
    const full = await get('/yaks.js')
    const tag = full.headers.get('ETag')
    await full.body?.cancel()
    expect(tag).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/)

    const head = await get('/yaks.js', {}, 'HEAD')
    expect(head.headers.get('ETag')).toBe(tag)

    const part = await get('/yaks.js', { Range: 'bytes=0-99' })
    expect(part.status).toBe(206)
    expect(part.headers.get('ETag')).toBe(tag)
    await part.body?.cancel()
  })

  it('answers a matching If-None-Match with a 304 that keeps its validators', async () => {
    const first = await get('/yaks.js')
    const tag = first.headers.get('ETag') ?? ''
    await first.body?.cancel()

    for (const [method, ifNoneMatch] of [['GET', tag], ['HEAD', tag], ['GET', `"other", ${tag.slice(2)}`], ['GET', '*']]) {
      const res = await get('/yaks.js', { 'If-None-Match': ifNoneMatch }, method)
      expect(res.status, `${method} ${ifNoneMatch}`).toBe(304)
      expect(res.headers.get('ETag')).toBe(tag)
      expect(res.headers.get('Cache-Control')).toBe('no-cache')
      expect(res.headers.get('Content-Length')).toBeNull()
      expect(res.headers.get('Content-Type')).toBeNull()
      expect(await res.text()).toBe('')
    }

    const stale = await get('/yaks.js', { 'If-None-Match': 'W/"0-0"' })
    expect(stale.status).toBe(200)
    await stale.body?.cancel()
  })

  it('leaves the API and missing files alone', async () => {
    for (const path of ['/api/health', '/api/nope', '/nope.js']) {
      const res = await get(path)
      expect(res.headers.get('Cache-Control'), path).toBeNull()
      expect(res.headers.get('ETag'), path).toBeNull()
    }
  })
})

describe('the demo video', () => {
  const bytes = Buffer.from('a small stand-in for an mp4 file, long enough to slice')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaac-demo-video-'))
  fs.writeFileSync(path.join(dir, 'demo-video.mp4'), bytes)
  const video = buildApp({ mediaDir: dir })

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('streams the media dir file at /demo-video as video/mp4', async () => {
    const res = await video.request('/demo-video')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600')
    expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/)
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true)
  })

  it('answers a byte range so a browser can seek', async () => {
    const res = await video.request('/demo-video', { headers: { Range: 'bytes=0-11' } })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-11/${bytes.length}`)
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes.subarray(0, 12))).toBe(true)
  })

  it('honours If-Range: a stale validator gets the whole file', async () => {
    const stale = await video.request('/demo-video', {
      headers: { Range: 'bytes=0-11', 'If-Range': 'Thu, 01 Jan 2015 00:00:00 GMT' },
    })
    expect(stale.status).toBe(200)
    expect(stale.headers.get('Content-Length')).toBe(String(bytes.length))
    await stale.body?.cancel()

    const current = fs.statSync(path.join(dir, 'demo-video.mp4')).mtime.toUTCString()
    const fresh = await video.request('/demo-video', { headers: { Range: 'bytes=0-11', 'If-Range': current } })
    expect(fresh.status).toBe(206)
    expect(fresh.headers.get('Content-Range')).toBe(`bytes 0-11/${bytes.length}`)
    await fresh.body?.cancel()
  })

  it('answers suffix ranges and a past-EOF 416', async () => {
    const suffix = await video.request('/demo-video', { headers: { Range: 'bytes=-5' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('Content-Range')).toBe(`bytes ${bytes.length - 5}-${bytes.length - 1}/${bytes.length}`)
    await suffix.body?.cancel()

    const past = await video.request('/demo-video', { headers: { Range: `bytes=${bytes.length}-` } })
    expect(past.status).toBe(416)
    expect(past.headers.get('Content-Range')).toBe(`bytes */${bytes.length}`)
    await past.body?.cancel()
  })

  it('answers a matching If-None-Match with a 304', async () => {
    const first = await video.request('/demo-video')
    const tag = first.headers.get('ETag') ?? ''
    await first.body?.cancel()
    const res = await video.request('/demo-video', { headers: { 'If-None-Match': tag } })
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(tag)
    // If-None-Match is evaluated before Range (RFC 9110), so this is still a 304.
    const withRange = await video.request('/demo-video', { headers: { 'If-None-Match': tag, Range: 'bytes=0-11' } })
    expect(withRange.status).toBe(304)
  })

  it('answers 404 with no file, and with no media dir', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'yaac-demo-video-empty-'))
    try {
      expect((await buildApp({ mediaDir: empty }).request('/demo-video')).status).toBe(404)
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
    expect((await buildApp().request('/demo-video')).status).toBe(404)
  })
})
