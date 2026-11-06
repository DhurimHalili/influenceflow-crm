// The InfluenceFlow mark, as data: a forward-leaning "F" whose top arm is a
// wave (the flow), and a spark (the reach it sends out). One source for the
// app logo, the browser-tab animation and the PNG icons.
//
// Every frame drawn from here is the complete logo — the glyph never draws
// in or disappears — so a bookmark or a tab snapshot taken at any moment
// still shows the real mark.

export const LOGO = {
  view: 64,
  radius: 16,
  /** Stem + wave arm, in the glyph's own (skewed) space. */
  stem: "M20 50 V25 C20 19 23 16 28.5 16 C34 16 36 19.5 41 19.5 C43.5 19.5 45.5 18.5 47 17",
  arm: "M20 32.5 H35",
  /** Leans the glyph forward. */
  lean: "translate(5.5 0) skewX(-12)",
  stroke: 8.5,
  spark: { cx: 45.5, cy: 45, r: 5.2 },
  colors: { a: "#8a5cff", b: "#5b3ff0", c: "#2a1d8f", glow: "#ff7ad9", spark: "#ffd2ef" },
} as const;

/**
 * A full logo SVG. `t` (0..1) is a moment in the shine loop; omit it for the
 * resting mark. `bleed` fills the whole square (maskable / Apple icons) and
 * shrinks the glyph into the safe zone.
 */
export function logoSvg(opts: { t?: number; bleed?: boolean } = {}) {
  const { view, radius, stem, arm, lean, stroke, spark, colors } = LOGO;
  const t = opts.t;
  const rx = opts.bleed ? 0 : radius;
  // Shine: a soft diagonal band crossing the tile in the first 40% of the loop.
  const band = t === undefined ? null : t < 0.4 ? -40 + (t / 0.4) * 150 : null;
  // Spark: a small pop + a ring right as the shine reaches it (≈ 30%).
  const pop = t === undefined ? 0 : Math.max(0, 1 - Math.abs(t - 0.32) / 0.1);
  const ring = t === undefined ? -1 : t >= 0.3 && t < 0.62 ? (t - 0.3) / 0.32 : -1;
  const glyph = opts.bleed ? ` transform="translate(${view / 2} ${view / 2}) scale(.76) translate(${-view / 2} ${-view / 2})"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}"><defs>`
    + `<linearGradient id="g" x1="4" y1="2" x2="60" y2="62" gradientUnits="userSpaceOnUse"><stop stop-color="${colors.a}"/><stop offset=".55" stop-color="${colors.b}"/><stop offset="1" stop-color="${colors.c}"/></linearGradient>`
    + `<radialGradient id="w" cx="72%" cy="20%" r="62%"><stop stop-color="${colors.glow}" stop-opacity=".8"/><stop offset="1" stop-color="${colors.glow}" stop-opacity="0"/></radialGradient>`
    + (band === null ? "" : `<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="c"><rect width="${view}" height="${view}" rx="${rx}"/></clipPath>`)
    + `</defs><rect width="${view}" height="${view}" rx="${rx}" fill="url(#g)"/><rect width="${view}" height="${view}" rx="${rx}" fill="url(#w)"/>`
    + `<g${glyph}><g transform="${lean}"><path d="${stem}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/><path d="${arm}" fill="none" stroke="#fff" stroke-opacity=".72" stroke-width="${stroke}" stroke-linecap="round"/></g>`
    + (ring < 0 ? "" : `<circle cx="${spark.cx}" cy="${spark.cy}" r="${(spark.r + ring * 9).toFixed(2)}" fill="none" stroke="${colors.spark}" stroke-width="${(2.2 * (1 - ring)).toFixed(2)}" opacity="${(0.9 * (1 - ring)).toFixed(2)}"/>`)
    + `<circle cx="${spark.cx}" cy="${spark.cy}" r="${(spark.r * (1 + 0.22 * pop)).toFixed(2)}" fill="${colors.spark}"/></g>`
    + (band === null ? "" : `<g clip-path="url(#c)"><rect x="${band.toFixed(1)}" y="-20" width="26" height="110" fill="url(#s)" transform="rotate(24 32 32)"/></g>`)
    + `</svg>`;
}
