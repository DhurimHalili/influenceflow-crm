import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiEnabled, hasAudience, QuotaExhausted, readAttachment, readCreatorEmail, type AudienceFacts, type FileReading } from "../_shared/ai.ts";
import { decodeEntities } from "../_shared/leadScanner.ts";
import { backfillList, negotiate, normalizeRateHistory, normalizeRateMeta, setListPrices, type RateEvent, type RateKey, type RateMetaMap, type Rates } from "../_shared/negotiation.ts";
import { isPlainYes, mentionsMoneyOrAudience, moneyMentions, ownText, readMine, readOffer, readPrices, statesAudience, type PriceHit } from "../_shared/priceReader.ts";
import { listPrice } from "../_shared/negotiation.ts";

// What a creator's email adds to their CRM profile:
//   • attachments that are a media kit / rate card / stats screenshot: PDF or
//     image, real type checked by its first bytes (not its name — PDFs often
//     arrive as "application/octet-stream"). Up to 10 MB → private storage;
//     10–25 MB → kept in Gmail (no storage used) and fetched when you download;
//   • kit LINKS (Canva, Google Drive / Slides / Docs, Dropbox, OneDrive…): saved
//     as a link; public Drive/Dropbox PDFs are downloaded and stored as files;
//   • AI reading (Claude or Gemini, see _shared/ai.ts) fills the "Verified"
//     audience panel and asking prices; when the AI is out of quota the file
//     waits in a queue and is read on a later run;
//   • prices: AI when available, otherwise strict rules (_shared/priceReader.ts).
//     A creator's plain "sounds good" to the ONE price you offered is an agreement.
//   • Older mail (sent before this existed) is gone through too, oldest first per
//     creator — and it never overwrites a price you typed or changed later.
//   • YOUR emails to a creator are read too: a price of your own is an offer
//     (→ Negotiating); a yes to one of their prices ("the $500 looks good") is an
//     agreement (→ the price is marked negotiated and they move to Roster).
//   • Status only moves forward (Negotiating, then Roster), only from a live
//     stage, and only for mail newer than the status you last set by hand.
// Email bodies are read in memory and never stored.

type Admin = SupabaseClient;
type Part = { partId?: string; mimeType?: string; filename?: string; body?: { data?: string; size?: number; attachmentId?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
export type FullMessage = { id: string; threadId: string; labelIds?: string[]; payload?: Part; snippet?: string; internalDate?: string };
export type Attachment = { filename: string; mime: string; size: number; attachmentId: string; partId: string; inline: boolean };
export type Fetcher = <T>(path: string) => Promise<T>;

const MAX_STORE = 10 * 1024 * 1024;
const MAX_GMAIL = 25 * 1024 * 1024;
const MAX_AI = 14 * 1024 * 1024;
const USER_QUOTA = 300 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const AI_DAILY_LIMIT = 150;

// Base64url → bytes without an intermediate binary string (edge functions have little memory).
const B64 = new Uint8Array(128).fill(255);
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("").forEach((c, i) => (B64[c.charCodeAt(0)] = i));
B64[43] = 62; B64[45] = 62; B64[47] = 63; B64[95] = 63; // + - / _
export const b64urlToBytes = (data: string) => {
  let len = data.length;
  while (len && data.charCodeAt(len - 1) === 61) len--; // "="
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < len; i++) {
    const v = B64[data.charCodeAt(i) & 127];
    if (v === 255) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return o === out.length ? out : out.subarray(0, o);
};
const bytesToB64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const htmlToText = (html: string) =>
  decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, " $1 ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/** Plain text of a message and its attachment list — read in memory only. */
export function bodyOf(message: FullMessage): { text: string; html: string; attachments: Attachment[] } {
  let plain = "";
  let html = "";
  const attachments: Attachment[] = [];
  const walk = (part?: Part) => {
    if (!part) return;
    const mime = (part.mimeType || "").toLowerCase();
    if (part.filename && part.body?.attachmentId) {
      const h = (n: string) => part.headers?.find((x) => x.name.toLowerCase() === n)?.value || "";
      attachments.push({ filename: part.filename, mime, size: part.body.size || 0, attachmentId: part.body.attachmentId, partId: part.partId || "", inline: !!h("content-id") && !/attachment/i.test(h("content-disposition")) });
    } else if (mime === "text/plain" && part.body?.data && !plain) plain = new TextDecoder().decode(b64urlToBytes(part.body.data));
    else if (mime === "text/html" && part.body?.data && !html) html = new TextDecoder().decode(b64urlToBytes(part.body.data));
    for (const p of part.parts || []) walk(p);
  };
  walk(message.payload);
  return { text: (plain || htmlToText(html)).slice(0, 20000), html: html.slice(0, 200000), attachments };
}

/** The file really is what it says: PDF / PNG / JPEG / WEBP magic bytes. */
export const sniff = (b: Uint8Array): string | null => {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
};
const sha256 = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>)), (x) => x.toString(16).padStart(2, "0")).join("");
const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
const KIT_WORDS = /media[\s_-]?kit|rate[\s_-]?card|\brates\b|press[\s_-]?kit|\bkit\b|\bstats\b|insights|analytics|demographic|audience|\bdeck\b|one[\s_-]?pager|portfolio/i;
const looksLikeKit = (name: string) => KIT_WORDS.test(name);
const declaredOk = (att: Attachment) => !!ALLOWED[att.mime] || (/^(application\/(octet-stream|x-pdf|download|force-download)|binary\/octet-stream)$/.test(att.mime) && /\.(pdf|png|jpe?g|webp)$/i.test(att.filename));

