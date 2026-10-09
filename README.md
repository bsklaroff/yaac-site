# yaac-site

Landing page for [bsklaroff/yaac](https://github.com/bsklaroff/yaac), served with GitHub Pages.

It is a single static `index.html` with no build step. To publish, enable Pages under **Settings → Pages** with source **Deploy from a branch**, branch `main`, folder `/ (root)`.

Preview locally:

```sh
python3 -m http.server 8000
```

## Assets

The screenshots in `assets/` are real captures of the yaac web app, taken with Playwright against a containerless yaac server. The design tokens follow `packages/frontend/src/index.css` in the yaac repo, and the yak icon is the desktop app's `packages/desktop/build/icon.png`.
