import { recordFeedback } from '#db'
import { ServerError } from '#errors'
import { decodeImages } from './images'
import type { FeedbackLimits } from './limits'
import type { FeedbackReport } from './report'

/** How far `sentAt` may be from this server's clock. Replays are refused by
 *  digest for as long as the report is kept, which outlasts this window. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000

/**
 * Store a report whose signature `signedBody` has verified, following the
 * endpoint checklist in bsklaroff/yaac's docs/feedback.md: refuse a stale
 * `sentAt`, a replay, a blocked key, or a key or site over its limit.
 * Images are refused whole, so a report is never stored without one.
 */
export async function receiveFeedback(
  signer: { key: string; digest: string },
  report: FeedbackReport,
  limits: FeedbackLimits,
): Promise<{ id: string }> {
  const now = new Date()
  if (Math.abs(now.getTime() - Date.parse(report.sentAt)) > MAX_CLOCK_SKEW_MS) {
    throw new ServerError('VALIDATION', 'sentAt: more than 5 minutes from this server\'s clock')
  }
  const { images: raw, ...rest } = report
  const images = decodeImages(raw)
  if (typeof images === 'string') throw new ServerError('VALIDATION', `images: ${images}`)
  return recordFeedback({ ...signer, report: rest, images }, limits, now)
}
