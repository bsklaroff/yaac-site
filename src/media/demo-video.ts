import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ServerError } from '#errors'

/** The uploaded demo video's name inside the media dir. */
export const DEMO_VIDEO_NAME = 'demo-video.mp4'

/** Refuse an upload over 2 GiB, well under the volume's size. */
export const DEMO_VIDEO_LIMIT = 2 * 1024 ** 3

/** Where the demo video lives inside `mediaDir`. */
export function demoVideoPath(mediaDir: string): string {
  return path.join(mediaDir, DEMO_VIDEO_NAME)
}

/** The prefix a temp file of an in-progress upload has. */
const PART_PREFIX = `.${DEMO_VIDEO_NAME}.`

/**
 * Remove leftover temp files from uploads a crash, an OOM kill or a
 * redeploy interrupted (their `catch` never ran). Only one server writes
 * `mediaDir`, so anything matching the temp name at startup is stale.
 * Best-effort: a directory that does not exist yet, or a file that cannot
 * be removed, is not an error.
 */
export async function sweepStaleParts(mediaDir: string): Promise<void> {
  let names: string[]
  try {
    names = await fsp.readdir(mediaDir)
  } catch {
    return
  }
  await Promise.all(names
    .filter((name) => name.startsWith(PART_PREFIX) && name.endsWith('.part'))
    .map((name) => fsp.rm(path.join(mediaDir, name), { force: true }).catch(() => undefined)))
}

/**
 * Counts an upload's bytes and, once it has the first eight, checks they
 * begin with an MP4 box header: `ftyp` at offset 4 (the size at 0-3).
 * Refuses an over-long body as TOO_LARGE (413) and anything else as
 * VALIDATION (400), before the bytes reach the file.
 */
class Mp4Guard extends Transform {
  #size = 0
  #head: Buffer[] = []
  #headLength = 0
  #checked = false

  get size(): number {
    return this.#size
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.#size += chunk.length
    if (this.#size > DEMO_VIDEO_LIMIT) {
      callback(new ServerError('TOO_LARGE', `the video is over the ${(DEMO_VIDEO_LIMIT / 1024 ** 3).toString()} GiB limit`))
      return
    }
    if (!this.#checked) {
      this.#head.push(chunk)
      this.#headLength += chunk.length
      if (this.#headLength >= 8) {
        const head = Buffer.concat(this.#head, this.#headLength)
        if (head.subarray(4, 8).toString('latin1') !== 'ftyp') {
          callback(new ServerError('VALIDATION', 'not an MP4'))
          return
        }
        this.#checked = true
        this.#head = []
      }
    }
    callback(null, chunk)
  }

  override _flush(callback: TransformCallback): void {
    // Fewer than eight bytes ever arrived, so it is neither an MP4 nor
    // anything else worth keeping.
    callback(this.#checked ? undefined : new ServerError('VALIDATION', 'not an MP4'))
  }
}

/**
 * Save the uploaded demo video: stream `body` to a temp file in `mediaDir`,
 * checking it as it goes, then rename it over `demo-video.mp4`. The rename
 * is atomic, so a viewer streaming the old file keeps the old one. Returns
 * the size.
 *
 * The body is streamed, never buffered: it can be gigabytes, and
 * `parseBody`/`formData` would hold it (twice) in memory. Any error,
 * including the client aborting, unlinks the temp file and rethrows.
 */
export async function saveDemoVideo(mediaDir: string, body: ReadableStream<Uint8Array> | null): Promise<number> {
  if (!body) throw new ServerError('VALIDATION', 'the request has no video')
  await fsp.mkdir(mediaDir, { recursive: true })
  const temp = path.join(mediaDir, `${PART_PREFIX}${crypto.randomUUID()}.part`)
  const guard = new Mp4Guard()
  try {
    // The DOM and node:stream/web ReadableStream types differ; the value is
    // the same stream, so cast across.
    const source = Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(source, guard, fs.createWriteStream(temp, { flags: 'wx' }))
    await fsp.rename(temp, demoVideoPath(mediaDir))
  } catch (err) {
    await fsp.rm(temp, { force: true }).catch(() => undefined)
    // A full disk beside the database is worth saying plainly rather than
    // as an opaque 500.
    const code = (err as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOSPC' || code === 'EDQUOT') {
      throw new ServerError('INSUFFICIENT_STORAGE', 'the media volume is full')
    }
    throw err
  }
  return guard.size
}

/** The saved video's size and upload time, or null when none is there. */
export async function demoVideoInfo(mediaDir: string): Promise<{ size: number; modified: Date } | null> {
  try {
    const stats = await fsp.stat(demoVideoPath(mediaDir))
    return stats.isFile() ? { size: stats.size, modified: stats.mtime } : null
  } catch {
    return null
  }
}
