import crypto from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { ServerError } from '#errors'

/** The headers a yaac server signs a report with: base64url of the raw
 *  32-byte Ed25519 public key, and of the 64-byte signature. */
export const signedHeaders = z.object({
  'x-yaac-key': z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'not a base64url Ed25519 public key'),
  'x-yaac-signature': z.string().regex(/^[A-Za-z0-9_-]{86}$/, 'not a base64url Ed25519 signature'),
})

/** Who signed the body, and the digest a replay of it would share. */
export interface Signer {
  key: string
  digest: string
}

/**
 * Verify `X-Yaac-Signature` over the exact body bytes with `X-Yaac-Key`,
 * refusing the request as `UNAUTHENTICATED` (401) before the body is
 * parsed. Runs after `zv('header', signedHeaders)`, which typed the
 * headers for the RPC client, and `cappedBody`, which read the body inside
 * the cap. Sets `signer` for the handler.
 *
 * This proves only that the report comes from the install holding the
 * key, not that the install is genuine yaac, nor its `from` or `client`.
 */
export const signedBody = createMiddleware<{ Variables: { signer: Signer } }>(async (c, next) => {
  /* eslint-disable no-restricted-syntax -- the signature covers the raw bytes */
  const key = c.req.header('x-yaac-key') ?? ''
  const signature = Buffer.from(c.req.header('x-yaac-signature') ?? '', 'base64url')
  const body = Buffer.from(await c.req.arrayBuffer())
  /* eslint-enable no-restricted-syntax */
  let verified = false
  try {
    const publicKey = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: key }, format: 'jwk' })
    verified = crypto.verify(null, body, publicKey, signature)
  } catch {
    // A key that is not a curve point verifies nothing.
  }
  if (!verified) throw new ServerError('UNAUTHENTICATED', 'the signature does not match the body and key')
  const digest = crypto.createHash('sha256')
    .update(Buffer.from(key, 'base64url'))
    .update(body)
    .digest('hex')
  c.set('signer', { key, digest })
  await next()
})
