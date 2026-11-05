// The one sanctioned wrapper of zValidator.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { zValidator } from '@hono/zod-validator'
import { bodyLimit } from 'hono/body-limit'
import type { MiddlewareHandler, ValidationTargets } from 'hono'
import type { z } from 'zod'
import { ServerError } from '#errors'

/**
 * `zValidator` that throws `ServerError('VALIDATION')` on bad input, so
 * `app.onError` serializes it like any other error (400). Throwing instead
 * of returning `c.json(...)` also keeps errors out of each route's inferred
 * response type, so RPC clients read `res.json()` without narrowing. Every
 * route validates its input through this wrapper.
 */
export const zv = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ServerError('VALIDATION', firstIssueMessage(result.error))
    }
  })

/**
 * Refuse a body over `maxSize` as `TOO_LARGE` (413) before anything reads
 * it. The body is read here, inside the limit: one that declares no length
 * is counted as it streams. Later readers (`signedBody`, `zv('json')`) get
 * the bytes this read cached.
 */
export function cappedBody(maxSize: number, message: string): MiddlewareHandler {
  const tooLarge = (): never => { throw new ServerError('TOO_LARGE', message) }
  const limit = bodyLimit({ maxSize, onError: tooLarge })
  return (c, next) => limit(c, async () => {
    // eslint-disable-next-line no-restricted-syntax -- caches the body, unparsed
    await c.req.arrayBuffer().catch((err: unknown) => {
      if (err instanceof Error && err.name === 'BodyLimitError') tooLarge()
      throw err
    })
    await next()
  })
}

/** `path: message` for the first issue (path omitted for top-level issues). */
function firstIssueMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const issue = error.issues[0]
  if (!issue) return 'Validation error'
  const path = issue.path.map(String).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
