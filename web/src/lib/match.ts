// Brand ⇄ creator matching: who fits whom, and who must not be pitched.
//
// The score (0–100) is mostly CONTENT: how much of a creator's recent videos
// sit on or close to what the brand sells (taxonomy.ts → topicFit). The rest
// only counts where we know it — size (the creators the brand already works
// with, or the brief's tiers), price (their rate vs. the brief budget or what
// the brand seems to pay), market (where the brand sells vs. where the creator
// and their audience are) and your own criteria. An off-topic creator can't
// climb up on good numbers: the total is capped near the content fit.
//
// Never pitch twice — every pair also carries flags:
//   works   they already had a BRAND DEAL with this brand (sponsored / seeded)
//   affiliate  they only link it for commission — not a deal, pitching is fine
//   rival   they had a paid or seeded deal with a competitor in the last 4 months
//   pitched you already pitched them to this brand (or they're in a campaign)
// Pure — tested in match.test.ts.

import type { Brand, Campaign, Creator } from "../types";
import { judge, youtubeSubs } from "./criteria";
import { findCountry } from "./countries";
import { dealProof, normalizeDomain, type DealKind, type Evidence, type Proof } from "./sponsors";
import { overlap, scoreText, topicFit, topicLabel, TOPIC, type ContentProfile } from "./taxonomy";

// ---- what the server writes ---------------------------------------------------------------

export type BrandIntel = {
  v: number; at: string; domain: string; url: string; name: string; summary: string; sells: { key: string; weight: number }[]; by: string;
  products: number; examples: string[]; price: { min: number; median: number; max: number; currency: string } | null; platform: string;
  programs: { kind: string; url: string; text: string; commission?: string; network?: string }[]; socials: { platform: string; url: string }[];
  markets: string[]; currency: string; wiki: string; pages: string[]; verified: boolean;
};
export type IntelRow = { brand_id: string; intel: BrandIntel | null; status: string; researched_at: string | null };
export type ContentRow = { creator_id: string; content: ContentProfile | null; status: string; note?: string; scanned_at: string | null };
export type BrandLink = {
  id: string; creator_id: string; brand_key: string; brand_name: string; domain: string; brand_id: string | null; kind: DealKind; confidence: number;
  store: boolean; videos: number; first_at: string | null; last_at: string | null; evidence: Evidence[]; by_ai: boolean; manual: boolean;
  verdict: "" | "yes" | "no"; verdict_kind: DealKind | null; verdict_at: string | null; updated_at: string;
};
export type SeenBrand = {
  brand_key: string; name: string; domain: string; domain_check: "" | "site" | "link" | "mismatch" | "guess" | "none" | "blocked";
  site: { title?: string; description?: string; topics?: { key: string; weight: number }[]; logo?: string } | null;
  checked_at: string | null; hidden: boolean; added_brand_id: string | null;
};
export type Pitch = { id: string; brand_id: string; creator_id: string; at: string; source: string };

// ---- small helpers ------------------------------------------------------------------------

// Both run inside brands × creators loops: remember answers (names and domains repeat endlessly).
const squashed = new Map<string, string>();
const squash = (raw: string) => {
  const key = String(raw || "");
  let v = squashed.get(key);
  if (v === undefined) { v = key.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, ""); if (squashed.size > 20000) squashed.clear(); squashed.set(key, v); }
  return v;
};
const domains = new Map<string, string>();
/** The kind you set wins over what was read. */
export const kindOf = (l: BrandLink): DealKind => l.verdict_kind || l.kind;
/** A link that counts: not rejected by you, and at least "possible" (or confirmed by you). */
export const counts = (l: BrandLink, min = 0.45) => l.verdict !== "no" && (l.verdict === "yes" || l.confidence >= min);
/** A brand deal (paid or product sent) — affiliate links and stores are not. */
export const isDeal = (l: BrandLink) => !l.store && kindOf(l) !== "affiliate";
/** How sure it's a real brand deal: proven / stated (said once) / hint / affiliate. */
const proofCache = new WeakMap<BrandLink, { level: Proof; why: string }>();
export const proofOf = (l: BrandLink): { level: Proof; why: string } => {
  let p = proofCache.get(l);
  if (!p) { p = dealProof(l); proofCache.set(l, p); }
  return p;
};
export const PROOF_LABEL: Record<Proof, string> = { proven: "Proven", stated: "Said once", hint: "Not confirmed", affiliate: "Affiliate" };
export const brandDomain = (b: Pick<Brand, "domain">) => {
  const key = b.domain || "";
  let v = domains.get(key);
  if (v === undefined) { v = normalizeDomain(key); if (domains.size > 20000) domains.clear(); domains.set(key, v); }
  return v;
};

