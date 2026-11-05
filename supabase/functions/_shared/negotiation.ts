// Rate negotiation engine — shared by the app (manual "Negotiate") and the
// Gmail sync (agreements read from email), so both apply identical rules.
//
// How agencies actually negotiate: you push one price down and the related
// format follows. Integrated and dedicated videos are one family — if you get
// the integration from 5,000 to 2,500 (−50 %), the dedicated drops by the same
// 50 % automatically, clearly marked "auto · followed Integrated". If you
// negotiated both, both take the agreed numbers and nothing is inferred. Every
// other rate (shorts, posts, stories, add-ons…) stays exactly as the creator
// set it unless it was negotiated itself.
//
// Each rate remembers its list price (the creator's asking price) so the card
// always shows "list 5,000 → 2,500 (−50 %)", and every change is kept in a
// history you can undo.
//
// Pure TypeScript: no Deno or DOM APIs.

export type RateKey = "video" | "extended" | "dedicated" | "bundle" | "short" | "post" | "carousel" | "story" | "stream" | "podcast" | "ugc" | "link_in_bio" | "usage_rights" | "exclusivity";
export const RATE_KEYS: RateKey[] = ["video", "extended", "dedicated", "bundle", "short", "post", "carousel", "story", "stream", "podcast", "ugc", "link_in_bio", "usage_rights", "exclusivity"];
export const RATE_SHORT: Record<RateKey, string> = {
  video: "Integrated", extended: "Extended integration", dedicated: "Dedicated", bundle: "Bundle", short: "Short", post: "Post", carousel: "Carousel", story: "Stories",
  stream: "Stream", podcast: "Podcast", ugc: "UGC", link_in_bio: "Link in bio", usage_rights: "Usage rights", exclusivity: "Exclusivity",
};
/** Formats that move together when only one of them is negotiated. */
export const RATE_FAMILIES: RateKey[][] = [["video", "extended", "dedicated"]];

export type RateSource = "email" | "manual" | "media_kit";
export type RateStatus = "list" | "negotiated" | "auto";
export type RateMeta = { list: number; status: RateStatus; pct: number; at: string; source: RateSource; note: string };
export type RateMetaMap = Partial<Record<RateKey, RateMeta>>;
export type Rates = Record<RateKey, number>;
export type RateChange = { key: RateKey; from: number; to: number; list: number; kind: RateStatus; note: string; prev: RateMeta | null };
export type RateEvent = { id: string; at: string; source: RateSource; summary: string; changes: RateChange[]; evidence?: string; undone?: boolean };

const money = (v: number) => Math.round(v).toLocaleString("en-US");
/** Prices land on clean numbers: 4,000 not 3,987. */
const tidy = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : v >= 100 ? Math.round(v / 5) * 5 : Math.round(v));
const pctOf = (to: number, list: number) => (list > 0 ? Math.round(((to - list) / list) * 1000) / 10 : 0);
const pctLabel = (p: number) => `${p > 0 ? "+" : ""}${p}%`;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const listPrice = (rates: Partial<Rates>, meta: RateMetaMap, key: RateKey) => num(meta[key]?.list) || num(rates[key]);

export function negotiate(
  rates: Partial<Rates>,
  meta: RateMetaMap,
  agreed: Partial<Record<RateKey, number>>,
  opts: { at?: string; source: RateSource; evidence?: string },
): { rates: Partial<Rates>; meta: RateMetaMap; event: RateEvent | null } {
  const at = opts.at || new Date().toISOString();
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const changes: RateChange[] = [];
  const keys = (Object.keys(agreed) as RateKey[]).filter((k) => RATE_KEYS.includes(k) && num(agreed[k]) > 0);
  if (!keys.length) return { rates, meta, event: null };

  for (const key of keys) {
    const list = listPrice(rates, meta, key);
    const to = Math.round(num(agreed[key]));
    const from = num(rates[key]);
    if (to === from && meta[key]?.status === "negotiated") continue;
    const pct = pctOf(to, list);
    next[key] = to;
    nextMeta[key] = { list: list || to, status: "negotiated", pct, at, source: opts.source, note: list ? `Negotiated ${pctLabel(pct)} from ${money(list)}` : "Agreed price" };
    changes.push({ key, from, to, list: list || to, kind: "negotiated", note: nextMeta[key]!.note, prev: meta[key] || null });
  }

  for (const family of RATE_FAMILIES) {
    const moved = family.filter((k) => keys.includes(k));
    if (moved.length !== 1) continue; // none, or several negotiated explicitly
    const lead = moved[0];
    const leadList = listPrice(rates, meta, lead);
    if (!leadList) continue;
    const ratio = num(next[lead]) / leadList;
    for (const sibling of family) {
      if (sibling === lead || keys.includes(sibling)) continue;
      const list = listPrice(rates, meta, sibling);
      if (!list) continue;
      const to = tidy(list * ratio);
      const from = num(rates[sibling]);
      const pct = pctOf(to, list);
      next[sibling] = to;
      nextMeta[sibling] = { list, status: "auto", pct, at, source: opts.source, note: `Auto ${pctLabel(pct)} · followed ${RATE_SHORT[lead]}` };
      if (to !== from) changes.push({ key: sibling, from, to, list, kind: "auto", note: nextMeta[sibling]!.note, prev: meta[sibling] || null });
    }
  }

  if (!changes.length) return { rates, meta, event: null };
  const lead = changes.filter((c) => c.kind === "negotiated");
  const summary = lead.length
    ? `${lead.map((c) => `${RATE_SHORT[c.key]} ${money(c.list)} → ${money(c.to)}`).join(", ")}${changes.some((c) => c.kind === "auto") ? ` · ${changes.filter((c) => c.kind === "auto").map((c) => RATE_SHORT[c.key]).join(", ")} followed` : ""}`
    : "Rates updated";
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary, changes, evidence: opts.evidence?.slice(0, 300) } };
}

