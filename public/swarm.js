// The ribbon swarm at the top of the hero, after the splash of the yaac
// design canvas (WSplash, the swarm in SwarmMotion). Forty ribbons fan in
// from the edges of the screen, bend at a waist and run down a shared trunk.
// The splash pours the trunk down a full screen; here the swarm recedes
// instead: the ribbons fade as they near the waist, and the trunk dissolves
// into the page (the canvas's CSS mask). They sweep in once on load, quickly,
// then their coloured segments keep drifting toward the trunk, slowly.
(() => {
  const canvas = document.querySelector('canvas.swarm')
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  // The logo's four colours (the page's --brand-1 to --brand-4), the same in
  // both themes.
  const COLOURS = ['#FF958D', '#F4A25C', '#76CF8A', '#B6A8FF']

  // Geometry, in CSS pixels at full size; narrow screens scale the pitch
  // and gap down a little. Ribbon m of a side has boundaries m and m + 1.
  const RIBS = 20 // ribbons per side
  const FORK = 0.74 // the waist, as a share of the canvas height
  const A0 = 8 // the innermost ribbon's angle from vertical, in degrees
  const AMAX = 80 // the outermost's
  const SEG = 300 // the length of one coloured segment along a ribbon
  const ARRIVE = 1.6 // seconds for one ribbon to sweep in
  const STAGGER = 0.018 // seconds between neighbouring ribbons, centre first
  const FLOW_FAST = 200 // segment drift as they arrive, px/s
  const FLOW_SLOW = 36 // and once they've settled

  let w = 0, h = 0, cx = 0, fork = 0, pitch = 5.6, gap = 2.6, dpr = 1

  const hex = (s) => { const n = parseInt(s.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  const css = (c) => `rgb(${c.map(Math.round).join(',')})`
  const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f)
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]

  // Eight tones: the four colours and the halfway mix of each neighbour pair.
  const C = COLOURS.map(hex)
  const TONES = []
  for (let q = 0; q < 4; q++) TONES.push(css(C[q]), css(mix(C[q], C[(q + 1) % 4], 0.5)))

  // Each ribbon: its side (-1 left, 1 right), its index out from the centre,
  // how far its head has come (0 at the screen edge, 1 at the trunk's end),
  // and where its segments start.
  const R = []
  for (const side of [-1, 1]) {
    for (let m = 0; m < RIBS; m++) {
      R.push({
        side, m, head: 0,
        // each ribbon drifts at its own speed, 0.75x to 1.25x
        speed: 0.75 + 0.5 * ((Math.sin((m + 1) * 7.13 + (side > 0 ? 2.1 : 0)) + 1) / 2),
        phase: ((m * 0.37 + (side > 0 ? 0.5 : 0)) % 1) * SEG,
      })
    }
  }

  // Where two lines (point, direction) cross.
  function meet(p1, d1, p2, d2) {
    const det = -d1[0] * d2[1] + d1[1] * d2[0]
    if (Math.abs(det) < 1e-9) return p1
    const t = (-(p2[0] - p1[0]) * d2[1] + (p2[1] - p1[1]) * d2[0]) / det
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t]
  }
  // How far from p, heading u, until the top or a side edge.
  function exitLen(p, u) {
    const ts = []
    if (u[1] < 0) ts.push(-p[1] / u[1])
    if (u[0] < 0) ts.push(-p[0] / u[0])
    if (u[0] > 0) ts.push((w - p[0]) / u[0])
    return Math.min(...ts)
  }
  // Boundary m of a side, offset sideways by s: its far end off the screen,
  // its mitre at the waist and its foot below the canvas. The trunk keeps
  // the same gap between ribbons that the fan has.
  function edge(m, side, s) {
    const ta = (A0 + (AMAX - A0) * m / RIBS) * Math.PI / 180
    const ut = [side * Math.sin(ta), -Math.cos(ta)], nt = [side * Math.cos(ta), Math.sin(ta)]
    const org = [cx + side * (pitch * m + (m === 0 ? gap / 2 : 0)), fork]
    const pb = m === 0 ? [cx + side * s, fork] : [org[0] + side * s, org[1]]
    const mid = meet([org[0] + nt[0] * s, org[1] + nt[1] * s], ut, pb, [0, 1])
    const lt = exitLen(mid, ut) + 40
    return { top: [mid[0] + ut[0] * lt, mid[1] + ut[1] * lt], mid, bot: [mid[0], h + 30], lt, lb: h + 30 - mid[1] }
  }
  function shape(r) {
    const A = edge(r.m, r.side, gap / 2), B = edge(r.m + 1, r.side, -gap / 2)
    const lt = (A.lt + B.lt) / 2
    return { A, B, lt, L: lt + (A.lb + B.lb) / 2 }
  }
  // The ribbon's cross-section at distance s along it from its far end.
  function cut(g, s) {
    if (s <= g.lt) { const f = s / g.lt; return [lerp(g.A.top, g.A.mid, f), lerp(g.B.top, g.B.mid, f)] }
    const k = Math.min(1, (s - g.lt) / (g.L - g.lt))
    return [lerp(g.A.mid, g.A.bot, k), lerp(g.B.mid, g.B.bot, k)]
  }
  // Fill the stretch of a ribbon from a to b, split at the waist so each
  // half is a straight quad.
  function fill(g, a, b, colour) {
    if (b - a < 0.5) return
    ctx.fillStyle = colour
    const parts = []
    if (a < g.lt) parts.push([a, Math.min(b, g.lt + 0.6)])
    if (b > g.lt) parts.push([Math.max(a, g.lt - 0.6), b])
    for (const [s0, s1] of parts) {
      const P = cut(g, s0), Q = cut(g, s1)
      ctx.beginPath()
      ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(Q[0][0], Q[0][1])
      ctx.lineTo(Q[1][0], Q[1][1]); ctx.lineTo(P[1][0], P[1][1])
      ctx.closePath(); ctx.fill()
    }
  }
  // A segment's tone: never the same as its neighbour along the ribbon.
  function tone(r, n) {
    const si = ((n % 1000) + 1000) % 1000
    const hsh = Math.abs(Math.sin((r.m + 1) * 12.9898 + si * 78.233 + (r.side > 0 ? 19.19 : 0)) * 43758.5453)
    return TONES[(r.m * 3 + si * 5 + Math.floor((hsh - Math.floor(hsh)) * 2)) % 8]
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    for (const r of R) {
      const g = shape(r)
      const b = r.head * g.L
      for (let n = Math.floor(-r.phase / SEG); n * SEG + r.phase < b; n++) {
        fill(g, Math.max(0, n * SEG + r.phase), Math.min(b, (n + 1) * SEG + r.phase - 0.01), tone(r, n))
      }
    }
    // Distance: rub the ribbons out toward the waist, so the fan recedes into
    // it rather than meeting there. Erasing, not shading, so it fades into
    // either theme's page.
    const rad = Math.max(fork * 1.6, 260)
    const v = ctx.createRadialGradient(cx, fork, 0, cx, fork, rad)
    v.addColorStop(0, 'rgba(0,0,0,1)')
    v.addColorStop(0.3, 'rgba(0,0,0,.72)')
    v.addColorStop(0.65, 'rgba(0,0,0,.22)')
    v.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    w = rect.width; h = rect.height; cx = w / 2; fork = h * FORK
    const k = Math.min(1, Math.max(0.6, w / 1200))
    pitch = 5.6 * k; gap = 2.6 * k
    dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
    draw()
  }

  // The arrival curve, a cubic-bezier(.42, 0, .3, 1): slow off the edge,
  // quick through the middle, easing into place.
  function bezier(x1, y1, x2, y2) {
    const f = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
    return (x) => {
      let lo = 0, hi = 1
      for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; if (f(t, x1, x2) < x) lo = t; else hi = t }
      return f((lo + hi) / 2, y1, y2)
    }
  }
  const ease = bezier(0.42, 0, 0.3, 1)

  let start = null, last = null, frame = 0, visible = true
  function tick(now) {
    frame = 0
    start ??= now
    const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000)
    last = now
    const t = (now - start) / 1000
    // The drift slows from fast to slow as the swarm lands.
    const flow = FLOW_SLOW + (FLOW_FAST - FLOW_SLOW) * Math.max(0, 1 - t / (ARRIVE + 1.2)) ** 2
    for (const r of R) {
      if (r.head < 1) {
        r.head = ease(Math.min(1, Math.max(0, (t - r.m * STAGGER) / ARRIVE)))
      }
      // Never wrapped: a segment's colour comes from its index, so wrapping
      // the phase would recolour every segment on the ribbon at once.
      r.phase += flow * r.speed * dt
    }
    draw()
    if (visible) frame = requestAnimationFrame(tick)
  }
  const run = () => { if (!frame) { last = null; frame = requestAnimationFrame(tick) } }

  resize()
  new ResizeObserver(resize).observe(canvas)
  // Only animate while the hero is on screen.
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) run()
    else if (frame) { cancelAnimationFrame(frame); frame = 0 }
  }).observe(canvas)
  run()
})()
