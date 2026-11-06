import { logoSvg } from "./logoArt";

// Browser-tab icon with a little life: every few seconds a shine crosses the
// mark and the spark pops (Chrome, Edge and Safari never animate an SVG
// favicon on their own, so frames are swapped in). Bookmark-safe by design:
// every frame is the complete logo, and between shines — and whenever the
// tab is hidden — the icon is the real static file, which is what browsers
// store for a bookmark. Off for people who prefer reduced motion.

const FRAMES = 24;
const FRAME_MS = 90;
const REST_MS = 6500;

export function startFaviconAnimation() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (!link) return;
  const still = link.href;
  const frames = Array.from({ length: FRAMES }, (_, i) => `data:image/svg+xml,${encodeURIComponent(logoSvg({ t: i / FRAMES }))}`);
  let timer = 0;
  const rest = () => { window.clearTimeout(timer); link.href = still; };
  const play = (i = 0) => {
    if (document.hidden) return rest();
    if (i >= FRAMES) { link.href = still; timer = window.setTimeout(() => play(0), REST_MS); return; }
    link.href = frames[i];
    timer = window.setTimeout(() => play(i + 1), FRAME_MS);
  };
  document.addEventListener("visibilitychange", () => { rest(); if (!document.hidden) timer = window.setTimeout(() => play(0), 1200); });
  window.addEventListener("pagehide", rest);
  timer = window.setTimeout(() => play(0), 1500);
}
