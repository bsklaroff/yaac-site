import { and, count, eq, gt } from 'drizzle-orm'
import { ServerError } from '#errors'
import type { FeedbackLimits } from '#feedback/limits'
import type { FeedbackReport } from '#feedback/report'
import { getDb } from './client'
import { feedback, feedbackImages, installKeys } from './schema'

/**
 * Record a verified report from `key`, recording the key too the first
 * time it is seen. Throws if the key is blocked (`FORBIDDEN`), the report
 * is a replay (`CONFLICT`), or a limit is reached (`RATE_LIMITED`), which
 * rolls the key back too. One transaction, which PGlite runs exclusively, so
 * concurrent reports can't both pass a limit only one fits under.
 */
export async function recordFeedback(
  entry: {
    key: string
    digest: string
    report: Omit<FeedbackReport, 'images'>
    images: ReadonlyArray<{ mimeType: string; data: Buffer }>
  },
  limits: FeedbackLimits,
  now: Date = new Date(),
): Promise<{ id: string }> {
  const db = await getDb()
  const since = new Date(now.getTime() - limits.windowMs)
  return db.transaction(async (tx) => {
    const [known] = await tx.select().from(installKeys).where(eq(installKeys.key, entry.key))
    if (known?.blockedAt) throw new ServerError('FORBIDDEN', 'this install\'s key is blocked')
    const [seen] = await tx.select({ id: feedback.id }).from(feedback).where(eq(feedback.digest, entry.digest))
    if (seen) throw new ServerError('CONFLICT', 'this report was already received')
    if (!known) {
      const [fresh] = await tx.select({ n: count() }).from(installKeys).where(gt(installKeys.firstSeenAt, since))
      if ((fresh?.n ?? 0) >= limits.newKeys) {
        throw new ServerError('RATE_LIMITED', 'too many new installs are sending feedback; try again later')
      }
      await tx.insert(installKeys).values({ key: entry.key, firstSeenAt: now })
    } else {
      const [recent] = await tx.select({ n: count() }).from(feedback)
        .where(and(eq(feedback.key, entry.key), gt(feedback.receivedAt, since)))
      if ((recent?.n ?? 0) >= limits.perKey) {
        throw new ServerError('RATE_LIMITED', 'this install has sent too many reports; try again later')
      }
    }
    const { message, sentAt, from, server, client } = entry.report
    const [row] = await tx.insert(feedback).values({
      key: entry.key,
      digest: entry.digest,
      message,
      sentAt: new Date(sentAt),
      receivedAt: now,
      from,
      server,
      client,
    }).returning({ id: feedback.id })
    if (!row) throw new Error('inserting the report returned no row')
    if (entry.images.length > 0) {
      await tx.insert(feedbackImages).values(entry.images.map((image, position) => ({
        feedbackId: row.id,
        position,
        mimeType: image.mimeType,
        data: image.data,
      })))
    }
    return { id: row.id }
  })
}

/** A report with its images, for tests and whatever reads them out. */
export async function getFeedback(id: string) {
  const db = await getDb()
  const [row] = await db.select().from(feedback).where(eq(feedback.id, id))
  if (!row) return undefined
  const images = await db.select().from(feedbackImages)
    .where(eq(feedbackImages.feedbackId, id)).orderBy(feedbackImages.position)
  return { ...row, images: images.map(({ mimeType, data }) => ({ mimeType, data })) }
}

/** Refuse a key's reports from now on, recording it if it is new. */
export async function blockKey(key: string): Promise<void> {
  const db = await getDb()
  const now = new Date()
  await db.insert(installKeys).values({ key, blockedAt: now })
    .onConflictDoUpdate({ target: installKeys.key, set: { blockedAt: now } })
}