/** Is this link about this brand? (same CRM record, same domain, or the same name). */
export function linkIsBrand(l: Pick<BrandLink, "brand_id" | "domain" | "brand_name" | "brand_key">, b: Pick<Brand, "id" | "domain" | "name">) {
  if (l.brand_id && l.brand_id === b.id) return true;
  const d = brandDomain(b);
  if (d && (l.domain === d || l.brand_key === d)) return true;
  const n = squash(b.name);
  return n.length >= 3 && squash(l.brand_name) === n;
}

/** What a brand sells: your pick → their site → their type / brief niches (rules). */
export function sellsOf(b: Pick<Brand, "brand_type" | "brief" | "name"> & { match_topics?: string[] }, intel?: BrandIntel | null): { key: string; weight: number }[] {
  const mine = (b.match_topics || []).filter((k) => TOPIC.has(k));
  if (mine.length) return mine.map((key) => ({ key, weight: Math.round((1 / mine.length) * 1000) / 1000 }));
  if (intel?.sells?.length) return intel.sells.filter((s) => TOPIC.has(s.key));
  const words = [b.brand_type || "", ...(b.brief?.niches || [])].filter(Boolean);
  if (!words.length) return [];
  const s = scoreText(words.map((text) => ({ text, weight: 1 })), { catalog: true });
  const sum = Object.values(s).reduce((a, x) => a + x, 0);
  return sum ? Object.entries(s).map(([key, v]) => ({ key, weight: Math.round((v / sum) * 1000) / 1000 })).sort((a, b2) => b2.weight - a.weight).slice(0, 6) : [];
}
/** Where a sells list came from — for "why". */
export const sellsSource = (b: { match_topics?: string[] }, intel?: BrandIntel | null) => ((b.match_topics || []).length ? "you" : intel?.sells?.length ? "site" : "type");

