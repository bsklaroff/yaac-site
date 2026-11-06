import { and, count, desc, eq, gt } from 'drizzle-orm'
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

/** A report with its images, and when its key was blocked if it was. */
export async function getFeedback(id: string) {
  const db = await getDb()
  const [row] = await db.select().from(feedback).where(eq(feedback.id, id))
  if (!row) return undefined
  const [install] = await db.select({ blockedAt: installKeys.blockedAt }).from(installKeys)
    .where(eq(installKeys.key, row.key))
  const images = await db.select().from(feedbackImages)
    .where(eq(feedbackImages.feedbackId, id)).orderBy(feedbackImages.position)
  return {
    ...row,
    blockedAt: install?.blockedAt ?? null,
    images: images.map(({ mimeType, data }) => ({ mimeType, data })),
  }
}

/**
 * A page of reports, newest first, without their images' bytes: `limit`
 * of them after skipping `offset`, and whether older ones remain.
 */
export async function listFeedback(page: { limit: number; offset: number }) {
  const db = await getDb()
  const rows = await db.select({
    id: feedback.id,
    key: feedback.key,
    message: feedback.message,
    receivedAt: feedback.receivedAt,
    from: feedback.from,
    blockedAt: installKeys.blockedAt,
    images: count(feedbackImages.position),
  }).from(feedback)
    .innerJoin(installKeys, eq(installKeys.key, feedback.key))
    .leftJoin(feedbackImages, eq(feedbackImages.feedbackId, feedback.id))
    .groupBy(feedback.id, installKeys.key)
    .orderBy(desc(feedback.receivedAt), desc(feedback.id))
    .limit(page.limit + 1)
    .offset(page.offset)
  return { reports: rows.slice(0, page.limit), more: rows.length > page.limit }
}

/** One of a report's images, by its position in the report. */
export async function getFeedbackImage(id: string, position: number) {
  const db = await getDb()
  const [image] = await db.select({ mimeType: feedbackImages.mimeType, data: feedbackImages.data })
    .from(feedbackImages)
    .where(and(eq(feedbackImages.feedbackId, id), eq(feedbackImages.position, position)))
  return image
}

/** Refuse a key's reports from now on, recording it if it is new. */
export async function blockKey(key: string): Promise<void> {
  const db = await getDb()
  const now = new Date()
  await db.insert(installKeys).values({ key, blockedAt: now })
    .onConflictDoUpdate({ target: installKeys.key, set: { blockedAt: now } })
}
