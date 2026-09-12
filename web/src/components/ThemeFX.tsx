import { useEffect, useRef, useState } from 'react'

type FXTheme = 'honey' | 'ocean' | null

function readTheme(): FXTheme {
  const t = document.documentElement.dataset.theme
  return t === 'honey' || t === 'ocean' ? t : null
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/* ------------------------------------------------------------------ */
/* Helpers — seamless periodic wave paths (period P, so a translateX   */
/* of exactly one period loops perfectly)                              */
/* ------------------------------------------------------------------ */

const P = 480 // wave period in viewBox units

/** Closed fill path: top edge down to a wave baseline, tiled far beyond the viewport. */
function waveFill(width: number, baseline: number, amp: number): string {
  const from = -P
  const to = width + P
  let d = `M${from},0 H${to} V${baseline}`
  for (let x = to; x > from; x -= P) {
    d += ` c ${-P / 8},${amp} ${-P * 3 / 8},${amp} ${-P / 2},0 c ${-P / 8},${-amp} ${-P * 3 / 8},${-amp} ${-P / 2},0`
  }
  return `${d} Z`
}

/** Open stroked wave (foam line) on the same tile grid. */
function waveLine(width: number, baseline: number, amp: number): string {
  const from = -P
  const to = width + P
  let d = `M${from},${baseline}`
  for (let x = from; x < to; x += P) {
    d += ` c ${P / 8},${amp} ${P * 3 / 8},${amp} ${P / 2},0 c ${P / 8},${-amp} ${P * 3 / 8},${-amp} ${P / 2},0`
  }
  return d
}

/* ------------------------------------------------------------------ */
/* HONEY SCENE — golden honeycomb with glossy honey poured from above  */
/* ------------------------------------------------------------------ */

const HEX_R = 30
const HEX_W = Math.sqrt(3) * HEX_R
const HEX_V = HEX_R * 1.5

/** Pointy-top hexagon subpath centered at (cx, cy). */
function hexPath(cx: number, cy: number): string {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90)
    d += `${i === 0 ? 'M' : 'L'}${(cx + HEX_R * Math.cos(a)).toFixed(1)},${(cy + HEX_R * Math.sin(a)).toFixed(1)}`
  }
  return `${d}Z`
}

/** Closed pour shape: full-width sheet whose bottom edge is a run of scallops. */
function pourPath(width: number, baseline: number, amp: number, halfW: number): string {
  let d = `M0,0 H${width} V${baseline}`
  for (let x = width; x > 0; x -= halfW * 2) {
    d += ` c ${-halfW / 3},${amp} ${(-halfW * 2) / 3},${amp} ${-halfW},0 c ${-halfW / 3},${-amp} ${(-halfW * 2) / 3},${-amp} ${-halfW},0`
  }
  return `${d} Z`
}

