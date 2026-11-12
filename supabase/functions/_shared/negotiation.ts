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
// The asking price is the ANCHOR of a negotiation: the first price they named.
// When they come down by email while it is still fresh ("ok, I can do 4,500"),
// that is a counter — the card shows 4,500 with 5,000 struck through, and a deal
// closed at 3,500 reads "−30 % from 5,000", never "−22 % from 4,500". Your own
// offers are kept in the same history, so the whole path is on one line:
// asked 5,000 → you 3,200 → they 4,500 → you 3,500 → agreed 3,500.
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
/** list = their asking price · counter = they came down, nothing agreed yet · negotiated = agreed · auto = followed a negotiated sibling. */
export type RateStatus = "list" | "counter" | "negotiated" | "auto";
export type RateMeta = { list: number; status: RateStatus; pct: number; at: string; source: RateSource; note: string };
export type RateMetaMap = Partial<Record<RateKey, RateMeta>>;
export type Rates = Record<RateKey, number>;
export type RateChange = { key: RateKey; from: number; to: number; list: number; kind: RateStatus; note: string; prev: RateMeta | null };
export type RateEvent = { id: string; at: string; source: RateSource; summary: string; changes: RateChange[]; evidence?: string; undone?: boolean;
  /** A price YOU put on the table: part of the story, changes no rate. */
  offer?: { key: RateKey; amount: number } };
/** How long an asking price stays the anchor: a lower price from them within this many days is a counter, not a new price list. */
export const ANCHOR_DAYS = 120;

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
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary: dealSummary(changes), changes, evidence: opts.evidence?.slice(0, 300) } };
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
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary: listSummary(changes), changes, evidence: opts.evidence?.slice(0, 300) } };
}

const daysApart = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
const counterNote = (pct: number, list: number) => `Their counter ${pctLabel(pct)} from ${money(list)}`;
const counterSummary = (changes: RateChange[]) => `They came down: ${changes.map((c) => `${RATE_SHORT[c.key]} ${money(c.list)} → ${money(c.to)} (${pctLabel(pctOf(c.to, c.list))})`).join(", ")}`;
const listSummary = (changes: RateChange[]) => `New asking prices: ${changes.map((c) => `${RATE_SHORT[c.key]} ${money(c.to)}`).join(", ")}`;
const dealSummary = (changes: RateChange[]) => {
  const lead = changes.filter((c) => c.kind === "negotiated");
  const auto = changes.filter((c) => c.kind === "auto");
  return lead.length ? `${lead.map((c) => `${RATE_SHORT[c.key]} ${money(c.list)} → ${money(c.to)}`).join(", ")}${auto.length ? ` · ${auto.map((c) => RATE_SHORT[c.key]).join(", ")} followed` : ""}` : "Rates updated";
};

/**
 * Prices the creator names in an email. The first one is their asking price.
 * A LOWER one while that asking price is still fresh is them coming down: a
 * counter — the asking price stays the anchor, so the deal's % is measured
 * from where they started. A higher price, or one long after, is a new
 * asking price. The price they already have on the card restated changes nothing
 * (an agreed price repeated in a later email stays agreed).
 */
export function theirPrices(rates: Partial<Rates>, meta: RateMetaMap, prices: Partial<Record<RateKey, number>>, opts: { at?: string; source: RateSource; evidence?: string }) {
  const at = opts.at || new Date().toISOString();
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const changes: RateChange[] = [];
  for (const key of (Object.keys(prices) as RateKey[]).filter((k) => RATE_KEYS.includes(k))) {
    const to = Math.round(num(prices[key]));
    const from = num(rates[key]);
    if (!to || to === from) continue;
    const m = meta[key];
    const anchor = num(m?.list);
    if (m && anchor && to === anchor && m.status === "counter") {
      // Back up to what they first asked: the counter is off the table.
      next[key] = to;
      nextMeta[key] = { list: anchor, status: "list", pct: 0, at, source: opts.source, note: "Their asking price" };
      changes.push({ key, from, to, list: anchor, kind: "list", note: nextMeta[key]!.note, prev: m });
    } else if (m && anchor && to < anchor && m.at && daysApart(at, m.at) <= ANCHOR_DAYS) {
      const pct = pctOf(to, anchor);
      next[key] = to;
      nextMeta[key] = { list: anchor, status: "counter", pct, at, source: opts.source, note: counterNote(pct, anchor) };
      changes.push({ key, from, to, list: anchor, kind: "counter", note: nextMeta[key]!.note, prev: m });
    } else {
      next[key] = to;
      nextMeta[key] = { list: to, status: "list", pct: 0, at, source: opts.source, note: opts.source === "media_kit" ? "From their media kit" : "Their asking price" };
      changes.push({ key, from, to, list: to, kind: "list", note: nextMeta[key]!.note, prev: m || null });
    }
  }
  if (!changes.length) return { rates, meta, event: null as RateEvent | null };
  const counters = changes.filter((c) => c.kind === "counter");
  const lists = changes.filter((c) => c.kind === "list");
  const summary = [counters.length ? counterSummary(counters) : "", lists.length ? listSummary(lists) : ""].filter(Boolean).join(" · ");
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary, changes, evidence: opts.evidence?.slice(0, 300) } as RateEvent };
}

