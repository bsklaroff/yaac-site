import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { buildAdminApp } from '#admin/app'
import { buildApp } from '#app'
import { closeDb, openDb } from '#db'
import { sweepStaleParts } from '#media/demo-video'

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
 *   MEDIA_DIR   the uploaded media's directory, holding the demo video the
 *               admin uploads and the public site serves at /demo-video. It
 *               defaults to `yaac-site-media` beside DATA_DIR, so a release
 *               that puts DATA_DIR on its volume gets the media there too
 *               without naming it, and a local run gets
 *               ~/.local/share/yaac-site-media.
 */

const port = Number(process.env.PORT ?? '8000')
const hostname = process.env.HOST ?? '0.0.0.0'
const adminPort = Number(process.env.ADMIN_PORT ?? '7777')
const adminHostname = process.env.ADMIN_HOST ?? '127.0.0.1'
const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(dataHome, 'yaac-site'))
const mediaDir = path.resolve(process.env.MEDIA_DIR ?? path.join(path.dirname(dataDir), 'yaac-site-media'))

if (adminPort === port) throw new Error(`ADMIN_PORT must differ from PORT (both ${port.toString()})`)
// The admin's Host check stops only browsers, so the bind is what keeps
// everyone else out.
if (!/^(127(\.\d{1,3}){3}|::1|localhost)$/.test(adminHostname)) {
  console.warn(`yaac-site admin: ADMIN_HOST ${adminHostname} is not loopback, so anyone who can reach it can read every report`)
}

await openDb(dataDir)
// A crash, an OOM kill or a redeploy mid-upload leaves a temp file behind
// that its own cleanup never saw; this is the only writer of mediaDir, so
// sweep them before the servers can take a new upload.
await sweepStaleParts(mediaDir)
const servers = [
  serve({ fetch: buildApp({ logRequests: true, mediaDir }).fetch, port, hostname }, (info) => {
    console.log(`yaac-site listening on http://${info.address}:${info.port.toString()} (database ${dataDir})`)
  }),
  serve(
    {
      fetch: buildAdminApp({ logRequests: true, mediaDir }).fetch,
      port: adminPort,
      hostname: adminHostname,
      // A video upload can run for more than Node's 5-minute default, over a
      // slow tunnel, so the total request timeout is off. The admin binds
      // loopback, so that is safe; the public server keeps its default.
      serverOptions: { requestTimeout: 0 },
    },
    (info) => {
      console.log(`yaac-site admin listening on http://${info.address}:${info.port.toString()}`)
    },
  ),
]
// With no total timeout, a client that sends its headers and then stops
// would hold its temp file (and disk) open forever. Destroy a socket idle
// for two minutes: a slow-but-moving upload keeps resetting the clock, and
// a stalled one is cut, which runs saveDemoVideo's cleanup.
const adminServer = servers[1] as Server
adminServer.setTimeout(120_000, (socket) => socket.destroy())

// Close the database on the way out so PGlite checkpoints cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    for (const server of servers) server.close()
    void closeDb().finally(() => process.exit(0))
  })
}
