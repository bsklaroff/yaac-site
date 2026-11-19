import { html, raw } from 'hono/html'
import type { getFeedback, listFeedback } from '#db'

/*
 * The admin pages, as `hono/html` templates, which escape every
 * interpolated string: the reports are whatever an install chose to send.
 * The styles are inline, and the one script is the constant `SCRIPT`,
 * which the pages' CSP allows by its hash and no other. `STYLE` and
 * `SCRIPT` are constants, so they alone go in raw: `<style>` and
 * `<script>` don't decode entities, so escaping them would break their
 * quotes.
 */

type Html = ReturnType<typeof html>
type Report = NonNullable<Awaited<ReturnType<typeof getFeedback>>>
type Summary = Awaited<ReturnType<typeof listFeedback>>['reports'][number]

const STYLE = `
  :root { color-scheme: light dark;
    --bg: light-dark(#FFFFFF, #202023); --sunken: light-dark(#F6F6F5, #1B1B1E);
    --line: light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.08));
    --text: light-dark(#171717, #F2F2F1); --text-muted: light-dark(#5C5C5B, #B4B4B1);
    --text-subtle: light-dark(#6A6A69, #97979A); --accent: light-dark(#4353D9, #97A6FF);
    --info: light-dark(#2563EB, #82B8FF); --danger: light-dark(#C4302B, #FF8178);
    --edge-inset: inset 0 0 0 1px light-dark(rgb(0 0 0 / 0.09), rgb(255 255 255 / 0.08));
    --edge-control: 0 0 0 1px light-dark(rgb(0 0 0 / 0.12), rgb(0 0 0 / 0.60)),
      inset 0 1px 0 light-dark(transparent, rgb(255 255 255 / 0.10)), 0 2px 4px -2px rgb(0 0 0 / 0.12);
    --fill-control: light-dark(#FFFFFF, #27272B); --fill-control-hover: light-dark(#FAFAFA, #2F2F33);
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  body { margin: 0 auto; max-width: 72rem; padding: 1.5rem; background: var(--bg); color: var(--text);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased; }
  a { color: var(--info); text-underline-offset: 2px; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  h1 { font-size: 1.25rem; font-weight: 600; }
  h2 { font-size: 1rem; font-weight: 600; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--line); }
  th { color: var(--text-subtle); font-weight: 500; white-space: nowrap; }
  .mono { font-family: var(--mono); font-size: 12px; }
  .dim { color: var(--text-muted); }
  .nowrap { white-space: nowrap; }
  .blocked { color: var(--danger); font-weight: 600; }
  .archived { color: var(--text-subtle); }
  tr.archived td { opacity: 0.6; }
  .tag { box-shadow: var(--edge-inset); border-radius: 4px; padding: 0 0.3rem; font-size: 12px; }
  button, .button { font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--text); background: var(--fill-control);
    border: 0; box-shadow: var(--edge-control); border-radius: 4px; padding: 0.25rem 0.7rem; cursor: pointer;
    text-decoration: none; display: inline-block; }
  button:hover, .button:hover { background: var(--fill-control-hover); }
  .toolbar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
  .toolbar .spacer { flex: 1; }
  input[type=checkbox] { margin: 0.2rem 0 0; accent-color: var(--accent); }
  .message { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--sunken);
    box-shadow: var(--edge-inset); border-radius: 4px; padding: 1rem; }
  .images img { max-width: 100%; max-height: 40rem; box-shadow: 0 0 0 1px var(--line); margin-bottom: 1rem; }
  nav { margin-top: 1rem; display: flex; gap: 1rem; }
`

/** The list's select-all box: hidden until this shows it, it checks or
 *  unchecks every report's box, and shows whether some or all are. */
export const SCRIPT = `
  const all = document.getElementById('select-all')
  const boxes = [...document.querySelectorAll('input[name="id"]')]
  if (all) {
    const sync = () => {
      const checked = boxes.filter((box) => box.checked).length
      all.checked = checked === boxes.length
      all.indeterminate = checked > 0 && checked < boxes.length
    }
    all.addEventListener('change', () => {
      for (const box of boxes) box.checked = all.checked
      sync()
    })
    for (const box of boxes) box.addEventListener('change', sync)
    // Back and forward restore the boxes' state after this first runs.
    addEventListener('pageshow', sync)
    all.hidden = false
  }
`