/**
 * A price YOU offered by email. Nothing on the card changes — it is kept in
 * the history so the path to the deal is complete, and so their "ok, let's
 * do that" can be matched to the number you put on the table. Null when the
 * same offer from the same email is already there.
 */
export function offerEvent(rates: Partial<Rates>, meta: RateMetaMap, history: RateEvent[], offer: { key: RateKey; amount: number }, opts: { at?: string; evidence?: string }): RateEvent | null {
  const at = opts.at || new Date().toISOString();
  const amount = Math.round(num(offer.amount));
  if (!amount || !RATE_KEYS.includes(offer.key)) return null;
  if (history.some((e) => e.offer && e.offer.key === offer.key && e.offer.amount === amount && e.at === at)) return null;
  // The same number said again in a follow-up ("just checking: $1,200 still stands") is still that one offer.
  const before = [...history].filter((e) => !e.undone && e.at < at && touches(e, offer.key)).sort((a, b) => a.at.localeCompare(b.at)).pop();
  if (before?.offer?.key === offer.key && before.offer.amount === amount) return null;
  const list = listPrice(rates, meta, offer.key);
  const vs = list && list !== amount ? ` (${pctLabel(pctOf(amount, list))} from ${money(list)})` : "";
  return { id: newId(), at, source: "email", summary: `You offered ${money(amount)} for ${RATE_SHORT[offer.key]}${vs}`, changes: [], evidence: opts.evidence?.slice(0, 300), offer: { key: offer.key, amount } };
}

const touches = (e: RateEvent, key: RateKey) => e.offer?.key === key || e.changes.some((c) => c.key === key);

/**
 * One offer per number: an offer repeating the amount of the step right
 * before it on the same format (your follow-up restating it) is dropped.
 * Returns the same array when nothing repeats.
 */
export function dropRepeatOffers(history: RateEvent[]): RateEvent[] {
  const drop = new Set<string>();
  const last = new Map<RateKey, RateEvent>();
  for (const e of [...history].filter((x) => !x.undone).sort((a, b) => a.at.localeCompare(b.at))) {
    if (e.offer) {
      const prev = last.get(e.offer.key);
      if (prev?.offer?.key === e.offer.key && prev.offer.amount === e.offer.amount) { drop.add(e.id); continue; }
      last.set(e.offer.key, e);
    }
    for (const c of e.changes) last.set(c.key, e);
  }
  return drop.size ? history.filter((e) => !drop.has(e.id)) : history;
}

/** Your offers still on the table: the latest one per format, made after that format's last agreement. */
export function openOffers(history: RateEvent[]): { key: RateKey; amount: number; at: string }[] {
  const out = new Map<RateKey, { key: RateKey; amount: number; at: string }>();
  const closed = new Map<RateKey, string>();
  for (const e of history) {
    if (e.undone) continue;
    for (const c of e.changes) if (c.kind === "negotiated" && (closed.get(c.key) || "") < e.at) closed.set(c.key, e.at);
  }
  for (const e of history) {
    if (e.undone || !e.offer) continue;
    if (e.at <= (closed.get(e.offer.key) || "")) continue;
    const prev = out.get(e.offer.key);
    if (!prev || prev.at < e.at) out.set(e.offer.key, { ...e.offer, at: e.at });
  }
  return [...out.values()];
}

export type TrailStep = { who: "them" | "you" | "deal"; label: string; amount: number; at: string };
/**
 * The path of one format's price, oldest first: what they asked, what you
 * offered, where they came down, what was agreed. Starts at the asking price
 * the current deal is measured from. Empty when there is no story to tell
 * (a lone asking price).
 */