const reach = (c: Creator) => c.avg_views || c.youtube?.avg_views || 0;
const median = (xs: number[]) => { const v = xs.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
const CURRENCY_HOME: Record<string, string[]> = { USD: ["US"], GBP: ["GB"], CAD: ["CA"], AUD: ["AU"], NZD: ["NZ"], EUR: ["DE", "FR", "NL", "IT", "ES", "BE", "AT", "IE", "FI", "PT"], JPY: ["JP"], SEK: ["SE"], NOK: ["NO"], DKK: ["DK"], CHF: ["CH"], PLN: ["PL"], INR: ["IN"], SGD: ["SG"] };
const ENGLISH = new Set(["US", "GB", "CA", "AU", "NZ", "IE"]);
const EU = new Set(["DE", "FR", "NL", "IT", "ES", "BE", "AT", "IE", "FI", "PT", "SE", "DK", "PL", "CZ", "GR", "HU", "RO", "SK", "SI", "HR", "LU", "LT", "LV", "EE", "BG", "CY", "MT"]);
const codeOf = (v: string) => (/^[A-Z]{2}$/.test(v) ? v : findCountry(v)?.code || "");

/** Where a brand sells (country codes), from your brief, then its site. */
export function marketsOf(b: Pick<Brand, "brief">, intel?: BrandIntel | null): string[] {
  const fromBrief = (b.brief?.markets || []).map(codeOf).filter(Boolean);
  if (fromBrief.length) return Array.from(new Set(fromBrief));
  const site = [...(intel?.markets || []), ...(CURRENCY_HOME[intel?.currency || ""] || [])];
  return Array.from(new Set(site));
}

// ---- budget ---------------------------------------------------------------------------------

export type Budget = { kind: "brief" | "deals" | "estimate"; low: number; high: number; per: "campaign" | "video"; from: string; n: number } | null;

/**
 * What a brand pays per creator, best source first: your brief → deals you
 * closed with them → an estimate from the creators they already sponsor (their
 * video rate when you have it, else $15–35 per 1,000 average views).
 */
export function budgetOf(b: Brand, ctx: { links: BrandLink[]; creators: Creator[]; campaigns: Campaign[] }): Budget {
  const br = b.brief;
  if (br && (br.budget_max || br.budget_min) && br.budget_period === "campaign") return { kind: "brief", low: br.budget_min || 0, high: br.budget_max || br.budget_min, per: "campaign", from: "your brief", n: 0 };
  const deals = ctx.campaigns.filter((c) => c.brand_id === b.id && (c.status === "active" || c.status === "completed") && c.agreed_payment > 0);
  if (deals.length) {
    const per = deals.map((d) => d.agreed_payment / Math.max(1, d.creator_ids?.length || 1));
    return { kind: "deals", low: Math.min(...per), high: Math.max(...per), per: "campaign", from: `${deals.length} deal${deals.length === 1 ? "" : "s"} you closed`, n: deals.length };
  }
  const idx = "brands" in ctx ? indexOf(ctx as MatchWorld) : null;
  const paid = (idx ? idx.linksFor(b) : ctx.links.filter((l) => linkIsBrand(l, b))).filter((l) => counts(l, 0.65) && kindOf(l) === "sponsored");
  const byId = idx ? idx.creatorById : new Map(ctx.creators.map((c) => [c.id, c]));
  const who = paid.map((l) => byId.get(l.creator_id)).filter((c): c is Creator => !!c);
  if (!who.length) return null;
  const rates = who.map((c) => c.rates?.video || c.rates?.dedicated || 0).filter((x) => x > 0);
  if (rates.length) return { kind: "estimate", low: Math.min(...rates), high: Math.max(...rates), per: "video", from: `the rates of ${rates.length} creator${rates.length === 1 ? "" : "s"} they sponsor`, n: rates.length };
  const views = median(who.map(reach));
  if (!views) return null;
  return { kind: "estimate", low: Math.round((views / 1000) * 15 / 50) * 50, high: Math.round((views / 1000) * 35 / 50) * 50, per: "video", from: `${who.length} creator${who.length === 1 ? "" : "s"} they sponsor (≈${Math.round(views / 1000)}K avg views)`, n: who.length };
}

// ---- the match ------------------------------------------------------------------------------

export type Reason = { text: string; tone: "good" | "warn" | "bad" | "info" };
export type Flags = {
  works?: BrandLink;
  affiliate?: BrandLink;
  rival?: { link: BrandLink; name: string; days: number };
  pitched?: { at: string; how: "pitch" | "campaign" };
};
export type Match = {
  score: number;
  tone: "great" | "good" | "fair" | "weak";
  fit: number;
  onTopic: number;
  carriers: { key: string; share: number }[];
  parts: { content: number; size: number | null; price: number | null; market: number | null; quality: number | null };
  reasons: Reason[];
  flags: Flags;
  /** Why there's no real score yet: we haven't read the creator's videos, or don't know what the brand sells. */
  missing: "" | "creator" | "brand";
};

export type MatchWorld = {
  links: BrandLink[];
  /** Links per creator (fast lookup). */
  linksBy?: Map<string, BrandLink[]>;
  pitches: Pitch[];
  campaigns: Campaign[];
  creators: Creator[];
  brands: Brand[];
  intel: Map<string, IntelRow>;
  content: Map<string, ContentRow>;
  seen: Map<string, SeenBrand>;
  criteria?: Parameters<typeof judge>[1];
  /** Brands you archived: never suggested again as "found". */
  archivedBrands?: Pick<Brand, "domain" | "name">[];
  now?: Date;
};

export const toneOf = (score: number): Match["tone"] => (score >= 80 ? "great" : score >= 62 ? "good" : score >= 45 ? "fair" : "weak");
const WEIGHTS = { content: 0.6, size: 0.14, price: 0.1, market: 0.08, quality: 0.08 };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const k = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e3 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n)));