type CreatorRow = { pipeline_status?: string; id: string; name: string; rates: Partial<Rates> | null; rate_meta: unknown; rate_history: unknown; audience: Record<string, unknown> | null; socials: { handle?: string }[] | null };
type FileRow = { id: string; creator_id: string; path: string; filename: string; mime: string; size: number; received_at: string; storage: string; gmail_id: string; part_id: string; mailbox: string; kind: string; ai_attempts: number };

export async function aiAllowed(admin: Admin, userId: string) {
  if (!aiEnabled()) return false;
  const { data } = await admin.rpc("ai_take", { p_user: userId, p_limit: AI_DAILY_LIMIT });
  return data === true;
}

const audienceBlock = (facts: AudienceFacts, extra: Record<string, unknown>) => ({
  top_countries: facts.topCountries, age_ranges: facts.ageRanges, gender_female_pct: facts.genderFemalePct, gender_male_pct: facts.genderMalePct, avg_views: facts.avgViews,
  followers: facts.followers, engagement_rate: facts.engagementRate, ...extra,
});

// ---- one creator's profile, changed in memory and saved once -----------------------

class Profile {
  rates: Partial<Rates>;
  meta: RateMetaMap;
  history: RateEvent[];
  audience: Record<string, unknown>;
  activities: string[] = [];
  touched = false;
  /** The furthest stage this mail proves: Negotiating (prices on the table) or Roster (a price agreed). */
  stage: { status: "negotiating" | "roster"; at: string; why: string } | null = null;
  private manual: Set<RateKey>;
  /** Prices read from their analyzed media kits / rate cards (oldest first). */
  kits: { at: string; rates: { key: RateKey; amount: number; currency: string }[] }[] = [];
  constructor(public c: CreatorRow, private admin: Admin, private userId: string, private currency: string) {
    this.rates = { ...(c.rates || {}) };
    this.meta = normalizeRateMeta(c.rate_meta);
    this.history = normalizeRateHistory(c.rate_history);
    this.audience = { ...(c.audience || {}) };
    // A price with no history behind it was typed by hand — older mail never replaces it.
    this.manual = new Set((Object.keys(this.rates) as RateKey[]).filter((k) => Number(this.rates[k]) > 0 && (!this.meta[k] || this.meta[k]!.source === "manual")));
  }
  /** Prices from mail sent at `at` may change these keys (never a hand-typed price from older mail, never anything changed after that email). */
  private allowed(prices: Partial<Record<RateKey, number>>, at: string, historical: boolean) {
    return Object.fromEntries(Object.entries(prices).filter(([k]) => {
      const key = k as RateKey;
      if (historical && this.manual.has(key)) return false;
      const changed = this.meta[key]?.at;
      // The same email read again (rules got better) may correct what it said.
      return !changed || changed <= at;
    })) as Partial<Record<RateKey, number>>;
  }
  private money(list: { key: RateKey; amount: number; currency: string }[]) {
    return Object.fromEntries(list.filter((r) => !r.currency || r.currency === this.currency).map((r) => [r.key, r.amount])) as Partial<Record<RateKey, number>>;
  }
  listPrices(list: { key: RateKey; amount: number; currency: string }[], at: string, source: "email" | "media_kit", evidence: string, historical: boolean, label: string) {
    const prices = this.allowed(this.money(list), at, historical);
    if (!Object.keys(prices).length) return false;
    const done = setListPrices(this.rates, this.meta, prices, { at, source, evidence });
    if (!done.event) return false;
    this.rates = done.rates; this.meta = done.meta; this.history.unshift(done.event); this.touched = true;
    this.activities.push(`${this.c.name}: ${label}${done.event.summary.replace(/^New asking prices: /, "")}`);
    return true;
  }
  /** Their kit's asking price for each key (latest kit sent on or before `at`, else the latest one). */
  kitAsking(at?: string) {
    const out: Partial<Record<RateKey, number>> = {};
    const kits = [...this.kits].sort((a, b) => a.at.localeCompare(b.at));
    const before = at ? kits.filter((k) => k.at <= at) : kits;
    for (const k of (before.length ? before : kits)) Object.assign(out, this.money(k.rates));
    return out;
  }
  /** A deal agreed with no asking price on file gets the kit's price as its list (and its real %). */
  fixFromKits(label = "") {
    const asking = this.kitAsking();
    if (!Object.keys(asking).length) return false;
    const done = backfillList(this.rates, this.meta, asking, { source: "media_kit", evidence: "Asking price from their media kit" });
    if (!done.event) return false;
    this.rates = done.rates; this.meta = done.meta; this.history.unshift(done.event); this.touched = true;
    this.activities.push(`${this.c.name}: ${label}${done.event.summary}`);
    return true;
  }
  agree(list: { key: RateKey; amount: number; currency: string }[], at: string, evidence: string, historical: boolean, label: string) {
    const prices = this.allowed(this.money(list), at, historical);
    if (!Object.keys(prices).length) return false;
    // No asking price on file for what they agreed, but their media kit has one:
    // that's the price you negotiated from.
    const asking = this.kitAsking(at);
    const missing = Object.fromEntries((Object.keys(prices) as RateKey[]).filter((k) => !listPrice(this.rates, this.meta, k) && asking[k]).map((k) => [k, asking[k]!])) as Partial<Record<RateKey, number>>;
    if (Object.keys(missing).length) {
      const kitAt = [...this.kits].filter((k) => k.at <= at).map((k) => k.at).sort().pop() || at;
      const listed = setListPrices(this.rates, this.meta, missing, { at: kitAt < at ? kitAt : at, source: "media_kit", evidence: "Asking price from their media kit" });
      if (listed.event) { this.rates = listed.rates; this.meta = listed.meta; this.history.unshift(listed.event); this.touched = true; }
    }
    const done = negotiate(this.rates, this.meta, prices, { at, source: "email", evidence });
    if (!done.event) return false;
    this.rates = done.rates; this.meta = done.meta; this.history.unshift(done.event); this.touched = true;
    this.activities.push(`${label} ${this.c.name}: ${done.event.summary}`);
    return true;
  }
  reach(status: "negotiating" | "roster", at: string, why: string) {
    const rank = { negotiating: 1, roster: 2 };
    if (!this.stage || rank[status] > rank[this.stage.status] || (rank[status] === rank[this.stage.status] && at > this.stage.at)) this.stage = { status, at, why };
  }
  /** Prices this same email set before but no longer says (a misread, e.g. a bundle read as a dedicated video): put them back. */
  forget(at: string, keep: RateKey[]) {
    // Only what the rules read from this very email (the AI's readings are left alone).
    const byRules = new Set(this.history.filter((e) => e.at === at && (e.evidence || "").startsWith("Read by rules")).flatMap((e) => e.changes.map((c) => c.key)));
    const wrong = (Object.keys(this.meta) as RateKey[]).filter((k) => byRules.has(k) && this.meta[k]?.at === at && this.meta[k]?.source === "email" && this.meta[k]?.status === "list" && !keep.includes(k));
    if (!wrong.length) return;
    const changes = wrong.map((k) => ({ key: k, from: Number(this.rates[k]) || 0, to: 0, list: Number(this.rates[k]) || 0, kind: "list" as const, note: "Corrected: read wrongly before", prev: this.meta[k] || null }));
    for (const k of wrong) { this.rates[k] = 0; delete this.meta[k]; }
    this.history.unshift({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), source: "email", summary: `Corrected after re-reading the email: removed ${wrong.join(", ")}`, changes });
    this.touched = true;
    this.activities.push(`${this.c.name}: corrected prices read wrongly from an older email`);
  }
  setAudience(slot: "verified" | "claimed", block: Record<string, unknown>, at: string) {
    const prev = this.audience[slot] as { at?: string } | undefined;
    if (prev?.at && prev.at > at) return false; // a newer kit/claim already there
    this.audience[slot] = block; this.touched = true;
    return true;
  }
  async save() {
    if (this.stage) await this.moveStatus(this.stage);
    if (this.touched) await this.admin.from("creators").update({ rates: this.rates, rate_meta: this.meta, rate_history: this.history.slice(0, 60), audience: this.audience }).eq("id", this.c.id).eq("user_id", this.userId);
    if (this.activities.length) await this.admin.from("activities").insert(this.activities.slice(0, 8).map((t) => ({ user_id: this.userId, text: t.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: this.c.id })));
    this.activities = [];
    this.touched = false;
    this.stage = null;
  }
  private async moveStatus(stage: NonNullable<Profile["stage"]>) {
    const { data: row } = await this.admin.from("creators").select("pipeline_status, status_updated_at, archived_at").eq("id", this.c.id).eq("user_id", this.userId).maybeSingle();
    if (!row || row.archived_at) return;
    const RANK: Record<string, number> = { new: 0, contacted: 1, no_reply: 1, inbound: 1, replied: 2, negotiating: 3, roster: 4 };
    const now = RANK[row.pipeline_status as string];
    // Signed and Denied are yours; a status you set by hand wins over older mail.
    if (now === undefined || RANK[stage.status] <= now) return;
    if (row.status_updated_at && stage.at <= row.status_updated_at) return;
    const at = stage.at > new Date().toISOString() ? new Date().toISOString() : stage.at;
    const patch: Record<string, unknown> = { pipeline_status: stage.status, status_updated_at: at, status_source: "gmail" };
    if (stage.status === "roster") patch.on_roster = true;
    const { error } = await this.admin.from("creators").update(patch).eq("id", this.c.id).eq("user_id", this.userId).eq("pipeline_status", row.pipeline_status);
    if (!error) this.activities.push(`Gmail: ${this.c.name} moved to ${stage.status === "roster" ? "Roster" : "Negotiating"} — ${stage.why}`);
  }
}

