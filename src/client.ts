import { hc } from 'hono/client'
import type { AppType } from '#app'

/** The typed client for `origin`'s API, which every caller uses rather
 *  than building requests by hand. */
export function createApiClient(
  origin: string,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = globalThis.fetch,
) {
  return hc<AppType>(`${origin}/api`, { fetch })
}
