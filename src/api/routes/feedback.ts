import { Hono } from 'hono'
import type { FeedbackLimits } from '#feedback/limits'
import { receiveFeedback } from '#feedback/receive'
import { feedbackReport } from '#feedback/report'
import { signedBody, signedHeaders } from '#api/signed'
import { cappedBody, zv } from '#api/validator'

/** A well-formed report is at most about 7 MB: 5 MB of images in base64,
 *  plus the words. Capped before the signature is checked, so a forged
 *  flood cannot exhaust the server. */
const FEEDBACK_BODY_LIMIT = 7 * 1024 * 1024

/**
 * `POST /api/feedback`: the endpoint a yaac server's `YAAC_FEEDBACK_URL`
 * names. The middleware runs in the order the contract's checklist sets:
 * cap the body, verify its signature, then parse it.
 */
export function feedbackRoutes(limits: FeedbackLimits) {
  return new Hono()
    .post(
      '/',
      zv('header', signedHeaders),
      cappedBody(FEEDBACK_BODY_LIMIT, 'the report is over the 7 MB limit'),
      signedBody,
      zv('json', feedbackReport),
      async (c) => c.json(await receiveFeedback(c.get('signer'), c.req.valid('json'), limits), 201),
    )
}
