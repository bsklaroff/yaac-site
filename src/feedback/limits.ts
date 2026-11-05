/** How many reports one key may send, and how many keys may first appear
 *  site-wide, per `windowMs`. */
export interface FeedbackLimits {
  windowMs: number
  perKey: number
  newKeys: number
}

/** A key costs nothing to make, so new keys are capped site-wide as well
 *  as each key's reports. */
export const DEFAULT_LIMITS: FeedbackLimits = {
  windowMs: 60 * 60_000,
  perKey: 20,
  newKeys: 100,
}