async function loadProfile(admin: Admin, userId: string, creatorId: string, currency: string) {
  const [{ data }, { data: kits }] = await Promise.all([
    admin.from("creators").select("id, name, rates, rate_meta, rate_history, audience, socials, pipeline_status").eq("id", creatorId).eq("user_id", userId).maybeSingle(),
    admin.from("creator_files").select("received_at, created_at, analysis").eq("user_id", userId).eq("creator_id", creatorId).eq("status", "analyzed").in("kind", ["media_kit", "rate_card", "stats_screenshot"]).limit(20),
  ]);
  if (!data) return null;
  const p = new Profile(data as CreatorRow, admin, userId, currency);
  p.kits = kitsOf(kits || []);
  return p;
}

type KitRow = { received_at: string | null; created_at: string; analysis: { rates?: unknown } | null };
const kitsOf = (rows: KitRow[]) =>
  rows.map((r) => ({
    at: r.received_at || r.created_at,
    rates: (Array.isArray(r.analysis?.rates) ? r.analysis!.rates : [])
      .map((x) => x as { key?: unknown; amount?: unknown; currency?: unknown })
      .filter((x) => typeof x.key === "string" && Number(x.amount) > 0)
      .map((x) => ({ key: x.key as RateKey, amount: Number(x.amount), currency: String(x.currency || "").toUpperCase() })),
  })).filter((k) => k.rates.length);