function HoneycombScene() {
  // build the whole hive as explicit vector geometry — three fill buckets
  // for honey tone variety, one shared outline, and gloss dots on a few cells
  const fills = ['', '', '', '', '']
  let outlines = ''
  const dots: Array<[number, number]> = []
  const cols = Math.ceil(1440 / HEX_W) + 2
  const rows = Math.ceil(900 / HEX_V) + 2
  for (let row = -1; row < rows; row++) {
    for (let col = -1; col < cols; col++) {
      const x = col * HEX_W + (row % 2 ? HEX_W / 2 : 0)
      const y = row * HEX_V
      const d = hexPath(x, y)
      outlines += d
      const frac = Math.abs(Math.sin(col * 127.1 + row * 311.7) * 43758.5453) % 1
      const k = Math.floor(frac * 9)
      const bucket = k < 4 ? 0 : k < 6 ? 1 : k === 6 ? 2 : k === 7 ? 3 : 4
      fills[bucket] += d
      if (k === 2 && row % 2 === 0) dots.push([x - 7, y - 9])
    }
  }
  // tongues of honey hanging from the poured sheet
  const tongues = [
    { x: 170, w: 24, h: 78 },
    { x: 420, w: 16, h: 46 },
    { x: 745, w: 30, h: 148 },
    { x: 1005, w: 18, h: 58 },
    { x: 1265, w: 24, h: 96 },
  ]
  return (
    <svg className="fx-sea" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fx-combshade" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#FFE9A8" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#F2A93A" stopOpacity="0" />
          <stop offset="100%" stopColor="#A86308" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="fx-pour" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="290">
          <stop offset="0%" stopColor="#FFE38A" />
          <stop offset="45%" stopColor="#F7BE45" />
          <stop offset="80%" stopColor="#DD9420" />
          <stop offset="100%" stopColor="#CE8517" />
        </linearGradient>
        <radialGradient id="fx-vig2" cx="0.5" cy="0.48" r="0.8">
          <stop offset="58%" stopColor="#4A2E06" stopOpacity="0" />
          <stop offset="100%" stopColor="#4A2E06" stopOpacity="0.42" />
        </radialGradient>
        <radialGradient id="fx-warm" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFEDBC" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#FFEDBC" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FFEDBC" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fx-warmdeep" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#CE8517" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#CE8517" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#CE8517" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the hive — amber base with cream and deep-honey cells */}
      <rect width="1440" height="900" fill="#F7B733" />
      <path d={fills[1]} fill="#FFE3A0" />
      <path d={fills[2]} fill="#FFD267" />
      <path d={fills[3]} fill="#E89427" />
      <path d={fills[4]} fill="#D07E1C" />
      <path d={outlines} fill="none" stroke="#B36F12" strokeOpacity="0.5" strokeWidth="1.6" />
      {dots.map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7.5" ry="4.4" fill="#FFF8DC" opacity="0.55" />
      ))}
      {/* warmth and depth across the comb */}
      <rect width="1440" height="900" fill="url(#fx-combshade)" />

      {/* sunlight patches warming the comb (soft radial gradients — no filters) */}
      <ellipse cx="240" cy="310" rx="340" ry="230" fill="url(#fx-warm)" />
      <ellipse cx="830" cy="540" rx="400" ry="260" fill="url(#fx-warm)" opacity="0.8" />
      <ellipse cx="1290" cy="250" rx="310" ry="210" fill="url(#fx-warm)" opacity="0.85" />
      <ellipse cx="1090" cy="780" rx="370" ry="240" fill="url(#fx-warmdeep)" />
      <ellipse cx="430" cy="800" rx="340" ry="225" fill="url(#fx-warmdeep)" opacity="0.9" />

      {/* glossy honey poured across the top, dripping over the comb */}
      <path d={pourPath(1440, 112, 20, 60)} fill="url(#fx-pour)" />
      {tongues.map((t, i) => (
        <g key={i}>
          <rect x={t.x - t.w / 2} y={92} width={t.w} height={t.h} rx={t.w / 2} fill="url(#fx-pour)" />
          <ellipse cx={t.x - t.w * 0.18} cy={100 + t.h * 0.26} rx={t.w * 0.16} ry={t.h * 0.2} fill="#FFF6D6" opacity="0.7" />
        </g>
      ))}
      {/* gloss along the pour's crest */}
      <rect width="1440" height="12" fill="#FFF6D8" opacity="0.7" />
      <path d={pourPath(1440, 34, 8, 60)} fill="#FFF1BE" opacity="0.35" />

      <rect width="1440" height="900" fill="url(#fx-vig2)" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* OCEAN SCENE — living aerial ocean, caustic light, rolling swells    */
/* ------------------------------------------------------------------ */

