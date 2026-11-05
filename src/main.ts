import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { buildApp } from '#app'
import { closeDb, openDb } from '#db'

/*
 * The composition root: open the database, then serve the landing page and
 * the API.
 *
 *   PORT      where to listen (8080)
 *   HOST      the address to bind (0.0.0.0)
 *   DATA_DIR  the PGlite database's directory ($XDG_DATA_HOME/yaac-site,
 *             else ~/.local/share/yaac-site). Outside the checkout, so a
 *             redeploy or `git clean` can't take it. It must be on a local
 *             disk, and only one server may open it.
 */

const port = Number(process.env.PORT ?? '8080')
const hostname = process.env.HOST ?? '0.0.0.0'
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(dataHome, 'yaac-site'))

await openDb(dataDir)
const server = serve({ fetch: buildApp({ logRequests: true }).fetch, port, hostname }, (info) => {
  console.log(`yaac-site listening on http://${info.address}:${info.port.toString()} (database ${dataDir})`)
})

// Close the database on the way out so PGlite checkpoints cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close()
    void closeDb().finally(() => process.exit(0))
  })
}