function page(title: string, body: Html): Html {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · yaac-site admin</title>
<style>${raw(STYLE)}</style>
</head>
<body>
${body}
</body>
</html>`
}

/** `2026-11-05 15:21:15 UTC`. */
function when(date: Date | null): string {
  return date ? `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC` : '—'
}

function sender(from: Report['from']): string {
  return from ? `${from.name} <${from.email}> (${from.source})` : '—'
}

function excerpt(message: string, max = 200): string {
  const line = message.replace(/\s+/g, ' ')
  return line.length > max ? `${line.slice(0, max)}…` : line
}

function keyCell(key: string, blockedAt: Date | null): Html {
  return html`<span class="mono" title="${key}">${key.slice(0, 12)}…</span>${blockedAt ? html` <span class="blocked">blocked</span>` : ''}`
}

/** Which page of the list, and whether it shows the archived reports. */
export interface ListView {
  page: number
  archived: boolean
}

/** The list's own URL for `view`, leaving out what is the default. */
export function listUrl(view: ListView): string {
  const query = new URLSearchParams()
  if (view.archived) query.set('archived', '1')
  if (view.page > 1) query.set('page', view.page.toString())
  return query.size > 0 ? `/?${query.toString()}` : '/'
}

function archivedTag(archivedAt: Date | null): Html | string {
  return archivedAt ? html` <span class="tag archived" title="archived ${when(archivedAt)}">archived</span>` : ''
}

/**
 * The list of reports, newest first, a page at a time, without the
 * archived ones unless `at.archived`. Each has a box to check, and the
 * checked ones are archived (or unarchived) together.
 */
export function feedbackListPage(reports: Summary[], at: ListView & { more: boolean }): Html {
  const rows = reports.map((r) => html`<tr${r.archivedAt ? html` class="archived"` : ''}>
  <td><input type="checkbox" name="id" value="${r.id}" form="archive" aria-label="Select"></td>
  <td class="nowrap"><a href="/feedback/${r.id}">${when(r.receivedAt)}</a>${archivedTag(r.archivedAt)}</td>
  <td>${sender(r.from)}</td>
  <td>${excerpt(r.message)}</td>
  <td>${r.images || ''}</td>
  <td class="nowrap">${keyCell(r.key, r.blockedAt)}</td>
</tr>`)
  const empty = at.page > 1 ? 'No reports on this page.' : at.archived ? 'No reports yet.' : 'No unarchived reports.'
  return page('Feedback', html`<h1>Feedback</h1>
<form id="archive" method="post" action="/archive" class="toolbar">
<input type="hidden" name="page" value="${at.page}">
${at.archived ? html`<input type="hidden" name="archived" value="1">` : ''}
${reports.length > 0 ? html`<button name="archive" value="1">Archive selected</button>` : ''}
${reports.length > 0 && at.archived ? html`<button name="archive" value="0">Unarchive selected</button>` : ''}
<span class="spacer"></span>
${at.archived
    ? html`<a class="button" href="${listUrl({ page: 1, archived: false })}">Hide archived</a>`
    : html`<a class="button" href="${listUrl({ page: 1, archived: true })}">Show archived</a>`}
</form>
${reports.length === 0
    ? html`<p class="dim">${empty}</p>`
    : html`<table>
<thead><tr><th><input type="checkbox" id="select-all" aria-label="Select all" hidden></th><th>Received</th><th>From</th><th>Message</th><th>Images</th><th>Key</th></tr></thead>
<tbody>${rows}</tbody>
</table>`}
<nav>
${at.page > 1 ? html`<a href="${listUrl({ ...at, page: at.page - 1 })}">← Newer</a>` : ''}
${at.more ? html`<a href="${listUrl({ ...at, page: at.page + 1 })}">Older →</a>` : ''}
</nav>
<script>${raw(SCRIPT)}</script>`)
}

/** `{ app: { kind: 'desktop' } }` → `[['app.kind', 'desktop']]`. */
function flatten(value: object, prefix = ''): Array<[string, string]> {
  return Object.entries(value).flatMap(([k, v]): Array<[string, string]> => {
    const name = prefix + k
    if (v !== null && typeof v === 'object') return flatten(v as object, `${name}.`)
    return [[name, v === null ? '—' : String(v)]]
  })
}

function fieldTable(fields: Array<[string, string | Html]>): Html {
  return html`<table>${fields.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</table>`
}

/** One report: its message, who sent it from what, and its screenshots. */
export function feedbackDetailPage(r: Report): Html {
  const images = r.images.map((_image, position) => {
    const src = `/feedback/${r.id}/images/${position.toString()}`
    return html`<div><a href="${src}"><img src="${src}" alt="Screenshot ${position + 1}"></a></div>`
  })
  return page(excerpt(r.message, 60), html`<p><a href="/">← All feedback</a></p>
<h1>Feedback from ${sender(r.from)}${archivedTag(r.archivedAt)}</h1>
<form method="post" action="/feedback/${r.id}/archive" class="toolbar">
${r.archivedAt
    ? html`<button name="archive" value="0">Unarchive</button>`
    : html`<button name="archive" value="1">Archive</button>`}
</form>
<div class="message">${r.message}</div>
<h2>Report</h2>
${fieldTable([
    ['id', html`<span class="mono">${r.id}</span>`],
    ['received', when(r.receivedAt)],
    ['sent', when(r.sentAt)],
    ['archived', when(r.archivedAt)],
    ['from', sender(r.from)],
    ['key', html`<span class="mono">${r.key}</span>${r.blockedAt ? html` <span class="blocked">blocked ${when(r.blockedAt)}</span>` : ''}`],
  ])}
<h2>Server</h2>
${fieldTable(flatten(r.server))}
<h2>Client</h2>
${r.client ? fieldTable(flatten(r.client)) : html`<p class="dim">Not sent.</p>`}
${images.length > 0 ? html`<h2>Images</h2><div class="images">${images}</div>` : ''}`)
}