function OceanScene() {
  return (
    <svg className="fx-sea" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fx-ocebase" x1="0" y1="0" x2="0.1" y2="1">
          <stop offset="0%" stopColor="#9FDEED" />
          <stop offset="24%" stopColor="#45B2C7" />
          <stop offset="52%" stopColor="#1E86A0" />
          <stop offset="78%" stopColor="#0F5872" />
          <stop offset="100%" stopColor="#093B52" />
        </linearGradient>
        <radialGradient id="fx-ocesun" cx="0.74" cy="0.04" r="0.7">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="45%" stopColor="#D8F6FA" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#D8F6FA" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fx-ocevig" cx="0.5" cy="0.5" r="0.8">
          <stop offset="55%" stopColor="#06222F" stopOpacity="0" />
          <stop offset="100%" stopColor="#06222F" stopOpacity="0.45" />
        </radialGradient>
        {/* wave streaks — horizontal wave lines warped by animated turbulence,
            so the surface genuinely undulates like water */}
        <filter id="fx-ocestreak" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="2" seed="5" result="n">
            <animate
              attributeName="baseFrequency"
              dur="19s"
              values="0.008 0.02;0.012 0.027;0.008 0.02"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="60" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* broad soft light patches */}
        <filter id="fx-ocebroad" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.005 0.009" numOctaves="2" seed="3" result="n">
            <animate
              attributeName="baseFrequency"
              dur="31s"
              values="0.005 0.009;0.008 0.012;0.005 0.009"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.95 0.95 0.95 0 -1.1" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
        {/* deep water shadows */}
        <filter id="fx-ocedeep" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="9" result="n">
            <animate
              attributeName="baseFrequency"
              dur="24s"
              values="0.006 0.011;0.009 0.008;0.006 0.011"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.2  0 0 0 0 0.28  -1 -1 -1 0 2.1" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
        <linearGradient id="fx-oceswell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EAFCFE" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#EAFCFE" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1440" height="900" fill="url(#fx-ocebase)" />

      {/* deep shadow currents */}
      <g className="fx-drift-b" opacity="0.42" style={{ mixBlendMode: 'multiply' }}>
        <rect x="-140" y="-100" width="1720" height="1100" fill="#0E4A5E" filter="url(#fx-ocedeep)" />
      </g>
      {/* broad light patches */}
      <g className="fx-drift-a" opacity="0.45" style={{ mixBlendMode: 'soft-light' }}>
        <rect x="-140" y="-100" width="1720" height="1100" fill="#FFFFFF" filter="url(#fx-ocebroad)" />
      </g>
      {/* wave streaks — light crests warped into organic water lines */}
      <g filter="url(#fx-ocestreak)" className="fx-drift-a" fill="none" strokeLinecap="round">
        {[
          { y: 70, c: 18, w: 2, o: 0.3, col: '#FFFFFF' },
          { y: 112, c: -14, w: 3.5, o: 0.22, col: '#CFF2F7' },
          { y: 158, c: 22, w: 1.5, o: 0.16, col: '#FFFFFF' },
          { y: 205, c: -20, w: 4.5, o: 0.34, col: '#BFF0F6' },
          { y: 252, c: 12, w: 2.5, o: 0.2, col: '#8FDDE8' },
          { y: 298, c: -16, w: 2, o: 0.28, col: '#FFFFFF' },
          { y: 345, c: 24, w: 3, o: 0.2, col: '#CFF2F7' },
          { y: 392, c: -10, w: 1.5, o: 0.14, col: '#FFFFFF' },
          { y: 440, c: 18, w: 5, o: 0.36, col: '#BFF0F6' },
          { y: 488, c: -22, w: 2, o: 0.2, col: '#FFFFFF' },
          { y: 535, c: 14, w: 3.5, o: 0.24, col: '#8FDDE8' },
          { y: 582, c: -18, w: 1.5, o: 0.15, col: '#FFFFFF' },
          { y: 628, c: 20, w: 4, o: 0.3, col: '#CFF2F7' },
          { y: 675, c: -12, w: 2, o: 0.18, col: '#FFFFFF' },
          { y: 722, c: 24, w: 3, o: 0.26, col: '#BFF0F6' },
          { y: 768, c: -16, w: 1.5, o: 0.14, col: '#FFFFFF' },
          { y: 815, c: 16, w: 4.5, o: 0.3, col: '#CFF2F7' },
          { y: 860, c: -20, w: 2, o: 0.18, col: '#FFFFFF' },
        ].map((s, i) => (
          <path
            key={i}
            d={`M-120,${s.y} C 240,${s.y - s.c} 480,${s.y + s.c} 760,${s.y} S 1280,${s.y - s.c} 1560,${s.y}`}
            stroke={s.col}
            strokeWidth={s.w}
            opacity={s.o}
          />
        ))}
      </g>

      {/* rolling swell bands sliding across the surface */}
      <g opacity="0.5">
        <g className="fx-oce-swell-1" fill="url(#fx-oceswell)">
          <path d={waveFill(1440, 220, 30)} />
        </g>
      </g>
      <g opacity="0.32">
        <g className="fx-oce-swell-2" fill="url(#fx-oceswell)">
          <path d={waveFill(1440, 520, 42)} />
        </g>
      </g>
      <g opacity="0.22">
        <g className="fx-oce-swell-3" fill="url(#fx-oceswell)">
          <path d={waveFill(1440, 780, 34)} />
        </g>
      </g>

      {/* sun glints twinkling near the light source */}
      <g fill="#FFFFFF">
        {[
          { x: 1050, y: 90, r: 5, d: 3.2 },
          { x: 1130, y: 150, r: 3.4, d: 4.4 },
          { x: 1210, y: 80, r: 6.5, d: 2.7 },
          { x: 990, y: 190, r: 2.6, d: 5.1 },
          { x: 1280, y: 170, r: 4.2, d: 3.8 },
          { x: 1345, y: 105, r: 3, d: 4.9 },
          { x: 1180, y: 230, r: 2.4, d: 5.6 },
          { x: 1090, y: 40, r: 3.8, d: 3.4 },
          { x: 1250, y: 260, r: 2.8, d: 6.1 },
          { x: 1390, y: 210, r: 3.4, d: 4.1 },
        ].map((g, i) => (
          <ellipse
            key={i}
            className="fx-glint"
            cx={g.x}
            cy={g.y}
            rx={g.r}
            ry={g.r * 0.42}
            style={{ animationDuration: `${g.d}s`, animationDelay: `${i * 0.7}s` }}
          />
        ))}
      </g>

      <rect width="1440" height="900" fill="url(#fx-ocesun)" />
      <rect width="1440" height="900" fill="url(#fx-ocevig)" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* OCEAN EDGE — two wave layers sliding forever with foam              */
/* ------------------------------------------------------------------ */

function OceanEdge() {
  const foamDots: Array<[number, number, number]> = [
    [120, 6.5, 1.4], [405, 4.5, 1.1], [690, 7.5, 1.6], [975, 5, 1.2], [1260, 6.8, 1.4], [1545, 4.2, 1.1],
  ]
  return (
    <svg className="fx-edge-svg" viewBox="0 0 1440 30" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="fx-ocewavea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4FB0BC" />
          <stop offset="100%" stopColor="#22808F" />
        </linearGradient>
        <linearGradient id="fx-ocewaveb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2E94A2" />
          <stop offset="100%" stopColor="#175E6B" />
        </linearGradient>
      </defs>

      {/* back wave — slower, deeper */}
      <g className="fx-oce-wave-b">
        <path d={waveFill(1440, 15, 5)} fill="url(#fx-ocewaveb)" />
      </g>

      {/* front wave with foam crest */}
      <g className="fx-oce-wave-a">
        <path d={waveFill(1440, 10, 6)} fill="url(#fx-ocewavea)" />
        <path d={waveLine(1440, 10, 6)} fill="none" stroke="#EAFBFC" strokeWidth="1.8" opacity="0.75" />
        {foamDots.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#F4FDFE" opacity="0.85" />
        ))}
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Click particles                                                     */
/* ------------------------------------------------------------------ */

function spawnHoneyPoint(layer: HTMLElement, x: number, y: number) {
  for (let i = 0; i < 3; i++) {
    const el = document.createElement('span')
    el.className = 'fx-honey-drop'
    const size = rand(8, 14)
    el.style.left = `${x + rand(-14, 14)}px`
    el.style.top = `${y + rand(-6, 6)}px`
    el.style.width = `${size}px`
    el.style.height = `${size * 1.3}px`
    el.style.setProperty('--dx', `${rand(-26, 26).toFixed(0)}px`)
    el.style.animationDelay = `${(i * 50).toFixed(0)}ms`
    el.addEventListener('animationend', () => el.remove())
    layer.appendChild(el)
  }
}

function spawnHoneyButton(layer: HTMLElement, r: DOMRect) {
  // honey releases from the dipped button's bottom edge
  const count = Math.min(5, Math.max(3, Math.round(r.width / 90)))
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span')
    el.className = 'fx-honey-drop fx-honey-drop-btn'
    const size = rand(7, 13)
    el.style.left = `${r.left + r.width * rand(0.14, 0.86)}px`
    el.style.top = `${r.bottom - 4}px`
    el.style.width = `${size}px`
    el.style.height = `${size * 1.35}px`
    el.style.setProperty('--dx', `${rand(-14, 14).toFixed(0)}px`)
    el.style.animationDelay = `${(i * 60).toFixed(0)}ms`
    el.addEventListener('animationend', () => el.remove())
    layer.appendChild(el)
  }
  // golden splash ring at the press point
  const ring = document.createElement('span')
  ring.className = 'fx-honey-splash'
  ring.style.left = `${r.left + r.width / 2}px`
  ring.style.top = `${r.top + r.height / 2}px`
  ring.addEventListener('animationend', () => ring.remove())
  layer.appendChild(ring)
}