/** "Apply the same % to…" — the one-click follow-up the card offers. */
export function applySamePct(rates: Partial<Rates>, meta: RateMetaMap, fromKey: RateKey, targets: RateKey[], at = new Date().toISOString()) {
  const list = listPrice(rates, meta, fromKey);
  if (!list) return { rates, meta, event: null as RateEvent | null };
  const ratio = num(rates[fromKey]) / list;
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const changes: RateChange[] = [];
  for (const key of targets) {
    if (key === fromKey) continue;
    const l = listPrice(rates, meta, key);
    if (!l) continue;
    const to = tidy(l * ratio);
    const pct = pctOf(to, l);
    next[key] = to;
    nextMeta[key] = { list: l, status: "auto", pct, at, source: "manual", note: `Auto ${pctLabel(pct)} · same as ${RATE_SHORT[fromKey]}` };
    changes.push({ key, from: num(rates[key]), to, list: l, kind: "auto", note: nextMeta[key]!.note, prev: meta[key] || null });
  }
  if (!changes.length) return { rates, meta, event: null as RateEvent | null };
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: "manual" as RateSource, summary: `${changes.map((c) => RATE_SHORT[c.key]).join(", ")} set ${pctLabel(changes[0].list ? pctOf(changes[0].to, changes[0].list) : 0)} like ${RATE_SHORT[fromKey]}`, changes } };
}

/** New asking prices from a media kit / the creator: they become the list prices. */
export function setListPrices(rates: Partial<Rates>, meta: RateMetaMap, prices: Partial<Record<RateKey, number>>, opts: { at?: string; source: RateSource; evidence?: string }) {
  const at = opts.at || new Date().toISOString();
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const changes: RateChange[] = [];
  for (const key of (Object.keys(prices) as RateKey[]).filter((k) => RATE_KEYS.includes(k))) {
    const to = Math.round(num(prices[key]));
    if (!to) continue;
    const from = num(rates[key]);
    if (from === to && (!meta[key] || meta[key]!.status === "list")) continue;
    next[key] = to;
    nextMeta[key] = { list: to, status: "list", pct: 0, at, source: opts.source, note: opts.source === "media_kit" ? "From their media kit" : "Their asking price" };
    changes.push({ key, from, to, list: to, kind: "list", note: nextMeta[key]!.note, prev: meta[key] || null });
  }
  if (!changes.length) return { rates, meta, event: null as RateEvent | null };
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary: `New asking prices: ${changes.map((c) => `${RATE_SHORT[c.key]} ${money(c.to)}`).join(", ")}`, changes, evidence: opts.evidence?.slice(0, 300) } };
}

/** Put every rate an event touched back exactly as it was. */
export function undoEvent(rates: Partial<Rates>, meta: RateMetaMap, event: RateEvent) {
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  for (const c of event.changes) {
    next[c.key] = c.from;
    if (c.prev) nextMeta[c.key] = c.prev;
    else delete nextMeta[c.key];
  }
  return { rates: next, meta: nextMeta };
}

export const normalizeRateMeta = (value: unknown): RateMetaMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: RateMetaMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!RATE_KEYS.includes(k as RateKey) || !v || typeof v !== "object") continue;
    const m = v as Record<string, unknown>;
    const status = m.status === "negotiated" || m.status === "auto" ? m.status : "list";
    const source = m.source === "email" || m.source === "media_kit" ? m.source : "manual";
    out[k as RateKey] = { list: num(m.list), status, pct: Number(m.pct) || 0, at: typeof m.at === "string" ? m.at : "", source, note: typeof m.note === "string" ? m.note.slice(0, 200) : "" };
  }
  return out;
};

export const normalizeRateHistory = (value: unknown): RateEvent[] =>
  (Array.isArray(value) ? value : [])
    .filter((e): e is RateEvent => !!e && typeof e === "object" && typeof (e as RateEvent).id === "string" && Array.isArray((e as RateEvent).changes))
    .slice(0, 60);
