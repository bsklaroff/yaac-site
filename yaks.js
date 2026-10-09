// Yaks that roam the page background. Hovering one swaps the cursor for
// clippers; clicking (or holding and dragging) shaves it, which it enjoys.
// Nothing is saved, so a reload brings every coat back.
(() => {
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
  // The head, horns and ear are drawn around the neck pivot, muzzle right.
  const HEAD = new Path2D('M-2 -14C10 -22 30 -20 40 -12C50 -4 58 8 64 18C68 26 64 34 56 34C46 34 36 30 26 26C14 22 2 18 -4 10Z')
  const HORN = new Path2D('M15 -15C8 -30 16 -45 33 -47C24 -41 22 -30 28 -16Z')
  const EAR = new Path2D('M15 -9Q5 -15 -6 -8Q5 -3 15 -4Z')
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
      muzzle: '#1f1916', horn: '#c9b99a', hornTip: '#4a4540', hoof: '#151110',
    },
    { // golden
      under: ['#6e4d2c', '#7a5531', '#634528'], over: ['#8f6a3f', '#9c7547', '#a57d4c', '#87613a'], hi: ['#c49a62', '#d0a86f', '#b88d58'],
      skin: '#93716a', skinLight: '#ab8a80', stubble: '#5b4026', fur: '#7c5833', furDark: '#5a3f24',
      muzzle: '#3d2c24', horn: '#ddd0b5', hornTip: '#8a7e6a', hoof: '#2a1f18',
    },
    { // grey-brown
      under: ['#3e3530', '#463c36', '#38302b'], over: ['#5a4e46', '#665950', '#52473f'], hi: ['#8d7f73', '#9a8b7d'],
      skin: '#5d5150', skinLight: '#726564', stubble: '#2f2925', fur: '#4c423b', furDark: '#362f2a',
      muzzle: '#2a2421', horn: '#cfc4ad', hornTip: '#5d564d', hoof: '#1a1613',
    },
  ]
  // White patches on piebald yaks. The skin under them is pink.
  const PIED = { under: ['#b9afa2', '#c6bdb0'], over: ['#ddd5c9', '#e6dfd4', '#d2c9bc'], hi: ['#f2ece3'], skin: '#c49a92', face: '#ddd5c9' }

  const canvas = document.createElement('canvas')
  canvas.className = 'yaks'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.prepend(canvas)
  const ctx = canvas.getContext('2d')

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
      scale: 1, sx: 1, drawY: y, speed: rand(22, 32), walk: 0, phase: 0, ha: .15,
      tailA: .3, tailT: 0, sway: .05, swayT: 0, swayHz: 2.2, lag: 0, hop: 0,
      seed: rand(0, TAU), blinkAt: rand(1, 5), heartT: 0, say: null, naked: false, hovered: false,
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
    // Head: a fringe over the eyes, a tuft between the horns, and a beard.
    for (let n = 0; n < 34;) {
      const sx = rand(10, 42)
      const sy = rand(-20, -4)
      if (!inHead(sx, sy)) continue
      n++
      strand('head', 'over', 2, 1, sx, sy, rand(.4, 1.1), rand(10, 20), .4)
    }
    for (let i = 0; i < 12; i++) strand('head', 'hi', 1.8, 1, rand(4, 20), rand(-17, -13), -Math.PI / 2 - rand(.4, 1), rand(8, 13), .8)
    for (let n = 0; n < 36;) {
      const sx = rand(-4, 36)
      const sy = rand(6, 32)
      if (!inHead(sx, sy) || inHead(sx, sy + 5)) continue
      n++
      strand('head', pick(['under', 'over']), 2.3, 1, sx, sy, Math.PI / 2 + rand(-.2, .2), rand(14, 26) + (36 - sx) * .35, rand(.1, .3), true)
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

  // Lay out every strand as a quadratic curve. A strand's shape depends on its
  // full length, so cutting one just ends it sooner along the same curve.
  function layoutCoat(yak, bones) {
    for (const st of yak.all) {
      const b = bones[st.bone]
      const rx = b.x + st.x * b.c - st.y * b.s
      const ry = b.y + st.x * b.s + st.y * b.c
      const a = st.gravity ? st.angle : st.angle + b.a
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      const bend = st.curl + yak.sway * Math.sin(yak.swayT + st.phase) + yak.lag
      const L = st.L
      const k1 = L * L * .075 / st.L0
      const k2 = L * L * .3 / st.L0
      const mx = rx + dx * L / 2 + bend * k1
      const my = ry + dy * L / 2 + st.droop * k1
      st.ax = rx; st.ay = ry; st.dx = dx; st.dy = dy
      st.ex = rx + dx * L + bend * k2
      st.ey = ry + dy * L + st.droop * k2
      st.cx = 2 * mx - (rx + st.ex) / 2
      st.cy = 2 * my - (ry + st.ey) / 2
    }
  }

  function strokeCoat(yak, list) {
    const paths = []
    for (const st of list) {
      if (st.L <= STUB) continue
      const p = paths[st.style] ??= new Path2D()
      p.moveTo(st.ax, st.ay)
      p.quadraticCurveTo(st.cx, st.cy, st.ex, st.ey)
    }
    paths.forEach((p, i) => {
      ctx.strokeStyle = yak.styles[i].color
      ctx.lineWidth = yak.styles[i].w
      ctx.stroke(p)
    })
  }

  function strokeStubble(yak, list) {
    const p = new Path2D()
    let any = false
    for (const st of list) {
      if (st.L > STUB) continue
      p.moveTo(st.ax, st.ay)
      p.lineTo(st.ax + st.dx * 2, st.ay + st.dy * 2)
      any = true
    }
    if (!any) return
    ctx.globalAlpha = .55
    ctx.strokeStyle = yak.pal.stubble
    ctx.lineWidth = 1.2
    ctx.stroke(p)
    ctx.globalAlpha = 1
  }

  // ---------- drawing ----------

  let W = 0
  let H = 0
  let dpr = 1
  let unit = 1
  const field = { left: 0, right: 0, top: 0, bottom: 0 }
  const yaks = []
  const tufts = []
  const clippings = []
  const fx = []

  const scaleAt = (y) => unit * (.78 + .32 * clamp((y - field.top) / Math.max(1, field.bottom - field.top), 0, 1))
  const toScreen = (yak, x, y) => [yak.x + x * yak.scale * yak.sx, yak.drawY + y * yak.scale]

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

  function hornPaint(yak, x0, y0, dark) {
    const g = ctx.createLinearGradient(x0 + 20, y0 - 15, x0 + 32, y0 - 46)
    g.addColorStop(0, dark ? yak.pal.hornTip : yak.pal.horn)
    g.addColorStop(1, dark ? '#1c1a18' : yak.pal.hornTip)
    return g
  }

  function drawHeadBase(yak, b, t) {
    const pal = yak.pal
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.a)
    ctx.save()
    ctx.translate(8, 3)
    ctx.fillStyle = hornPaint(yak, 8, 3, true)
    ctx.fill(HORN)
    ctx.restore()
    const g = ctx.createLinearGradient(0, -20, 0, 34)
    g.addColorStop(0, pal.fur)
    g.addColorStop(1, pal.furDark)
    ctx.fillStyle = g
    ctx.fill(HEAD)
    if (yak.blaze) {
      ctx.save()
      ctx.clip(HEAD)
      ctx.fillStyle = PIED.face
      ctx.beginPath(); ctx.ellipse(46, 6, 12, 26, -.6, 0, TAU); ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = yak.blaze ? '#8f6f6a' : pal.muzzle
    ctx.beginPath(); ctx.ellipse(57, 25, 9, 10, .5, 0, TAU); ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .55)'
    ctx.beginPath(); ctx.ellipse(62.5, 20, 2.2, 1.3, .9, 0, TAU); ctx.fill()
    const chew = yak.state === 'graze' && !still ? Math.sin(t * 9) * 1.5 : 0
    ctx.strokeStyle = 'rgb(0 0 0 / .5)'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(61, 31 + chew * .3); ctx.quadraticCurveTo(55, 33 + chew, 48, 30); ctx.stroke()
    ctx.save()
    ctx.translate(15, -7)
    ctx.rotate(Math.sin(t * 1.1 + yak.seed) * .15 + (Math.sin(t * .37 + yak.seed) > .97 ? Math.sin(t * 30) * .3 : 0))
    ctx.translate(-15, 7)
    ctx.fillStyle = pal.fur
    ctx.fill(EAR)
    ctx.fillStyle = 'rgb(214 150 140 / .45)'
    ctx.beginPath(); ctx.ellipse(6, -7.5, 6, 1.6, -.15, 0, TAU); ctx.fill()
    ctx.restore()
    ctx.fillStyle = hornPaint(yak, 0, 0, false)
    ctx.fill(HORN)
    ctx.restore()
  }

  function drawFace(yak, b, t) {
    const happy = yak.state === 'enjoy' || yak.state === 'celebrate'
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.a)
    const ex = 34
    const ey = -1
    if (happy) {
      ctx.strokeStyle = '#f1e4cf'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(ex, ey + 2, 3.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke()
      ctx.fillStyle = 'rgb(255 120 135 / .5)'
      ctx.beginPath(); ctx.ellipse(43, 11, 5.5, 3, .3, 0, TAU); ctx.fill()
    } else if (t < yak.blinkUntil) {
      ctx.strokeStyle = '#140f0d'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(ex - 3.5, ey); ctx.lineTo(ex + 3.5, ey + .5); ctx.stroke()
    } else {
      ctx.fillStyle = '#e9dcc6'
      ctx.beginPath(); ctx.ellipse(ex, ey, 4.1, 4.3, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = '#140f0d'
      ctx.beginPath(); ctx.ellipse(ex + .8, ey + .3, 2.9, 3.2, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(ex + 1.8, ey - 1, .9, 0, TAU); ctx.fill()
    }
    ctx.restore()
  }

  function drawYak(yak, t) {
    const s = yak.scale
    const pal = yak.pal
    yak.sx = Math.sign(yak.face || 1) * Math.max(.06, Math.abs(yak.face))
    yak.drawY = yak.y - yak.hop * s
    const bones = yak.bones = pose(yak)
    const bob = bones[0].y
    layoutCoat(yak, bones)

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
    ctx.restore()
    strokeStubble(yak, yak.tail)
    strokeCoat(yak, yak.tail)

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

    // Neck, joining the shoulders to wherever the head is. Its short fur
    // matches the head's.
    const hb = bones[1]
    const hp = (x, y) => [hb.x + x * hb.c - y * hb.s, hb.y + x * hb.s + y * hb.c]
    ctx.fillStyle = pal.fur
    ctx.beginPath()
    ctx.moveTo(56, -116 + bob); ctx.lineTo(...hp(2, -17)); ctx.lineTo(...hp(-2, 14)); ctx.lineTo(78, -60 + bob)
    ctx.fill()

    for (const leg of LEGS) if (leg.near) drawLeg(yak, leg, bob, t)

    ctx.lineCap = 'round'
    strokeStubble(yak, yak.under)
    strokeStubble(yak, yak.over)
    strokeStubble(yak, yak.fluff)
    strokeCoat(yak, yak.under)
    strokeCoat(yak, yak.over)
    strokeCoat(yak, yak.fluff)

    drawHeadBase(yak, hb, t)
    ctx.lineCap = 'round'
    strokeStubble(yak, yak.head)
    strokeCoat(yak, yak.head)
    drawFace(yak, hb, t)
    ctx.restore()
  }

  function drawTuft(tf) {
    const s = scaleAt(tf.y)
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

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const scene = [...tufts.map((tf) => ({ y: tf.y, tf })), ...yaks.map((yak) => ({ y: yak.y, yak }))]
    scene.sort((a, b) => a.y - b.y)
    for (const item of scene) item.tf ? drawTuft(item.tf) : drawYak(item.yak, t)

    ctx.lineCap = 'round'
    for (const c of clippings) {
      ctx.globalAlpha = Math.min(1, c.life / 3)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(c.rot)
      ctx.strokeStyle = c.color
      ctx.lineWidth = c.w
      ctx.beginPath()
      ctx.moveTo(c.pts[0], c.pts[1])
      for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(c.pts[i], c.pts[i + 1])
      ctx.stroke()
      ctx.restore()
    }
    for (const f of fx) {
      ctx.globalAlpha = Math.min(1, f.life / (f.max * .5))
      if (f.kind === 'heart') { ctx.fillStyle = '#ff7a93'; drawHeart(f.x, f.y, f.size) }
      else { ctx.fillStyle = '#ffd98a'; drawSparkle(f.x, f.y, f.size) }
    }
    ctx.globalAlpha = 1
    for (const yak of yaks) {
      if (!yak.say || t > yak.say.until || !yak.bones) continue
      const h = yak.bones[1]
      drawBubble(...toScreen(yak, h.x + 24, h.y - 52), yak.say.text)
    }
  }

  // ---------- behaviour ----------

  function makeTuft(x, y, amount = 1) {
    const blades = Array.from({ length: 9 }, () => ({
      x: rand(-9, 9), h: rand(9, 18), lean: rand(-6, 6), color: pick(['#3f5a2c', '#4a6a32', '#56783a', '#35502a']),
    }))
    return { x, y, amount, grow: amount < 1, claimed: null, blades }
  }

  const randomSpot = () => ({ x: rand(field.left, field.right), y: rand(field.top, field.bottom) })

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

  function decide(yak, t) {
    release(yak)
    if (yak.hovered) return setState(yak, 'idle', rand(1, 2))
    if (yak.naked && Math.random() < .15) {
      say(yak, 'brr', t)
      return setState(yak, 'shiver', 1)
    }
    const r = Math.random()
    if (r < .4 && !still) {
      const d = rand(100, 380)
      const a = rand(0, TAU)
      yak.target = { x: clamp(yak.x + Math.cos(a) * d, field.left, field.right), y: clamp(yak.y + Math.sin(a) * d * .5, field.top, field.bottom) }
      return setState(yak, 'walk', 30)
    }
    if (r < .7) {
      let tuft = null
      let best = 600
      for (const tf of tufts) {
        const d = Math.hypot(tf.x - yak.x, tf.y - yak.y)
        if (!tf.claimed && tf.amount > .5 && d < best) { best = d; tuft = tf }
      }
      if (tuft && !still) {
        let dir = tuft.x >= yak.x ? 1 : -1
        const reach = 80 * scaleAt(tuft.y)
        const x = tuft.x - dir * reach
        if (x < field.left || x > field.right) dir = -dir
        yak.tuft = tuft
        tuft.claimed = yak
        yak.grazeDir = dir
        yak.target = { x: tuft.x - dir * reach, y: tuft.y - 1 }
        return setState(yak, 'walk', 30)
      }
      // No grass in reach, so it makes do with what's underfoot.
      const tf = makeTuft(yak.x + 80 * yak.scale * Math.sign(yak.faceTo), yak.y + 1, .7)
      tf.grow = false
      tf.claimed = yak
      tufts.push(tf)
      yak.tuft = tf
      return setState(yak, 'graze', rand(4, 7))
    }
    if (r < .86) return setState(yak, 'idle', rand(2, 5))
    if (r < .93 && !still) return setState(yak, 'shake', 1.2)
    say(yak, pick(['*grunt*', 'hrmph', 'mrrrh']), t)
    return setState(yak, 'idle', 2.5)
  }

  function update(yak, dt, t) {
    yak.scale = scaleAt(yak.y)
    yak.timer -= dt
    if (yak.hovered && yak.state === 'walk') { release(yak); setState(yak, 'idle', 1.5) }
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
          if (yak.tuft && d < 2) {
            yak.faceTo = yak.grazeDir
            setState(yak, 'graze', rand(5, 9))
          } else decide(yak, t)
          break
        }
        if (Math.abs(dx) > 3) yak.faceTo = Math.sign(dx)
        const turning = Math.abs(yak.face - yak.faceTo) > .3
        const step = Math.min(d, yak.speed * yak.scale * (turning ? .25 : 1) * dt)
        yak.x += dx / d * step
        yak.y += dy / d * step
        yak.phase += step / yak.scale * .11
        walking = true
        break
      }
      case 'graze':
        headTo = 1.15
        if (yak.tuft && yak.ha > .9 && Math.abs(yak.face - yak.faceTo) < .1) {
          yak.tuft.amount -= dt * .07
          if (yak.tuft.amount <= .05) {
            tufts.splice(tufts.indexOf(yak.tuft), 1)
            yak.tuft = null
            if (tufts.length < yaks.length * 2 + 2) {
              const spot = randomSpot()
              tufts.push(makeTuft(spot.x, spot.y, 0))
            }
            decide(yak, t)
          }
        }
        break
      case 'enjoy':
        headTo = -.22
        yak.heartT -= dt
        if (yak.heartT <= 0 && yak.bones) {
          yak.heartT = .3
          const [x, y] = toScreen(yak, yak.bones[1].x + rand(10, 40), yak.bones[1].y - rand(15, 30))
          fx.push({ kind: 'heart', x, y, vx: rand(-12, 12), vy: rand(-45, -30), life: 1.4, max: 1.4, size: rand(4, 6.5) })
        }
        break
      case 'celebrate':
        headTo = -.3
        if (!still) yak.hop = Math.abs(Math.sin(t * 7)) * 14
        if (Math.random() < dt * 14) {
          const [x, y] = toScreen(yak, rand(-90, 110), rand(-140, -30))
          fx.push({ kind: 'sparkle', x, y, vx: 0, vy: -15, life: .9, max: .9, size: rand(3, 6) })
        }
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
  function shave(yak, px, py, t) {
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
      setState(yak, 'celebrate', 2.4)
      say(yak, 'so fresh!', t, 2.4)
    }
  }

  function drop(yak, st, from) {
    const s = yak.scale
    const pts = []
    let cx = 0
    let cy = 0
    for (let i = 0; i < 4; i++) {
      const u = from + (1 - from) * i / 3
      const v = 1 - u
      const [x, y] = toScreen(yak, v * v * st.ax + 2 * u * v * st.cx + u * u * st.ex, v * v * st.ay + 2 * u * v * st.cy + u * u * st.ey)
      pts.push(x, y)
      cx += x / 4
      cy += y / 4
    }
    for (let i = 0; i < pts.length; i += 2) { pts[i] -= cx; pts[i + 1] -= cy }
    const style = yak.styles[st.style]
    clippings.push({
      pts, x: cx, y: cy, vx: rand(-30, 30), vy: rand(-50, 0), rot: 0, vr: rand(-2, 2),
      color: style.color, w: style.w * s, ground: yak.y + rand(-4, 10) * s, landed: false, life: rand(9, 15),
    })
    if (clippings.length > 900) clippings.shift()
  }

  function updateEffects(dt) {
    for (const c of clippings) {
      if (c.landed) { c.life -= dt; continue }
      c.vy = Math.min(c.vy + 320 * dt, 130)
      c.vx *= 1 - dt * 1.5
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.rot += c.vr * dt
      if (c.y >= c.ground) { c.y = c.ground; c.landed = true }
    }
    for (const f of fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt }
    for (const list of [clippings, fx]) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1)
    }
    for (const tf of tufts) if (tf.grow) { tf.amount = Math.min(1, tf.amount + dt * .05); tf.grow = tf.amount < 1 }
  }

  // ---------- pointer ----------

  const pointer = { x: 0, y: 0, inside: false, mouse: true, down: false }
  let lastShave = 0

  function hitYak(yak, px, py) {
    const s = yak.scale
    if (!yak.bones || Math.abs(yak.sx) < .3) return false
    if (Math.abs(px - yak.x) > 140 * s || py > yak.drawY + 6 * s || py < yak.drawY - 175 * s) return false
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

  // The front-most yak under the point, unless page content is in the way.
  function yakAt(px, py) {
    const hit = [...yaks].sort((a, b) => b.y - a.y).find((yak) => hitYak(yak, px, py))
    if (!hit) return null
    const el = document.elementFromPoint(px, py)
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
    shave(yak, e.clientX, e.clientY, lastShave)
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
      shave(yak, pointer.x, pointer.y, t)
    }
  }

  // ---------- setup ----------

  function resize() {
    W = innerWidth
    H = innerHeight
    dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    unit = clamp(W / 1700, .42, .8)
    field.left = 70 * unit
    field.right = W - 70 * unit
    field.top = Math.min(H * .3, 160)
    field.bottom = H - 14
    for (const yak of yaks) {
      yak.x = clamp(yak.x, field.left, field.right)
      yak.y = clamp(yak.y, field.top, field.bottom)
    }
    for (const tf of tufts) {
      tf.x = clamp(tf.x, field.left, field.right)
      tf.y = clamp(tf.y, field.top, field.bottom)
    }
  }

  resize()
  addEventListener('resize', resize)
  const count = clamp(Math.round(W * H / 320000), 2, 6)
  for (let i = 0; i < count; i++) {
    const yak = makeYak(clamp((i + .5) / count * W + rand(-60, 60), field.left, field.right), rand(field.top, field.bottom))
    yak.face = yak.faceTo = Math.random() < .5 ? 1 : -1
    yaks.push(yak)
  }
  for (let i = 0; i < count * 2 + 2; i++) {
    const spot = randomSpot()
    tufts.push(makeTuft(spot.x, spot.y))
  }

  let last = performance.now()
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000)
    const t = now / 1000
    last = now
    updateHover(t)
    for (const yak of yaks) update(yak, dt, t)
    updateEffects(dt)
    draw(t)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()