// ---- one index per world: matchOf runs brands × creators times, so nothing in it may scan every link or brand ----

type Index = {
  creatorById: Map<string, Creator>;
  brandOf: (l: BrandLink) => Brand | null;
  linksFor: (b: Pick<Brand, "id" | "domain" | "name">) => BrandLink[];
  sells: (b: Brand) => { key: string; weight: number }[];
  topics: (l: BrandLink) => { key: string; weight: number }[];
  memo: Map<string, unknown>;
};
const indexes = new WeakMap<MatchWorld, Index>();
function indexOf(w: MatchWorld): Index {
  const hit = indexes.get(w);
  if (hit) return hit;
  const brandById = new Map(w.brands.map((b) => [b.id, b]));
  const brandByDomain = new Map<string, Brand>(), brandByName = new Map<string, Brand>();
  for (const b of w.brands) {
    const d = brandDomain(b); if (d && !brandByDomain.has(d)) brandByDomain.set(d, b);
    const n = squash(b.name); if (n.length >= 3 && !brandByName.has(n)) brandByName.set(n, b);
  }
  const byBrandId = new Map<string, BrandLink[]>(), byDomain = new Map<string, BrandLink[]>(), byName = new Map<string, BrandLink[]>();
  const push = (m: Map<string, BrandLink[]>, k: string, l: BrandLink) => { if (k) (m.get(k) || m.set(k, []).get(k)!).push(l); };
  for (const l of w.links) {
    if (l.brand_id) push(byBrandId, l.brand_id, l);
    push(byDomain, l.domain, l);
    if (l.brand_key && l.brand_key !== l.domain) push(byDomain, l.brand_key, l);
    const n = squash(l.brand_name); if (n.length >= 3) push(byName, n, l);
  }
  const ofLink = new Map<string, Brand | null>(), forBrand = new Map<string, BrandLink[]>(), sellsBy = new Map<string, { key: string; weight: number }[]>(), topicsBy = new Map<string, { key: string; weight: number }[]>();
  const idx: Index = {
    creatorById: new Map(w.creators.map((c) => [c.id, c])),
    // Same rule as linkIsBrand: your record, then the domain, then the name.
    brandOf: (l) => {
      if (ofLink.has(l.id)) return ofLink.get(l.id)!;
      const b = (l.brand_id && brandById.get(l.brand_id)) || brandByDomain.get(l.domain) || brandByDomain.get(l.brand_key) || brandByName.get(squash(l.brand_name)) || null;
      ofLink.set(l.id, b);
      return b;
    },
    linksFor: (b) => {
      const hit = forBrand.get(b.id);
      if (hit) return hit;
      const d = brandDomain(b), n = squash(b.name);
      const all = new Set<BrandLink>([...(byBrandId.get(b.id) || []), ...(d ? byDomain.get(d) || [] : []), ...(n.length >= 3 ? byName.get(n) || [] : [])]);
      const out = [...all];
      forBrand.set(b.id, out);
      return out;
    },
    sells: (b) => {
      let x = sellsBy.get(b.id);
      if (!x) { x = sellsOf(b as Brand & { match_topics?: string[] }, w.intel.get(b.id)?.intel); sellsBy.set(b.id, x); }
      return x;
    },
    topics: (l) => {
      let x = topicsBy.get(l.id);
      if (!x) { const crm = idx.brandOf(l); x = crm ? idx.sells(crm) : w.seen.get(l.brand_key)?.site?.topics || []; topicsBy.set(l.id, x); }
      return x;
    },
    memo: new Map(),
  };
  indexes.set(w, idx);
  return idx;
}
const memo = <T,>(w: MatchWorld, key: string, make: () => T): T => {
  const m = indexOf(w).memo;
  if (!m.has(key)) m.set(key, make());
  return m.get(key) as T;
};

/** The topics another brand sells (CRM brand → its site; a brand found in videos → its site check). */
export function topicsOfLink(l: BrandLink, w: MatchWorld): { key: string; weight: number }[] {
  return indexOf(w).topics(l);
}