/**
 * Deals agreed before their media kit's prices were on file read "0 %". Every
 * read run: any creator with an analyzed kit and a deal with no real asking
 * price gets the kit's price as the list (the agreed price never changes).
 */
export async function repairKitLists(admin: Admin, userId: string, currency: string, max = 20) {
  const { data: files } = await admin.from("creator_files").select("creator_id").eq("user_id", userId).eq("status", "analyzed").in("kind", ["media_kit", "rate_card", "stats_screenshot"]).limit(500);
  const ids = Array.from(new Set((files || []).map((f) => f.creator_id)));
  if (!ids.length) return 0;
  const { data: rows } = await admin.from("creators").select("id, rates, rate_meta").eq("user_id", userId).in("id", ids);
  const needs = (rows || []).filter((r) => {
    const meta = normalizeRateMeta(r.rate_meta);
    const rates = (r.rates || {}) as Partial<Rates>;
    return (Object.keys(meta) as RateKey[]).some((k) => meta[k]?.status === "negotiated" && Number(rates[k]) > 0 && (!Number(meta[k]?.list) || Number(meta[k]?.list) === Number(rates[k])));
  }).slice(0, max);
  let fixed = 0;
  for (const r of needs) {
    const p = await loadProfile(admin, userId, r.id, currency);
    if (p?.fixFromKits("deal price checked against their media kit — ")) { await p.save(); fixed++; }
  }
  return fixed;
}

const verdictOf = (r: FileReading, name: string) =>
  (r.suspicious ? "Not used: the file contained instructions aimed at software" : r.kind === "other" ? `Not a media kit: ${r.summary}` : r.belongs === "no" ? `Belongs to someone else (${r.nameSeen || "another name"})` : r.belongs === "unclear" ? `Couldn't confirm it's ${name}'s — check it` : r.summary).slice(0, 240);

/** Read one stored file with AI and apply what it proves. Throws QuotaExhausted when every key is out. */
async function readFile(admin: Admin, p: Profile, file: FileRow, bytes: Uint8Array, mime: string, historical: boolean) {
  if (bytes.length > MAX_AI) {
    await admin.from("creator_files").update({ verdict: "Too large for the AI to read — open it to check", ai_attempts: 9 }).eq("id", file.id);
    return { verdict: "Too large for the AI to read", useful: false };
  }
  const handles = (p.c.socials || []).map((s) => s.handle || "").filter(Boolean).slice(0, 6);
  let reading: FileReading | null = null;
  try {
    reading = await readAttachment({ creator: p.c.name, handles, filename: file.filename, mime, base64: bytesToB64(bytes) });
  } catch (e) {
    if (e instanceof QuotaExhausted) throw e;
  }
  if (!reading) {
    await admin.from("creator_files").update({ ai_attempts: (file.ai_attempts || 0) + 1 }).eq("id", file.id);
    return { verdict: "", useful: false };
  }
  const useful = reading.kind !== "other" && reading.belongs === "yes" && !reading.suspicious;
  const verdict = verdictOf(reading, p.c.name);
  const status = useful ? "analyzed" : reading.kind === "other" || reading.suspicious || reading.belongs === "no" ? "rejected" : "stored";
  await admin.from("creator_files").update({ kind: reading.kind, status, verdict, ai_attempts: status === "stored" ? 9 : (file.ai_attempts || 0) + 1, analysis: { rates: reading.rates, audience: reading.audience, name_seen: reading.nameSeen, summary: reading.summary } }).eq("id", file.id);
  if (!useful) return { verdict, useful };
  const at = file.received_at || new Date().toISOString();
  if (hasAudience(reading.audience) && p.setAudience("verified", audienceBlock(reading.audience, { at, file_id: file.id, filename: file.filename, kind: reading.kind }), at)) {
    p.activities.push(`${p.c.name}'s audience updated from their ${reading.kind === "stats_screenshot" ? "stats screenshot" : "media kit"} (verified)`);
  }
  const priced = p.listPrices(reading.rates, at, "media_kit", file.filename, historical, "prices from their kit — ");
  // A deal already agreed on a price this kit lists: now it has its asking price (and its real %).
  p.kits = [...p.kits, { at, rates: reading.rates }];
  p.fixFromKits("deal price checked against their media kit — ");
  return { verdict: priced ? `${verdict} · prices updated` : verdict, useful };
}

// ---- links to a kit --------------------------------------------------------------

