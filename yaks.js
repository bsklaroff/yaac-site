// Yaks that roam the page background. Hovering one swaps the cursor for
// clippers; clicking (or holding and dragging) shaves it, which it enjoys.
// Nothing is saved, so a reload brings every coat back.
(async () => {
  const TAU = Math.PI * 2
  const rand = (a, b) => a + Math.random() * (b - a)
  const pick = (list) => list[Math.floor(Math.random() * list.length)]
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const approach = (v, target, rate) => v + (target - v) * Math.min(1, rate)
  const toward = (v, target, step) => v + clamp(target - v, -step, step)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Shapes are in yak units: facing right, origin on the ground under the
  // middle of the yak, y pointing down. A yak is about 170 units long. This is
  // the shorn body, so the hump, ribs and skinny legs show once the coat is off.
  const BODY = new Path2D('M82 -64C84 -86 74 -104 60 -114C50 -132 30 -138 14 -126C-8 -112 -40 -110 -62 -106C-80 -102 -88 -88 -86 -74C-84 -60 -78 -50 -68 -46C-54 -43 -40 -47 -24 -43C-4 -36 30 -34 50 -40C70 -46 80 -52 82 -64Z')
  // The head, horns and ear are drawn around the neck pivot, muzzle right:
  // a short, broad face ending in a wide muzzle. The horns grow from the
  // sides of the poll, rise, and sweep forward to a point.
  const HEAD = new Path2D('M-4 -10C0 -20 14 -24 26 -20C36 -16 44 -6 52 6C58 14 64 18 65 25C66 32 62 37 55 38C48 39 40 37 32 33C22 29 10 24 0 16C-6 10 -7 0 -4 -10Z')
  const HORN = new Path2D('M6 -12C0 -26 2 -44 20 -54C24 -56 28 -57 31 -56C24 -52 18 -44 17 -34C16 -26 18 -18 20 -12Z')
  const HORN_RIDGES = new Path2D('M4.5 -18Q12 -15.5 19 -18M3 -24Q10 -21.5 17.5 -24M2.5 -30Q9.5 -27.5 16.5 -30')
  const EAR = new Path2D('M10 -4C2 -10 -10 -10 -16 -4C-10 0 0 2 10 2Z')
  const NECK = { x: 72, y: -98 }
  const TAIL = { x: -84, y: -92 }
  const LEGS = [
    { x: 46, y: -50, off: Math.PI, near: false },
    { x: -50, y: -52, off: 0, near: false },
    { x: 56, y: -52, off: 0, near: true },
    { x: -60, y: -54, off: Math.PI, near: true },
  ]
  const STUB = 2.5 // a strand this short is stubble
  const RADIUS = 15 // clipper reach, in CSS pixels
  const BLOCK = 'a, button, summary, input, textarea, select, img, nav, .tabs, .frame, .term, .card, .arch, .table'

  const PALETTES = [
    { // wild black
      under: ['#2b201a', '#33261e', '#3a2b21'], over: ['#46352a', '#4f3c2e', '#3d2e24', '#5a4434'], hi: ['#7a604b', '#8a6d55', '#6a523f'],
      skin: '#4f4342', skinLight: '#665755', stubble: '#2a201c', fur: '#3a2c23', furDark: '#271e18',
      muzzle: '#1f1916', muzzleRing: '#5e5550', horn: '#a39886', hornTip: '#24201d', hoof: '#151110',
    },
    { // golden
      under: ['#6e4d2c', '#7a5531', '#634528'], over: ['#8f6a3f', '#9c7547', '#a57d4c', '#87613a'], hi: ['#c49a62', '#d0a86f', '#b88d58'],
      skin: '#93716a', skinLight: '#ab8a80', stubble: '#5b4026', fur: '#7c5833', furDark: '#5a3f24',
      muzzle: '#3d2c24', muzzleRing: '#b89f82', horn: '#d6c8a8', hornTip: '#5f5647', hoof: '#2a1f18',
    },
    { // grey-brown
      under: ['#3e3530', '#463c36', '#38302b'], over: ['#5a4e46', '#665950', '#52473f'], hi: ['#8d7f73', '#9a8b7d'],
      skin: '#5d5150', skinLight: '#726564', stubble: '#2f2925', fur: '#4c423b', furDark: '#362f2a',
      muzzle: '#2a2421', muzzleRing: '#7d726a', horn: '#bcb19c', hornTip: '#36312c', hoof: '#1a1613',
    },
  ]
  // White patches on piebald yaks. The skin under them is pink.
  const PIED = { under: ['#b9afa2', '#c6bdb0'], over: ['#ddd5c9', '#e6dfd4', '#d2c9bc'], hi: ['#f2ece3'], skin: '#c49a92', face: '#ddd5c9' }

  // Each yak, tuft and pile of clippings gets its own small canvas, placed in
  // the page. The browser scrolls them like any other element, and only the
  // patches where something moves are repainted.
  const stage = document.createElement('div')
  stage.className = 'yaks'
  stage.setAttribute('aria-hidden', 'true')
  document.body.prepend(stage)
  let ctx = null // the canvas currently being drawn into

  const buzzer = document.createElement('div')
  buzzer.className = 'buzzer'
  buzzer.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><g transform="translate(24 24) rotate(-45)">
    <path d="M0 15C0 21 4 24 6 29" fill="none" stroke="#55555f" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M-6 -24v-4M-3 -24v-4M0 -24v-4M3 -24v-4M6 -24v-4" stroke="#d9dce2" stroke-width="1.6"/>
    <rect x="-7.5" y="-25" width="15" height="9" rx="1.5" fill="#d9dce2"/>
    <rect x="-9" y="-18" width="18" height="34" rx="7" fill="#2c2c33" stroke="#5a5a64" stroke-width="1.2"/>
    <rect x="-2.5" y="-10" width="5" height="11" rx="2.5" fill="#d4875f"/>
    <path d="M-5 7h10M-5 10h10" stroke="#45454e" stroke-width="1.2"/>
  </g></svg>`
  document.body.append(buzzer)

  // Point-in-path tests run on a spare context with an identity transform.
  const probe = document.createElement('canvas').getContext('2d')
  const inBody = (x, y) => probe.isPointInPath(BODY, x, y)
  const inHead = (x, y) => probe.isPointInPath(HEAD, x, y)
  const top = new Map()
  const bottom = new Map()
  for (let x = -90; x <= 84; x += 2) {
    for (let y = -140; y <= -30; y++) {
      if (!inBody(x, y)) continue
      if (!top.has(x)) top.set(x, y)
      bottom.set(x, y)
    }
  }
  const edge = (map, x) => map.get(clamp(Math.round(x / 2) * 2, -90, 84)) ?? -80

  // ---------- coats ----------

  function makeYak(x, y) {
    const pal = pick(PALETTES)
    const pied = pal === PALETTES[0] && Math.random() < .5
    const patches = []
    if (pied) {
      for (let i = 0; i < 3; i++) patches.push({ bone: 0, x: rand(-70, 60), y: rand(-115, -50), r: rand(16, 30) })
      patches.push({ bone: 1, x: 42, y: -4, r: 20 })
      if (Math.random() < .5) patches.push({ bone: 2, x: -3, y: 34, r: 22 })
    }
    const yak = {
      x, y, pal, patches, blaze: pied, styles: [],
      tail: [], under: [], over: [], fluff: [], head: [], all: [],
      face: 1, faceTo: 1, state: 'idle', timer: rand(0, 2), target: null, tuft: null, grazeDir: 1,
      scale: 1, sx: 1, drawY: y, speed: rand(40, 55), walk: 0, phase: 0, ha: .15,
      tailA: .3, tailT: 0, sway: .05, swayT: 0, swayHz: 2.2, lag: 0, hop: 0,
      seed: rand(0, TAU), blinkAt: rand(1, 5), fx: [], litter: null, sprite: null, visible: false, layers: {}, layerK: 0, coatDirty: true, tailDirty: true, headHa: null, heartT: 0, say: null, naked: false, hovered: false,
    }
    const styleOf = (color, w) => {
      let i = yak.styles.findIndex((st) => st.color === color && st.w === w)
      if (i < 0) i = yak.styles.push({ color, w }) - 1
      return i
    }
    const strand = (layer, kind, w, bone, sx, sy, angle, len, droop, gravity = false) => {
      const white = patches.some((p) => p.bone === bone && (sx - p.x) ** 2 + (sy - p.y) ** 2 < p.r ** 2)
      const color = pick((white ? PIED : pal)[kind])
      yak[layer].push({ bone, x: sx, y: sy, angle, gravity, L0: len, L: len, droop, curl: rand(-.4, .4), phase: rand(0, TAU), style: styleOf(color, w) })
    }

    // Tail: a plume hanging off a short stub.
    for (let i = 0; i < 40; i++) {
      const t = rand(.2, 1)
      strand('tail', pick(['under', 'over']), 2.4, 2, -4 * t + rand(-2, 2), 36 * t, Math.PI / 2 + rand(-.2, .35), rand(16, 30) + 18 * t, rand(.1, .3))
    }
    // Body: long hair, hanging into a skirt that nearly reaches the ground.
    for (let n = 0; n < 620;) {
      const sx = rand(-88, 82)
      const sy = rand(-138, -34)
      if (!inBody(sx, sy)) continue
      n++
      const t = edge(top, sx)
      const depth = (sy - t) / Math.max(1, edge(bottom, sx) - t)
      let angle = Math.PI / 2 + .12 + rand(-.18, .18)
      if (sx > 56) angle -= (sx - 56) / 24 * .5
      if (sx < -64) angle += (-64 - sx) / 22 * .5
      const len = clamp(rand(-36, -24) - sy, 8, 66) * rand(.85, 1.1)
      if (depth < .5) strand('over', 'over', 2.6, 0, sx, sy, angle, len, rand(.3, .6))
      else strand('under', 'under', 3.2, 0, sx, sy, angle, len, rand(.3, .6))
    }
    // Extra hair along the back, where the skin would otherwise peek through.
    for (let i = 0; i < 120; i++) {
      const sx = rand(-82, 70)
      const sy = edge(top, sx) + rand(2, 12)
      const len = clamp(rand(-36, -24) - sy, 8, 66) * rand(.85, 1.1)
      strand('over', 'over', 2.6, 0, sx, sy, Math.PI / 2 + .25 + rand(-.2, .2), len, rand(.3, .6))
    }
    // Fluff along the back and rump, so the outline reads as hair.
    for (let sx = -84; sx <= 78; sx += 2.2) {
      strand('fluff', pick(['hi', 'over', 'over']), 2.2, 0, sx, edge(top, sx) + rand(0, 4), -Math.PI / 2 - rand(.9, 1.5), rand(7, 13), rand(1, 1.6))
    }
    for (let sy = -100; sy <= -56; sy += 3) {
      let sx = -90
      while (sx < -60 && !inBody(sx, sy)) sx++
      strand('fluff', pick(['hi', 'over']), 2.2, 0, sx + rand(1, 4), sy, Math.PI - rand(0, .5), rand(7, 12), rand(1, 1.6))
    }
    // Head: a thick fringe over the brow, a tuft between the horns, a mane
    // down the back of the head that hides the neck, and a beard.
    for (let n = 0; n < 46;) {
      const sx = rand(0, 34)
      const sy = rand(-22, -6)
      if (!inHead(sx, sy)) continue
      n++
      strand('head', pick(['over', 'over', 'hi']), 2.1, 1, sx, sy, rand(.6, 1.3), rand(12, 22), .5)
    }
    for (let i = 0; i < 14; i++) strand('head', 'hi', 1.9, 1, rand(2, 16), rand(-21, -16), -Math.PI / 2 - rand(.3, .9), rand(9, 15), .9)
    for (let i = 0; i < 18; i++) strand('head', 'under', 2.6, 1, rand(-6, 6), rand(-10, 14), Math.PI / 2 + rand(0, .4), rand(20, 34), rand(.2, .4), true)
    for (let n = 0; n < 36;) {
      const sx = rand(-4, 40)
      const sy = rand(6, 40)
      if (!inHead(sx, sy) || inHead(sx, sy + 5)) continue
      n++
      strand('head', pick(['under', 'over']), 2.3, 1, sx, sy, Math.PI / 2 + rand(-.2, .2), rand(14, 26) + (40 - sx) * .3, rand(.1, .3), true)
    }
    yak.all = [...yak.tail, ...yak.under, ...yak.over, ...yak.fluff, ...yak.head]
    return yak
  }

  // Bones: 0 body, 1 head, 2 tail. Each strand hangs off one.
  function pose(yak) {
    const bob = -Math.abs(Math.sin(yak.phase)) * 1.6 * yak.walk
    const g = clamp(yak.ha - .15, 0, 1)
    const bone = (x, y, a) => ({ x, y, a, c: Math.cos(a), s: Math.sin(a) })
    return [bone(0, bob, 0), bone(NECK.x + 12 * g, NECK.y + 18 * g + bob, yak.ha), bone(TAIL.x, TAIL.y + bob, yak.tailA)]
  }

  // Lay out strands as quadratic curves. A strand's shape depends on its full
  // length, so cutting one just ends it sooner along the same curve.
  // `tilt` lays head hair out relative to the head while still letting the
  // beard hang straight down for a head tilted that far.
  function layoutCoat(list, bones, tilt = 0) {
    for (const st of list) {
      const b = bones[st.bone]
      const rx = b.x + st.x * b.c - st.y * b.s
      const ry = b.y + st.x * b.s + st.y * b.c
      const a = st.gravity ? st.angle - tilt : st.angle + b.a
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const L = st.L
      const k1 = L * L * .075 / st.L0
      const k2 = L * L * .3 / st.L0
      const mx = rx + dx * L / 2 + st.curl * k1
      const my = ry + dy * L / 2 + st.droop * k1
      st.ax = rx; st.ay = ry; st.dx = dx; st.dy = dy
      st.ex = rx + dx * L + st.curl * k2
      st.ey = ry + dy * L + st.droop * k2
      st.cx = 2 * mx - (rx + st.ex) / 2
      st.cy = 2 * my - (ry + st.ey) / 2
    }
  }

  function strokeCoat(c, yak, list) {
    const paths = []
    for (const st of list) {
      if (st.L <= STUB) continue
      const p = paths[st.style] ??= new Path2D()
      p.moveTo(st.ax, st.ay)
      p.quadraticCurveTo(st.cx, st.cy, st.ex, st.ey)
    }
    paths.forEach((p, i) => {
      c.strokeStyle = yak.styles[i].color
      c.lineWidth = yak.styles[i].w
      c.stroke(p)
    })
  }

  function strokeStubble(c, yak, list) {
    const p = new Path2D()
    let any = false
    for (const st of list) {
      if (st.L > STUB) continue
      p.moveTo(st.ax, st.ay)
      p.lineTo(st.ax + st.dx * 2, st.ay + st.dy * 2)
      any = true
    }
    if (!any) return
    c.globalAlpha = .55
    c.strokeStyle = yak.pal.stubble
    c.lineWidth = 1.2
    c.stroke(p)
    c.globalAlpha = 1
  }

  // Hair is by far the most expensive thing to draw, so each yak's hair is
  // painted into a few bitmaps (body coat, head hair, tail) that are only
  // repainted when they change: a cut, a new size, the head moving. Each frame
  // just stamps them in place, skewed a little so the coat still sways.
  const COAT_BOX = { x: -114, y: -164, w: 236, h: 180 }
  const HEAD_BOX = { x: -40, y: -80, w: 130, h: 160 }
  const TAIL_BOX = { x: -40, y: -6, w: 64, h: 100 }
  const BODY_LISTS = ['under', 'over', 'fluff']

  function paintLayer(yak, name, box, k, paint) {
    const cv = yak.layers[name] ??= document.createElement('canvas')
    const w = Math.ceil(box.w * k)
    const h = Math.ceil(box.h * k)
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
    const c = cv.getContext('2d')
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, w, h)
    c.setTransform(k, 0, 0, k, -box.x * k, -box.y * k)
    c.lineCap = 'round'
    paint(c)
  }

  function stamp(yak, name, box, skew, pivotY) {
    ctx.save()
    ctx.translate(0, pivotY)
    ctx.transform(1, 0, skew, 1, 0, 0)
    ctx.translate(0, -pivotY)
    ctx.drawImage(yak.layers[name], box.x, box.y, box.w, box.h)
    ctx.restore()
  }

  // ---------- drawing ----------

  let W = 0
  let H = 0
  let dpr = 1
  let unit = 1
  let quality = 1 // hair bitmap resolution, lowered on slow machines
  const field = { w: 0, h: 0 }
  const yaks = []
  const tufts = []
  const litters = []

  const toPage = (yak, x, y) => [yak.x + x * yak.scale * yak.sx, yak.drawY + y * yak.scale]
  const inView = (y, above, below) => y + below > scrollY && y - above < scrollY + H

  function makeSprite() {
    const cv = document.createElement('canvas')
    stage.append(cv)
    return { cv, c: cv.getContext('2d'), left: 0, top: 0, w: 0, h: 0, dpr: 0, z: null }
  }

  // Size and place a sprite over a rect of the page, clear it, and point ctx
  // at it, ready to draw in page coordinates.
  function begin(sp, l, t, r, b, z) {
    const left = Math.floor(l)
    const top = Math.floor(t)
    // The size depends only on the rect's extent, not where it sits, so a
    // moving sprite isn't reallocated every frame.
    const w = Math.ceil(r - l) + 1
    const h = Math.ceil(b - t) + 1
    if (sp.w !== w || sp.h !== h || sp.dpr !== dpr) {
      sp.cv.width = Math.round(w * dpr)
      sp.cv.height = Math.round(h * dpr)
      sp.cv.style.width = `${w}px`
      sp.cv.style.height = `${h}px`
      sp.w = w
      sp.h = h
      sp.dpr = dpr
    } else {
      sp.c.setTransform(1, 0, 0, 1, 0, 0)
      sp.c.clearRect(0, 0, sp.cv.width, sp.cv.height)
    }
    if (sp.left !== left || sp.top !== top) {
      sp.cv.style.transform = `translate(${left}px, ${top}px)`
      sp.left = left
      sp.top = top
    }
    const zi = Math.round(z)
    if (sp.z !== zi) { sp.cv.style.zIndex = zi; sp.z = zi }
    sp.cv.hidden = false
    ctx = sp.c
    ctx.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr)
  }

  function drawLeg(yak, leg, bob, t) {
    let a = 0
    let bend = 0
    if (yak.walk > .01) {
      const p = yak.phase + leg.off
      a = Math.sin(p) * .32 * yak.walk
      bend = Math.max(0, Math.cos(p)) * .7 * yak.walk
    }
    if (leg.near && leg.x < 0 && yak.state === 'enjoy' && !still) {
      // A happy back-leg thump, like a dog having its ear scratched.
      a = -.3 + Math.sin(t * 18) * .25
      bend = .6
    }
    const jy = leg.y + bob
    const kx = leg.x - Math.sin(a) * 26
    const ky = jy + Math.cos(a) * 26
    const fx = kx - Math.sin(a + bend) * 25
    const fy = ky + Math.cos(a + bend) * 25
    ctx.strokeStyle = leg.near ? yak.pal.fur : yak.pal.furDark
    ctx.lineCap = 'round'
    ctx.lineWidth = 14
    ctx.beginPath(); ctx.moveTo(leg.x, jy); ctx.lineTo(kx, ky); ctx.stroke()
    ctx.lineWidth = 7.5
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy - 2); ctx.stroke()
    ctx.fillStyle = yak.pal.hoof
    ctx.beginPath(); ctx.ellipse(fx + 1, fy - 1.5, 5.5, 3.5, 0, 0, TAU); ctx.fill()
  }

  function drawHorn(yak, far) {
    const pal = yak.pal
    ctx.save()
    if (far) { ctx.translate(15, -3); ctx.scale(.9, .9) }
    const g = ctx.createLinearGradient(12, -12, 30, -56)
    g.addColorStop(0, far ? pal.hornTip : pal.horn)
    g.addColorStop(.35, far ? pal.hornTip : pal.horn)
    g.addColorStop(1, far ? '#151312' : pal.hornTip)
    ctx.fillStyle = g
    ctx.fill(HORN)
    if (!far) {
      ctx.strokeStyle = 'rgb(0 0 0 / .22)'
      ctx.lineWidth = 1.1
      ctx.stroke(HORN_RIDGES)
      ctx.strokeStyle = 'rgb(255 255 255 / .2)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(6, -20); ctx.bezierCurveTo(3, -32, 6, -44, 20, -52); ctx.stroke()
    }
    ctx.restore()
  }

  function drawHeadBase(yak, b, t) {
    const pal = yak.pal
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.a)
    ctx.lineCap = 'round'
    drawHorn(yak, true)

    const g = ctx.createLinearGradient(0, -22, 10, 38)
    g.addColorStop(0, pal.fur)
    g.addColorStop(1, pal.furDark)
    ctx.fillStyle = g
    ctx.fill(HEAD)
    ctx.save()
    ctx.clip(HEAD)
    if (yak.blaze) {
      ctx.fillStyle = PIED.face
      ctx.beginPath(); ctx.ellipse(42, 6, 10, 26, -.75, 0, TAU); ctx.fill()
    }
    const cheek = ctx.createRadialGradient(20, 6, 0, 20, 6, 18)
    cheek.addColorStop(0, 'rgb(255 255 255 / .08)')
    cheek.addColorStop(1, 'rgb(255 255 255 / 0)')
    ctx.fillStyle = cheek
    ctx.fillRect(0, -12, 40, 36)
    ctx.strokeStyle = 'rgb(255 255 255 / .08)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(30, -15); ctx.quadraticCurveTo(46, -2, 58, 16); ctx.stroke()
    ctx.strokeStyle = 'rgb(0 0 0 / .28)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(6, 20); ctx.quadraticCurveTo(28, 34, 52, 39); ctx.stroke()
    // A broad, pale-rimmed muzzle with a dark nose pad.
    ctx.fillStyle = yak.blaze ? '#c9a8a0' : pal.muzzleRing
    ctx.beginPath(); ctx.ellipse(55, 28, 12.5, 10.5, .35, 0, TAU); ctx.fill()
    ctx.restore()
    ctx.fillStyle = yak.blaze ? '#8f6f6a' : pal.muzzle
    ctx.beginPath(); ctx.ellipse(59.5, 23.5, 7, 6, .5, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .6)'
    ctx.beginPath(); ctx.ellipse(62, 21.5, 2.6, 1.5, .9, 0, TAU); ctx.fill()
    ctx.strokeStyle = 'rgb(0 0 0 / .45)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(61, 23.5); ctx.quadraticCurveTo(59, 25, 57.5, 23.5); ctx.stroke()
    const chew = yak.state === 'graze' && !still ? Math.sin(t * 9) * 1.5 : 0
    ctx.strokeStyle = 'rgb(0 0 0 / .5)'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(64, 33 + chew * .3); ctx.quadraticCurveTo(57, 36 + chew, 48, 34); ctx.stroke()

    // A small, hairy ear held out below the horn, flicking now and then.
    ctx.save()
    ctx.translate(8, -1)
    ctx.rotate(Math.sin(t * 1.1 + yak.seed) * .12 + (Math.sin(t * .37 + yak.seed) > .97 ? Math.sin(t * 30) * .3 : 0))
    ctx.translate(-8, 1)
    ctx.fillStyle = pal.fur
    ctx.fill(EAR)
    ctx.fillStyle = 'rgb(214 150 140 / .4)'
    ctx.beginPath(); ctx.ellipse(-2, -3, 7, 1.8, -.05, 0, TAU); ctx.fill()
    ctx.strokeStyle = pal.furDark
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (let x = -14; x <= 6; x += 3) { ctx.moveTo(x, 0); ctx.lineTo(x - 2, 4) }
    ctx.stroke()
    ctx.restore()

    drawHorn(yak, false)
    ctx.restore()
  }

  // The eye, drawn after the fringe so it peeks out from under it.
  function drawFace(yak, b, t) {
    const happy = yak.state === 'enjoy' || yak.state === 'celebrate'
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.a)
    const ex = 31
    const ey = -4
    ctx.fillStyle = 'rgb(0 0 0 / .25)'
    ctx.beginPath(); ctx.ellipse(ex, ey + .5, 5.5, 4.5, 0, 0, TAU); ctx.fill()
    if (happy) {
      ctx.strokeStyle = '#f1e4cf'
      ctx.lineWidth = 1.7
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(ex, ey + 2, 3.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
      ctx.fillStyle = 'rgb(255 120 135 / .5)'
      ctx.beginPath(); ctx.ellipse(40, 8, 5.5, 3, .3, 0, TAU); ctx.fill()
    } else if (t < yak.blinkUntil) {
      ctx.strokeStyle = '#140f0d'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey + .5); ctx.stroke()
    } else {
      ctx.fillStyle = '#d7c8b0'
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.5, 3.3, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = '#120d0b'
      ctx.beginPath(); ctx.ellipse(ex + .6, ey + .2, 2.5, 2.7, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(ex + 1.4, ey - .9, .8, 0, TAU); ctx.fill()
    }
    ctx.restore()
  }

  const ORIGIN = { x: 0, y: 0, a: 0, c: 1, s: 0 }
  const REST = [ORIGIN, ORIGIN, ORIGIN]

  function drawYak(yak, t) {
    const s = yak.scale
    const pal = yak.pal
    yak.sx = Math.sign(yak.face || 1) * Math.max(.06, Math.abs(yak.face))
    yak.drawY = yak.y - yak.hop * s
    const bones = yak.bones = pose(yak)
    const bob = bones[0].y

    // Repaint whichever hair bitmaps are stale. They're painted with the body
    // at rest and the tail hanging straight; bob and swish are applied when
    // they're stamped.
    const k = s * dpr * quality
    if (yak.layerK !== k) { yak.layerK = k; yak.coatDirty = yak.tailDirty = true; yak.headHa = null }
    if (yak.tailDirty) {
      layoutCoat(yak.tail, REST)
      paintLayer(yak, 'tail', TAIL_BOX, k, (c) => { strokeStubble(c, yak, yak.tail); strokeCoat(c, yak, yak.tail) })
      yak.tailDirty = false
    }
    if (yak.coatDirty) {
      for (const name of BODY_LISTS) layoutCoat(yak[name], REST)
      paintLayer(yak, 'coat', COAT_BOX, k, (c) => {
        for (const name of BODY_LISTS) strokeStubble(c, yak, yak[name])
        for (const name of BODY_LISTS) strokeCoat(c, yak, yak[name])
      })
    }
    // Head hair is painted relative to the head, so it only needs repainting
    // when the head tips far enough that the beard should hang differently.
    if (yak.coatDirty || yak.headHa === null || Math.abs(yak.ha - yak.headHa) > .12) {
      layoutCoat(yak.head, REST, yak.ha)
      paintLayer(yak, 'head', HEAD_BOX, k, (c) => { strokeStubble(c, yak, yak.head); strokeCoat(c, yak, yak.head) })
      yak.headHa = yak.ha
    }
    yak.coatDirty = false
    yak.laidOut = false
    const skew = still ? 0 : yak.sway * Math.sin(yak.swayT) * .25 + yak.lag * .3

    ctx.fillStyle = 'rgb(0 0 0 / .35)'
    ctx.beginPath(); ctx.ellipse(yak.x, yak.y, 86 * s * Math.max(.35, Math.abs(yak.sx)), 8 * s, 0, 0, TAU); ctx.fill()

    ctx.save()
    const shiver = yak.state === 'shiver' && !still ? Math.sin(t * 60) * .8 : 0
    ctx.translate(yak.x, yak.drawY)
    ctx.scale(s * yak.sx, s)
    ctx.translate(shiver, 0)
    if (yak.state === 'shake' && !still) {
      ctx.translate(0, -60); ctx.rotate(Math.sin(t * 24) * .04); ctx.translate(0, 60)
    }

    for (const leg of LEGS) if (!leg.near) drawLeg(yak, leg, bob, t)

    // Tail stub, then its plume.
    const tb = bones[2]
    ctx.save()
    ctx.translate(tb.x, tb.y)
    ctx.rotate(tb.a)
    ctx.strokeStyle = pal.skin
    ctx.lineCap = 'round'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-3, 20, -4, 36); ctx.stroke()
    ctx.drawImage(yak.layers.tail, TAIL_BOX.x, TAIL_BOX.y, TAIL_BOX.w, TAIL_BOX.h)
    ctx.restore()

    // Shorn body: skin, pink under white patches, ribs, hip and shoulder.
    const g = ctx.createLinearGradient(0, -128, 0, -34)
    g.addColorStop(0, pal.skinLight)
    g.addColorStop(1, pal.skin)
    ctx.fillStyle = g
    ctx.fill(BODY)
    ctx.save()
    ctx.clip(BODY)
    for (const p of yak.patches) {
      if (p.bone !== 0) continue
      const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
      pg.addColorStop(0, PIED.skin)
      pg.addColorStop(.75, PIED.skin)
      pg.addColorStop(1, 'rgb(196 154 146 / 0)')
      ctx.fillStyle = pg
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill()
    }
    ctx.fillStyle = 'rgb(0 0 0 / .2)'
    ctx.beginPath(); ctx.ellipse(0, -30, 84, 16, 0, 0, TAU); ctx.fill()
    ctx.strokeStyle = 'rgb(0 0 0 / .22)'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const rx of [0, 14, 28]) { ctx.moveTo(rx + 4, -100); ctx.quadraticCurveTo(rx - 6, -76, rx + 2, -48) }
    ctx.moveTo(-72, -104); ctx.quadraticCurveTo(-56, -94, -66, -78)
    ctx.moveTo(56, -116); ctx.quadraticCurveTo(42, -92, 54, -70)
    ctx.stroke()
    ctx.strokeStyle = 'rgb(255 255 255 / .07)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(56, -120); ctx.bezierCurveTo(36, -138, 0, -116, -66, -103); ctx.stroke()
    ctx.restore()

    // Neck, joining the shoulders to wherever the head is, in shadow under
    // the mane.
    const hb = bones[1]
    const hp = (x, y) => [hb.x + x * hb.c - y * hb.s, hb.y + x * hb.s + y * hb.c]
    ctx.fillStyle = pal.furDark
    ctx.beginPath()
    ctx.moveTo(56, -116 + bob); ctx.lineTo(...hp(2, -17)); ctx.lineTo(...hp(-2, 14)); ctx.lineTo(78, -60 + bob)
    ctx.fill()

    for (const leg of LEGS) if (leg.near) drawLeg(yak, leg, bob, t)

    ctx.translate(0, bob)
    stamp(yak, 'coat', COAT_BOX, skew, -120)
    ctx.translate(0, -bob)
    drawHeadBase(yak, hb, t)
    ctx.save()
    ctx.translate(hb.x, hb.y)
    ctx.rotate(hb.a)
    stamp(yak, 'head', HEAD_BOX, skew * .5, 0)
    ctx.restore()
    drawFace(yak, hb, t)
    ctx.restore()
  }

  function drawTuft(tf) {
    const s = unit
    ctx.lineCap = 'round'
    ctx.lineWidth = 2 * s
    for (const b of tf.blades) {
      const h = b.h * s * tf.amount
      ctx.strokeStyle = b.color
      ctx.beginPath()
      ctx.moveTo(tf.x + b.x * s, tf.y)
      ctx.quadraticCurveTo(tf.x + (b.x + b.lean * .2) * s, tf.y - h * .6, tf.x + (b.x + b.lean * tf.amount) * s, tf.y - h)
      ctx.stroke()
    }
  }

  function drawHeart(x, y, r) {
    ctx.beginPath()
    ctx.moveTo(x, y + r * .35)
    ctx.bezierCurveTo(x, y - r * .2, x - r, y - r * .2, x - r, y + r * .35)
    ctx.bezierCurveTo(x - r, y + r * .8, x - r * .2, y + r * 1.1, x, y + r * 1.4)
    ctx.bezierCurveTo(x + r * .2, y + r * 1.1, x + r, y + r * .8, x + r, y + r * .35)
    ctx.bezierCurveTo(x + r, y - r * .2, x, y - r * .2, x, y + r * .35)
    ctx.fill()
  }

  function drawSparkle(x, y, r) {
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.quadraticCurveTo(x, y, x, y + r)
    ctx.quadraticCurveTo(x, y, x - r, y)
    ctx.quadraticCurveTo(x, y, x, y - r)
    ctx.fill()
  }

  function drawBubble(x, y, text) {
    ctx.font = '600 12px Inter, ui-sans-serif, system-ui, sans-serif'
    const w = ctx.measureText(text).width + 16
    const h = 22
    ctx.fillStyle = 'rgb(27 27 33 / .94)'
    ctx.strokeStyle = 'rgb(255 255 255 / .14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - h, w, h, 8)
    ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 5, y - .5); ctx.lineTo(x, y + 6); ctx.lineTo(x + 5, y - .5); ctx.fill()
    ctx.fillStyle = '#ececef'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y - h / 2 + .5)
  }

  function drawEffects(list) {
    for (const f of list) {
      ctx.globalAlpha = Math.min(1, f.life / (f.max * .5))
      if (f.kind === 'heart') { ctx.fillStyle = '#ff7a93'; drawHeart(f.x, f.y, f.size) }
      else { ctx.fillStyle = '#ffd98a'; drawSparkle(f.x, f.y, f.size) }
    }
    ctx.globalAlpha = 1
  }

  function drawClippings(list) {
    ctx.lineCap = 'round'
    for (const c of list) {
      const cos = Math.cos(c.rot)
      const sin = Math.sin(c.rot)
      ctx.globalAlpha = Math.min(1, c.life / 3)
      ctx.strokeStyle = c.color
      ctx.lineWidth = c.w
      ctx.beginPath()
      for (let i = 0; i < c.pts.length; i += 2) {
        const x = c.x + c.pts[i] * cos - c.pts[i + 1] * sin
        const y = c.y + c.pts[i] * sin + c.pts[i + 1] * cos
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // The canvas a yak (plus its hearts and speech bubble) is drawn in, around
  // where it stands.
  const yakBox = (yak, x, y) => {
    const s = yak.scale
    return [x - 210 * s - 50, y - 250 * s - 36, x + 210 * s + 50, y + 26 * s]
  }

  function draw(t) {
    for (const yak of yaks) {
      if (!yak.visible) {
        if (yak.sprite) yak.sprite.cv.hidden = true
        continue
      }
      yak.sprite ??= makeSprite()
      const [l, tp, r, b] = yakBox(yak, yak.x, yak.y - yak.hop * yak.scale)
      begin(yak.sprite, l, tp, r, b, yak.y)
      drawYak(yak, t)
      drawEffects(yak.fx)
      if (yak.say && t < yak.say.until) {
        const h = yak.bones[1]
        drawBubble(...toPage(yak, h.x + 24, h.y - 52), yak.say.text)
      }
    }
    // Grass and fallen hair are only redrawn while they change.
    for (const tf of tufts) {
      if (tf.drawn === tf.amount) continue
      tf.sprite ??= makeSprite()
      begin(tf.sprite, tf.x - 16 * unit - 2, tf.y - 20 * unit - 2, tf.x + 16 * unit + 2, tf.y + 3, tf.y)
      drawTuft(tf)
      tf.drawn = tf.amount
    }
    for (const lt of litters) {
      if (!lt.dirty) continue
      begin(lt.sprite, ...lt.box, lt.y + 1)
      drawClippings(lt.items)
      lt.dirty = false
    }
  }

  // ---------- room ----------

  // A grid over the page marking where text and panes are, padded a little.
  // Yaks only stand, walk and graze where their whole body fits in the gaps.
  const CELL = 12
  // Panes, plus layouts whose gaps belong to the text around them: a yak
  // between a value's title and its description would split the row.
  const PANES = '.frame, .card, .arch, .table, .term, .tabs, .btn, img, details, .phone, .values'
  let cols = 0
  let rows = 0
  let taken = new Int32Array(1) // summed-area table of blocked cells

  function mapPage() {
    stage.style.height = '0'
    field.w = document.documentElement.clientWidth
    field.h = document.documentElement.scrollHeight
    stage.style.width = `${field.w}px`
    stage.style.height = `${field.h}px`
    cols = Math.ceil(field.w / CELL)
    rows = Math.ceil(field.h / CELL)
    const blocked = new Uint8Array(cols * rows)
    const mark = (l, t, r, b, pad) => {
      const x0 = clamp(Math.floor((l - pad) / CELL), 0, cols - 1)
      const x1 = clamp(Math.floor((r + pad) / CELL), 0, cols - 1)
      const y0 = clamp(Math.floor((t - pad) / CELL), 0, rows - 1)
      const y1 = clamp(Math.floor((b + pad) / CELL), 0, rows - 1)
      for (let y = y0; y <= y1; y++) blocked.fill(1, y * cols + x0, y * cols + x1 + 1)
    }
    const add = (rect, pad) => {
      if (rect.width && rect.height) mark(rect.left + scrollX, rect.top + scrollY, rect.right + scrollX, rect.bottom + scrollY, pad)
    }
    // The sticky nav sits over whatever scrolls under it, so keep the top clear.
    mark(0, 0, field.w, document.querySelector('nav')?.offsetHeight ?? 62, 8)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.data.trim() && !n.parentElement.closest('script, style, nav') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    })
    const range = document.createRange()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n)
      for (const rect of range.getClientRects()) add(rect, 12)
    }
    for (const el of document.querySelectorAll(PANES)) if (!el.closest('nav')) add(el.getBoundingClientRect(), 12)

    const C = cols + 1
    taken = new Int32Array(C * (rows + 1))
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        taken[(y + 1) * C + x + 1] = blocked[y * cols + x] + taken[y * C + x + 1] + taken[(y + 1) * C + x] - taken[y * C + x]
      }
    }
  }

  function clear(l, t, r, b) {
    if (l < 0 || t < 0 || r > field.w || b > field.h) return false
    const C = cols + 1
    const x0 = Math.floor(l / CELL)
    const y0 = Math.floor(t / CELL)
    const x1 = Math.min(cols, Math.floor(r / CELL) + 1)
    const y1 = Math.min(rows, Math.floor(b / CELL) + 1)
    return taken[y1 * C + x1] - taken[y0 * C + x1] - taken[y1 * C + x0] + taken[y0 * C + x0] === 0
  }

  // Room for a yak standing at (x, y), facing either way, horns included.
  const roomAt = (x, y, s) => clear(x - 140 * s, y - 152 * s, x + 140 * s, y + 8 * s)

  function pathClear(x0, y0, x1, y1, s) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 14)
    for (let i = 1; i <= n; i++) if (!roomAt(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, s)) return false
    return true
  }

  function freeSpot(s, tries = 200) {
    for (let i = 0; i < tries; i++) {
      const x = rand(0, field.w)
      const y = rand(0, field.h)
      if (roomAt(x, y, s)) return { x, y }
    }
    return null
  }

  // ---------- behaviour ----------

  function makeTuft(x, y, amount = 1) {
    const blades = Array.from({ length: 9 }, () => ({
      x: rand(-9, 9), h: rand(9, 18), lean: rand(-6, 6), color: pick(['#3f5a2c', '#4a6a32', '#56783a', '#35502a']),
    }))
    return { x, y, amount, grow: amount < 1, claimed: null, blades, stand: null, dir: 1, sprite: null, drawn: -1 }
  }

  function removeTuft(i) {
    tufts[i].sprite?.cv.remove()
    tufts.splice(i, 1)
  }

  // Grass grows just ahead of a spot where a yak can stand to eat it.
  function plantTuft(amount) {
    const spot = freeSpot(unit)
    if (!spot) return
    const dir = Math.random() < .5 ? 1 : -1
    const tf = makeTuft(spot.x + dir * 80 * unit, spot.y + 1, amount)
    tf.stand = spot
    tf.dir = dir
    tufts.push(tf)
  }

  function say(yak, text, t, time = 1.8) {
    yak.say = { text, until: t + time }
  }

  function release(yak) {
    if (yak.tuft) yak.tuft.claimed = null
    yak.tuft = null
  }

  function setState(yak, state, time) {
    yak.state = state
    yak.timer = time
  }

  function wander(yak) {
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU)
      const d = rand(120, 700)
      const x = yak.x + Math.cos(a) * d
      const y = yak.y + Math.sin(a) * d * .6
      if (roomAt(x, y, yak.scale) && pathClear(yak.x, yak.y, x, y, yak.scale)) {
        yak.target = { x, y }
        setState(yak, 'walk', 40)
        return true
      }
    }
    return false
  }

  // The open spot nearest to (x, y), from a full sweep of the page grid.
  function nearestRoom(x, y, s) {
    let best = null
    let bestD = Infinity
    for (let gy = CELL / 2; gy < field.h; gy += CELL) {
      if ((gy - y) ** 2 >= bestD) continue
      for (let gx = CELL / 2; gx < field.w; gx += CELL) {
        const d = (gx - x) ** 2 + (gy - y) ** 2
        if (d < bestD && roomAt(gx, gy, s)) { best = { x: gx, y: gy }; bestD = d }
      }
    }
    return best
  }

  const onScreen = (yak) => yak.x > scrollX - 60 && yak.x < scrollX + W + 60 && inView(yak.y, 150 * yak.scale, 10)

  // A yak the layout has moved onto content (or off the page edge) heads for
  // the nearest open ground at a trot, or simply appears there if nobody is
  // looking. Returns whether it had to move.
  function relocate(yak) {
    if (roomAt(yak.x, yak.y, yak.scale)) return false
    const spot = nearestRoom(yak.x, yak.y, yak.scale)
    if (!spot) return false
    release(yak)
    if (!onScreen(yak) || still) {
      yak.x = spot.x
      yak.y = spot.y
      setState(yak, 'idle', rand(.5, 1.5))
    } else {
      yak.target = spot
      yak.rush = true
      setState(yak, 'walk', 30)
    }
    return true
  }

  // After a layout change: move stranded yaks, and send any yak whose walk
  // now runs into content off somewhere else.
  function replan(yak, t) {
    yak.scale = unit * yak.size
    if (relocate(yak) || yak.state !== 'walk' || yak.rush) return
    if (!roomAt(yak.target.x, yak.target.y, yak.scale) || !pathClear(yak.x, yak.y, yak.target.x, yak.target.y, yak.scale)) decide(yak, t)
  }

  function decide(yak, t) {
    release(yak)
    yak.scale = unit * yak.size
    if (relocate(yak)) return
    if (yak.hovered) return setState(yak, 'idle', rand(1, 2))
    if (yak.naked && Math.random() < .12) {
      say(yak, 'brr', t)
      return setState(yak, 'shiver', 1)
    }
    const r = Math.random()
    if (r < .62 && !still && wander(yak)) return
    if (r < .84) {
      let tuft = null
      let best = 800
      for (const tf of tufts) {
        if (!tf.stand) continue
        const d = Math.hypot(tf.stand.x - yak.x, tf.stand.y - yak.y)
        if (!tf.claimed && tf.amount > .5 && d < best && pathClear(yak.x, yak.y, tf.stand.x, tf.stand.y, yak.scale)) { best = d; tuft = tf }
      }
      if (tuft && !still) {
        yak.tuft = tuft
        tuft.claimed = yak
        yak.target = { ...tuft.stand }
        return setState(yak, 'walk', 40)
      }
      // No grass in reach, so it makes do with what's underfoot.
      const tf = makeTuft(yak.x + 80 * yak.scale * Math.sign(yak.faceTo), yak.y + 1, .6)
      tf.grow = false
      tf.claimed = yak
      tufts.push(tf)
      yak.tuft = tf
      return setState(yak, 'graze', rand(3, 5))
    }
    if (r < .92) return setState(yak, 'idle', rand(1, 2.5))
    if (r < .96 && !still) return setState(yak, 'shake', 1.2)
    say(yak, pick(['*grunt*', 'hrmph', 'mrrrh']), t)
    return setState(yak, 'idle', 2)
  }

  function update(yak, dt, t) {
    yak.scale = unit * yak.size
    yak.timer -= dt
    if (yak.hovered && yak.state === 'walk' && !yak.rush) { release(yak); setState(yak, 'idle', 1.5) }
    let walking = false
    let headTo = .12 + Math.sin(t * .6 + yak.seed) * .12
    yak.hop = 0
    switch (yak.state) {
      case 'walk': {
        const dx = yak.target.x - yak.x
        const dy = yak.target.y - yak.y
        const d = Math.hypot(dx, dy)
        headTo = .25
        if (d < 2 || yak.timer <= 0) {
          yak.rush = false
          if (yak.tuft && d < 2) {
            yak.faceTo = yak.tuft.dir
            setState(yak, 'graze', rand(3, 6))
          } else decide(yak, t)
          break
        }
        if (Math.abs(dx) > 3) yak.faceTo = Math.sign(dx)
        const turning = Math.abs(yak.face - yak.faceTo) > .3
        const step = Math.min(d, yak.speed * yak.scale * (turning ? .3 : 1) * (yak.rush ? 2.5 : 1) * dt)
        yak.x += dx / d * step
        yak.y += dy / d * step
        yak.phase += step / yak.scale * (yak.rush ? .07 : .11)
        walking = true
        break
      }
      case 'graze':
        headTo = 1.15
        if (yak.tuft && yak.ha > .9 && Math.abs(yak.face - yak.faceTo) < .1) {
          yak.tuft.amount -= dt * .1
          if (yak.tuft.amount <= .05) {
            const planted = !!yak.tuft.stand
            removeTuft(tufts.indexOf(yak.tuft))
            yak.tuft = null
            if (planted) plantTuft(0)
            decide(yak, t)
          }
        }
        break
      case 'enjoy':
        headTo = -.22
        yak.heartT -= dt
        if (yak.heartT <= 0 && yak.bones) {
          yak.heartT = .3
          const [x, y] = toPage(yak, yak.bones[1].x + rand(10, 40), yak.bones[1].y - rand(15, 30))
          yak.fx.push({ kind: 'heart', x, y, vx: rand(-12, 12), vy: rand(-45, -30), life: 1.4, max: 1.4, size: rand(4, 6.5) })
        }
        break
      case 'celebrate':
        headTo = -.3
        if (!still && yak.timer > .3) yak.hop = Math.abs(Math.sin(t * 9)) * 7
        if (Math.random() < dt * 5) sparkle(yak)
        break
      case 'shake':
        headTo = .2
        break
    }
    if (yak.state !== 'walk' && yak.timer <= 0) decide(yak, t)

    if (t > yak.blinkAt) { yak.blinkUntil = t + .13; yak.blinkAt = t + rand(2.5, 6) }
    const shaking = yak.state === 'shake' || yak.state === 'shiver'
    const happy = yak.state === 'enjoy' || yak.state === 'celebrate'
    yak.walk = approach(yak.walk, walking ? 1 : 0, dt * 4)
    yak.ha = approach(yak.ha, headTo, dt * 3)
    yak.face = toward(yak.face, yak.faceTo, dt * 3.2)
    yak.sway = still ? 0 : approach(yak.sway, shaking ? .5 : happy ? .15 : .05, dt * 5)
    yak.swayT += dt * (shaking ? 22 : 2.2)
    yak.lag = still ? 0 : approach(yak.lag, -.3 * yak.walk, dt * 2)
    yak.tailT += dt * (happy ? 16 : 1.4)
    yak.tailA = still ? .3 : .3 + Math.sin(yak.tailT + yak.seed) * (happy ? .35 : .18)
  }

  // Cut every strand that passes under the clippers, keeping the part above
  // the cut. The rest falls to the ground.
  // Strands are only laid out where they're drawn when something needs to
  // know: a hit test, a cut, a sparkle.
  function layOut(yak) {
    if (yak.laidOut || !yak.bones) return
    layoutCoat(yak.all, yak.bones)
    yak.laidOut = true
  }

  function shave(yak, px, py, t) {
    layOut(yak)
    const s = yak.scale
    const lx = (px - yak.x) / (s * yak.sx)
    const ly = (py - yak.drawY) / s
    const r2 = (RADIUS / s) ** 2
    let dropped = 0
    for (const st of yak.all) {
      if (st.L <= STUB) continue
      for (let i = 0; i <= 8; i++) {
        const u = i / 8
        const v = 1 - u
        const qx = v * v * st.ax + 2 * u * v * st.cx + u * u * st.ex
        const qy = v * v * st.ay + 2 * u * v * st.cy + u * u * st.ey
        if ((qx - lx) ** 2 + (qy - ly) ** 2 > r2) continue
        if (dropped++ < 40) drop(yak, st, u)
        st.L = st.L * u < 4 ? STUB : st.L * u
        break
      }
    }
    if (dropped) yak.coatDirty = yak.tailDirty = true

    // Clippers held down keep cutting; don't let that end the celebration.
    if (yak.state === 'celebrate') return
    if (yak.state !== 'enjoy') {
      release(yak)
      if (Math.random() < .5) say(yak, pick(['mmm', 'ahh', 'oh yes', 'right there', '♪']), t)
    }
    setState(yak, 'enjoy', 1.3)

    const shaggy = yak.all.filter((st) => st.L > 6).length
    if (!yak.naked && shaggy < yak.all.length * .04) {
      // Nearly bare: it shakes off the last wisps and celebrates.
      yak.naked = true
      for (const st of yak.all) {
        if (st.L <= STUB) continue
        drop(yak, st, 0)
        st.L = STUB
      }
      yak.coatDirty = yak.tailDirty = true
      setState(yak, 'celebrate', .8)
      if (Math.random() < .3) say(yak, pick(['so fresh!', 'ahh, breezy', '♪']), t, 1.2)
      for (let i = 0; i < 6; i++) sparkle(yak)
    }
  }

  // A sparkle somewhere on the yak itself: at the root of a random hair,
  // which covers the body, head and tail.
  function sparkle(yak) {
    layOut(yak)
    const st = pick(yak.all)
    if (st.ax === undefined) return
    const [x, y] = toPage(yak, st.ax + rand(-6, 6), st.ay + rand(-6, 6))
    yak.fx.push({ kind: 'sparkle', x, y, vx: 0, vy: rand(-25, -10), life: rand(.45, .65), max: .65, size: rand(3, 6.5) })
  }

  function drop(yak, st, from) {
    const s = yak.scale
    const pts = []
    let cx = 0
    let cy = 0
    for (let i = 0; i < 4; i++) {
      const u = from + (1 - from) * i / 3
      const v = 1 - u
      const [x, y] = toPage(yak, v * v * st.ax + 2 * u * v * st.cx + u * u * st.ex, v * v * st.ay + 2 * u * v * st.cy + u * u * st.ey)
      pts.push(x, y)
      cx += x / 4
      cy += y / 4
    }
    for (let i = 0; i < pts.length; i += 2) { pts[i] -= cx; pts[i + 1] -= cy }
    const style = yak.styles[st.style]
    // Clippings land in a pile with its own canvas, which stays put if the
    // yak walks off.
    let lt = yak.litter
    if (!lt || Math.hypot(lt.x - yak.x, lt.y - yak.y) > 30 || lt.items.length >= 300) {
      const [l, t, r, b] = yakBox(yak, yak.x, yak.y)
      lt = yak.litter = { x: yak.x, y: yak.y, box: [l - 20, t, r + 20, b + 40], items: [], dirty: true, sprite: makeSprite() }
      litters.push(lt)
    }
    lt.items.push({
      pts, x: cx, y: cy, vx: rand(-25, 25), vy: rand(-50, 0), rot: 0, vr: rand(-2, 2),
      color: style.color, w: style.w * s, ground: yak.y + rand(-4, 10) * s, landed: false, life: rand(7, 11),
    })
    lt.dirty = true
  }

  function updateEffects(dt) {
    for (const lt of litters) {
      for (const c of lt.items) {
        c.life -= dt
        if (c.life < 3) lt.dirty = true
        if (c.landed) continue
        c.vy = Math.min(c.vy + 320 * dt, 130)
        c.vx *= 1 - dt * 1.5
        c.x += c.vx * dt
        c.y += c.vy * dt
        c.rot += c.vr * dt
        if (c.y >= c.ground) { c.y = c.ground; c.landed = true }
        lt.dirty = true
      }
      lt.items = lt.items.filter((c) => c.life > 0)
    }
    for (let i = litters.length - 1; i >= 0; i--) {
      const lt = litters[i]
      if (lt.items.length) continue
      lt.sprite.cv.remove()
      litters.splice(i, 1)
      for (const yak of yaks) if (yak.litter === lt) yak.litter = null
    }
    for (const yak of yaks) {
      for (const f of yak.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt }
      yak.fx = yak.fx.filter((f) => f.life > 0)
    }
    for (const tf of tufts) if (tf.grow) { tf.amount = Math.min(1, tf.amount + dt * .05); tf.grow = tf.amount < 1 }
    // Grass a yak found underfoot stays where it was eaten down to. So it
    // doesn't pile up, the oldest is cleared once there's too much of it,
    // but only while it's off screen.
    const loose = tufts.filter((tf) => !tf.stand && !tf.claimed)
    if (loose.length > yaks.length) {
      const old = loose.find((tf) => !inView(tf.y, 30, 10))
      if (old) removeTuft(tufts.indexOf(old))
    }
  }

  // ---------- pointer ----------

  // The pointer is kept in viewport coordinates, so a yak scrolling under a
  // still mouse is still picked up.
  const pointer = { x: 0, y: 0, inside: false, mouse: true, down: false }
  let lastShave = 0

  function hitYak(yak, px, py) {
    const s = yak.scale
    if (!yak.visible || Math.abs(yak.sx) < .3) return false
    if (Math.abs(px - yak.x) > 140 * s || py > yak.drawY + 6 * s || py < yak.drawY - 175 * s) return false
    layOut(yak)
    const lx = (px - yak.x) / (s * yak.sx)
    const ly = (py - yak.drawY) / s
    if (inBody(lx, ly - yak.bones[0].y)) return true
    const h = yak.bones[1]
    const hx = lx - h.x
    const hy = ly - h.y
    if (inHead(hx * h.c + hy * h.s, -hx * h.s + hy * h.c)) return true
    for (const st of yak.all) {
      if (st.L <= STUB) continue
      const mx = .25 * st.ax + .5 * st.cx + .25 * st.ex
      const my = .25 * st.ay + .5 * st.cy + .25 * st.ey
      if ((mx - lx) ** 2 + (my - ly) ** 2 < 36 || (st.ex - lx) ** 2 + (st.ey - ly) ** 2 < 36) return true
    }
    return false
  }

  // The front-most yak under a viewport point, unless page content is in the way.
  function yakAt(cx, cy) {
    const px = cx + scrollX
    const py = cy + scrollY
    const hit = [...yaks].sort((a, b) => b.y - a.y).find((yak) => hitYak(yak, px, py))
    if (!hit) return null
    const el = document.elementFromPoint(cx, cy)
    return !el || el.closest(BLOCK) ? null : hit
  }

  addEventListener('pointermove', (e) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointer.inside = true
    pointer.mouse = e.pointerType === 'mouse'
    buzzer.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`
  }, { passive: true })
  document.documentElement.addEventListener('mouseleave', () => { pointer.inside = false })
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const yak = yakAt(e.clientX, e.clientY)
    if (!yak) return
    if (e.pointerType === 'mouse') {
      e.preventDefault()
      pointer.down = true
    }
    lastShave = performance.now() / 1000
    shave(yak, e.clientX + scrollX, e.clientY + scrollY, lastShave)
  })
  addEventListener('pointerup', () => { pointer.down = false })
  addEventListener('blur', () => { pointer.down = false })

  function updateHover(t) {
    const yak = pointer.inside && pointer.mouse ? yakAt(pointer.x, pointer.y) : null
    for (const y of yaks) y.hovered = y === yak
    document.documentElement.classList.toggle('buzz', !!yak)
    buzzer.classList.toggle('show', !!yak)
    buzzer.classList.toggle('on', !!yak && pointer.down)
    if (yak && pointer.down && t - lastShave > .07) {
      lastShave = t
      shave(yak, pointer.x + scrollX, pointer.y + scrollY, t)
    }
  }

  // ---------- setup ----------

  function resize() {
    W = innerWidth
    H = innerHeight
    dpr = Math.min(perf.dprCap, devicePixelRatio || 1)
    unit = clamp(W / 2600, .4, .6)
  }

  // Watch the frame rate while yaks are on screen. If the machine can't keep
  // up, drop to 1x resolution first, then draw the yaks at 30, 20 and 15 fps.
  // Their behaviour still updates every frame, so they don't slow down.
  const perf = { avg: 16.7, slow: 0, fast: 0, every: 1, dprCap: 2 }
  if ((navigator.hardwareConcurrency || 8) <= 2) { perf.dprCap = 1; perf.every = 2 }

  function adapt(ms) {
    perf.avg += (Math.min(ms, 100) - perf.avg) * .05
    if (perf.avg > 24) { perf.slow += ms; perf.fast = 0 } else if (perf.avg < 18) { perf.fast += ms; perf.slow = 0 }
    if (perf.slow > 1500) {
      perf.slow = 0
      perf.avg = 16.7
      if (perf.dprCap > 1 && (devicePixelRatio || 1) > 1) { perf.dprCap = 1; resize() }
      else if (perf.every < 4) perf.every++
    } else if (perf.fast > 15000 && perf.every > 1) {
      perf.fast = 0
      perf.every--
    }
  }

  // Re-map the page whenever its layout can change: resizes, fonts loading,
  // FAQ answers opening. Layout can change on every frame of a window drag,
  // so wait for it to settle first.
  let remapTimer = 0
  function remap() {
    clearTimeout(remapTimer)
    remapTimer = setTimeout(() => {
      mapPage()
      const t = performance.now() / 1000
      for (const yak of yaks) replan(yak, t)
      for (let i = tufts.length - 1; i >= 0; i--) {
        const tf = tufts[i]
        if (tf.claimed) continue
        const ok = tf.stand ? roomAt(tf.stand.x, tf.stand.y, unit) : clear(tf.x - 12, tf.y - 20, tf.x + 12, tf.y + 2)
        if (ok) continue
        removeTuft(i)
        if (tf.stand) plantTuft(tf.amount)
      }
    }, 200)
  }

  // Wait for the web fonts, so the page is mapped with its final layout.
  await Promise.race([document.fonts?.ready, new Promise((done) => setTimeout(done, 1500))])
  resize()
  mapPage()
  addEventListener('resize', () => { resize(); remap() })
  new ResizeObserver(remap).observe(document.body)

  // Roughly one yak per screenful, kept apart from each other.
  const count = clamp(Math.round(field.h / (W < 700 ? 1400 : 800)), 2, 10)
  for (let i = 0; i < count; i++) {
    let spot = null
    for (let k = 0; k < 20 && !spot; k++) {
      const s = freeSpot(unit)
      if (s && yaks.every((y) => Math.hypot(y.x - s.x, y.y - s.y) > 260)) spot = s
    }
    if (!spot) continue
    const yak = makeYak(spot.x, spot.y)
    yak.size = rand(.92, 1.08)
    yak.scale = unit * yak.size
    if (!roomAt(yak.x, yak.y, yak.scale)) yak.size = 1
    yak.face = yak.faceTo = Math.random() < .5 ? 1 : -1
    yaks.push(yak)
  }
  for (let i = 0; i < yaks.length * 2; i++) plantTuft(1)

  let last = performance.now()
  let frameNo = 0
  function frame(now) {
    const ms = now - last
    const dt = Math.min(.05, ms / 1000)
    const t = now / 1000
    last = now
    let anyVisible = false
    for (const yak of yaks) {
      yak.visible = inView(yak.y, 260 * yak.scale, 40)
      anyVisible ||= yak.visible
    }
    updateHover(t)
    for (const yak of yaks) update(yak, dt, t)
    updateEffects(dt)
    if (anyVisible) adapt(ms)
    if (++frameNo % perf.every === 0) draw(t)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()