/** How well one creator fits one brand, with the reasons and the "don't pitch" flags. */
export function matchOf(b: Brand & { match_topics?: string[] }, c: Creator, w: MatchWorld): Match {
  const now = w.now || new Date();
  const intel = w.intel.get(b.id)?.intel || null;
  const idx = indexOf(w);
  const sells = idx.sells(b);
  const content = w.content.get(c.id)?.content || null;
  const mine = w.linksBy?.get(c.id) || w.links.filter((l) => l.creator_id === c.id);
  const reasons: Reason[] = [];
  const flags: Flags = {};

  // Flags first — they matter even with no score.
  const withBrand = mine.filter((l) => linkIsBrand(l, b) && counts(l));
  flags.works = withBrand.filter(isDeal).sort((x, y) => Number(proofOf(y).level === "proven") - Number(proofOf(x).level === "proven") || y.confidence - x.confidence)[0];
  if (!flags.works) flags.affiliate = withBrand[0];
  const pitch = w.pitches.find((p) => p.brand_id === b.id && p.creator_id === c.id);
  const camp = w.campaigns.find((x) => x.brand_id === b.id && (x.creator_ids || []).includes(c.id) && x.status !== "cancelled");
  if (pitch) flags.pitched = { at: pitch.at, how: "pitch" };
  else if (camp) flags.pitched = { at: camp.start_date || "", how: "campaign" };
  if (sells.length) {
    let best: Flags["rival"];
    for (const l of mine) {
      if (linkIsBrand(l, b) || l.store || !counts(l, 0.65) || kindOf(l) === "affiliate" || !l.last_at) continue;
      const days = Math.floor((now.getTime() - new Date(l.last_at).getTime()) / 86400000);
      if (days > 120 || days < 0) continue;
      const o = overlap(sells, topicsOfLink(l, w));
      if (o >= 0.35 && (!best || days < best.days)) best = { link: l, name: l.brand_name, days };
    }
    if (best) flags.rival = best;
  }

  if (!content?.topics?.length || !sells.length) {
    return { score: 0, tone: "weak", fit: 0, onTopic: 0, carriers: [], parts: { content: 0, size: null, price: null, market: null, quality: null }, reasons, flags, missing: !sells.length ? "brand" : "creator" };
  }
  const tf = topicFit(sells, content.topics);
  const parts: Match["parts"] = { content: tf.fit, size: null, price: null, market: null, quality: null };
  if (tf.carriers.length) {
    const top = tf.carriers.slice(0, 2).map((x) => topicLabel(x.key)).join(" + ");
    reasons.push({ text: `${pct(tf.onTopic)} of their videos: ${top}`, tone: tf.fit >= 0.6 ? "good" : tf.fit >= 0.35 ? "info" : "warn" });
  } else reasons.push({ text: `Their videos are about ${content.topics.slice(0, 2).map((t) => topicLabel(t.key)).join(", ") || "other things"}`, tone: "bad" });

  // Size: the brief's tiers, else the creators the brand already works with.
  const views = reach(c);
  const tiers = b.brief?.tiers || [];
  if (views > 0 && tiers.length) {
    const TIER: Record<string, [number, number]> = { nano: [0, 10e3], micro: [10e3, 100e3], mid: [100e3, 500e3], macro: [500e3, 1e6], mega: [1e6, Infinity] };
    const subs = youtubeSubs(c) || views;
    const inTier = tiers.some((t) => subs >= TIER[t][0] && subs < TIER[t][1]);
    const near = tiers.some((t) => subs >= TIER[t][0] * 0.6 && subs < TIER[t][1] * 1.6);
    parts.size = inTier ? 1 : near ? 0.6 : 0.25;
    reasons.push({ text: inTier ? "The size they asked for" : near ? "Close to the size they want" : "Not the size they want", tone: inTier ? "good" : near ? "info" : "warn" });
  } else if (views > 0) {
    const pool = memo(w, `size:${b.id}`, () => idx.linksFor(b).filter((l) => isDeal(l) && counts(l, 0.65)).map((l) => ({ id: l.creator_id, views: reach(idx.creatorById.get(l.creator_id) || ({} as Creator)) })).filter((x) => x.views > 0));
    const theirs = pool.filter((x) => x.id !== c.id).map((x) => x.views);
    const m = median(theirs);
    if (m > 0) {
      const r = Math.abs(Math.log10(views / m));
      parts.size = r <= 0.3 ? 1 : r <= 0.6 ? 0.75 : r <= 1 ? 0.45 : 0.2;
      reasons.push({ text: r <= 0.3 ? `Same size as who they work with (${k(m)} views)` : views > m ? `Bigger than who they work with (${k(m)} views)` : `Smaller than who they work with (${k(m)} views)`, tone: r <= 0.3 ? "good" : r <= 0.6 ? "info" : "warn" });
    }
  }

  // Price: the creator's rate against what the brand pays.
  const rate = c.rates?.video || c.rates?.dedicated || c.rates?.short || 0;
  const budget = memo(w, `budget:${b.id}`, () => budgetOf(b, w));
  if (rate > 0 && budget && budget.high > 0) {
    parts.price = rate <= budget.high ? 1 : rate <= budget.high * 1.25 ? 0.6 : 0.2;
    reasons.push({ text: rate <= budget.high ? "Their rate fits the budget" : rate <= budget.high * 1.25 ? "Rate a little over budget" : "Rate over budget", tone: rate <= budget.high ? "good" : rate <= budget.high * 1.25 ? "info" : "warn" });
  }

  // Market: where the brand sells vs. the creator and their audience.
  const markets = marketsOf(b, intel);
  const home = codeOf(c.country || "") || (c.youtube?.country || "").toUpperCase();
  const top = (c.audience?.verified?.top_countries || []).map((x) => codeOf(x.country)).filter(Boolean);
  if (markets.length && (home || top.length)) {
    const where = [...top.slice(0, 2), home].filter(Boolean);
    const hit = where.some((x) => markets.includes(x));
    const near = !hit && where.some((x) => (EU.has(x) && markets.some((m) => EU.has(m))) || (ENGLISH.has(x) && markets.some((m) => ENGLISH.has(m))));
    parts.market = hit ? 1 : near ? 0.65 : 0.3;
    if (!hit) reasons.push({ text: near ? "A nearby market" : "Outside where they sell", tone: near ? "info" : "warn" });
  }

  // Your bar.
  const verdict = judge({ views, er: c.engagement_rate || 0, subs: youtubeSubs(c), youtube: !!c.youtube?.channel_id || c.platform === "YouTube" }, w.criteria);
  if (verdict.level !== "none") {
    parts.quality = verdict.level === "fits" ? 1 : verdict.level === "slight" ? 0.75 : verdict.level === "over" ? 0.7 : 0.45;
    if (verdict.level === "hard") reasons.push({ text: "Below your criteria", tone: "warn" });
  }

  let sum = 0, weight = 0;
  for (const [key, v] of Object.entries(parts) as [keyof typeof WEIGHTS, number | null][]) if (v !== null) { sum += v * WEIGHTS[key]; weight += WEIGHTS[key]; }
  let score = Math.round((sum / weight) * 100);
  // Content is the gate: good numbers can't lift an off-topic creator.
  score = Math.max(0, Math.min(score, Math.round(tf.fit * 100) + 12, 99));
  if (flags.affiliate) reasons.push({ text: `Has an affiliate link to ${b.name} — no deal yet`, tone: "info" });
  if (flags.rival) reasons.push({ text: `${kindOf(flags.rival.link) === "seeded" ? "Seeded" : "Sponsored"} by ${flags.rival.name} ${flags.rival.days < 14 ? "this month" : `${Math.round(flags.rival.days / 7)} wk ago`}`, tone: "warn" });
  return { score, tone: toneOf(score), fit: tf.fit, onTopic: tf.onTopic, carriers: tf.carriers, parts, reasons, flags, missing: "" };
}

