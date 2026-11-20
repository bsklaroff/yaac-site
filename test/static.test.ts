import { describe, expect, it } from 'vitest'
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
    for (const path of ['/assets/fonts/geist-latin-wght-normal.woff2', '/assets/show-review.webp', '/assets/wordmark.svg']) {
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
