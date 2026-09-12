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
/* HONEY SCENE — slowly flowing liquid gold                            */
/* ------------------------------------------------------------------ */

function HoneyScene() {
  return (
    <svg className="fx-sea" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fx-honeybase" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#FFE9A4" />
          <stop offset="32%" stopColor="#F4C659" />
          <stop offset="62%" stopColor="#DB9C2B" />
          <stop offset="86%" stopColor="#B0741A" />
          <stop offset="100%" stopColor="#8A560F" />
        </linearGradient>
        <radialGradient id="fx-honeyglow" cx="0.24" cy="0.08" r="0.8">
          <stop offset="0%" stopColor="#FFFDF2" stopOpacity="0.62" />
          <stop offset="45%" stopColor="#FFF6D8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FFF6D8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fx-honeyvig" cx="0.5" cy="0.5" r="0.78">
          <stop offset="55%" stopColor="#4A2E06" stopOpacity="0" />
          <stop offset="100%" stopColor="#4A2E06" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="fx-honeysheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFDF0" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFDF0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFDF0" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fx-honeybub" cx="0.32" cy="0.28" r="0.85">
          <stop offset="0%" stopColor="#FFFBEA" stopOpacity="0.95" />
          <stop offset="42%" stopColor="#F7D879" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#B4771B" stopOpacity="0.65" />
        </radialGradient>
        {/* viscous dark streaks — turbulence slowly morphs so the honey truly flows */}
        <filter id="fx-honeydark" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.007 0.024" numOctaves="3" seed="11" result="n">
            <animate
              attributeName="baseFrequency"
              dur="38s"
              values="0.007 0.024;0.011 0.018;0.007 0.024"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.34  0 0 0 0 0.2  0 0 0 0 0.04  1 1 1 0 -1.05" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
        {/* pale gold ribbons drifting through the honey */}
        <filter id="fx-honeylight" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="4" result="n">
            <animate
              attributeName="baseFrequency"
              dur="26s"
              values="0.012 0.02;0.009 0.026;0.012 0.02"
              keyTimes="0;0.5;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.93  0 0 0 0 0.6  1.15 1.15 1.15 0 -1.3" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
      </defs>

      <rect width="1440" height="900" fill="url(#fx-honeybase)" />

      {/* deep amber pools */}
      <g className="fx-drift-a" opacity="0.38">
        <rect x="-140" y="-100" width="1720" height="1100" fill="#7A4C0C" filter="url(#fx-honeydark)" />
      </g>
      {/* golden ribbons */}
      <g className="fx-drift-b" opacity="0.42">
        <rect x="-140" y="-100" width="1720" height="1100" fill="#FFEDB0" filter="url(#fx-honeylight)" />
      </g>

      {/* glossy sheen bands, rotating slowly through the liquid */}
      <g opacity="0.22" transform="rotate(24 720 450)">
        <rect className="fx-drift-a" x="-240" y="-200" width="360" height="1400" fill="url(#fx-honeysheen)" />
      </g>
      <g opacity="0.14" transform="rotate(24 720 450)">
        <rect className="fx-drift-b" x="520" y="-200" width="520" height="1400" fill="url(#fx-honeysheen)" />
      </g>
      <g opacity="0.18" transform="rotate(24 720 450)">
        <rect className="fx-drift-a" x="1080" y="-200" width="260" height="1400" fill="url(#fx-honeysheen)" />
      </g>

      {/* slow air bubbles rising through the honey */}
      {[
        { x: 150, y: 830, r: 8, d: 15 },
        { x: 420, y: 880, r: 5, d: 19 },
        { x: 690, y: 810, r: 10, d: 13 },
        { x: 1010, y: 890, r: 6, d: 21 },
        { x: 1270, y: 840, r: 8, d: 17 },
      ].map((b, i) => (
        <circle
          key={i}
          className="fx-honey-bub"
          cx={b.x}
          cy={b.y}
          r={b.r}
          fill="url(#fx-honeybub)"
          style={{ animationDuration: `${b.d}s`, animationDelay: `${i * 3.1}s` }}
        />
      ))}

      <rect width="1440" height="900" fill="url(#fx-honeyglow)" />
      <rect width="1440" height="900" fill="url(#fx-honeyvig)" />
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
/* HONEY EDGE — glossy bar, stretching drips, droplets that detach     */
/* ------------------------------------------------------------------ */

function HoneyEdge() {
  // [x, width, length] — static drips
  const statics: Array<[number, number, number]> = [
    [34, 13, 10], [96, 9, 7], [180, 18, 17], [285, 10, 8], [352, 14, 12],
    [455, 20, 22], [560, 9, 6], [625, 15, 13], [742, 11, 9], [830, 17, 15],
    [945, 10, 7], [1022, 21, 24], [1130, 12, 10], [1218, 15, 12], [1330, 19, 19], [1408, 10, 8],
  ]
  // stretching drips [x, width, length, duration, delay]
  const stretchers: Array<[number, number, number, number, number]> = [
    [130, 15, 15, 4.6, 0.4],
    [505, 17, 17, 5.4, 1.6],
    [878, 14, 14, 4.2, 2.7],
    [1165, 16, 16, 5.8, 1.1],
  ]
  // droplets that form and fall [x, delay, duration]
  const droplets: Array<[number, number, number]> = [
    [137.5, 2.9, 4.6],
    [513.5, 4.4, 5.4],
    [885, 1.6, 4.2],
    [1173, 3.8, 5.8],
  ]
  return (
    <svg className="fx-edge-svg" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="fx-honeybar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F8D36E" />
          <stop offset="55%" stopColor="#E3AC45" />
          <stop offset="100%" stopColor="#B07C1F" />
        </linearGradient>
        <linearGradient id="fx-honeydrip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9B94E" />
          <stop offset="70%" stopColor="#C08A24" />
          <stop offset="100%" stopColor="#9A6714" />
        </linearGradient>
      </defs>

      {/* bar with a gently scalloped bottom */}
      <path d={waveFill(1440, 9, 3).replace('V9', 'V6')} fill="url(#fx-honeybar)" transform="translate(0,3)" />
      <rect x="0" y="0" width="1440" height="2.4" fill="#FFF4D6" opacity="0.9" />
      <rect x="0" y="7.4" width="1440" height="1.4" fill="#8A5D0E" opacity="0.3" />

      {statics.map(([x, w, h], i) => (
        <g key={`s${i}`}>
          <rect x={x} y="6" width={w} height={h} rx={w / 2} fill="url(#fx-honeydrip)" />
          <ellipse cx={x + w * 0.32} cy={6 + h * 0.3} rx={w * 0.16} ry={h * 0.24} fill="#FFF6DC" opacity="0.6" />
        </g>
      ))}

      {stretchers.map(([x, w, h, d, delay], i) => (
        <g key={`m${i}`} className="fx-honey-stretch" style={{ animationDuration: `${d}s`, animationDelay: `${delay}s` }}>
          <rect x={x} y="5" width={w} height={h} rx={w / 2} fill="url(#fx-honeydrip)" />
          <ellipse cx={x + w * 0.32} cy={5 + h * 0.28} rx={w * 0.16} ry={h * 0.26} fill="#FFF6DC" opacity="0.65" />
        </g>
      ))}

      {droplets.map(([x, delay, d], i) => (
        <ellipse
          key={`d${i}`}
          className="fx-honey-fall"
          cx={x}
          cy="26"
          rx="3.4"
          ry="4.6"
          fill="url(#fx-honeydrip)"
          style={{ animationDuration: `${d}s`, animationDelay: `${delay}s` }}
        />
      ))}
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
        {fx === 'honey' ? <HoneyScene /> : <OceanScene />}
        <div className={fx === 'honey' ? 'fx-veil-honey' : 'fx-veil-ocean'} />
      </div>
      <div className="fx-edge" aria-hidden>
        {fx === 'honey' ? <HoneyEdge /> : <OceanEdge />}
      </div>
      <div ref={layerRef} className="fx-layer" aria-hidden />
    </>
  )
}
