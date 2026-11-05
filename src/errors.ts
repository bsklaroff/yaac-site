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
