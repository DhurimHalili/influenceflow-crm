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
    </svg>
  )
}

/**
 * Theme-only special effects. Renders nothing except on honey/ocean:
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
      <div className="fx-edge" aria-hidden>
        {fx === 'honey' ? <HoneyEdge /> : <OceanEdge />}
      </div>
      <div ref={layerRef} className="fx-layer" aria-hidden />
    </>
  )
}