function spawnOceanPoint(layer: HTMLElement, x: number, y: number) {
  const ring = document.createElement('span')
  ring.className = 'fx-ripple'
  ring.style.left = `${x}px`
  ring.style.top = `${y}px`
  ring.addEventListener('animationend', () => ring.remove())
  layer.appendChild(ring)
  for (let i = 0; i < 2; i++) {
    const b = document.createElement('span')
    b.className = 'fx-bubble'
    const size = rand(5, 10)
    b.style.left = `${x + rand(-16, 16)}px`
    b.style.top = `${y + rand(-4, 8)}px`
    b.style.width = `${size}px`
    b.style.height = `${size}px`
    b.style.setProperty('--dx', `${rand(-20, 20).toFixed(0)}px`)
    b.style.animationDelay = `${(i * 70).toFixed(0)}ms`
    b.addEventListener('animationend', () => b.remove())
    layer.appendChild(b)
  }
}

function spawnOceanButton(layer: HTMLElement, r: DOMRect) {
  const cx = r.left + r.width / 2
  // double splash ring at the bottom edge, like a stone hitting water
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement('span')
    ring.className = 'fx-ripple fx-ripple-big'
    ring.style.left = `${cx}px`
    ring.style.top = `${r.bottom - 2}px`
    ring.style.animationDelay = `${i * 110}ms`
    ring.addEventListener('animationend', () => ring.remove())
    layer.appendChild(ring)
  }
  // droplets leaping out of the button
  for (let i = 0; i < 6; i++) {
    const el = document.createElement('span')
    el.className = 'fx-droplet'
    const size = rand(4, 8)
    el.style.left = `${r.left + r.width * rand(0.1, 0.9)}px`
    el.style.top = `${r.bottom - 2}px`
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.setProperty('--dx', `${rand(-70, 70).toFixed(0)}px`)
    el.style.setProperty('--dy', `${rand(-52, -14).toFixed(0)}px`)
    el.style.animationDelay = `${(i * 28).toFixed(0)}ms`
    el.addEventListener('animationend', () => el.remove())
    layer.appendChild(el)
  }
  // bubbles drifting up from the water line
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('span')
    b.className = 'fx-bubble'
    const size = rand(5, 9)
    b.style.left = `${r.left + r.width * rand(0.15, 0.85)}px`
    b.style.top = `${r.bottom - 4}px`
    b.style.width = `${size}px`
    b.style.height = `${size}px`
    b.style.setProperty('--dx', `${rand(-24, 24).toFixed(0)}px`)
    b.style.animationDelay = `${(i * 90).toFixed(0)}ms`
    b.addEventListener('animationend', () => b.remove())
    layer.appendChild(b)
  }
}