type KitLink = { url: string; label: string; download: string | null };
const LINK_RE = /https:\/\/[^\s<>"'()\]]+/gi;
const SOCIAL_HOST = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|twitter\.com|x\.com|twitch\.tv|kick\.com|facebook\.com|linkedin\.com|threads\.net|snapchat\.com|pinterest\.com|discord\.(gg|com)|patreon\.com|spotify\.com|apple\.com|amazon\.[a-z.]+|google\.com\/maps|calendly\.com)$/;
const safeDecode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };
const KIT_ANCHOR = /media[\s_-]?kit|rate[\s_-]?card|press[\s_-]?kit|one[\s_-]?pager|sponsorship deck|rates/i;
function kitLinks(text: string, subject: string, fromDriveShare = false): KitLink[] {
  const out = new Map<string, KitLink>();
  const subjectSaysKit = KIT_WORDS.test(subject) || fromDriveShare;
  for (const m of text.matchAll(LINK_RE)) {
    const url = m[0].replace(/[.,;:!]+$/, "");
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    const host = u.hostname.toLowerCase();
    const near = text.slice(Math.max(0, (m.index || 0) - 160), (m.index || 0) + url.length + 40);
    const context = subjectSaysKit || KIT_WORDS.test(near) || KIT_WORDS.test(safeDecode(u.pathname));
    let link: KitLink | null = null;
    const id = (re: RegExp) => (u.pathname.match(re) || u.search.match(/[?&]id=([\w-]{20,})/))?.[1] || "";
    if (/(^|\.)canva\.com$/.test(host) && /^\/design\//.test(u.pathname)) link = { url: `https://www.canva.com${u.pathname}`, label: "Canva media kit", download: null };
    else if (host === "drive.google.com" && context) { const f = id(/\/file\/d\/([\w-]{20,})/); if (f) link = { url: `https://drive.google.com/file/d/${f}/view`, label: "Google Drive media kit", download: `https://drive.usercontent.google.com/download?id=${f}&export=download&confirm=t` }; }
    else if (host === "docs.google.com" && context) {
      const kind = u.pathname.match(/^\/(presentation|document)\/d\/([\w-]{20,})/);
      if (kind) link = { url: `https://docs.google.com/${kind[1]}/d/${kind[2]}/view`, label: kind[1] === "presentation" ? "Google Slides media kit" : "Google Docs media kit", download: kind[1] === "presentation" ? `https://docs.google.com/presentation/d/${kind[2]}/export/pdf` : `https://docs.google.com/document/d/${kind[2]}/export?format=pdf` };
    } else if (/(^|\.)dropbox\.com$/.test(host) && context && /^\/(s|scl)\//.test(u.pathname)) { const d = new URL(url); d.searchParams.set("dl", "1"); link = { url, label: "Dropbox media kit", download: d.toString() }; }
    else if ((/(^|\.)(1drv\.ms|onedrive\.live\.com|notion\.site|beacons\.ai|figma\.com|behance\.net|issuu\.com|flipsnack\.com|wetransfer\.com|we\.tl|box\.com)$/.test(host)) && context) link = { url, label: "Media kit link", download: null };
    // Any other site, only when the words right next to the link say it's the kit ("Full Media Kit", "Rate card: …").
    if (!link && !SOCIAL_HOST.test(host) && !/(^|\.)(google\.com|dropbox\.com|canva\.com)$/.test(host)) {
      const start = m.index || 0;
      const before = text.slice(Math.max(0, start - 45), start);
      const after = text.slice(start + url.length, start + url.length + 35);
      if (KIT_ANCHOR.test(after) || KIT_ANCHOR.test(before) || KIT_ANCHOR.test(safeDecode(u.pathname))) link = { url, label: "Media kit link", download: null };
    }
    if (link && link.url.length <= 600) out.set(link.url, link);
  }
  return Array.from(out.values()).slice(0, 5);
}

/** Download a public kit from Google / Dropbox only (hosts fixed in code — no SSRF), ≤ 10 MB, real PDF/image only. */
async function fetchPublic(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const OK_HOST = /(^|\.)(google\.com|googleusercontent\.com|dropbox\.com|dropboxusercontent\.com)$/;
  let next = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!OK_HOST.test(new URL(next).hostname)) return null;
    const res = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) { const loc = res.headers.get("location"); if (!loc) return null; next = new URL(loc, next).toString(); continue; }
    if (!res.ok || !res.body || Number(res.headers.get("content-length") || 0) > MAX_STORE) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_STORE) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    const mime = sniff(bytes);
    return mime ? { bytes, mime } : null;
  }
  return null;
}

// ---- one email from a creator ------------------------------------------------------

export type MailCtx = { admin: Admin; userId: string; mailbox: string; currency: string; get: Fetcher; budget: { files: number; ai: number; bytes?: number }; historical?: boolean };

async function usedBytes(admin: Admin, userId: string) {
  const { data } = await admin.from("creator_files").select("size").eq("user_id", userId).eq("storage", "bucket");
  return (data || []).reduce((s, r) => s + (r.size || 0), 0);
}

async function storeFile(ctx: MailCtx, p: Profile, f: { bytes: Uint8Array; mime: string; filename: string; at: string; gmailId: string; partId: string; url?: string }) {
  const { admin, userId } = ctx;
  const hash = await sha256(f.bytes);
  const { data: dupe } = await admin.from("creator_files").select("id").eq("user_id", userId).eq("creator_id", p.c.id).eq("sha256", hash).maybeSingle();
  if (dupe) return null;
  const inBucket = f.bytes.length <= MAX_STORE && (await usedBytes(admin, userId)) + f.bytes.length <= USER_QUOTA;
  const path = inBucket ? `${userId}/${p.c.id}/${hash.slice(0, 16)}.${ALLOWED[f.mime]}` : "";
  if (inBucket) {
    const up = await admin.storage.from("creator-files").upload(path, f.bytes, { contentType: f.mime, upsert: true });
    if (up.error) return null;
  } else if (!f.gmailId || !f.partId) return null; // too big for storage and not in Gmail: can't keep it
  const filename = safeName(f.filename);
  const { data: row } = await admin.from("creator_files").insert({
    user_id: userId, creator_id: p.c.id, path, filename, mime: f.mime, size: f.bytes.length, sha256: hash, source: "gmail", gmail_id: f.gmailId, part_id: inBucket ? "" : f.partId,
    mailbox: ctx.mailbox, received_at: f.at, kind: looksLikeKit(filename) || f.url ? "media_kit" : "unknown", storage: inBucket ? "bucket" : "gmail", url: f.url || "",
  }).select("id, creator_id, path, filename, mime, size, received_at, storage, gmail_id, part_id, mailbox, kind, ai_attempts").maybeSingle();
  if (!row) return null;
  ctx.budget.files--;
  p.activities.push(`Saved “${filename}” from ${p.c.name}'s email${inBucket ? "" : " (kept in Gmail — too big for storage)"}`);
  return row as FileRow;
}

