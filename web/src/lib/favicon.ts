// Animated browser-tab icon. Firefox animates SVG favicons by itself; Chrome,
// Edge and Safari only draw the first frame, so we redraw the icon a few
// times per second. Stops for people who prefer reduced motion.

const FRAMES = 30;
const FRAME_MS = 110;

const frame = (t: number) => {
  // t: 0..1 through one loop
  const ripple = (offset: number) => {
    const p = (t + offset) % 1;
    return `<circle cx="18" cy="32" r="${(6 + p * 16).toFixed(2)}" fill="none" stroke="#fff" stroke-width="${(2.6 * (1 - p)).toFixed(2)}" opacity="${(0.55 * (1 - p)).toFixed(2)}"/>`;
  };
  // Wave draws in over the first 55%, then holds and fades back.
  const draw = Math.min(1, t / 0.55);
  const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
  const dash = 100 - draw * 100;
  const dot = (start: number) => {
    const lit = t >= start && t < 0.92 ? 1 : 0.38;
    return lit;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop stop-color="#8b6dff"/><stop offset="1" stop-color="#3d9cf0"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/>${ripple(0)}${ripple(0.5)}<path d="M18 32 C 26 14, 34 50, 47 32" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="4.4" stroke-linecap="round"/><path d="M18 32 C 26 14, 34 50, 47 32" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${dash.toFixed(1)}" opacity="${fade.toFixed(2)}"/><circle cx="18" cy="32" r="6.6" fill="#fff"/><circle cx="50" cy="19" r="3.4" fill="#fff" opacity="${dot(0.42)}"/><circle cx="52" cy="32" r="3.8" fill="#fff" opacity="${dot(0.5)}"/><circle cx="50" cy="45" r="3.4" fill="#fff" opacity="${dot(0.58)}"/></svg>`;
};

export function startFaviconAnimation() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const urls = Array.from({ length: FRAMES }, (_, i) => `data:image/svg+xml,${encodeURIComponent(frame(i / FRAMES))}`);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  let i = 0;
  window.setInterval(() => {
    i = (i + 1) % FRAMES;
    link!.href = urls[i];
  }, FRAME_MS);
}
