import fs from 'node:fs/promises'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PGlite } from '@electric-sql/pglite'
import { MIGRATIONS_DIR } from '#paths'

/**
 * The site's PGlite database (embedded Postgres). `getDb` stays off the
 * barrel so other layers can't build their own queries; they get only
 * `openDb`/`closeDb` and the row functions.
 *
 * PGlite is single-process: run one server per data dir.
 */

export type Db = PgliteDatabase & { $client: PGlite }

let handle: Promise<Db> | null = null

/**
 * Open the database at `dataDir` and run pending migrations. `memory://`
 * opens a throwaway one (tests). Called once by the composition root
 * before it listens.
 */
export async function openDb(dataDir: string): Promise<void> {
  if (handle) throw new Error('the database is already open')
  handle = (async () => {
    if (!dataDir.startsWith('memory://')) {
      await fs.mkdir(dataDir, { recursive: true })
      await fs.chmod(dataDir, 0o700)
    }
    const db = drizzle({ connection: { dataDir } })
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    } catch (err) {
      await db.$client.close().catch(() => undefined)
      throw err
    }
    return db
  })()
  handle.catch(() => { handle = null })
  await handle
}

/** The open handle, for the row functions in this folder. */
export function getDb(): Promise<Db> {
  if (!handle) throw new Error('the database is not open: call openDb first')
  return handle
}

/** Close the handle so PGlite checkpoints cleanly. Idempotent. */
export async function closeDb(): Promise<void> {
  const prev = handle
  handle = null
  if (!prev) return
  try {
    await (await prev).$client.close()
  } catch {
    // Open failed, so there is nothing to close.
  }
}
