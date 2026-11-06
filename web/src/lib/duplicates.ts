import type { Creator } from "../types";
import { socialKey } from "./socials";

// "Is this person already in my CRM?" — checked while you type, across active
// AND archived influencers (so someone you deleted isn't quietly added back).
// Exact hits (same name, same email, same profile) are a clear warning;
// similar names are a softer hint. The on-submit duplicate review stays.

/** "  Dàn  O'Brien " → "dan obrien": case, accents, punctuation and spacing don't matter. */
export const nameKey = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

const emailKey = (value: string) => value.trim().toLowerCase();

export type ClashReason = "name" | "email" | "profile";
export type Clash = { creator: Creator; reasons: ClashReason[]; archived: boolean };

export function creatorClashes(creators: Creator[], draft: { name: string; emails: string[]; links: string[] }, ignoreId?: string): Clash[] {
  const name = nameKey(draft.name);
  const emails = new Set(draft.emails.map(emailKey).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)));
  const links = new Set(draft.links.map((l) => (l ? socialKey(l) : "")).filter((l) => l.length > 4));
  if (name.length < 2 && !emails.size && !links.size) return [];
  const out: Clash[] = [];
  for (const c of creators) {
    if (c.id === ignoreId) continue;
    const reasons: ClashReason[] = [];
    if (name.length >= 2 && nameKey(c.name) === name) reasons.push("name");
    if (emails.size && [c.contact_email, c.secondary_email || ""].some((e) => e && emails.has(emailKey(e)))) reasons.push("email");
    if (links.size && [c.channel_link, ...(c.socials || []).map((s) => s.url)].some((u) => u && links.has(socialKey(u)))) reasons.push("profile");
    if (reasons.length) out.push({ creator: c, reasons, archived: !!c.archived_at });
  }
  // Active records first, then the strongest evidence.
  return out.sort((a, b) => Number(a.archived) - Number(b.archived) || b.reasons.length - a.reasons.length);
}

/** Names that start with, or contain a word starting with, what's typed (3+ letters) — but aren't exact hits. */
export function similarCreators(creators: Creator[], typed: string, exclude: Set<string>, max = 3): Creator[] {
  const q = nameKey(typed);
  if (q.length < 3) return [];
  const words = q.split(" ");
  return creators
    .filter((c) => !exclude.has(c.id))
    .map((c) => {
      const n = nameKey(c.name);
      if (!n || n === q) return null;
      const parts = n.split(" ");
      // Every typed word must start one of their name's words ("ben az" → "Ben Azelart").
      const hit = words.every((w) => parts.some((p) => p.startsWith(w)));
      return hit ? { c, rank: (n.startsWith(q) ? 0 : 1) + (c.archived_at ? 2 : 0) } : null;
    })
    .filter((x): x is { c: Creator; rank: number } => !!x)
    .sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name))
    .slice(0, max)
    .map((x) => x.c);
}

/** Same matching as the influencer list's search box. */
export const matchesCreatorQuery = (c: Creator, query: string) => {
  const q = query.toLowerCase().replace(/^@/, "");
  return !q || [c.name, c.contact_email, c.secondary_email || "", c.niche, c.country || "", c.channel_link, ...(c.socials || []).flatMap((s) => [s.handle, s.url])].some((v) => (v || "").toLowerCase().includes(q));
};

// ---------------------------------------------------------------------------
// Duplicates already in the CRM. Two records for one person split their mail:
// Gmail files a reply under one copy while you follow up from the other, so
// the follow-up clock, status and history all go wrong. Every active record is
// checked; strong matches (same email, same profile, same YouTube channel,
// same website) are a red alert until merged or marked "not the same".

export type DupKind = "creator" | "brand";
export type DupReason = "email" | "profile" | "channel" | "domain" | "name";
export type DupMatch = { reason: DupReason; value: string };
export type DupPair = { a: string; b: string; key: string; matches: DupMatch[] };
export type DupGroup = { key: string; ids: string[]; pairs: DupPair[]; reasons: DupReason[]; strong: boolean };

export const DUP_LABELS: Record<DupReason, string> = { email: "Same email", profile: "Same profile", channel: "Same YouTube channel", domain: "Same website", name: "Same name" };
const STRONG: DupReason[] = ["email", "profile", "channel", "domain"];
const ORDER: DupReason[] = ["email", "channel", "profile", "domain", "name"];

/** The id pair, order-free: what "not the same" remembers. */
export const dupPairKey = (kind: DupKind, a: string, b: string) => `${kind}:${a < b ? `${a}|${b}` : `${b}|${a}`}`;

const domainKey = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** "Who could be whom": the identifying keys of one record. `primary` = their own address (a second address may be a shared manager). */
type Key = { reason: DupReason; value: string; shown: string; primary?: boolean };

