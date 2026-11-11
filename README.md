# yaac-site

Landing page for [bsklaroff/yaac](https://github.com/bsklaroff/yaac), and the endpoint its in-app feedback is sent to, served at [yaac.dev](https://yaac.dev) by a small [Hono](https://hono.dev) server.

The page is the static `public/index.html`, plus `public/yaks.js` for the shaveable yaks that roam the background, with no build step. The server serves `public/` and the API under `/api`, and an admin view of the feedback it has received on a separate port.

## Running it

```sh
pnpm install
pnpm dev                # tsx watch, on :8000 (admin on 127.0.0.1:7777)
pnpm build && pnpm start  # the bundled dist/main.js
```

| Variable     | Default     | Meaning |
|--------------|-------------|---------|
| `PORT`       | `8000`      | Where to listen. |
| `HOST`       | `0.0.0.0`   | The address to bind. |
| `ADMIN_PORT` | `7777`      | Where the [admin view](#admin) listens. Keep it off the public internet: it has no login. |
| `ADMIN_HOST` | `127.0.0.1` | The address the admin view binds. Must be loopback: any other address gives every report, with no login, to whoever can reach it, since the `Host` check stops only browsers. |
| `DATA_DIR`   | `$XDG_DATA_HOME/yaac-site`, else `~/.local/share/yaac-site` | The [PGlite](https://pglite.dev) database. Keep it on a local disk outside the checkout, and run one server per directory. |

TLS, and redirecting `www.yaac.dev` to `yaac.dev`, are left to whatever fronts the server.

`pnpm lint` typechecks and lints, and `pnpm test` runs the tests. After changing `src/db/schema.ts`, run `pnpm db:generate --name <what-changed>` and commit the new `drizzle/` migration, which the server applies when it starts.

## Feedback

A yaac server with `YAAC_FEEDBACK_URL=https://yaac.dev/api/feedback` forwards its users' feedback to `POST /api/feedback`. The request shape and the endpoint's checklist are in yaac's [docs/feedback.md](https://github.com/bsklaroff/yaac/blob/main/docs/feedback.md). In order, the route:

1. Refuses a body over 7 MB (413) before reading it.
2. Verifies `X-Yaac-Signature` over the exact body bytes with `X-Yaac-Key` (401).
3. Validates the report (400), refusing a `sentAt` more than 5 minutes from its clock and any image that is not a PNG, JPEG, GIF or WebP by its bytes.
4. Refuses a blocked key (403), a replay of a report already stored (409), more than 20 reports an hour from one key, or more than 100 new keys an hour site-wide (429).

It answers `201 { id }`. Reports go in the `feedback` table, their screenshots in `feedback_images`, and each key the first time it is seen in `install_keys`. Set `install_keys.blocked_at` to block one. The images are untrusted bytes: a polyglot passes the magic-byte check, so never show them inline on an origin that matters.

The API is written for [Hono RPC](https://hono.dev/docs/guides/rpc). Routes are chained so `AppType` (`src/app.ts`) carries each one's input and output, every input is read through `zv` (`src/api/validator.ts`), and callers use the typed client in `src/client.ts`. ESLint refuses reading the request any other way, and refuses database access from the rest of `src` except through the `#db` barrel.

## Admin

The admin view on `ADMIN_PORT` lists the reports newest first, 50 to a page, and shows each with its sender, the server and client it came from, whether its key is blocked, and its screenshots. Check reports in the list (or check them all with the box in its header) and press **Archive selected**, or **Archive** on a report's own page, to set its `archived_at`. The list leaves archived reports out until you press **Show archived**, which also offers **Unarchive selected**. Only that port routes to it. It has no login, so it binds loopback, which is what keeps everyone else out, and warns at startup if `ADMIN_HOST` is not. It also answers only to a `Host` of `localhost` or a name under it (like yaac's preview, `7777.<workspace>.localhost`), `127.x.x.x` or `[::1]`, which browsers always resolve to loopback. That stops a page in your browser that rebinds its name to `127.0.0.1` from reading it, but not any other client, which can send whatever `Host` it likes. Reach it through an SSH tunnel (`ssh -L 7777:localhost:7777 …`) or a port forward to `localhost`. Its forms post only to itself, and it refuses a post whose `Sec-Fetch-Site` (or, without one, `Origin`) says another page sent it, so a site you visit can't archive reports through your browser. The pages run no script but the list's select-all box, which the CSP allows by its hash. The screenshots show only in `<img>` tags, which run no script, and are served with their checked type, `nosniff`, `Content-Disposition: attachment` and a sandboxing CSP, so opening one downloads it rather than rendering it.

## Assets

The `show-*.webp` screenshots are real captures of the yaac desktop app (`packages/desktop`), with agents working on this site. They were taken like this:

- A containerless yaac server built from yaac `main` at `0fe29f9`, with credentials seeded by `yaac auth fake` and the agents' own logins.
- The Electron app driven by Playwright under Xvfb, at `--force-device-scale-factor=2` in a 1440×900 window, with the app in its dark theme.
- The project rail and settings button cropped off the left (66 CSS px).
- The Preview pane's contents pasted in from the embedded page's own `capturePage()`, because under Xvfb the window capture draws embedded pages at the wrong scale.

Under `public/assets`, each `show-*.webp` is the 2748px original, which the lightbox uses. The `-1110` and `-2220` variants are resized copies for the page's `srcset`. `og.jpg` is the top-left 1200×630 of `show-chat.webp` at half scale. The design tokens follow `packages/frontend/src/index.css` in the yaac repo. `logo.svg` is the yaac logo, a copy of `packages/frontend/src/logo.svg` in the yaac repo, and `apple-touch-icon.png` is it rendered at 180px. `logo-mark.svg` is the logo without its background, for the nav and footer. `favicon.svg` is the four strokes alone, cropped to fill the square, with the gaps of the desktop tray icon (`packages/desktop/src/tray-icon.ts`: 29-unit strokes, each half 5 units further out) but 39-unit strokes, each stroke moved out to keep those gaps, and the outer strokes 4 units further out still, and `favicon.png` is it rendered at 64px.
