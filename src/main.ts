import os from 'node:os'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { buildAdminApp } from '#admin/app'
import { buildApp } from '#app'
import { closeDb, openDb } from '#db'

/*
 * The composition root: open the database, then serve the landing page and
 * the API, and the admin view of the feedback on a port of its own.
 *
 *   PORT        where to listen (8000)
 *   HOST        the address to bind (0.0.0.0)
 *   ADMIN_PORT  where the admin view listens (7777). It has no login, so
 *               keep it off the public internet.
 *   ADMIN_HOST  the address the admin binds (127.0.0.1)
 *   DATA_DIR    the PGlite database's directory ($XDG_DATA_HOME/yaac-site,
 *               else ~/.local/share/yaac-site). Outside the checkout, so a
 *               redeploy or `git clean` can't take it. It must be on a local
 *               disk, and only one server may open it.
 */

const port = Number(process.env.PORT ?? '8000')
const hostname = process.env.HOST ?? '0.0.0.0'
const adminPort = Number(process.env.ADMIN_PORT ?? '7777')
const adminHostname = process.env.ADMIN_HOST ?? '127.0.0.1'
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(dataHome, 'yaac-site'))

if (adminPort === port) throw new Error(`ADMIN_PORT must differ from PORT (both ${port.toString()})`)
// The admin's Host check stops only browsers, so the bind is what keeps
// everyone else out.
if (!/^(127(\.\d{1,3}){3}|::1|localhost)$/.test(adminHostname)) {
  console.warn(`yaac-site admin: ADMIN_HOST ${adminHostname} is not loopback, so anyone who can reach it can read every report`)
}

await openDb(dataDir)
const servers = [
  serve({ fetch: buildApp({ logRequests: true }).fetch, port, hostname }, (info) => {
    console.log(`yaac-site listening on http://${info.address}:${info.port.toString()} (database ${dataDir})`)
  }),
  serve({ fetch: buildAdminApp({ logRequests: true }).fetch, port: adminPort, hostname: adminHostname }, (info) => {
    console.log(`yaac-site admin listening on http://${info.address}:${info.port.toString()}`)
  }),
]

// Close the database on the way out so PGlite checkpoints cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    for (const server of servers) server.close()
    void closeDb().finally(() => process.exit(0))
  })
}
