import { html, raw } from 'hono/html'
import type { getFeedback, listFeedback } from '#db'

/*
 * The admin pages, as `hono/html` templates, which escape every
 * interpolated string: the reports are whatever an install chose to send.
 * No script, and the styles inline, so the pages' CSP can refuse both.
 * `STYLE` is a constant, so it alone goes in raw: `<style>` doesn't decode
 * entities, so escaping it would break its quotes.
 */

type Html = ReturnType<typeof html>
type Report = NonNullable<Awaited<ReturnType<typeof getFeedback>>>
type Summary = Awaited<ReturnType<typeof listFeedback>>['reports'][number]

const STYLE = `
  :root { color-scheme: dark; --bg: #08080a; --surface: #131317; --border: #2c2c34;
    --text: #ececef; --text-dim: #9a9aa4; --accent: #d4875f;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  body { margin: 0 auto; max-width: 72rem; padding: 1.5rem; background: var(--bg); color: var(--text);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  a { color: var(--accent); }
  h1 { font-size: 1.25rem; }
  h2 { font-size: 1rem; margin-top: 2rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); }
  th { color: var(--text-dim); font-weight: 500; white-space: nowrap; }
  .mono { font-family: var(--mono); font-size: 12px; }
  .dim { color: var(--text-dim); }
  .nowrap { white-space: nowrap; }
  .blocked { color: #f85149; font-weight: 600; }
  .message { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface);
    border: 1px solid var(--border); border-radius: 6px; padding: 1rem; }
  .images img { max-width: 100%; max-height: 40rem; border: 1px solid var(--border); margin-bottom: 1rem; }
  nav { margin-top: 1rem; display: flex; gap: 1rem; }
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

/** The list of reports, newest first, a page at a time. */
export function feedbackListPage(reports: Summary[], at: { page: number; more: boolean }): Html {
  const rows = reports.map((r) => html`<tr>
  <td class="nowrap"><a href="/feedback/${r.id}">${when(r.receivedAt)}</a></td>
  <td>${sender(r.from)}</td>
  <td>${excerpt(r.message)}</td>
  <td>${r.images || ''}</td>
  <td class="nowrap">${keyCell(r.key, r.blockedAt)}</td>
</tr>`)
  return page('Feedback', html`<h1>Feedback</h1>
${reports.length === 0
    ? html`<p class="dim">${at.page === 1 ? 'No reports yet.' : 'No reports on this page.'}</p>`
    : html`<table>
<thead><tr><th>Received</th><th>From</th><th>Message</th><th>Images</th><th>Key</th></tr></thead>
<tbody>${rows}</tbody>
</table>`}
<nav>
${at.page > 1 ? html`<a href="/?page=${at.page - 1}">← Newer</a>` : ''}
${at.more ? html`<a href="/?page=${at.page + 1}">Older →</a>` : ''}
</nav>`)
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
<h1>Feedback from ${sender(r.from)}</h1>
<div class="message">${r.message}</div>
<h2>Report</h2>
${fieldTable([
    ['id', html`<span class="mono">${r.id}</span>`],
    ['received', when(r.receivedAt)],
    ['sent', when(r.sentAt)],
    ['from', sender(r.from)],
    ['key', html`<span class="mono">${r.key}</span>${r.blockedAt ? html` <span class="blocked">blocked ${when(r.blockedAt)}</span>` : ''}`],
  ])}
<h2>Server</h2>
${fieldTable(flatten(r.server))}
<h2>Client</h2>
${r.client ? fieldTable(flatten(r.client)) : html`<p class="dim">Not sent.</p>`}
${images.length > 0 ? html`<h2>Images</h2><div class="images">${images}</div>` : ''}`)
}
