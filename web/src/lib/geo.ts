// Where a brand sells and where a creator's audience is — and how well the two meet.
//
// Brand markets, strongest source first:
//   • your brief (Brands → brief → Markets): the order you put them in IS the order — first = main;
//   • otherwise what the CRM found: the store's own country (Shopify), the site's country domain
//     (.de, .co.uk), a one-country shop currency, the company's home country (Wikidata), the countries
//     the site offers, and where the creators the brand already sponsors are. These add up per country;
//     the strongest is the main market, the rest are weighed against it.
// Creator audience: the media kit's audience countries (percentages) when there are any — that IS the
// audience — else the creator's country, else their YouTube channel's country. Nothing known = no
// market part in the score (never a penalty).

import { findCountry } from "./countries.ts";

export type GeoSignals = { shop?: string; tld?: string; hq?: string; at?: string };
export type MarketEntry = { code: string; weight: number; why: string[] };
export type BrandMarkets = { list: MarketEntry[]; source: "you" | "found" | "none"; global: boolean };
export type AudienceEntry = { code: string; share: number };
export type Audience = { list: AudienceEntry[]; source: "kit" | "country" | "youtube" | "none" };
export type MarketFit = { fit: number; best: string; bestWeight: number; why: "main" | "also" | "near" | "outside" };

export const codeOf = (v: string | undefined | null) => {
  const s = String(v || "").trim();
  if (/^[A-Z]{2}$/.test(s)) return s === "UK" ? "GB" : s;
  return findCountry(s)?.code || "";
};

// Country domains that mean a country (.co, .io, .ai, .tv, .me… are used by everyone and mean nothing).
const TLD: Record<string, string> = {
  de: "DE", at: "AT", ch: "CH", fr: "FR", nl: "NL", be: "BE", it: "IT", es: "ES", pt: "PT", pl: "PL", se: "SE", no: "NO", dk: "DK", fi: "FI", ie: "IE",
  uk: "GB", "co.uk": "GB", "org.uk": "GB", "com.au": "AU", au: "AU", ca: "CA", "co.nz": "NZ", nz: "NZ", jp: "JP", "co.jp": "JP", kr: "KR", "co.kr": "KR",
  br: "BR", "com.br": "BR", mx: "MX", "com.mx": "MX", in: "IN", "co.in": "IN", cz: "CZ", gr: "GR", hu: "HU", ro: "RO", sk: "SK", si: "SI", hr: "HR",
  tr: "TR", "com.tr": "TR", ae: "AE", sg: "SG", "com.sg": "SG", za: "ZA", "co.za": "ZA", ar: "AR", "com.ar": "AR", cl: "CL", lt: "LT", lv: "LV", ee: "EE", us: "US",
};
export const tldCountry = (domain: string) => {
  const d = String(domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const parts = d.split(".");
  if (parts.length < 2) return "";
  return TLD[parts.slice(-2).join(".")] || TLD[parts[parts.length - 1]] || "";
};
/** A currency used by one country only says where the shop is aimed (EUR covers 20 countries: says nothing alone). */
const CURRENCY_HOME: Record<string, string> = { USD: "US", GBP: "GB", CAD: "CA", AUD: "AU", NZD: "NZ", JPY: "JP", SEK: "SE", NOK: "NO", DKK: "DK", CHF: "CH", PLN: "PL", INR: "IN", SGD: "SG", BRL: "BR", MXN: "MX", KRW: "KR", CZK: "CZ", HUF: "HU", TRY: "TR", ZAR: "ZA" };

// ---- regions: how close two markets are --------------------------------------------------------
const GROUPS: [string[], number][] = [
  [["GB", "IE"], 0.8],
  [["DE", "AT", "CH"], 0.8],
  [["US", "CA"], 0.6],
  [["AU", "NZ"], 0.7],
  [["SE", "NO", "DK", "FI", "IS"], 0.6],
  [["BE", "NL", "LU"], 0.7],
  [["FR", "BE", "LU", "CH"], 0.55],
  [["ES", "MX", "AR", "CO", "CL", "PE"], 0.4],
  [["PT", "BR"], 0.4],
  [["US", "GB", "CA", "AU", "NZ", "IE"], 0.4],
  [["DE", "FR", "NL", "IT", "ES", "BE", "AT", "IE", "FI", "PT", "SE", "DK", "PL", "CZ", "GR", "HU", "RO", "SK", "SI", "HR", "LU", "LT", "LV", "EE", "BG", "CY", "MT"], 0.35],
];
/** 1 = the same market; 0 = unrelated. */
export function affinity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let best = 0;
  for (const [g, v] of GROUPS) if (v > best && g.includes(a) && g.includes(b)) best = v;
  return best;
}

// ---- the brand ---------------------------------------------------------------------------------
type BrandLike = { brief?: { markets?: string[] } | null; domain?: string };
type IntelLike = { markets?: string[]; currency?: string; geo?: GeoSignals | null } | null | undefined;

/**
 * Where a brand sells, main market first (weight 1), the rest weighed against it.
 * `sponsored` = the main audience country of each creator the brand already pays (one entry per creator).
 */