/** Group a list of links per creator once (they're read many times per render). */
export const byCreator = (links: BrandLink[]) => {
  const m = new Map<string, BrandLink[]>();
  for (const l of links) (m.get(l.creator_id) || m.set(l.creator_id, []).get(l.creator_id)!).push(l);
  return m;
};

/** Brands found in videos that aren't in your CRM, with who works with them. */
export type Found = { seen: SeenBrand; links: BrandLink[]; best: BrandLink; creators: number; keys: string[] };
/** The words that name one brand: its domain's main label ("autodoc" for autodoc.de and autodoc.com) and its name. */
const tokensOf = (domain: string, name: string) => {
  const label = squash(normalizeDomain(domain || "").split(".")[0] || "");
  return [label.length >= 3 ? `d:${label}` : "", squash(name).length >= 3 ? `d:${squash(name)}` : ""].filter(Boolean);
};
/**
 * Brand DEALS found in videos for brands you don't have. One row per brand
 * even when creators link it differently (autodoc.de / autodoc.com / "AUTODOC"),
 * never a brand you already have (archived ones too — you removed it once),
 * never an affiliate link or a store, and never a bare hint: only "proven" or "said once".
 */
export function foundBrands(w: MatchWorld): Found[] {
  const have = new Set<string>();
  for (const b of [...w.brands, ...(w.archivedBrands || [])]) for (const t of tokensOf(b.domain || "", b.name)) have.add(t);
  // Group links that share a domain label or a name (union-find over tokens).
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (a: string, b: string) => { for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const kept: BrandLink[] = [];
  for (const l of w.links) {
    if (!isDeal(l) || l.brand_id || !counts(l)) continue;
    const level = proofOf(l).level;
    if (level !== "proven" && level !== "stated") continue;
    const toks = tokensOf(l.domain, l.brand_name);
    if (toks.some((t) => have.has(t))) continue;
    if (w.seen.get(l.brand_key)?.added_brand_id) continue;
    const id = `k:${l.brand_key}`;
    join(id, id);
    for (const t of toks) join(id, t);
    kept.push(l);
  }
  const groups = new Map<string, BrandLink[]>();
  for (const l of kept) { const r = find(`k:${l.brand_key}`); (groups.get(r) || groups.set(r, []).get(r)!).push(l); }
  const rank = (l: BrandLink) => ({ proven: 3, stated: 2, hint: 1, affiliate: 0 })[proofOf(l).level] + l.confidence;
  const check = (s?: SeenBrand) => (!s ? 0 : s.domain_check === "site" ? 4 : s.domain_check === "guess" ? 3 : s.domain ? 2 : 1);
  const out: Found[] = [];
  for (const links of groups.values()) {
    const keys = Array.from(new Set(links.map((l) => l.brand_key)));
    if (keys.some((k) => w.seen.get(k)?.hidden)) continue;
    const best = [...links].sort((a, b) => rank(b) - rank(a))[0];
    // The record with the best-checked website speaks for the brand.
    const key = [...keys].sort((a, b) => check(w.seen.get(b)) - check(w.seen.get(a)) || Number(b === best.brand_key) - Number(a === best.brand_key))[0];
    const seen = w.seen.get(key) || { brand_key: key, name: best.brand_name, domain: best.domain, domain_check: "", site: null, checked_at: null, hidden: false, added_brand_id: null };
    out.push({ seen, links, best, creators: new Set(links.map((l) => l.creator_id)).size, keys });
  }
  return out.sort((a, b) => b.creators - a.creators || rank(b.best) - rank(a.best));
}

/** "Sure" when the domain is the creator's own link AND the site says it's that brand. */
export const domainTrust = (s: Pick<SeenBrand, "domain" | "domain_check" | "checked_at">): { label: string; tone: "good" | "info" | "warn" } =>
  !s.domain ? { label: "No website yet", tone: "warn" }
    : s.domain_check === "site" ? { label: "Website checked", tone: "good" }
      : s.domain_check === "guess" ? { label: "Website found by name — check it", tone: "info" }
        : s.domain_check === "mismatch" ? { label: "Site name differs — check it", tone: "warn" }
          : s.domain_check === "blocked" ? { label: "Site blocks checks", tone: "info" }
            : s.checked_at ? { label: "Site didn't load", tone: "warn" } : { label: "Checking the website…", tone: "info" };
