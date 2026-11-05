/** All of a report's images together, decoded: yaac's own cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const SIGNATURES: ReadonlyArray<{ mimeType: string; test: (b: Uint8Array) => boolean }> = [
  { mimeType: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mimeType: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/gif', test: (b) => ascii(b, 0, 'GIF8') },
  { mimeType: 'image/webp', test: (b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
]

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false
  }
  return true
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Decode a report's images and type each by its magic bytes, ignoring the
 * declared type, as the sending server did. Returns the first refusal as a
 * string, so the whole report is refused rather than stored without an
 * image. Typing by magic bytes does not make them safe to show: a polyglot
 * passes, so they are stored as untrusted bytes.
 */
export function decodeImages(
  raw: ReadonlyArray<{ mimeType: string; data: string }>,
): Array<{ mimeType: string; data: Buffer }> | string {
  const images: Array<{ mimeType: string; data: Buffer }> = []
  let total = 0
  for (const { data } of raw) {
    // Buffer.from skips characters that are not base64, so check first.
    if (!BASE64.test(data)) return 'an image is not base64'
    const bytes = Buffer.from(data, 'base64')
    total += bytes.byteLength
    if (total > MAX_IMAGE_BYTES) return 'its images are over the 5 MB limit'
    const kind = SIGNATURES.find((s) => s.test(bytes))
    if (!kind) return 'an image is not a PNG, JPEG, GIF or WebP'
    images.push({ mimeType: kind.mimeType, data: bytes })
  }
  return images
}
