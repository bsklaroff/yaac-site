import type { FeedbackClient, FeedbackFrom, FeedbackServer } from '#feedback/report'
import { bytea, index, integer, jsonb, primaryKey, snakeCase, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Drizzle schema for the site's PGlite database (see client.ts).
 *
 * `snakeCase.table` derives column names from the camelCase keys
 * (`firstSeenAt` → `first_seen_at`) for both drizzle-kit and runtime
 * queries.
 *
 * drizzle-kit loads this file with plain-Node resolution, so keep it free
 * of runtime `#` imports (type-only imports are erased).
 */

/**
 * Every yaac install that has sent feedback, by the Ed25519 public key it
 * signs with. A key costs nothing to make, so this is what rate limits and
 * blocks count by, and its first sighting what the new-key cap counts.
 * Every user of an install shares its key.
 */
export const installKeys = snakeCase.table('install_keys', {
  /** The `X-Yaac-Key`: base64url of the raw 32-byte public key. */
  key: text().primaryKey(),
  firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** Set by hand to refuse the key's reports (403). */
  blockedAt: timestamp({ withTimezone: true }),
}, (t) => [index().on(t.firstSeenAt)])

/**
 * One accepted report. `from` and `client` are claims made by the install
 * the key names, not vouched for (docs/feedback.md in bsklaroff/yaac).
 */
export const feedback = snakeCase.table('feedback', {
  id: uuid().primaryKey().defaultRandom(),
  key: text().notNull().references(() => installKeys.key),
  /** SHA-256 of the key and the exact body, hex. A replay has the same one,
   *  and rows are kept, so it is refused for as long as the report is. */
  digest: text().notNull().unique(),
  message: text().notNull(),
  sentAt: timestamp({ withTimezone: true }).notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  from: jsonb().$type<FeedbackFrom>(),
  server: jsonb().$type<FeedbackServer>().notNull(),
  client: jsonb().$type<FeedbackClient>(),
  /** Set from the admin to hide the report from its list by default. */
  archivedAt: timestamp({ withTimezone: true }),
}, (t) => [index().on(t.key, t.receivedAt)])

/**
 * A report's screenshots, typed by their magic bytes. Untrusted: whatever
 * shows them must serve a fixed `Content-Type` with `nosniff` and
 * `Content-Disposition: attachment`, or re-encode them, and never inline on
 * an origin that matters, since a polyglot passes the magic-byte check.
 */
export const feedbackImages = snakeCase.table('feedback_images', {
  feedbackId: uuid().notNull().references(() => feedback.id, { onDelete: 'cascade' }),
  /** Its index in the report's `images`. */
  position: integer().notNull(),
  mimeType: text().notNull(),
  data: bytea().notNull(),
}, (t) => [primaryKey({ columns: [t.feedbackId, t.position] })])
