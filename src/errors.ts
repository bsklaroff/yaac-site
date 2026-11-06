import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * The error codes the server returns in every non-2xx response body, as
 * `{ error: { code, message } }`.
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'

export interface ServerErrorBody {
  error: {
    code: ErrorCode
    message: string
  }
}

export class ServerError extends Error {
  readonly code: ErrorCode
  readonly httpStatus: ContentfulStatusCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
    this.httpStatus = defaultStatus(code)
  }
}

function defaultStatus(code: ErrorCode): ContentfulStatusCode {
  switch (code) {
    case 'NOT_FOUND': return 404
    case 'VALIDATION': return 400
    // The signature does not verify against the key it names.
    case 'UNAUTHENTICATED': return 401
    // The key is blocked.
    case 'FORBIDDEN': return 403
    // A replay of a report already received.
    case 'CONFLICT': return 409
    // Refused rather than silently truncated.
    case 'TOO_LARGE': return 413
    case 'RATE_LIMITED': return 429
    case 'INTERNAL': return 500
  }
}

/** The wire form of a thrown error. An unexpected one's message stays in
 *  the log, not the response. */
export function errorResponse(err: Error, c: Context): Response {
  const reply = (status: ContentfulStatusCode, error: ServerErrorBody['error']) => c.json({ error }, status)
  if (err instanceof ServerError) return reply(err.httpStatus, { code: err.code, message: err.message })
  // Hono's own validator refusals: malformed JSON, a wrong Content-Type.
  if (err instanceof HTTPException && err.status === 400) return reply(400, { code: 'VALIDATION', message: err.message })
  console.error(`${c.req.method} ${c.req.path} failed:`, err)
  return reply(500, { code: 'INTERNAL', message: 'internal error' })
}