export function priceTrail(history: RateEvent[], key: RateKey): TrailStep[] {
  const steps: TrailStep[] = [];
  for (const e of [...history].filter((x) => !x.undone).sort((a, b) => a.at.localeCompare(b.at))) {
    const prev = steps[steps.length - 1];
    if (e.offer?.key === key && !(prev?.who === "you" && prev.amount === e.offer.amount)) steps.push({ who: "you", label: "You offered", amount: e.offer.amount, at: e.at });
    for (const c of e.changes) {
      if (c.key !== key || !c.to) continue;
      if (c.kind === "list") { steps.length = 0; steps.push({ who: "them", label: "Asked", amount: c.to, at: e.at }); }
      else if (c.kind === "counter") steps.push({ who: "them", label: "They came down to", amount: c.to, at: e.at });
      else if (c.kind === "negotiated" && c.from !== c.to) {
        if (!steps.length && c.list && c.list !== c.to) steps.push({ who: "them", label: "Asked", amount: c.list, at: e.at });
        steps.push({ who: "deal", label: "Agreed", amount: c.to, at: e.at });
      }
    }
  }
  return steps.length > 1 ? steps : [];
}

/**
 * Repairs histories written before counters existed: a lower price they
 * emailed mid-negotiation was stored as a NEW asking price, so the deal that
 * followed was measured from it ("4,500 → 3,500, −22 %") instead of from what
 * they first asked ("5,000 → 3,500, −30 %"). The lowered "asking price"
 * becomes a counter, the deal is measured from the first ask again, and a
 * sibling that followed by the same % is recalculated when nobody touched it
 * since. Agreed prices never change. Returns null when nothing was wrong.
 */
export function reanchor(rates: Partial<Rates>, meta: RateMetaMap, history: RateEvent[]): { rates: Partial<Rates>; meta: RateMetaMap; history: RateEvent[]; fixed: { key: RateKey; from: number; to: number; agreed: number }[] } | null {
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const events = history.map((e) => ({ ...e, changes: e.changes.map((c) => ({ ...c })) }));
  const order = [...events].filter((e) => !e.undone).sort((a, b) => a.at.localeCompare(b.at));
  const fixed: { key: RateKey; from: number; to: number; agreed: number }[] = [];
  let touched = false;
  for (const key of RATE_KEYS) {
    let anchor: { price: number; at: string } | null = null;
    let wrong = 0; // the lowered price that was stored as the list
    for (const e of order) {
      const c = e.changes.find((x) => x.key === key);
      if (!c) continue;
      if (c.kind === "list") {
        const lowered = e.source === "email" && !!anchor && c.to > 0 && c.to < anchor.price && c.from === anchor.price && c.prev?.status === "list" && daysApart(e.at, anchor.at) <= ANCHOR_DAYS;
        if (lowered) {
          const pct = pctOf(c.to, anchor!.price);
          c.kind = "counter"; c.list = anchor!.price; c.note = counterNote(pct, anchor!.price);
          wrong = c.to;
          e.summary = [counterSummary(e.changes.filter((x) => x.kind === "counter")), e.changes.some((x) => x.kind === "list") ? listSummary(e.changes.filter((x) => x.kind === "list")) : ""].filter(Boolean).join(" · ");
          if (nextMeta[key]?.at === e.at && nextMeta[key]?.status === "list" && num(next[key]) === c.to) nextMeta[key] = { ...nextMeta[key]!, list: anchor!.price, status: "counter", pct, note: c.note };
          touched = true;
        } else { anchor = c.to > 0 ? { price: c.to, at: e.at } : null; wrong = 0; }
      } else if (c.kind === "negotiated" && anchor && wrong && c.list === wrong) {
        const pct = pctOf(c.to, anchor.price);
        const oldRatio = c.to / wrong;
        c.list = anchor.price; c.note = `Negotiated ${pctLabel(pct)} from ${money(anchor.price)}`;
        if (c.prev && c.prev.status === "list" && c.prev.list === wrong) c.prev = { ...c.prev, list: anchor.price, status: "counter", pct: pctOf(wrong, anchor.price), note: counterNote(pctOf(wrong, anchor.price), anchor.price) };
        if (nextMeta[key]?.at === e.at && nextMeta[key]?.status === "negotiated" && num(next[key]) === c.to) nextMeta[key] = { ...nextMeta[key]!, list: anchor.price, pct, note: c.note };
        // Siblings that followed this deal by the old (too small) %: follow the real one.
        const lead = e.changes.filter((x) => x.kind === "negotiated");
        if (lead.length === 1) {
          const ratio = c.to / anchor.price;
          for (const s of e.changes.filter((x) => x.kind === "auto")) {
            if (tidy(s.list * oldRatio) !== s.to) continue;
            const to = tidy(s.list * ratio);
            const sp = pctOf(to, s.list);
            const current = nextMeta[s.key]?.at === e.at && nextMeta[s.key]?.status === "auto" && num(next[s.key]) === s.to;
            s.to = to; s.note = `Auto ${pctLabel(sp)} · followed ${RATE_SHORT[key]}`;
            if (current) { next[s.key] = to; nextMeta[s.key] = { ...nextMeta[s.key]!, pct: sp, note: s.note }; }
          }
        }
        e.summary = dealSummary(e.changes);
        fixed.push({ key, from: wrong, to: anchor.price, agreed: c.to });
        wrong = 0;
        touched = true;
      } else if (c.kind === "negotiated") wrong = 0;
    }
  }
  return touched ? { rates: next, meta: nextMeta, history: events, fixed } : null;
}

