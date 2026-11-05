# yaac-site

Landing page for [bsklaroff/yaac](https://github.com/bsklaroff/yaac), and the endpoint its in-app feedback is sent to, served at [yaac.dev](https://yaac.dev) by a small [Hono](https://hono.dev) server.

The page is the static `public/index.html`, plus `public/yaks.js` for the shaveable yaks that roam the background, with no build step. The server serves `public/` and the API under `/api`.

## Running it

```sh
pnpm install
pnpm dev                # tsx watch, on :8080
pnpm build && pnpm start  # the bundled dist/main.js
```

| Variable   | Default  | Meaning |
|------------|----------|---------|
| `PORT`     | `8080`   | Where to listen. |
| `HOST`     | `0.0.0.0`| The address to bind. |
| `DATA_DIR` | `$XDG_DATA_HOME/yaac-site`, else `~/.local/share/yaac-site` | The [PGlite](https://pglite.dev) database. Keep it on a local disk outside the checkout, and run one server per directory. |

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

## Assets

The `show-*.webp` screenshots are real captures of the yaac desktop app (`packages/desktop`), with agents working on this site. They were taken like this:

- A containerless yaac server built from yaac `main` at `0fe29f9`, with credentials seeded by `yaac auth fake` and the agents' own logins.
- The Electron app driven by Playwright under Xvfb, at `--force-device-scale-factor=2` in a 1440×900 window, with the app in its dark theme.
- The project rail and settings button cropped off the left (66 CSS px).
- The Preview pane's contents pasted in from the embedded page's own `capturePage()`, because under Xvfb the window capture draws embedded pages at the wrong scale.

Under `public/assets`, each `show-*.webp` is the 2748px original, which the lightbox uses. The `-1110` and `-2220` variants are resized copies for the page's `srcset`. `og.jpg` is the top-left 1200×630 of `show-chat.webp` at half scale. The design tokens follow `packages/frontend/src/index.css` in the yaac repo, and the yak icon is the desktop app's `packages/desktop/build/icon.png`.
