# yaac-site

Landing page for [bsklaroff/yaac](https://github.com/bsklaroff/yaac), served with GitHub Pages.

It is a static `index.html`, plus `yaks.js` for the shaveable yaks that roam the background, with no build step. To publish, enable Pages under **Settings → Pages** with source **Deploy from a branch**, branch `main`, folder `/ (root)`.

Preview locally:

```sh
python3 -m http.server 8000
```

## Assets

The `show-*.webp` screenshots are real captures of the yaac desktop app (`packages/desktop`), with agents working on this site. They were taken like this:

- A containerless yaac server built from yaac `main` at `0fe29f9`, with credentials seeded by `yaac auth fake` and the agents' own logins.
- The Electron app driven by Playwright under Xvfb, at `--force-device-scale-factor=2` in a 1440×900 window, with the app in its dark theme.
- The project rail and settings button cropped off the left (66 CSS px).
- The Preview pane's contents pasted in from the embedded page's own `capturePage()`, because under Xvfb the window capture draws embedded pages at the wrong scale.

Each `show-*.webp` is the 2748px original, which the lightbox uses. The `-1110` and `-2220` variants are resized copies for the page's `srcset`. `og.jpg` is the top-left 1200×630 of `show-chat.webp` at half scale. The design tokens follow `packages/frontend/src/index.css` in the yaac repo, and the yak icon is the desktop app's `packages/desktop/build/icon.png`.