/**
 * A deal was agreed with no asking price on file (it was only in their media
 * kit, read later), so it shows "Agreed price · 0%". Given the asking price,
 * fix it after the fact: the agreed price stays, the list price and the % are
 * filled in ("Negotiated -25% from 4,000"), and its family follows by the same
 * % like any negotiation (only prices still at their list). Nothing changes
 * when the deal already has a real list price, or the price is the same.
 */
export function backfillList(rates: Partial<Rates>, meta: RateMetaMap, asking: Partial<Record<RateKey, number>>, opts: { at?: string; source: RateSource; evidence?: string }) {
  const at = opts.at || new Date().toISOString();
  const next: Partial<Rates> = { ...rates };
  const nextMeta: RateMetaMap = { ...meta };
  const changes: RateChange[] = [];
  const fixed: RateKey[] = [];
  for (const key of (Object.keys(asking) as RateKey[]).filter((k) => RATE_KEYS.includes(k))) {
    const m = meta[key];
    const agreed = num(rates[key]);
    const list = Math.round(num(asking[key]));
    if (!m || m.status !== "negotiated" || !agreed || !list || list === agreed) continue;
    // Only a deal that never had a real asking price behind it.
    if (num(m.list) && num(m.list) !== agreed) continue;
    const pct = pctOf(agreed, list);
    nextMeta[key] = { ...m, list, pct, note: `Negotiated ${pctLabel(pct)} from ${money(list)}${opts.source === "media_kit" ? " (their media kit)" : ""}` };
    changes.push({ key, from: agreed, to: agreed, list, kind: "negotiated", note: nextMeta[key]!.note, prev: m });
    fixed.push(key);
  }
  for (const family of RATE_FAMILIES) {
    const lead = family.find((k) => fixed.includes(k));
    if (!lead || family.filter((k) => fixed.includes(k)).length !== 1) continue;
    const ratio = num(next[lead]) / num(nextMeta[lead]!.list);
    for (const sibling of family) {
      if (sibling === lead || nextMeta[sibling]?.status === "negotiated") continue;
      const list = listPrice(next, nextMeta, sibling);
      if (!list) continue;
      const to = tidy(list * ratio);
      const pct = pctOf(to, list);
      const from = num(next[sibling]);
      next[sibling] = to;
      nextMeta[sibling] = { list, status: "auto", pct, at, source: opts.source, note: `Auto ${pctLabel(pct)} · followed ${RATE_SHORT[lead]}` };
      if (to !== from) changes.push({ key: sibling, from, to, list, kind: "auto", note: nextMeta[sibling]!.note, prev: meta[sibling] || null });
    }
  }
  if (!changes.length) return { rates, meta, event: null as RateEvent | null };
  const lead = changes.filter((c) => c.kind === "negotiated");
  const summary = `${lead.map((c) => `${RATE_SHORT[c.key]} ${money(c.list)} → ${money(c.to)} (${pctLabel(pctOf(c.to, c.list))})`).join(", ")} — asking price from ${opts.source === "media_kit" ? "their media kit" : "their email"}${changes.some((c) => c.kind === "auto") ? ` · ${changes.filter((c) => c.kind === "auto").map((c) => RATE_SHORT[c.key]).join(", ")} followed` : ""}`;
  return { rates: next, meta: nextMeta, event: { id: newId(), at, source: opts.source, summary, changes, evidence: opts.evidence?.slice(0, 300) } as RateEvent };
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
    const status = m.status === "negotiated" || m.status === "auto" || m.status === "counter" ? m.status : "list";
    const source = m.source === "email" || m.source === "media_kit" ? m.source : "manual";
    out[k as RateKey] = { list: num(m.list), status, pct: Number(m.pct) || 0, at: typeof m.at === "string" ? m.at : "", source, note: typeof m.note === "string" ? m.note.slice(0, 200) : "" };
  }
  return out;
};

export const normalizeRateHistory = (value: unknown): RateEvent[] =>
  (Array.isArray(value) ? value : [])
    .filter((e): e is RateEvent => !!e && typeof e === "object" && typeof (e as RateEvent).id === "string" && Array.isArray((e as RateEvent).changes))
    .slice(0, 60);