/** A big PDF/image left in Gmail: recorded by its place in the email, downloaded only when you open it. */
async function keepInGmail(ctx: MailCtx, p: Profile, att: Attachment, gmailId: string, at: string) {
  if (!att.partId || att.size > MAX_GMAIL) return false;
  const mime = ALLOWED[att.mime] ? att.mime : /\.pdf$/i.test(att.filename) ? "application/pdf" : /\.png$/i.test(att.filename) ? "image/png" : /\.jpe?g$/i.test(att.filename) ? "image/jpeg" : /\.webp$/i.test(att.filename) ? "image/webp" : "";
  if (!mime) return false;
  const hash = await sha256(new TextEncoder().encode(`gmail:${gmailId}:${att.partId}`));
  const filename = safeName(att.filename);
  const { error } = await ctx.admin.from("creator_files").insert({ user_id: ctx.userId, creator_id: p.c.id, path: "", filename, mime, size: att.size, sha256: hash, source: "gmail", gmail_id: gmailId, part_id: att.partId, mailbox: ctx.mailbox, received_at: at, kind: looksLikeKit(filename) ? "media_kit" : "unknown", storage: "gmail", url: "" });
  if (error) return false;
  ctx.budget.files--;
  p.activities.push(`Saved “${filename}” from ${p.c.name}'s email (kept in Gmail — too big for storage)`);
  return true;
}

async function tryAi(ctx: MailCtx) {
  return ctx.budget.ai > 0 && (await aiAllowed(ctx.admin, ctx.userId));
}