const INTERACTIVE = 'button, a, .btn, .chip-btn, .tab, .niche-pill, [role="button"]'

/**
 * Theme-only special effects. Renders nothing except on honey/ocean:
 * - a full animated scene background (flowing liquid honey / living ocean)
 * - an animated top edge (stretching honey drips / rolling waves)
 * - click particles; interactive elements release honey drops / water splashes
 * No animals, pointer-events none, capped for performance.
 */
export function ThemeFX() {
  const [fx, setFx] = useState<FXTheme>(() => readTheme())
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFx(readTheme())
    const mo = new MutationObserver(() => setFx(readTheme()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    if (!fx) return
    const layer = layerRef.current
    if (!layer) return

    const MAX = 56

    const onDown = (e: PointerEvent) => {
      if (layer.childElementCount > MAX) return
      const x = e.clientX
      const y = e.clientY
      const target = e.target as Element | null
      const btn = target?.closest?.(INTERACTIVE) as HTMLElement | null
      let r: DOMRect | null = null
      if (btn) {
        r = btn.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) r = null
      }
      if (fx === 'honey') {
        spawnHoneyPoint(layer, x, y)
        if (r) spawnHoneyButton(layer, r)
      } else {
        spawnOceanPoint(layer, x, y)
        if (r) spawnOceanButton(layer, r)
      }
    }

    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [fx])

  if (!fx) return null
  return (
    <>
      <div className="fx-bg" aria-hidden>
        {fx === 'honey' ? <HoneycombScene /> : <OceanScene />}
        {fx === 'honey' && <div className="fx-honey-sheen" />}
        <div className={fx === 'honey' ? 'fx-veil-honey' : 'fx-veil-ocean'} />
      </div>
      {fx === 'ocean' && (
        <div className="fx-edge" aria-hidden>
          <OceanEdge />
        </div>
      )}
      <div ref={layerRef} className="fx-layer" aria-hidden />
    </>
  )
}
