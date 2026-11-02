import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { aiEnabled, hasAudience, QuotaExhausted, readAttachment, readCreatorEmail, type AudienceFacts, type FileReading } from "../_shared/ai.ts";
import { decodeEntities } from "../_shared/leadScanner.ts";
import { negotiate, normalizeRateHistory, normalizeRateMeta, setListPrices, type RateEvent, type RateKey, type RateMetaMap, type Rates } from "../_shared/negotiation.ts";
import { isPlainYes, mentionsMoneyOrAudience, ownText, readOffer, readPrices } from "../_shared/priceReader.ts";

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

export const b64urlToBytes = (data: string) => {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((data.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
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

type CreatorRow = { id: string; name: string; rates: Partial<Rates> | null; rate_meta: unknown; rate_history: unknown; audience: Record<string, unknown> | null; socials: { handle?: string }[] | null };
type FileRow = { id: string; creator_id: string; path: string; filename: string; mime: string; size: number; received_at: string; storage: string; gmail_id: string; part_id: string; mailbox: string; kind: string; ai_attempts: number };

export async function aiAllowed(admin: Admin, userId: string) {
  if (!aiEnabled()) return false;
  const { data } = await admin.rpc("ai_take", { p_user: userId, p_limit: AI_DAILY_LIMIT });
  return data === true;
}

const audienceBlock = (facts: AudienceFacts, extra: Record<string, unknown>) => ({
  top_countries: facts.topCountries, age_ranges: facts.ageRanges, gender_female_pct: facts.genderFemalePct, avg_views: facts.avgViews,
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
  private manual: Set<RateKey>;
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
      return !changed || changed < at;
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
  agree(list: { key: RateKey; amount: number; currency: string }[], at: string, evidence: string, historical: boolean, label: string) {
    const prices = this.allowed(this.money(list), at, historical);
    if (!Object.keys(prices).length) return false;
    const done = negotiate(this.rates, this.meta, prices, { at, source: "email", evidence });
    if (!done.event) return false;
    this.rates = done.rates; this.meta = done.meta; this.history.unshift(done.event); this.touched = true;
    this.activities.push(`${label} ${this.c.name}: ${done.event.summary}`);
    return true;
  }
  setAudience(slot: "verified" | "claimed", block: Record<string, unknown>, at: string) {
    const prev = this.audience[slot] as { at?: string } | undefined;
    if (prev?.at && prev.at > at) return false; // a newer kit/claim already there
    this.audience[slot] = block; this.touched = true;
    return true;
  }
  async save() {
    if (this.touched) await this.admin.from("creators").update({ rates: this.rates, rate_meta: this.meta, rate_history: this.history.slice(0, 60), audience: this.audience }).eq("id", this.c.id).eq("user_id", this.userId);
    if (this.activities.length) await this.admin.from("activities").insert(this.activities.slice(0, 8).map((t) => ({ user_id: this.userId, text: t.slice(0, 500), at: new Date().toISOString(), entity_type: "creator", entity_id: this.c.id })));
    this.activities = [];
    this.touched = false;
  }
}

async function loadProfile(admin: Admin, userId: string, creatorId: string, currency: string) {
  const { data } = await admin.from("creators").select("id, name, rates, rate_meta, rate_history, audience, socials").eq("id", creatorId).eq("user_id", userId).maybeSingle();
  return data ? new Profile(data as CreatorRow, admin, userId, currency) : null;
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
  return { verdict: priced ? `${verdict} · prices updated` : verdict, useful };
}

// ---- links to a kit --------------------------------------------------------------

type KitLink = { url: string; label: string; download: string | null };
const LINK_RE = /https:\/\/[^\s<>"'()\]]+/gi;
function kitLinks(text: string, subject: string): KitLink[] {
  const out = new Map<string, KitLink>();
  const subjectSaysKit = KIT_WORDS.test(subject);
  for (const m of text.matchAll(LINK_RE)) {
    const url = m[0].replace(/[.,;:!]+$/, "");
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    const host = u.hostname.toLowerCase();
    const near = text.slice(Math.max(0, (m.index || 0) - 160), (m.index || 0) + url.length + 40);
    const context = subjectSaysKit || KIT_WORDS.test(near) || KIT_WORDS.test(decodeURIComponent(u.pathname));
    let link: KitLink | null = null;
    const id = (re: RegExp) => (u.pathname.match(re) || u.search.match(/[?&]id=([\w-]{20,})/))?.[1] || "";
    if (/(^|\.)canva\.com$/.test(host) && /^\/design\//.test(u.pathname)) link = { url: `https://www.canva.com${u.pathname}`, label: "Canva media kit", download: null };
    else if (host === "drive.google.com" && context) { const f = id(/\/file\/d\/([\w-]{20,})/); if (f) link = { url: `https://drive.google.com/file/d/${f}/view`, label: "Google Drive media kit", download: `https://drive.usercontent.google.com/download?id=${f}&export=download&confirm=t` }; }
    else if (host === "docs.google.com" && context) {
      const kind = u.pathname.match(/^\/(presentation|document)\/d\/([\w-]{20,})/);
      if (kind) link = { url: `https://docs.google.com/${kind[1]}/d/${kind[2]}/view`, label: kind[1] === "presentation" ? "Google Slides media kit" : "Google Docs media kit", download: kind[1] === "presentation" ? `https://docs.google.com/presentation/d/${kind[2]}/export/pdf` : `https://docs.google.com/document/d/${kind[2]}/export?format=pdf` };
    } else if (/(^|\.)dropbox\.com$/.test(host) && context && /^\/(s|scl)\//.test(u.pathname)) { const d = new URL(url); d.searchParams.set("dl", "1"); link = { url, label: "Dropbox media kit", download: d.toString() }; }
    else if ((/(^|\.)(1drv\.ms|onedrive\.live\.com|notion\.site|beacons\.ai|figma\.com|behance\.net|issuu\.com|flipsnack\.com|wetransfer\.com|we\.tl|box\.com)$/.test(host)) && context) link = { url, label: "Media kit link", download: null };
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

export type MailCtx = { admin: Admin; userId: string; mailbox: string; currency: string; get: Fetcher; budget: { files: number; ai: number }; historical?: boolean };

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

async function tryAi(ctx: MailCtx) {
  return ctx.budget.ai > 0 && (await aiAllowed(ctx.admin, ctx.userId));
}

export async function processCreatorMail(ctx: MailCtx & { message: FullMessage; creatorId: string }) {
  const { admin, userId, message } = ctx;
  const p = await loadProfile(admin, userId, ctx.creatorId, ctx.currency);
  if (!p) return { files: 0, changes: 0 };
  const historical = !!ctx.historical;
  const { text, attachments } = bodyOf(message);
  const subject = decodeEntities(message.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value || "").slice(0, 200);
  const at = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
  let saved = 0;

  // ---- attachments ----
  for (const att of attachments) {
    if (ctx.budget.files <= 0) break;
    if (!declaredOk(att) || att.size > MAX_GMAIL || att.size < 15_000) continue; // signature logos & oversize
    if (att.inline && att.mime.startsWith("image/") && !looksLikeKit(att.filename) && att.size < 150_000) continue; // pictures in the signature/body
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
  for (const link of kitLinks(text, subject)) {
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

  // ---- what the email itself says: AI when it can, strict rules otherwise ----
  let readByAi = false;
  if (text.length > 20 && mentionsMoneyOrAudience(text) && (await tryAi(ctx))) {
    ctx.budget.ai--;
    try {
      const claims = await readCreatorEmail({ creator: p.c.name, subject, body: ownText(text) || text, currentRates: p.rates });
      if (claims) {
        readByAi = true;
        if (!claims.suspicious && claims.confidence >= 0.7) {
          if (claims.agreement) p.agree(claims.agreement.items, at, claims.agreement.quote || subject, historical, "Negotiated with");
          else if (claims.statedRates.length) p.listPrices(claims.statedRates, at, "email", subject, historical, "sent their prices — ");
          if (hasAudience(claims.audience) && p.setAudience("claimed", audienceBlock(claims.audience, { at, subject }), at)) p.activities.push(`${p.c.name} described their audience by email (not proven)`);
        }
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) ctx.budget.ai = 0;
    }
  }
  if (!readByAi && text.length > 5) {
    const rules = readPrices(text);
    if (rules.agreed.length) p.agree(rules.agreed, at, `Read by rules: “${rules.agreed[0].quote}”`, historical, "Agreed by email with");
    if (rules.stated.length) p.listPrices(rules.stated, at, "email", `Read by rules: “${rules.stated[0].quote}”`, historical, "sent their prices (read by rules) — ");
    // "Sounds good!" to the one price you offered in this thread = agreed.
    if (!rules.agreed.length && !rules.stated.length && isPlainYes(text) && message.threadId) {
      const thread = await ctx.get<{ messages?: FullMessage[] }>(`/threads/${message.threadId}?format=full`).catch(() => null);
      const before = (thread?.messages || []).filter((m) => Number(m.internalDate || 0) < Number(message.internalDate || 0));
      const last = before[before.length - 1];
      if (last && (last.labelIds || []).includes("SENT")) {
        const offer = readOffer(bodyOf(last).text);
        if (offer) p.agree([offer], at, `They said yes to your offer: “${offer.quote}”`, historical, "Agreed by email with");
      }
    }
  }

  await p.save();
  return { files: saved, changes: p.touched ? 1 : 0 };
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