export async function processCreatorMail(ctx: MailCtx & { message: FullMessage; creatorId: string }) {
  const { admin, userId, message } = ctx;
  const p = await loadProfile(admin, userId, ctx.creatorId, ctx.currency);
  if (!p) return { files: 0, changes: 0, deferred: false };
  const historical = !!ctx.historical;
  const { text, attachments } = bodyOf(message);
  const subject = decodeEntities(message.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value || "").slice(0, 200);
  const at = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
  let saved = 0;
  let deferred = false;

  // ---- attachments ----
  for (const att of attachments) {
    if (ctx.budget.files <= 0) break;
    if (!declaredOk(att) || att.size > MAX_GMAIL || att.size < 15_000) continue; // signature logos & oversize
    if (att.inline && att.mime.startsWith("image/") && !looksLikeKit(att.filename) && att.size < 150_000) continue; // pictures in the signature/body
    if (att.size > MAX_STORE) {
      // Too big to hold in memory here: keep it in Gmail and record it. Its real type is checked when you download it.
      if (await keepInGmail(ctx, p, att, message.id, at)) saved++;
      continue;
    }
    if ((ctx.budget.bytes ?? Infinity) < att.size) { deferred = true; continue; } // this run has downloaded enough; the email is checked again next run
    if (ctx.budget.bytes !== undefined) ctx.budget.bytes -= att.size;
    const res = await ctx.get<{ data?: string }>(`/messages/${message.id}/attachments/${att.attachmentId}`).catch(() => null);
    if (!res?.data) continue;
    const bytes = b64urlToBytes(res.data);
    const real = sniff(bytes);
    if (!real || bytes.length > MAX_GMAIL) continue; // renamed executables, broken files…
    const row = await storeFile(ctx, p, { bytes, mime: real, filename: att.filename, at, gmailId: message.id, partId: att.partId });
    if (!row) continue;
    saved++;
    if (await tryAi(ctx)) {
      ctx.budget.ai--;
      try { await readFile(admin, p, row, bytes, real, historical); } catch (e) { if (e instanceof QuotaExhausted) ctx.budget.ai = 0; }
    }
  }

  // ---- links to a kit (Canva, Drive, Dropbox…) ----
  const from = message.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value || "";
  for (const link of kitLinks(text, subject, /drive-shares-(dm-)?noreply@google\.com/i.test(from))) {
    if (ctx.budget.files <= 0) break;
    const hash = await sha256(new TextEncoder().encode(link.url));
    const [{ data: byHash }, { data: byUrl }] = await Promise.all([
      admin.from("creator_files").select("id").eq("user_id", userId).eq("creator_id", p.c.id).eq("sha256", hash).limit(1),
      admin.from("creator_files").select("id").eq("user_id", userId).eq("creator_id", p.c.id).eq("url", link.url).limit(1),
    ]);
    if (byHash?.length || byUrl?.length) continue;
    const got = link.download ? await fetchPublic(link.download) : null;
    if (got) {
      const row = await storeFile(ctx, p, { bytes: got.bytes, mime: got.mime, filename: `${link.label}.${ALLOWED[got.mime]}`, at, gmailId: message.id, partId: "", url: link.url });
      if (row) {
        saved++;
        if (await tryAi(ctx)) { ctx.budget.ai--; try { await readFile(admin, p, row, got.bytes, got.mime, historical); } catch (e) { if (e instanceof QuotaExhausted) ctx.budget.ai = 0; } }
        continue;
      }
    }
    const { error } = await admin.from("creator_files").insert({ user_id: userId, creator_id: p.c.id, path: "", filename: link.label, mime: "text/uri-list", size: 0, sha256: hash, source: "gmail", gmail_id: message.id, mailbox: ctx.mailbox, received_at: at, kind: "media_kit", storage: "link", url: link.url, verdict: link.download ? "Shared privately — open the link to view it" : "Open the link to view it", ai_attempts: 9 });
    if (!error) { saved++; ctx.budget.files--; p.activities.push(`Saved the ${link.label.toLowerCase()} link from ${p.c.name}'s email`); }
  }

  // ---- what the email itself says: strict rules always, AI on top when it can ----
  // Rules are exact when they fire (a price list, "$2,500 for the integration
  // works for me"); the AI fills what rules can't read. On the same format the
  // rules win, so a bundle is never turned into a dedicated video.
  const rules = text.length > 5 ? readPrices(text) : { agreed: [] as PriceHit[], stated: [] as PriceHit[] };
  let stated: { key: RateKey; amount: number; currency: string }[] = [...rules.stated];
  let agreed: { key: RateKey; amount: number; currency: string }[] = [...rules.agreed];
  let evidence = rules.agreed[0]?.quote || rules.stated[0]?.quote || "";
  let fromAi = false;
  // The AI reads an email only when it adds something the rules couldn't, in
  // the part of the relationship where prices matter:
  //   • prices on the page that the rules didn't read (e.g. tangled wording), or
  //   • audience numbers when nothing verified is on file yet;
  //   • and only while talking terms (contacted → negotiating, inbound), or a
  //     signed creator writing new prices. Denied / not contacted: rules only.
  // Everything else — "thanks!", scheduling, already-read prices — costs no quota.
  const stage = p.c.pipeline_status || "contacted";
  const live = ["contacted", "no_reply", "replied", "negotiating", "inbound"].includes(stage) || (["roster", "signed"].includes(stage) && moneyMentions(text) > 0);
  const unread = moneyMentions(text) > rules.stated.length + rules.agreed.length;
  const audienceWanted = statesAudience(text) && !(p.audience as { verified?: unknown }).verified;
  const worthAi = live && (unread || audienceWanted);
  if (text.length > 20 && worthAi && mentionsMoneyOrAudience(text) && (await tryAi(ctx))) {
    ctx.budget.ai--;
    try {
      const claims = await readCreatorEmail({ creator: p.c.name, subject, body: ownText(text) || text, currentRates: p.rates });
      if (claims && !claims.suspicious && claims.confidence >= 0.7) {
        const add = <T extends { key: RateKey }>(base: T[], extra: T[]) => [...base, ...extra.filter((x) => !base.some((b) => b.key === x.key))];
        if (claims.agreement) { agreed = add(agreed, claims.agreement.items); evidence = evidence || claims.agreement.quote; fromAi = fromAi || !rules.agreed.length; }
        if (claims.statedRates.length) { stated = add(stated, claims.statedRates); evidence = evidence || subject; fromAi = fromAi || !rules.stated.length; }
        if (hasAudience(claims.audience) && p.setAudience("claimed", audienceBlock(claims.audience, { at, subject }), at)) p.activities.push(`${p.c.name} described their audience by email (not proven)`);
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) ctx.budget.ai = 0;
    }
  }
  const label = fromAi ? "" : "Read by rules: ";
  if (agreed.length && p.agree(agreed, at, `${label}“${evidence}”`, historical, "Agreed by email with")) p.reach("roster", at, `they agreed ${agreed.map((a) => `${a.amount.toLocaleString("en-US")} for ${a.key}`).join(", ")} by email`);
  else if (agreed.length) p.reach("roster", at, "they agreed a price by email");
  if (stated.length) {
    p.listPrices(stated, at, "email", `${label}“${evidence}”`, historical, `sent their prices${fromAi ? "" : " (read by rules)"} — `);
    p.reach("negotiating", at, "they sent their prices");
  }
  if (!fromAi) p.forget(at, [...stated, ...agreed].map((x) => x.key));
  // "Sounds good, let's do it" to the one price you offered just before = agreed.
  if (!agreed.length && !stated.length && isPlainYes(text) && message.threadId) {
    const thread = await ctx.get<{ messages?: FullMessage[] }>(`/threads/${message.threadId}?format=full`).catch(() => null);
    const before = (thread?.messages || []).filter((m) => Number(m.internalDate || 0) < Number(message.internalDate || 0));
    const last = before[before.length - 1];
    if (last && (last.labelIds || []).includes("SENT")) {
      const offer = readOffer(bodyOf(last).text);
      if (offer) {
        p.agree([offer], at, `They said yes to your offer: “${offer.quote}”`, historical, "Agreed by email with");
        p.reach("roster", at, `they said yes to your ${offer.amount.toLocaleString("en-US")} offer`);
      }
    }
  }

  await p.save();
  return { files: saved, changes: p.touched ? 1 : 0, deferred };
}

/** One of YOUR emails to a creator: an offer (→ Negotiating) or a yes to their price (→ agreed, Roster). */
export async function processMyMail(ctx: MailCtx & { message: FullMessage; creatorId: string }) {
  const p = await loadProfile(ctx.admin, ctx.userId, ctx.creatorId, ctx.currency);
  if (!p) return { files: 0, changes: 0, deferred: false };
  const { text } = bodyOf(ctx.message);
  const at = ctx.message.internalDate ? new Date(Number(ctx.message.internalDate)).toISOString() : new Date().toISOString();
  // Their asking prices: what they listed (not what was already negotiated down).
  const theirs = Object.fromEntries((Object.keys(p.rates) as RateKey[]).filter((k) => Number(p.rates[k]) > 0).map((k) => [k, listPrice(p.rates, p.meta, k)])) as Partial<Record<RateKey, number>>;
  const mine = readMine(text, theirs);
  if (mine.accepted) {
    p.agree([mine.accepted], at, `You agreed: “${mine.accepted.quote}”`, !!ctx.historical, "Agreed by email with");
    p.reach("roster", at, `you agreed ${mine.accepted.amount.toLocaleString("en-US")} by email`);
  } else if (mine.offer) p.reach("negotiating", at, `you offered ${mine.offer.amount.toLocaleString("en-US")} by email`);
  await p.save();
  return { files: 0, changes: mine.accepted ? 1 : 0, deferred: false };
}

