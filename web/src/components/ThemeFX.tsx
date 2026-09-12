import { useEffect, useRef, useState } from 'react'

type FXTheme = 'honey' | 'ocean' | null

function readTheme(): FXTheme {
  const t = document.documentElement.dataset.theme
  return t === 'honey' || t === 'ocean' ? t : null
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/** Honey drip edge — golden pills of varying lengths hanging from the top. */
function HoneyEdge() {
  const drips = [
    { x: 40, w: 22, h: 16 },
    { x: 150, w: 14, h: 9 },
    { x: 260, w: 26, h: 22 },
    { x: 400, w: 12, h: 8 },
    { x: 520, w: 20, h: 14 },
    { x: 660, w: 28, h: 26 },
    { x: 800, w: 13, h: 8 },
    { x: 920, w: 22, h: 17 },
    { x: 1050, w: 15, h: 10 },
    { x: 1180, w: 26, h: 21 },
    { x: 1310, w: 16, h: 11 },
  ]
  return (
    <svg className="fx-edge-svg" viewBox="0 0 1440 34" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="fx-honey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9B94E" />
          <stop offset="100%" stopColor="#B07C1F" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1440" height="7" fill="url(#fx-honey)" />
      <rect x="0" y="0" width="1440" height="2" fill="#FFF6DC" opacity="0.55" />
      {drips.map((d, i) => (
        <rect key={i} x={d.x} y="4" width={d.w} height={d.h} rx={d.w / 2} fill="url(#fx-honey)" />
      ))}
      <circle cx="272" cy="31" r="3" fill="#C9962E" opacity="0.85" />
      <circle cx="672" cy="32" r="2.4" fill="#C9962E" opacity="0.7" />
      <circle cx="1192" cy="30" r="2.8" fill="#C9962E" opacity="0.8" />
    </svg>
  )
}

/** Ocean wave edge — two soft overlapping swells. */
function OceanEdge() {
  return (
    <svg className="fx-edge-svg" viewBox="0 0 1440 22" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="fx-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3E96A3" />
          <stop offset="100%" stopColor="#24707D" />
        </linearGradient>
      </defs>
      <path
        d="M0,0H1440V8c-60,6-120,6-180,0s-120-6-180,0-120,6-180,0-120-6-180,0-120,6-180,0-120-6-180,0-120,6-180,0-120-6-180,0V0Z"
        fill="url(#fx-sea)"
        opacity="0.55"
      />
      <path
        d="M0,0H1440V5c-72,8-144,8-216,0s-144-8-216,0-144,8-216,0-144-8-216,0-144,8-216,0-144-8-216,0V0Z"
        fill="url(#fx-sea)"
      />
      <path
        d="M0,4H1440V6c-72,8-144,8-216,0s-144-8-216,0-144,8-216,0-144-8-216,0-144,8-216,0-144-8-216,0V4Z"
        fill="#FFFFFF"
        opacity="0.5"
      />
    </svg>
  )
}

/** Real flowing honey — viscous vertical streaks, gloss light, dark depth. */
function HoneySea() {
  return (
    <svg className="fx-sea" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fx-honeysea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F6D47C" />
          <stop offset="40%" stopColor="#E3AC45" />
          <stop offset="70%" stopColor="#C08A24" />
          <stop offset="100%" stopColor="#8F5F14" />
        </linearGradient>
        <radialGradient id="fx-honeygloss" cx="0.24" cy="0.1" r="0.75">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fx-honeyvig" cx="0.5" cy="0.52" r="0.75">
          <stop offset="58%" stopColor="#5A370A" stopOpacity="0" />
          <stop offset="100%" stopColor="#5A370A" stopOpacity="0.42" />
        </radialGradient>
        <filter id="fx-honeyflow" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.03" numOctaves="2" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0.9 0 -0.9" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill="url(#fx-honeysea)" />
      <g className="fx-drift-a" opacity="0.32">
        <rect x="-140" y="-100" width="1720" height="1100" fill="#7D5510" filter="url(#fx-honeyflow)" />
      </g>
      <g className="fx-drift-b" opacity="0.28">
        <rect x="-140" y="-100" width="1720" height="1100" fill="#FFE9B0" filter="url(#fx-honeyflow)" />
      </g>
      <rect width="1440" height="900" fill="url(#fx-honeygloss)" />
      <rect width="1440" height="900" fill="url(#fx-honeyvig)" />
    </svg>
  )
}

/** Real aerial ocean — bright shallows, drifting caustic light, deep bands. */
function OceanSea() {
  return (
    <svg className="fx-sea" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fx-seabase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C4E2EA" />
          <stop offset="38%" stopColor="#79B8C6" />
          <stop offset="68%" stopColor="#3E96A3" />
          <stop offset="100%" stopColor="#256B77" />
        </linearGradient>
        <radialGradient id="fx-seasun" cx="0.72" cy="0.06" r="0.65">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter id="fx-seacaustic" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.2 1.2 1.2 0 -1.6" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
        <filter id="fx-seadeep" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="9" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 2.1" result="a" />
          <feComposite in="SourceGraphic" in2="a" operator="in" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill="url(#fx-seabase)" />
      <g className="fx-drift-b" opacity="0.3" style={{ mixBlendMode: 'multiply' }}>
        <rect x="-140" y="-100" width="1720" height="1100" fill="#174E57" filter="url(#fx-seadeep)" />
      </g>
      <g className="fx-drift-a" opacity="0.55" style={{ mixBlendMode: 'soft-light' }}>
        <rect x="-140" y="-100" width="1720" height="1100" fill="#FFFFFF" filter="url(#fx-seacaustic)" />
      </g>
      <rect width="1440" height="900" fill="url(#fx-seasun)" />
    </svg>
  )
}

/**
 * Theme-only special effects. Renders nothing except on honey/ocean:
 * - a full realistic scene background (flowing honey / aerial ocean)
 * - a decorative top edge (honey drips / ocean waves)
 * - click particles (falling honey drops / water ripples + rising bubbles)
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

    const MAX = 36
    function spawn(x: number, y: number) {
      if (!layer || layer.childElementCount > MAX) return
      if (fx === 'honey') {
        // 3 honey drops with random drift + size
        for (let i = 0; i < 3; i++) {
          const el = document.createElement('span')
          el.className = 'fx-honey-drop'
          const size = rand(7, 13)
          el.style.left = `${x + rand(-14, 14)}px`
          el.style.top = `${y + rand(-6, 6)}px`
          el.style.width = `${size}px`
          el.style.height = `${size * 1.25}px`
          el.style.setProperty('--dx', `${rand(-26, 26).toFixed(0)}px`)
          el.style.animationDelay = `${(i * 45).toFixed(0)}ms`
          el.addEventListener('animationend', () => el.remove())
          layer.appendChild(el)
        }
      } else {
        // expanding ripple ring + 2 rising bubbles
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
    }

    const onDown = (e: PointerEvent) => spawn(e.clientX, e.clientY)
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [fx])

  if (!fx) return null
  return (
    <>
      <div className="fx-bg" aria-hidden>
        {fx === 'honey' ? <HoneySea /> : <OceanSea />}
        <div className={fx === 'honey' ? 'fx-veil-honey' : 'fx-veil-ocean'} />
      </div>
      <div className="fx-edge" aria-hidden>
        {fx === 'honey' ? <HoneyEdge /> : <OceanEdge />}
      </div>
      <div ref={layerRef} className="fx-layer" aria-hidden />
    </>
  )
}