export function creatorKeys(c: Pick<Creator, "name" | "contact_email" | "secondary_email" | "channel_link" | "socials" | "youtube">): Key[] {
  const keys: Key[] = [];
  const email = emailKey(c.contact_email || "");
  if (isEmail(email)) keys.push({ reason: "email", value: email, shown: email, primary: true });
  const second = emailKey(c.secondary_email || "");
  if (isEmail(second) && second !== email) keys.push({ reason: "email", value: second, shown: second });
  const links = new Set<string>();
  for (const s of [{ url: c.channel_link, platform: "" }, ...(c.socials || [])]) {
    // A website or link page is often shared (an agency site), so it never makes two people one.
    if (!s.url || s.platform === "Website" || /linktr\.ee|beacons\.ai|bio\.link|lnk\.bio/i.test(s.url)) continue;
    const key = socialKey(s.url);
    if (key.length > 4 && key.includes("/") && !links.has(key)) { links.add(key); keys.push({ reason: "profile", value: key, shown: s.url.replace(/^https?:\/\/(www\.)?/, "") }); }
  }
  const channel = c.youtube?.channel_id || "";
  if (/^UC[\w-]{10,}$/.test(channel)) keys.push({ reason: "channel", value: channel, shown: c.youtube?.title || c.youtube?.handle || channel });
  const name = nameKey(c.name || "");
  if (name.length >= 3) keys.push({ reason: "name", value: name, shown: c.name.trim() });
  return keys;
}

export function brandKeys(b: { name: string; domain: string; contact_email: string; secondary_email: string; socials?: { url: string; platform?: string }[] }): Key[] {
  const keys: Key[] = [];
  const email = emailKey(b.contact_email || "");
  if (isEmail(email)) keys.push({ reason: "email", value: email, shown: email, primary: true });
  const second = emailKey(b.secondary_email || "");
  if (isEmail(second) && second !== email) keys.push({ reason: "email", value: second, shown: second });
  const domain = domainKey(b.domain || "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) keys.push({ reason: "domain", value: domain, shown: domain });
  for (const s of b.socials || []) {
    if (!s.url || s.platform === "Website") continue;
    const key = socialKey(s.url);
    if (key.length > 4 && key.includes("/")) keys.push({ reason: "profile", value: key, shown: s.url.replace(/^https?:\/\/(www\.)?/, "") });
  }
  const name = nameKey(b.name || "");
  if (name.length >= 2) keys.push({ reason: "name", value: name, shown: b.name.trim() });
  return keys;
}

/**
 * Groups of records that look like one person / company. Pairs you marked
 * "not the same" (`dismissed`) are never linked again. A key shared by many
 * records (a manager on 10 creators' second address) is a shared inbox, not
 * a duplicate, and is skipped.
 */
export function duplicateGroups(kind: DupKind, records: { id: string; archived_at?: string | null; keys: Key[] }[], dismissed: Iterable<string> = []): DupGroup[] {
  const skip = new Set(dismissed);
  const buckets = new Map<string, { id: string; key: Key }[]>();
  for (const r of records) {
    if (r.archived_at) continue;
    for (const key of r.keys) {
      const k = `${key.reason}:${key.value}`;
      const list = buckets.get(k) || [];
      if (!list.some((x) => x.id === r.id)) list.push({ id: r.id, key });
      buckets.set(k, list);
    }
  }
  const pairs = new Map<string, DupPair>();
  for (const list of buckets.values()) {
    if (list.length < 2 || list.length > 6) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const x = list[i], y = list[j];
      // Second addresses only count against someone's own address.
      if (x.key.reason === "email" && !x.key.primary && !y.key.primary) continue;
      const key = dupPairKey(kind, x.id, y.id);
      if (skip.has(key)) continue;
      const [a, b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
      const pair = pairs.get(key) || { a, b, key, matches: [] };
      if (!pair.matches.some((m) => m.reason === x.key.reason && m.value === x.key.shown)) pair.matches.push({ reason: x.key.reason, value: x.key.shown });
      pairs.set(key, pair);
    }
  }
  // Same name alone is common ("Alex"): it only joins a group, or stands as a soft hint.
  const parent = new Map<string, string>();
  const find = (id: string): string => { let p = parent.get(id) || id; while (p !== (parent.get(p) || p)) p = parent.get(p) || p; parent.set(id, p); return p; };
  for (const p of pairs.values()) { const ra = find(p.a), rb = find(p.b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); }
  const groups = new Map<string, DupGroup>();
  for (const p of pairs.values()) {
    p.matches.sort((m, n) => ORDER.indexOf(m.reason) - ORDER.indexOf(n.reason));
    const root = find(p.a);
    const g = groups.get(root) || { key: "", ids: [], pairs: [], reasons: [], strong: false };
    for (const id of [p.a, p.b]) if (!g.ids.includes(id)) g.ids.push(id);
    g.pairs.push(p);
    for (const m of p.matches) if (!g.reasons.includes(m.reason)) g.reasons.push(m.reason);
    g.strong ||= p.matches.some((m) => STRONG.includes(m.reason));
    groups.set(root, g);
  }
  return Array.from(groups.values())
    .map((g) => ({ ...g, ids: g.ids.sort(), key: g.ids.slice().sort().join("|"), reasons: g.reasons.sort((m, n) => ORDER.indexOf(m) - ORDER.indexOf(n)) }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || b.reasons.length - a.reasons.length || b.ids.length - a.ids.length || a.key.localeCompare(b.key));
}

export const creatorDuplicates = (creators: Creator[], dismissed: Iterable<string> = []) =>
  duplicateGroups("creator", creators.map((c) => ({ id: c.id, archived_at: c.archived_at, keys: creatorKeys(c) })), dismissed);

export const brandDuplicates = (brands: { id: string; archived_at: string | null; name: string; domain: string; contact_email: string; secondary_email: string; socials?: { url: string; platform?: string }[] }[], dismissed: Iterable<string> = []) =>
  duplicateGroups("brand", brands.map((b) => ({ id: b.id, archived_at: b.archived_at, keys: brandKeys(b) })), dismissed);