// ---- files waiting for the AI (saved while it was off or out of quota) ----------------

const FILE_COLS = "id, creator_id, path, filename, mime, size, received_at, storage, gmail_id, part_id, mailbox, kind, ai_attempts";

async function fileBytes(admin: Admin, file: FileRow, get: Fetcher | null): Promise<Uint8Array | null> {
  if (file.storage === "bucket") {
    const { data: blob, error } = await admin.storage.from("creator-files").download(file.path);
    return error || !blob ? null : new Uint8Array(await blob.arrayBuffer());
  }
  if (file.storage === "gmail" && get) return gmailAttachment(get, file.gmail_id, file.part_id);
  return null;
}

/** A Gmail-kept attachment, found again by its part id (attachment ids change between reads). */
export async function gmailAttachment(get: Fetcher, gmailId: string, partId: string): Promise<Uint8Array | null> {
  const message = await get<FullMessage>(`/messages/${gmailId}?format=full`).catch(() => null);
  const att = message ? bodyOf(message).attachments.find((a) => a.partId === partId) : null;
  if (!att) return null;
  const res = await get<{ data?: string }>(`/messages/${gmailId}/attachments/${att.attachmentId}`).catch(() => null);
  return res?.data ? b64urlToBytes(res.data) : null;
}

/** Read up to `max` queued files — media kits first. Stops quietly when the quota is out. */
export async function drainQueue(ctx: { admin: Admin; userId: string; currency: string; mailbox: string; get: Fetcher; max: number; deadline: number }) {
  if (!aiEnabled() || ctx.max <= 0) return 0;
  const { data } = await ctx.admin.from("creator_files").select(FILE_COLS).eq("user_id", ctx.userId).eq("status", "stored").lt("ai_attempts", 3).in("storage", ["bucket", "gmail"]).order("received_at", { ascending: false }).limit(40);
  const queue = ((data || []) as FileRow[]).filter((f) => f.storage === "bucket" || f.mailbox === ctx.mailbox).sort((a, b) => Number(b.kind === "media_kit") - Number(a.kind === "media_kit"));
  let read = 0;
  for (const file of queue.slice(0, ctx.max)) {
    if (file.size > MAX_AI) { await ctx.admin.from("creator_files").update({ ai_attempts: 9, verdict: "Too large for the AI to read — open it to check" }).eq("id", file.id); continue; }
    if (Date.now() > ctx.deadline || !(await aiAllowed(ctx.admin, ctx.userId))) break;
    const bytes = await fileBytes(ctx.admin, file, ctx.get);
    const mime = bytes ? sniff(bytes) : null;
    if (!bytes || !mime) { await ctx.admin.from("creator_files").update({ ai_attempts: 9, verdict: "Couldn't open the file" }).eq("id", file.id); continue; }
    const p = await loadProfile(ctx.admin, ctx.userId, file.creator_id, ctx.currency);
    if (!p) continue;
    try { await readFile(ctx.admin, p, file, bytes, mime, true); } catch (e) { if (e instanceof QuotaExhausted) { await p.save(); break; } }
    await p.save();
    read++;
  }
  return read;
}

/** "Check it with AI" on one file (an upload, or one saved before AI was on). */
export async function analyzeStoredFile(admin: Admin, userId: string, fileId: string, currency: string, getFor: (mailbox: string) => Fetcher | null) {
  if (!aiEnabled()) return { error: "AI reading isn't set up on the server (add GEMINI_API_KEYS or ANTHROPIC_API_KEY)." };
  const { data: file } = await admin.from("creator_files").select(FILE_COLS).eq("id", fileId).eq("user_id", userId).maybeSingle();
  if (!file) return { error: "File not found." };
  const f = file as FileRow;
  if (f.storage === "link") return { error: "That's a link — open it to view the kit." };
  if (f.size > MAX_AI) return { error: "This file is too large for the AI to read — open it to check it yourself." };
  if (!(await aiAllowed(admin, userId))) return { error: "Daily AI limit reached — try again tomorrow." };
  const bytes = await fileBytes(admin, f, getFor(f.mailbox));
  const mime = bytes ? sniff(bytes) : null;
  if (!bytes || !mime) return { error: "Couldn't read the file." };
  const p = await loadProfile(admin, userId, f.creator_id, currency);
  if (!p) return { error: "Influencer not found." };
  try {
    const res = await readFile(admin, p, { ...f, ai_attempts: 0 }, bytes, mime, false);
    await p.save();
    if (!res.verdict) return { error: "Couldn't read this file — try again later." };
    return { verdict: res.verdict, updated: res.useful };
  } catch (e) {
    if (e instanceof QuotaExhausted) return { error: `Every AI key is out of quota — it's queued and will be read automatically${e.until ? ` after ${new Date(e.until).toUTCString().slice(17, 22)} UTC` : ""}.`, queued: true };
    throw e;
  }
}