export function brandMarkets(b: BrandLike, intel?: IntelLike, sponsored: string[] = []): BrandMarkets {
  const yours = Array.from(new Set((b.brief?.markets || []).map(codeOf).filter(Boolean)));
  if (yours.length) {
    return { source: "you", global: false, list: yours.map((code, i) => ({ code, weight: i === 0 ? 1 : i === 1 ? 0.75 : 0.6, why: [i === 0 ? "your main market" : "in your brief"] })) };
  }
  const score = new Map<string, { s: number; why: string[] }>();
  const add = (code: string, s: number, why: string) => { if (!code) return; const x = score.get(code) || { s: 0, why: [] }; x.s += s; if (!x.why.includes(why)) x.why.push(why); score.set(code, x); };
  const geo = intel?.geo || {};
  add(codeOf(geo.shop), 1, "their store's country");
  add(tldCountry(b.domain || "") || codeOf(geo.tld), 1, "their country website");
  add(CURRENCY_HOME[String(intel?.currency || "").toUpperCase()] || "", 0.6, "their shop currency");
  add(codeOf(geo.hq), 0.35, "where the company is based");
  const locales = Array.from(new Set((intel?.markets || []).map(codeOf).filter(Boolean)));
  const global = locales.length >= 8;
  for (const c of locales) add(c, global ? 0.15 : 0.3, "their site serves it");
  // Where the creators they already pay are: the market they're buying (two creators at least).
  if (sponsored.length >= 2) {
    const n = new Map<string, number>();
    for (const c of sponsored) if (c) n.set(c, (n.get(c) || 0) + 1);
    const top = Math.max(0, ...n.values());
    for (const [c, k] of n) if (k >= 2 || k / sponsored.length >= 0.3) add(c, 0.8 * (k / top), `${k} creator${k === 1 ? "" : "s"} they sponsor`);
  }
  const best = Math.max(0, ...[...score.values()].map((x) => x.s));
  if (!best) return { source: "none", global, list: [] };
  const list = [...score.entries()].map(([code, x]) => ({ code, weight: Math.round((x.s / best) * 100) / 100, why: x.why }))
    .filter((x) => x.weight >= 0.2).sort((a, b) => b.weight - a.weight || a.code.localeCompare(b.code));
  return { source: "found", global, list };
}

// ---- the creator -------------------------------------------------------------------------------
type CreatorLike = { country?: string; youtube?: { country?: string } | null; audience?: { verified?: { top_countries?: { country: string; pct: number }[] } | null } | null };

export function audienceOf(c: CreatorLike): Audience {
  const kit = (c.audience?.verified?.top_countries || []).map((x) => ({ code: codeOf(x.country), pct: Number(x.pct) || 0 })).filter((x) => x.code && x.pct > 0);
  if (kit.length) {
    // The kit's own percentages (61 = 61 % of their audience) — never stretched to 100.
    const scale = kit.some((x) => x.pct > 1) ? 100 : 1;
    return { source: "kit", list: kit.map((x) => ({ code: x.code, share: Math.min(1, x.pct / scale) })).sort((a, b) => b.share - a.share) };
  }
  const home = codeOf(c.country);
  if (home) return { source: "country", list: [{ code: home, share: 1 }] };
  const yt = codeOf(c.youtube?.country);
  if (yt) return { source: "youtube", list: [{ code: yt, share: 1 }] };
  return { source: "none", list: [] };
}
/** The one country that best stands for a creator's audience. */
export const mainAudience = (c: CreatorLike) => audienceOf(c).list[0]?.code || "";

// ---- the fit -------------------------------------------------------------------------------------
/** Share of a media-kit audience in the brand's markets that counts as a full match. */
export const KIT_FULL = 0.4;
/** 0–1: how much of their audience sits in the brand's markets, the main market counting most. null = not known. */
export function marketFit(markets: BrandMarkets, audience: Audience): MarketFit | null {
  if (!markets.list.length || !audience.list.length) return null;
  let fit = 0, best = "", bestWeight = 0, bestPart = -1;
  for (const a of audience.list) {
    let top = 0, topCode = "", topW = 0;
    for (const m of markets.list) {
      const v = m.weight * affinity(a.code, m.code);
      if (v > top) { top = v; topCode = m.code; topW = m.weight; }
    }
    // A global brand (its site serves 8+ countries) still reaches markets it doesn't list, a little.
    if (markets.global && top < 0.45) { top = 0.45; topCode = topCode || a.code; }
    fit += a.share * top;
    if (a.share * top > bestPart) { bestPart = a.share * top; best = topCode; bestWeight = topW; }
  }
  // An audience is spread over many countries: 40 % of it in the brand's markets is as good as it gets
  // (a German creator with 40 % US viewers is a top pick for a US brand).
  if (audience.source === "kit") fit = fit / KIT_FULL;
  fit = Math.max(0, Math.min(1, fit));
  const why = fit >= 0.9 ? "main" : fit >= 0.6 ? "also" : fit >= 0.3 ? "near" : "outside";
  return { fit: Math.round(fit * 100) / 100, best, bestWeight, why };
}
