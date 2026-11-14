import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { channelIdOf, uploadsPage, videoDetails, youtubeConfigured, YouTubeQuota, type FullVideo } from "../_shared/youtube.ts";
import { brandish, cleanName, combine, dealProof, DIRECTORY, domainFits, nameAsDomain, shortLinkDomain, hostKind, hostOf, knownIndex, linksToFollow, nameKey, namesIn, normalizeDomain, prettyName, readTranscript, readVideo, type Caption, type DealKind, type Known, type Mention, type Segment } from "../_shared/sponsors.ts";
import { brandTopics, contentProfile, TOPIC, TOPICS, topicLabel, videoTopics, type ContentVideo } from "../_shared/taxonomy.ts";
import { marketsOf, parseHtml, parseShopify, parseShopifyCollections, parseWoo, priceStats, readProgram, siteIsBrand, siteName, type Product, type SiteFacts } from "../_shared/brandSite.ts";
import { clefStatus, decide, useClefBudget, type ClefQuestion } from "../_shared/clef.ts";
import { listenConfigured, listenLeft, listenTo, useListenBudget } from "../_shared/listen.ts";
import { fetchTranscript, txConfigured, txLeft, txProviders } from "../_shared/transcriptApis.ts";
import { askBrand, searchSite, useBrandAskBudget } from "../_shared/brandAsk.ts";
import { companyCountry, duckSite, officialSite } from "../_shared/officialSite.ts";
import { clayCompany, clayPeople, hunterCompany, hunterPeople, mergePeople, siteLinkedin, wikidataLinkedin, type CompanyFacts, type People, type Person } from "../_shared/companyInfo.ts";
import { checkKey, cleanKey, hintOf, keyFor, openKey, sealKey, SERVICES, vaultKey, type KeyChoice, type Service } from "../_shared/memberKeys.ts";

// Brand ⇄ creator matching and "who works with whom" (see the migration
// 20261122000000_brand_match.sql for the tables).
//
// Actions (POST JSON):
//   cron            every 3 min, server only (x-cron-secret). In order, until
//                   the time runs out: creators never read → brands never
//                   researched → brands found in videos not checked yet →
//                   creators not read for a week → brands not researched for
//                   two weeks → listening to promoted clips nothing names.
//   scan_creator    {id}  read one of YOUR creators now (Scan button / just added)
//   research_brand  {id}  research one of YOUR brands now
//   status                what's queued, and today's AI allowance
//
// Reading a creator (YouTube ≈ 2–8 units, first read up to a year back, 150 videos):
//   uploads → full details of new videos (description, tags, YouTube's paid
//   label) → SponsorBlock segments (free, by hash prefix — the video id never
//   leaves in full) → short links followed to the real shop → rules
//   (_shared/sponsors.ts, _shared/taxonomy.ts) → Clef re-judges only what the
//   rules are unsure of → one row per brand with the evidence → their content mix.
// Researching a brand: their own site (plus the public Shopify / WooCommerce
// catalog), the affiliate / creator program page, Wikipedia when the site
// blocks robots — then what they sell, by topic (rules, Clef refines).
// Nothing here is a guess shown as fact: every finding keeps its source and a
// confidence, and your verdicts are never overwritten.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://localhost:5199"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READER_V = 7;
// Brand research version: 2 = Gemini reads sites that block robots or say too little.
const INTEL_V = 2;
const DAY = 86400_000;
const BACK_DAYS = 400;
// Full-year read: pages of 50 uploads per run (1 YouTube unit each), and a ceiling per creator.
const BACKFILL_PAGES = 4;
const MAX_VIDEOS = 1500;
type Backfill = { token?: string; done?: boolean; at?: string };
const RESCAN_DAYS = 7;
const BRAND_DAYS = 14;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type Social = { platform: string; url: string; handle?: string };
type CreatorRow = { id: string; user_id: string; name: string; socials: Social[] | null; youtube: Record<string, unknown> | null; created_at: string; archived_at: string | null };
type BrandRow = { id: string; user_id: string; name: string; domain: string | null; archived_at: string | null };
type VideoRow = {
  user_id: string; creator_id: string; video_id: string; title: string; published_at: string | null; secs: number; views: number; paid: boolean; tags: string[];
  description: string; topics: { key: string; share: number }[]; topics_by: string; mentions: Mention[]; segments: Segment[]; listen: { start: number; end: number; why: string } | null;
  listened_at: string | null; sb_at: string | null; reader_v: number; judged_at: string | null; updated_at?: string;
  transcript_status?: string; transcript_lang?: string; transcript_kind?: string; transcript_at?: string | null; transcript_hits?: { t: number; text: string }[]; transcript_tries?: number;
};

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
// Video text can hold broken characters (a lone half of an emoji, a NUL byte) that Postgres refuses as
// JSON — one such title used to make a creator's whole save fail. Every string is made well-formed first.
// One save may mix rows read back from the table (every column) with new ones built here: the database
// refuses a batch whose rows don't all have the same fields, so every video row gets every field.
const videoRow = (r: VideoRow) => ({
  transcript_status: "", transcript_lang: "", transcript_kind: "", transcript_at: null, transcript_hits: [], transcript_tries: 0,
  ...r,
});

// creator_videos without the two big text columns (description, tags): what every read needs.
const VIDEO_LIGHT = "user_id,creator_id,video_id,title,published_at,secs,views,paid,topics,topics_by,mentions,segments,listen,listened_at,sb_at,reader_v,judged_at,updated_at,transcript_status,transcript_lang,transcript_kind,transcript_at,transcript_hits,transcript_tries";
// What rebuilding who-works-with-whom reads.
const LINK_COLS = "user_id,creator_id,video_id,title,published_at,paid,mentions";

/** Description + tags for the rows that don't have them loaded yet (only those). */
async function fillText(admin: SupabaseClient, c: { id: string; user_id: string }, rows: VideoRow[]) {
  const want = rows.filter((r) => r.description === undefined);
  for (let i = 0; i < want.length; i += 150) {
    const part = want.slice(i, i + 150);
    const { data } = await admin.from("creator_videos").select("video_id,description,tags").eq("user_id", c.user_id).eq("creator_id", c.id).in("video_id", part.map((r) => r.video_id));
    const got = new Map(((data || []) as { video_id: string; description: string; tags: string[] }[]).map((d) => [d.video_id, d]));
    for (const r of part) { const d = got.get(r.video_id); r.description = d?.description || ""; r.tags = d?.tags || []; }
  }
}

/** Every video of a creator, just what the deal rebuild reads. */
async function linkRows(admin: SupabaseClient, userId: string, creatorId: string): Promise<VideoRow[]> {
  const all: VideoRow[] = [];
  for (let from = 0; from < MAX_VIDEOS; from += 1000) {
    const { data } = await admin.from("creator_videos").select(LINK_COLS).eq("user_id", userId).eq("creator_id", creatorId).range(from, from + 999);
    all.push(...((data || []) as unknown as VideoRow[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/**
 * Upsert videos in batches whose rows carry the SAME columns (PostgREST refuses mixed batches, PGRST102).
 * A row loaded without its text has no description/tags keys, so the stored text is left as it is.
 */
async function saveVideos(admin: SupabaseClient, rows: VideoRow[], at: string) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const row = wellFormed({ ...videoRow(r), updated_at: at }) as Record<string, unknown>;
    for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
    const sig = Object.keys(row).sort().join(",");
    (groups.get(sig) || groups.set(sig, []).get(sig)!).push(row);
  }
  for (const batch of groups.values()) for (let i = 0; i < batch.length; i += 80) {
    const { error } = await admin.from("creator_videos").upsert(batch.slice(i, i + 80));
    if (error) throw new Error(`save videos: ${error.message}`);
  }
}
function wellFormed<T>(v: T): T {
  if (typeof v === "string") return (((v as string).toWellFormed?.() ?? (v as string).replace(/[\uD800-\uDFFF]/g, "")).replace(/\u0000/g, "")) as T;
  if (Array.isArray(v)) return v.map(wellFormed) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, wellFormed(x)])) as T;
  return v;
}
const sha = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (x) => x.toString(16).padStart(2, "0")).join("");
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const youtubeOf = (socials: Social[] | null | undefined) => {
  const s = (socials || []).find((x) => x && x.platform === "YouTube" && (x.url || x.handle));
  return s ? s.url || `@${s.handle}` : "";
};

// ---- the web ------------------------------------------------------------------------

/** GET a page as text (size-capped). Null on network errors. */
async function getText(url: string, opts: { timeout?: number; max?: number; accept?: string } = {}): Promise<{ status: number; url: string; text: string; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: opts.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(opts.timeout || 12_000) });
    const max = opts.max || 2_500_000;
    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, url: res.url, text: "", type: res.headers.get("content-type") || "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < max) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
    reader.cancel().catch(() => null);
    const buf = new Uint8Array(Math.min(size, max));
    let off = 0;
    for (const c of chunks) { const take = Math.min(c.length, buf.length - off); buf.set(c.subarray(0, take), off); off += take; if (off >= buf.length) break; }
    return { status: res.status, url: res.url, text: new TextDecoder().decode(buf), type: res.headers.get("content-type") || "" };
  } catch { return null; }
}
const getJson = async (url: string) => {
  const r = await getText(url, { timeout: 15_000, max: 4_000_000, accept: "application/json" });
  if (!r || r.status !== 200 || !/json/i.test(r.type) && !/^\s*[[{]/.test(r.text)) return null;
  try { return JSON.parse(r.text); } catch { return null; }
};

/** Where a short / affiliate link really goes (cached forever — a link's target doesn't change). */
async function follow(admin: SupabaseClient, url: string): Promise<string> {
  const hash = (await sha(url)).slice(0, 40);
  const { data: hit } = await admin.from("link_cache").select("final").eq("url_hash", hash).maybeSingle();
  if (hit) return hit.final || "";
  let current = url, final = "";
  for (let hop = 0; hop < 7; hop++) {
    let res: Response;
    try { res = await fetch(current, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) }); } catch { break; }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); res.body?.cancel().catch(() => null); if (hostKind(hostOf(current)) !== "redirect") { final = current; break; } continue; }
    // Some trackers redirect from the page itself.
    const body = res.status === 200 ? (await res.text().catch(() => "")).slice(0, 60_000) : "";
    const meta = /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'>\s]+)/i.exec(body)?.[1] || /(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(body)?.[1];
    if (meta) { current = new URL(meta.replace(/&amp;/g, "&"), current).toString(); if (hostKind(hostOf(current)) !== "redirect") { final = current; break; } continue; }
    if (hostKind(hostOf(current)) !== "redirect") final = current;
    break;
  }
  await admin.from("link_cache").upsert({ url_hash: hash, final: final.slice(0, 1000) });
  return final;
}

/** SponsorBlock segments by hash prefix (the full video id is never sent). undefined = couldn't ask. */
async function sponsorBlock(id: string): Promise<Segment[] | undefined> {
  const prefix = (await sha(id)).slice(0, 4);
  const cats = encodeURIComponent(JSON.stringify(["sponsor", "selfpromo", "exclusive_access"]));
  const acts = encodeURIComponent(JSON.stringify(["skip", "full", "mute", "poi"]));
  try {
    const res = await fetch(`https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${cats}&actionTypes=${acts}`, { headers: { "User-Agent": "InfluenceFlow-CRM" }, signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return [];
    if (!res.ok) return undefined;
    const all = await res.json() as { videoID: string; segments: { category: string; actionType: string; segment: [number, number]; votes?: number; description?: string }[] }[];
    const mine = all.find((x) => x.videoID === id);
    return (mine?.segments || []).filter((s) => (s.votes ?? 0) >= -1).slice(0, 12).map((s) => ({ category: s.category, action: s.actionType, start: Math.round(s.segment[0] * 10) / 10, end: Math.round(s.segment[1] * 10) / 10, votes: s.votes ?? 0, ...(s.description ? { description: String(s.description).slice(0, 80) } : {}) }));
  } catch { return undefined; }
}

// ---- known brands ---------------------------------------------------------------------

async function knownFor(admin: SupabaseClient, userId: string): Promise<{ known: Known[]; brands: BrandRow[] }> {
  const [{ data: brands }, { data: seen }] = await Promise.all([
    admin.from("brands").select("id, user_id, name, domain, archived_at").eq("user_id", userId).limit(3000),
    admin.from("seen_brands").select("brand_key, name, domain, domain_check").eq("user_id", userId).neq("domain", "").limit(5000),
  ]);
  const known: Known[] = [];
  for (const b of (brands || []) as BrandRow[]) {
    const d = normalizeDomain(b.domain || "");
    if (b.name && (d || b.name.length >= 3)) known.push({ key: d || nameKey(b.name), name: b.name, domain: d, aliases: [b.name.replace(/\s+(gaming|tech|official|store|inc\.?|llc|co\.?)$/i, "")] });
  }
  for (const s of (seen || []) as { brand_key: string; name: string; domain: string; domain_check: string }[]) {
    if (s.domain && ["site", "guess", "link"].includes(s.domain_check)) known.push({ key: s.domain, name: s.name, domain: s.domain });
  }
  return { known, brands: (brands || []) as BrandRow[] };
}

// ---- Clef: unsure calls only ---------------------------------------------------------------

const JUDGE: Record<string, string> = {
  sponsored: "The brand paid for this video or an ad read in it: 'sponsored by', 'thanks to X for sponsoring', a discount-code ad read, YouTube's paid-promotion label for this brand.",
  seeded: "The brand sent, lent or gave the creator the product (review unit, sample, 'X sent me this'), with no paid ad read.",
  affiliate: "Only an affiliate link or discount code that earns the creator a commission — no ad read, nothing sent.",
  own: "The creator's own product, store, merch, course, app, company or channel.",
  mention: "The brand is only mentioned, reviewed, compared or linked — no deal with it.",
  not_brand: "Not a company or brand at all (a person, a product type, a game, a place, a phrase).",
};

/** Ask Clef about the mentions the rules are unsure of. Changes them in place. */
async function judge(creator: string, rows: VideoRow[]) {
  const todo: { row: VideoRow; m: Mention }[] = [];
  for (const row of rows) for (const m of row.mentions) if (!m.store && (m.unsure || (m.confidence >= 0.4 && m.confidence < 0.85))) todo.push({ row, m });
  for (let i = 0; i < Math.min(todo.length, 60); i += 15) {
    const batch = todo.slice(i, i + 15);
    const state: Record<string, unknown> = { creator };
    const questions: Record<string, ClefQuestion> = {};
    batch.forEach(({ row, m }, k) => {
      const lines = (row.description || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const at = lines.findIndex((l) => l.includes(m.quote.slice(0, 40)) || l.toLowerCase().includes(m.name.toLowerCase()));
      const excerpt = (at >= 0 ? lines.slice(Math.max(0, at - 1), at + 2) : [m.quote]).join("\n").slice(0, 500);
      state[`item${k}`] = { video_title: row.title.slice(0, 140), youtube_paid_promotion_label: row.paid, sponsor_segment_marked: row.segments.some((s) => s.category === "sponsor"), brand: m.name, brand_website: m.domain || "unknown", text: excerpt };
      // A plain affiliate / referral link can be confirmed or dropped, never promoted to a paid deal: the
      // paid label is about the video, not this brand (a referral in every description isn't the sponsor).
      const criteria = m.kind === "affiliate" && !m.unsure ? { affiliate: JUDGE.affiliate, own: JUDGE.own, mention: JUDGE.mention, not_brand: JUDGE.not_brand } : JUDGE;
      questions[`item${k}`] = { type: "choice", instructions: `Look at item${k}. How is the creator connected to the brand "${m.name}" in that video? YouTube's paid-promotion label and a marked sponsor segment say SOMETHING in the video is paid — not that this brand is.`, criteria };
    });
    const answers = await decide(state, questions);
    if (!answers) return;
    batch.forEach(({ m, row }, k) => {
      const a = answers[`item${k}`];
      if (!a?.choice) return;
      const p = a.probs?.[a.choice] ?? a.confidence ?? 0;
      if (["sponsored", "seeded", "affiliate"].includes(a.choice) && p >= 0.5) {
        m.kind = a.choice as DealKind;
        m.confidence = Math.min(0.96, Math.round((0.45 * m.confidence + 0.55 * p + 0.05) * 100) / 100);
        m.signals = Array.from(new Set([...m.signals, "ai" as const]));
      } else if (p >= 0.6) {
        // Clef says it isn't a deal: an explicit "sponsored by" line keeps a doubt, anything else drops out.
        m.confidence = m.confidence >= 0.85 ? 0.55 : Math.min(m.confidence, 0.25);
        m.signals = Array.from(new Set([...m.signals, "ai" as const]));
      }
      m.unsure = false;
      row.judged_at = new Date().toISOString();
    });
  }
}

/** Clef names the topic of videos the rules couldn't place. */
async function refineTopics(creator: string, rows: VideoRow[], extra: string[]) {
  const unclear = rows.filter((r) => !r.topics.length && r.topics_by === "rules").slice(0, 36);
  if (!unclear.length) return;
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.topics) counts.set(t.key, (counts.get(t.key) || 0) + t.share);
  const options = Array.from(new Set([...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 9), ...extra])).filter((k) => TOPIC.has(k)).slice(0, 15);
  if (!options.length) return;
  const criteria: Record<string, string> = Object.fromEntries(options.map((k) => [k, topicLabel(k)]));
  criteria.other = "Something else / none of these";
  for (let i = 0; i < unclear.length; i += 18) {
    const batch = unclear.slice(i, i + 18);
    const state: Record<string, unknown> = { channel: creator, videos: Object.fromEntries(batch.map((r, k) => [`v${k}`, `${r.title.slice(0, 120)}${r.tags.length ? ` · tags: ${r.tags.slice(0, 6).join(", ").slice(0, 120)}` : ""}`])) };
    const questions: Record<string, ClefQuestion> = Object.fromEntries(batch.map((_, k) => [`v${k}`, { type: "choice", instructions: `What is video v${k} mostly about?`, criteria } as ClefQuestion]));
    const answers = await decide(state, questions);
    if (!answers) return;
    batch.forEach((r, k) => {
      const a = answers[`v${k}`];
      if (!a?.choice) return;
      r.topics_by = "ai";
      const p = a.probs?.[a.choice] ?? a.confidence ?? 0;
      if (a.choice !== "other" && p >= 0.45) r.topics = [{ key: a.choice, share: 1 }];
    });
  }
}

// ---- reading one creator ------------------------------------------------------------------

type ScanResult = { videos: number; newVideos: number; links: number; status: string; backfilling?: boolean };

async function scanCreator(admin: SupabaseClient, c: CreatorRow, deadline: number, opts: { force?: boolean } = {}): Promise<ScanResult> {
  const now = new Date();
  const saveStatus = (status: string, note = "") => admin.from("creator_content").upsert({ creator_id: c.id, user_id: c.user_id, status, note: note.slice(0, 200), scanned_at: now.toISOString(), updated_at: now.toISOString() });
  let channel = typeof c.youtube?.channel_id === "string" ? c.youtube.channel_id : "";
  if (!/^UC[\w-]{22}$/.test(channel)) {
    const link = youtubeOf(c.socials);
    channel = link ? (await channelIdOf(link)) || "" : "";
  }
  if (!channel) { await saveStatus("no_channel"); return { videos: 0, newVideos: 0, links: 0, status: "no_channel" }; }

  // Every stored video WITHOUT its description and tags (half the table's size): the text is fetched
  // below only for the videos read again or shown to the AI. Loading all of it on every read was most
  // of the project's data transfer.
  const oldRows: VideoRow[] = [];
  for (let from = 0; from < MAX_VIDEOS; from += 1000) {
    const { data } = await admin.from("creator_videos").select(opts.force ? "*" : VIDEO_LIGHT).eq("user_id", c.user_id).eq("creator_id", c.id).order("published_at", { ascending: false }).range(from, from + 999);
    oldRows.push(...((data || []) as unknown as VideoRow[]));
    if (!data || data.length < 1000) break;
  }
  const rows = new Map<string, VideoRow>(oldRows.map((r) => [r.video_id, r]));
  const first = rows.size === 0;
  const since = now.getTime() - BACK_DAYS * DAY;
  const { data: cc } = await admin.from("creator_content").select("backfill").eq("creator_id", c.id).maybeSingle();
  // Where the full-year read stands. Creators read before it existed (capped at 150) start again from the top,
  // skipping what is stored — 1 YouTube unit per 50 videos.
  let backfill = (cc?.backfill || {}) as Backfill;
  if (backfill.done === undefined) backfill = { token: "", done: first ? false : oldRows.length < 140, at: now.toISOString() };

  // 1. Which uploads are new (or were read by older rules): newest first until 12 known in a row.
  const want: string[] = [];
  let token = "", pages = 0, knownRun = 0;
  const take = (items: { id: string; at: string }[]) => {
    for (const it of items) {
      if (it.at && new Date(it.at).getTime() < since) return "old";
      const old = rows.get(it.id);
      if (!old || old.reader_v < READER_V || opts.force && !old.description && (old.paid || old.mentions.length)) { want.push(it.id); knownRun = 0; }
      else if (++knownRun >= 12 && !first) return "known";
    }
    return "";
  };
  headLoop: while (pages < (first ? 3 : 2)) {
    const page = await uploadsPage(channel, token);
    pages++;
    const stop = take(page.items);
    if (stop === "old" || !page.next) { if (first) backfill = { token: "", done: true, at: now.toISOString() }; break headLoop; }
    if (stop === "known") break headLoop;
    token = page.next;
    if (first) backfill = { token, done: false, at: now.toISOString() };
    if (Date.now() > deadline - 25_000) break;
  }
  // 1b. The rest of the year, a few pages a run, until a year back (no 150-video cap).
  knownRun = -1e9;
  for (let p = 0; !backfill.done && p < BACKFILL_PAGES && want.length < 250 && Date.now() < deadline - 40_000; p++) {
    const page = await uploadsPage(channel, backfill.token || "");
    const stop = take(page.items);
    backfill = stop === "old" || !page.next || rows.size + want.length >= MAX_VIDEOS ? { token: "", done: true, at: now.toISOString() } : { token: page.next, done: false, at: now.toISOString() };
  }
  const fresh: FullVideo[] = want.length ? (await videoDetails(want.slice(0, 250))).filter((v) => v.live === "none" || v.live === "") : [];

  // 2. SponsorBlock: new long videos from the last 18 months, and recent ones again (segments come in after release).
  const sbWanted = [
    ...fresh.filter((v) => v.secs > 70 && Date.now() - new Date(v.at).getTime() < 548 * DAY).map((v) => v.id),
    ...[...rows.values()].filter((r) => r.secs > 70 && r.published_at && Date.now() - new Date(r.published_at).getTime() < 30 * DAY && (!r.sb_at || Date.now() - new Date(r.sb_at).getTime() > 3 * DAY)).map((r) => r.video_id),
  ];
  const sbIds = Array.from(new Set(sbWanted)).slice(0, 160);
  const sb = new Map<string, Segment[]>();
  if (sbIds.length && Date.now() < deadline - 20_000) {
    const got = await pool(sbIds, 8, async (id) => [id, await sponsorBlock(id)] as const);
    for (const [id, segs] of got) if (segs) sb.set(id, segs);
  }

  // 3. Short links → the real shop (each link once, ever).
  const { known } = await knownFor(admin, c.user_id);
  const handle = typeof c.youtube?.handle === "string" ? c.youtube.handle : "";
  const ownDomains = (c.socials || []).filter((s) => s && !["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "Facebook", "LinkedIn", "Snapchat", "Pinterest", "Threads", "WhatsApp"].includes(s.platform)).map((s) => normalizeDomain(s.url)).filter(Boolean);
  const toFollow = Array.from(new Set(fresh.flatMap((v) => linksToFollow(v.description)))).slice(0, 60);
  const resolved: Record<string, string> = {};
  if (toFollow.length && Date.now() < deadline - 15_000) {
    const got = await pool(toFollow, 6, async (u) => [u, Date.now() < deadline - 10_000 ? await follow(admin, u) : ""] as const);
    for (const [u, f] of got) if (f) resolved[u] = f;
  }
  const ctx = { creator: c.name, handle, ownDomains, known, resolved };

  // The text of the stored videos that will be read again (older rules, new SponsorBlock segments)
  // or shown to the AI (the newest 60) — and nothing else.
  {
    const freshIds = new Set(fresh.map((v) => v.id));
    const newest = [...rows.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 60);
    const need = [...rows.values()].filter((r) => !freshIds.has(r.video_id) && (r.reader_v < READER_V || sb.has(r.video_id) || newest.includes(r)));
    await fillText(admin, c, need);
  }

  // 4. Read every new video; re-read old ones whose SponsorBlock segments changed.
  const touched: VideoRow[] = [];
  for (const v of fresh) {
    const segments = sb.get(v.id) || rows.get(v.id)?.segments || [];
    const reading = readVideo({ id: v.id, title: v.title, description: v.description, tags: v.tags, paid: v.paid, segments, at: v.at, secs: v.secs }, ctx);
    const lead = v.description.split(/\r?\n/).filter((l) => l.trim() && !/https?:\/\//.test(l)).slice(0, 2).join(" ");
    const keep = reading.mentions.length > 0 || v.paid || segments.some((s) => s.category === "sponsor" || s.category === "exclusive_access");
    const old = rows.get(v.id);
    const row: VideoRow = {
      user_id: c.user_id, creator_id: c.id, video_id: v.id, title: v.title, published_at: v.at || null, secs: v.secs, views: v.views, paid: v.paid, tags: v.tags.slice(0, 20),
      description: keep ? v.description.slice(0, 4000) : "", topics: videoTopics({ title: v.title, tags: v.tags, lead }), topics_by: old?.topics_by === "ai" && !old.topics.length ? "ai" : "rules",
      mentions: reading.mentions, segments, listen: old?.listened_at ? null : reading.listen || null, listened_at: old?.listened_at || null,
      sb_at: sb.has(v.id) ? now.toISOString() : old?.sb_at || null, reader_v: READER_V, judged_at: null,
    };
    // What was heard in an earlier listen stays.
    if (old?.listened_at || old?.transcript_status === "ok") row.mentions = [...row.mentions, ...old.mentions.filter((m) => (m.signals.includes("voice") || m.signals.includes("transcript")) && !row.mentions.some((x) => x.key === m.key))];
    rows.set(v.id, row);
    touched.push(row);
  }
  // Older videos the paging didn't reach, read by older rules: read again from what is stored (no API call).
  for (const r of rows.values()) {
    if (r.reader_v >= READER_V || touched.includes(r)) continue;
    const reading = readVideo({ id: r.video_id, title: r.title, description: r.description, tags: r.tags, paid: r.paid, segments: r.segments, at: r.published_at || "", secs: r.secs }, ctx);
    r.mentions = [...reading.mentions, ...r.mentions.filter((m) => (m.signals.includes("voice") || m.signals.includes("transcript")) && !reading.mentions.some((x) => x.key === m.key))];
    r.reader_v = READER_V; r.judged_at = null;
    touched.push(r);
  }
  for (const [id, segs] of sb) {
    const r = rows.get(id);
    if (!r || touched.includes(r)) continue;
    r.sb_at = now.toISOString();
    if (JSON.stringify(segs) === JSON.stringify(r.segments)) { touched.push(r); continue; }
    r.segments = segs;
    const reading = readVideo({ id, title: r.title, description: r.description, tags: r.tags, paid: r.paid, segments: segs, at: r.published_at || "", secs: r.secs }, ctx);
    r.mentions = [...reading.mentions, ...r.mentions.filter((m) => (m.signals.includes("voice") || m.signals.includes("transcript")) && !reading.mentions.some((x) => x.key === m.key))];
    if (!r.listened_at) r.listen = reading.listen || null;
    r.judged_at = null;
    touched.push(r);
  }

  // 5. The AI looks only at what the rules were unsure of.
  if (Date.now() < deadline - 12_000) {
    const recent = [...rows.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 60);
    const before = new Set(recent.filter((r) => r.topics_by === "ai").map((r) => r.video_id));
    await refineTopics(c.name, recent, ["pc_builds", "pc_cases", "gpus", "desk_furniture", "car_accessories", "software"]);
    for (const r of recent) if (r.topics_by === "ai" && !before.has(r.video_id) && !touched.includes(r)) touched.push(r);
    await judge(c.name, touched.filter((r) => !r.judged_at));
  }

  // 6. Save the videos.
  await saveVideos(admin, touched, now.toISOString());

  // 7. One row per brand, and the content mix.
  const links = await rebuildLinks(admin, c, [...rows.values()]);
  const recent = [...rows.values()].filter((r) => r.published_at).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 60);
  const profile = contentProfile(recent.map((r): ContentVideo => ({ id: r.video_id, title: r.title, at: r.published_at || "", secs: r.secs, topics: r.topics })), now, recent.some((r) => r.topics_by === "ai") ? "rules+ai" : "rules");
  await admin.from("creator_content").upsert({ creator_id: c.id, user_id: c.user_id, content: profile, status: recent.length ? "ok" : "empty", note: "", backfill, scanned_at: now.toISOString(), updated_at: now.toISOString() });
  return { videos: rows.size, newVideos: fresh.length, links, status: recent.length ? "ok" : "empty", backfilling: !backfill.done };
}

/** creator_brands for one creator from all their videos. Your verdicts and hand-added links stay. */
async function rebuildLinks(admin: SupabaseClient, c: CreatorRow, rows: VideoRow[]): Promise<number> {
  const items = rows.flatMap((r) => r.mentions.filter((m) => m.confidence >= 0.3).map((m) => ({ video: { id: r.video_id, title: r.title, at: r.published_at || "" }, m })));
  const links = combine(items).filter((l) => l.confidence >= 0.4);
  const { brands } = await knownFor(admin, c.user_id);
  const byDomain = new Map<string, string>(), byName = new Map<string, string>();
  for (const b of brands) {
    if (b.archived_at) continue;
    const d = normalizeDomain(b.domain || "");
    if (d && !byDomain.has(d)) byDomain.set(d, b.id);
    const n = b.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (n.length >= 3 && !byName.has(n)) byName.set(n, b.id);
  }
  const { data: existing } = await admin.from("creator_brands").select("id, brand_key, verdict, manual").eq("user_id", c.user_id).eq("creator_id", c.id);
  const keep = new Set(links.map((l) => l.key));
  const now = new Date().toISOString();
  const payload = links.map((l) => ({
    user_id: c.user_id, creator_id: c.id, brand_key: l.key, brand_name: l.name.slice(0, 80), domain: l.domain,
    brand_id: (l.domain && byDomain.get(l.domain)) || byName.get(l.name.toLowerCase().replace(/[^a-z0-9]+/g, "")) || null,
    kind: l.kind, confidence: l.confidence, store: l.store, videos: l.videos, first_at: l.first || null, last_at: l.last || null, evidence: l.evidence,
    by_ai: l.evidence.some((e) => e.signals.includes("ai") || e.signals.includes("voice")), video_ids: l.videoIds, updated_at: now,
  }));
  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await admin.from("creator_brands").upsert(wellFormed(payload.slice(i, i + 100)), { onConflict: "user_id,creator_id,brand_key" });
    if (error) throw new Error(`save links: ${error.message}`);
  }
  const gone = ((existing || []) as { id: string; brand_key: string; verdict: string; manual: boolean }[]).filter((e) => !keep.has(e.brand_key) && !e.verdict && !e.manual).map((e) => e.id);
  if (gone.length) await admin.from("creator_brands").delete().in("id", gone).eq("user_id", c.user_id);
  // Brands not in the CRM: remember them for the "Found in videos" list — brand deals only
  // (shops and affiliate links aren't brands an agency pitches).
  const seen = payload.filter((p) => !p.brand_id && !p.store && p.kind !== "affiliate").map((p) => ({ user_id: c.user_id, brand_key: p.brand_key, name: p.brand_name, domain: p.domain }));
  if (seen.length) await admin.from("seen_brands").upsert(wellFormed(seen), { onConflict: "user_id,brand_key", ignoreDuplicates: true });
  return links.length;
}

// ---- listening ----------------------------------------------------------------------------

async function listenSome(admin: SupabaseClient, deadline: number): Promise<number> {
  if (!listenConfigured() || (await listenLeft()) <= 0) return 0;
  // A video whose captions were read (helper or a transcript service) already has its spoken words: no need to listen.
  const { data } = await admin.from("creator_videos").select("*").not("listen", "is", null).is("listened_at", null).neq("transcript_status", "ok").order("paid", { ascending: false }).order("published_at", { ascending: false }).limit(6);
  let done = 0;
  const changed = new Map<string, CreatorRow>();
  for (const r of (data || []) as VideoRow[]) {
    if (Date.now() > deadline - 45_000 || !r.listen) break;
    const heard = await listenTo(r.video_id, r.listen.start, r.listen.end);
    if (heard === null) break;
    const { known } = await knownFor(admin, r.user_id);
    const idx = knownIndex([...known, ...DIRECTORY]);
    for (const h of heard) {
      if (h.kind !== "sponsored" && h.kind !== "seeded" && h.kind !== "affiliate") continue;
      const k = idx.byName.get(h.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "")) || namesIn(h.name, idx)[0];
      const domain = k?.domain || h.domain;
      // Heard with their own words = strong; a bare "Werbung" / empty quote = possible only.
      const said = h.quote.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean).length >= 4;
      const m: Mention = { key: domain || nameKey(h.name), name: k?.name || h.name, domain, domainFrom: k?.domain ? "known" : "", kind: h.kind, confidence: !said ? 0.55 : h.kind === "sponsored" ? 0.84 : h.kind === "seeded" ? 0.8 : 0.66, signals: ["voice", ...(r.paid ? ["paid_label" as const] : [])], quote: `“${h.quote}”`, t: r.listen.start };
      if (!r.mentions.some((x) => x.key === m.key && x.confidence >= m.confidence)) r.mentions = [...r.mentions.filter((x) => x.key !== m.key), m];
    }
    r.listened_at = new Date().toISOString();
    await admin.from("creator_videos").update({ mentions: r.mentions, listened_at: r.listened_at, updated_at: r.listened_at }).eq("user_id", r.user_id).eq("creator_id", r.creator_id).eq("video_id", r.video_id);
    const { data: c } = await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").eq("id", r.creator_id).eq("user_id", r.user_id).maybeSingle();
    if (c) changed.set(c.id, c as CreatorRow);
    done++;
  }
  for (const c of changed.values()) {
    // Every video of the creator (it used to be the first 400: deals from older videos were dropped).
    await rebuildLinks(admin, c, await linkRows(admin, c.user_id, c.id));
  }
  return done;
}

type TxItem = { id: string; status: "ok" | "none" | "error"; lang: string; kind: string; caps: Caption[] };
/**
 * Captions read for a member's videos — by the helper in their browser or by a transcript service — are
 * read for spoken sponsors, saved, and who-works-with-whom is rebuilt. One path for both sources.
 */
async function applyTranscripts(admin: SupabaseClient, userId: string, items: TxItem[]): Promise<{ saved: number; found: number }> {
  if (!items.length) return { saved: 0, found: 0 };
  // Only this member's own videos.
  const { data: own } = await admin.from("creator_videos").select("*").eq("user_id", userId).in("video_id", items.map((i) => i.id));
  const rowsById = new Map<string, VideoRow[]>();
  for (const r of (own || []) as VideoRow[]) rowsById.set(r.video_id, [...(rowsById.get(r.video_id) || []), r]);
  const { known } = await knownFor(admin, userId);
  const creatorIds = Array.from(new Set(((own || []) as VideoRow[]).map((r) => r.creator_id)));
  const { data: people } = creatorIds.length ? await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").eq("user_id", userId).in("id", creatorIds) : { data: [] };
  const byCreator = new Map(((people || []) as CreatorRow[]).map((c) => [c.id, c]));
  const now = new Date().toISOString();
  const changed: VideoRow[] = [];
  let found = 0;
  for (const it of items) for (const r of rowsById.get(it.id) || []) {
    if (it.status === "error") { const tries = (r.transcript_tries || 0) + 1; changed.push({ ...r, transcript_tries: tries, transcript_status: tries >= 3 ? "error" : "", transcript_at: now }); continue; }
    if (it.status === "none") { changed.push({ ...r, transcript_status: "none", transcript_at: now, transcript_hits: [] }); continue; }
    const c = byCreator.get(r.creator_id);
    const ownDomains = (c?.socials || []).filter((x) => x && !["YouTube", "Instagram", "TikTok", "X", "Twitch", "Kick", "Facebook", "LinkedIn", "Snapchat", "Pinterest", "Threads", "WhatsApp"].includes(x.platform)).map((x) => normalizeDomain(x.url)).filter(Boolean);
    const base = r.mentions.filter((m) => !m.signals.includes("transcript"));
    const heard = readTranscript(it.caps, { creator: c?.name || "", handle: typeof c?.youtube?.handle === "string" ? c.youtube.handle : "", ownDomains, known, resolved: {}, local: base, paid: r.paid });
    // The same brand from the description and from their words: one finding with both signals.
    const merged = [...base];
    for (const m of heard.mentions) {
      const i = merged.findIndex((x) => x.key === m.key);
      if (i < 0) { merged.push(m); continue; }
      const x = merged[i];
      const spokenWins = m.confidence >= x.confidence || (x.kind === "affiliate" && m.kind !== "affiliate");
      merged[i] = { ...(spokenWins ? m : x), domain: x.domain || m.domain, domainFrom: x.domain ? x.domainFrom : m.domainFrom, signals: Array.from(new Set([...x.signals, ...m.signals])), confidence: Math.min(0.97, Math.max(x.confidence, m.confidence) + (x.kind === m.kind ? 0.04 : 0)), t: m.t ?? x.t };
    }
    if (heard.notSponsored) for (const m of merged) if (m.kind === "sponsored" && !/sponsor/i.test(m.quote)) m.confidence = Math.min(m.confidence, 0.35);
    const deal = heard.mentions.some((m) => m.kind !== "affiliate" && m.confidence >= 0.8);
    found += heard.mentions.filter((m) => m.kind !== "affiliate").length;
    changed.push({ ...r, mentions: merged, listen: deal ? null : r.listen, transcript_status: "ok", transcript_lang: it.lang, transcript_kind: it.kind, transcript_at: now, transcript_hits: heard.hits, judged_at: null });
  }
  if (changed.length) {
    await saveVideos(admin, changed, now);
  }
  // Who works with whom, again for the creators whose videos changed.
  for (const cid of Array.from(new Set(changed.filter((r) => r.transcript_status === "ok").map((r) => r.creator_id)))) {
    const c = byCreator.get(cid);
    if (!c) continue;
    await rebuildLinks(admin, c, await linkRows(admin, userId, cid)).catch(() => 0);
  }
  return { saved: changed.length, found };
}

/** Priority captions from the transcript services (free allowances): paid-labelled videos with no brand
 *  named in writing first (the listening queue), then other paid videos — so the videos most likely to
 *  hold a deal get read even when nobody has a CRM tab open. Whatever is left waits for the helper. */
async function txSome(admin: SupabaseClient, deadline: number): Promise<number> {
  if (!txConfigured()) return 0;
  const left = Math.min(5, await txLeft(admin));
  if (left <= 0) return 0;
  const since = new Date(Date.now() - 400 * DAY).toISOString();
  const base = () => admin.from("creator_videos").select("user_id, video_id").eq("transcript_status", "").gt("secs", 60).gte("published_at", since);
  const { data: a } = await base().not("listen", "is", null).order("paid", { ascending: false }).order("published_at", { ascending: false }).limit(left);
  const { data: b } = (a || []).length < left ? await base().eq("paid", true).is("listen", null).order("published_at", { ascending: false }).limit(left - (a || []).length) : { data: [] };
  let done = 0;
  for (const v of [...(a || []), ...(b || [])] as { user_id: string; video_id: string }[]) {
    if (Date.now() > deadline - 40_000) break;
    const got = await fetchTranscript(admin, v.video_id);
    if (!got) break; // every service is out for now
    const item: TxItem = got.status === "ok" ? { id: v.video_id, status: "ok", lang: got.lang.replace(/[^\w-]/g, "").slice(0, 12), kind: got.kind, caps: got.caps } : { id: v.video_id, status: "none", lang: "", kind: "", caps: [] };
    await applyTranscripts(admin, v.user_id, [item]).catch(() => null);
    done++;
  }
  return done;
}

// ---- researching a brand ------------------------------------------------------------------

type Intel = {
  v: number; at: string; domain: string; url: string; name: string; summary: string; sells: { key: string; weight: number }[]; by: string;
  products: number; examples: string[]; price: { min: number; median: number; max: number; currency: string } | null; platform: string;
  programs: { kind: string; url: string; text: string; commission?: string; network?: string }[]; socials: { platform: string; url: string }[];
  markets: string[]; currency: string; wiki: string; works_with_creators: boolean | number | null; pages: string[]; verified: boolean;
  /** Where the shop is: its store's own country (Shopify meta.json) and the company's home (Wikidata). */
  geo?: { shop?: string; cur?: string; hq?: string; at: string };
  /** LinkedIn page + company facts, from their own site, Wikidata or Hunter (by this domain only). */
  company?: CompanyFacts;
  /** People at the company Hunter knows (asked for by the member, kept so the credit is spent once). */
  people?: People;
};

// ---- Clay + Hunter: whose key, and its budget -------------------------------------------------------
// Every lookup runs with ONE member's key (`keyFor`: their own key from Settings, else the workspace key for
// the owner only) and counts against that key's scope in ai_budget ("hunter@<id>" / "clay@<id>" for a
// member's own key, "hunter" / "clay" for the workspace key).
// Hunter: credits left come from Hunter itself (/v2/account, free), capped for the workspace key at
// HUNTER_MONTHLY (50) a calendar month; the cron looks up at most HUNTER_AUTO_DAILY (1) brand a day per key
// and leaves HUNTER_KEEP (15) for searches you ask for. 429 = the plan's limit → paused until the 1st;
// 401 = key refused → a day (and an own key is marked refused). Clay: CLAY_MONTHLY (100) results per rolling
// 30 days, CLAY_AUTO_DAILY (2), CLAY_KEEP (40); 402 = a limit → a day's pause.
type Choice = NonNullable<KeyChoice>;
const envNum = (k: string, d: number) => { const v = Number(Deno.env.get(k)); return Deno.env.get(k) && Number.isFinite(v) && v >= 0 ? v : d; };
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const nextMonth = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 5); };
const utcToday = () => new Date().toISOString().slice(0, 10);
type Budget = { used: number; today: number; paused: number; left: number };
async function budgetRows(admin: SupabaseClient, route: string, since: string) {
  const { data } = await admin.from("ai_budget").select("day, calls, units, paused_until").eq("route", route).gte("day", since);
  return (data || []) as { day: string; calls: number; units: number; paused_until: string | null }[];
}
const hunterLive = new Map<string, Promise<number | null>>();
async function hunterState(admin: SupabaseClient, ch: KeyChoice): Promise<Budget> {
  if (!ch) return { used: 0, today: 0, paused: 0, left: 0 };
  const rows = await budgetRows(admin, ch.scope, monthStart());
  const used = rows.reduce((n, r) => n + (Number(r.calls) || 0), 0);
  const today = Number(rows.find((r) => r.day === utcToday())?.calls) || 0;
  const paused = Math.max(0, ...rows.map((r) => (r.paused_until ? new Date(r.paused_until).getTime() : 0)));
  // What Hunter itself says is left (free call, once per key per run).
  if (!hunterLive.has(ch.scope)) hunterLive.set(ch.scope, checkKey("hunter", ch.key).then((r) => (r.ok ? r.left : null)).catch(() => null));
  const live = await hunterLive.get(ch.scope)!;
  const capped = ch.own ? Infinity : Math.max(0, envNum("HUNTER_MONTHLY", 50) - used);
  return { used, today, paused, left: paused > Date.now() ? 0 : Math.max(0, Math.min(capped, live ?? (ch.own ? 25 : capped))) };
}
async function clayState(admin: SupabaseClient, ch: KeyChoice): Promise<Budget> {
  if (!ch) return { used: 0, today: 0, paused: 0, left: 0 };
  const rows = await budgetRows(admin, ch.scope, new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10));
  const used = rows.reduce((n, r) => n + (Number(r.units) || 0), 0);
  const today = Number(rows.find((r) => r.day === utcToday())?.units) || 0;
  const paused = Math.max(0, ...rows.map((r) => (r.paused_until ? new Date(r.paused_until).getTime() : 0)));
  return { used, today, paused, left: paused > Date.now() ? 0 : Math.max(0, envNum("CLAY_MONTHLY", 100) - used) };
}
const spend = (admin: SupabaseClient, ch: Choice, units: number) => Promise.resolve(admin.rpc("ai_budget_use", { p_route: ch.scope, p_units: Math.max(0, units) })).catch(() => null);
const hunterUse = (admin: SupabaseClient, ch: Choice) => spend(admin, ch, 1);
const clayUse = (admin: SupabaseClient, ch: Choice, results: number) => spend(admin, ch, results);
/** A refusal / limit pauses that key's scope; a member's own key that's refused is marked so Settings says so. */
async function keyStop(admin: SupabaseClient, ch: Choice, service: Service, why: string) {
  const until = why === "quota" ? (service === "hunter" ? nextMonth() : Date.now() + DAY) : why === "bad_key" ? Date.now() + DAY : why === "busy" ? Date.now() + 60_000 : 0;
  if (until) await Promise.resolve(admin.from("ai_budget").upsert({ route: ch.scope, day: utcToday(), paused_until: new Date(until).toISOString(), note: `${service} ${why}` })).catch(() => null);
  if (ch.own && (why === "bad_key" || why === "quota")) {
    const userId = ch.scope.split("@")[1];
    if (UUID.test(userId || "")) await Promise.resolve(admin.from("member_keys").update({ status: why === "bad_key" ? "refused" : "quota", checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("service", service)).catch(() => null);
  }
}

/** Clay's company record merged in (LinkedIn only if none was found on their own site / Wikidata). */
async function clayFill(admin: SupabaseClient, ch: Choice, co: CompanyFacts): Promise<{ co: CompanyFacts; why?: string }> {
  const r = await clayCompany(co.domain, undefined, ch.key);
  if (r.results) await clayUse(admin, ch, r.results);
  if (!r.ok) { if (r.why !== "none" && r.why !== "no_key") await keyStop(admin, ch, "clay", r.why); return { co: r.why === "none" ? { ...co, clay_at: new Date().toISOString() } : co, why: r.why }; }
  const v = r.value;
  const facts = Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== "linkedin" && x !== undefined && x !== ""));
  const next: CompanyFacts = { ...co, ...(co.facts_via === "hunter" ? {} : { ...facts, facts_via: "clay" as const }), clay_at: new Date().toISOString() };
  if (!co.linkedin && v.linkedin) { next.linkedin = v.linkedin; next.linkedin_via = "clay"; }
  return { co: next };
}

/** LinkedIn from the site (or kept), Wikidata once per domain when the site has none. */
async function companyOf(name: string, domain: string, socials: { platform: string; url: string }[] | undefined, kept: CompanyFacts | null | undefined): Promise<CompanyFacts> {
  const now = new Date().toISOString();
  const co: CompanyFacts = { ...(kept && kept.domain === domain ? kept : {}), domain, at: now };
  const site = siteLinkedin(socials);
  if (site) { co.linkedin = site; co.linkedin_via = "site"; }
  if (!co.linkedin && !co.wd_at) {
    co.wd_at = now;
    const wd = await wikidataLinkedin(name, domain).catch(() => "");
    if (wd) { co.linkedin = wd; co.linkedin_via = "wikidata"; }
  }
  return co;
}

/** Hunter's company record merged in (LinkedIn only if none was found on their own site / Wikidata). */
async function hunterFill(admin: SupabaseClient, ch: Choice, co: CompanyFacts): Promise<{ co: CompanyFacts; why?: string }> {
  const r = await hunterCompany(co.domain, undefined, ch.key);
  if (!r.ok) { if (r.why !== "none" && r.why !== "no_key") await keyStop(admin, ch, "hunter", r.why); if (r.why === "none" || r.why === "error") await hunterUse(admin, ch); return { co: r.why === "none" ? { ...co, hunter_at: new Date().toISOString() } : co, why: r.why }; }
  await hunterUse(admin, ch);
  const v = r.value;
  const next: CompanyFacts = { ...co, ...Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== "linkedin" && x !== undefined && x !== "")), facts_via: "hunter", hunter_at: new Date().toISOString() };
  if (!co.linkedin && v.linkedin) { next.linkedin = v.linkedin; next.linkedin_via = "hunter"; }
  return { co: next };
}


/**
 * Where a brand's shop is: a Shopify store publishes its own country (/meta.json, public); Wikidata knows
 * where the company is based. Both free. The app adds the country domain, the shop currency, the
 * countries the site serves and where the creators they pay are, to rank the brand's markets.
 */
async function brandGeo(name: string, domain: string, origin: string): Promise<NonNullable<Intel["geo"]>> {
  const geo: NonNullable<Intel["geo"]> = { at: new Date().toISOString() };
  const meta = origin ? await getJson(`${origin.replace(/\/$/, "")}/meta.json`).catch(() => null) as { country?: unknown; currency?: unknown; myshopify_domain?: unknown } | null : null;
  if (meta && typeof meta.country === "string" && /^[A-Z]{2}$/.test(meta.country) && (typeof meta.myshopify_domain === "string" || typeof meta.currency === "string")) {
    geo.shop = meta.country;
    // The store's base currency — never localized to whoever asks (a page's currency can be).
    if (typeof meta.currency === "string" && /^[A-Z]{3}$/.test(meta.currency)) geo.cur = meta.currency;
  }
  const hq = await companyCountry(name, domain).catch(() => "");
  if (hq) geo.hq = hq;
  return geo;
}

/**
 * A Wikipedia summary — ONLY when Wikidata's "official website" for that page is
 * this brand's domain. A name match alone is not enough ("Corsair" is also an
 * airline), so anything unverified is thrown away.
 */
async function wikipedia(name: string, domain: string): Promise<{ extract: string; verified: boolean } | null> {
  if (!domain) return null;
  const search = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=6&format=json&origin=*`);
  const titles: string[] = (search?.query?.search || []).map((s: { title: string }) => s.title).slice(0, 6);
  for (const title of titles) {
    const sum = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!sum?.extract || !sum.wikibase_item || sum.type === "disambiguation") continue;
    const wd = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(sum.wikibase_item)}.json`);
    const sites: string[] = (wd?.entities?.[sum.wikibase_item]?.claims?.P856 || []).map((c: { mainsnak?: { datavalue?: { value?: string } } }) => String(c.mainsnak?.datavalue?.value || ""));
    if (sites.some((s) => normalizeDomain(s) === domain)) return { extract: String(sum.extract).slice(0, 700), verified: true };
  }
  return null;
}

async function researchBrand(admin: SupabaseClient, b: BrandRow): Promise<Intel | null> {
  const now = new Date();
  const domain = normalizeDomain(b.domain || "");
  if (!domain) { await admin.from("brand_intel").upsert({ brand_id: b.id, user_id: b.user_id, status: "no_domain", researched_at: now.toISOString(), updated_at: now.toISOString() }); return null; }
  const { data: before } = await admin.from("brand_intel").select("intel").eq("brand_id", b.id).maybeSingle();
  const prev = (before?.intel || null) as Intel | null;
  const keptGeo = prev?.geo && prev.domain === domain ? prev.geo : null;
  const keptPeople = prev?.people && prev.people.domain === domain ? prev.people : undefined;
  // The address as you saved it first (a locale path like /en often has the real page), then the bare domain.
  const saved = (() => { try { const u = new URL(/^https?:\/\//i.test(b.domain || "") ? b.domain! : `https://${b.domain}`); return `${u.origin}${u.pathname}`.replace(/\/$/, ""); } catch { return ""; } })();
  const tries = Array.from(new Set([saved, `https://${domain}`, `https://www.${domain}`].filter(Boolean)));
  let facts: SiteFacts | null = null, origin = "", pages: string[] = [];
  for (const url of tries) {
    const page = await getText(url);
    if (!page || page.status >= 400 && page.status !== 403) continue;
    const f = parseHtml(page.text, page.url || url);
    const thin = !f.title && !f.description && !f.nav.length;
    if (!facts || (!f.blocked && (facts.blocked || thin === false))) { facts = f; origin = new URL(page.url || url).origin; pages = [page.url || url]; }
    if (!f.blocked && !thin) break;
    // A script-only shell: try the English locale.
    if (thin && !f.blocked) for (const loc of ["/en", "/en-us", "/us"]) {
      const p2 = await getText(`${new URL(page.url || url).origin}${loc}`);
      if (!p2 || p2.status >= 400) continue;
      const f2 = parseHtml(p2.text, p2.url);
      if (f2.title || f2.description) { facts = f2; origin = new URL(p2.url).origin; pages = [p2.url]; break; }
    }
    if (facts && (facts.title || facts.description)) break;
  }
  let products: Product[] = facts?.products || [];
  let collections: string[] = [];
  if (facts && !facts.blocked && origin) {
    if (facts.platform === "shopify" || !facts.platform) {
      const pj = await getJson(`${origin}/products.json?limit=250`);
      const got = parseShopify(pj);
      if (got.length) { products = got; pages.push(`${origin}/products.json`); facts.platform ||= "shopify"; collections = parseShopifyCollections(await getJson(`${origin}/collections.json?limit=100`)); }
    }
    if (!products.length && facts.platform === "woocommerce") {
      const got = parseWoo(await getJson(`${origin}/wp-json/wc/store/v1/products?per_page=100`));
      if (got.length) { products = got; pages.push(`${origin}/wp-json/wc/store/v1/products`); }
    }
  }
  // Affiliate / creator program: read the first one for its commission and network.
  const programs: Intel["programs"] = (facts?.programs || []).map((p) => ({ ...p }));
  const prog = programs.find((p) => p.kind === "affiliate") || programs.find((p) => p.kind === "creator" || p.kind === "ambassador");
  if (prog && /^https?:\/\//.test(prog.url)) {
    const page = await getText(prog.url, { timeout: 10_000, max: 1_500_000 });
    if (page && page.status < 400) { const r = readProgram(page.text); if (r.commission) prog.commission = r.commission; if (r.network && !prog.network) prog.network = r.network; pages.push(prog.url); }
  }
  const blocked = !facts || facts.blocked;
  const wiki = blocked || !(facts?.description) ? await wikipedia(b.name, domain) : null;
  const siteTexts = [facts?.title || "", facts?.description || "", ...(facts?.nav || []), wiki?.extract || ""].filter(Boolean);
  let sells = brandTopics({ products, collections, site: siteTexts });
  let by = "rules";
  // Clef: how much of what they sell is each candidate topic.
  const candidates = Array.from(new Set([...sells.map((s) => s.key), ...TOPICS.filter((t) => siteTexts.some((x) => t.words.test(x))).map((t) => t.key)])).slice(0, 10);
  if (candidates.length && (siteTexts.length || products.length)) {
    const levels = ["None of it", "A small side line", "A real part", "One of their main lines", "Nearly everything they sell"];
    const state = { brand: b.name, website: domain, in_their_words: (facts?.description || wiki?.extract || "").slice(0, 600), menu: (facts?.nav || []).slice(0, 30).join(" · "), products: products.slice(0, 40).map((p) => p.title).join(" · ").slice(0, 2400), collections: collections.slice(0, 30).join(" · ") };
    const questions: Record<string, ClefQuestion> = Object.fromEntries(candidates.map((k) => [`t_${k}`, { type: "score", instructions: `How much of what ${b.name} sells is ${topicLabel(k)}?`, criteria: levels } as ClefQuestion]));
    questions.creators = { type: "noul", instructions: `Does ${b.name} work with YouTube creators or influencers (sponsorships, an affiliate or creator program, ambassadors)?` };
    const answers = await decide(state, questions);
    if (answers) {
      const w = candidates.map((k) => ({ key: k, weight: Math.max(0, (answers[`t_${k}`]?.score ?? -1)) / 4 })).filter((x) => x.weight >= 0.3);
      const sum = w.reduce((n, x) => n + x.weight, 0);
      if (sum > 0) { sells = w.map((x) => ({ key: x.key, weight: Math.round((x.weight / sum) * 1000) / 1000 })).sort((a, b) => b.weight - a.weight).slice(0, 8); by = "rules+ai"; }
    }
  }
  // The site blocked us, didn't load, or said too little: Gemini reads it (Google's reader + Search), our topics only.
  let asked: Awaited<ReturnType<typeof askBrand>> = null;
  if (!sells.length || blocked) {
    asked = await askBrand(b.name, domain).catch(() => null);
    if (asked?.isBrand && asked.sells.length) { sells = asked.sells; by = "gemini"; }
  }
  const name = (facts && !facts.blocked && siteName(facts, domain, b.name)) || b.name;
  const intel: Intel = {
    // Gemini was needed but couldn't answer (quota, busy): stay on the old version so the cron asks again later.
    v: (!sells.length || blocked) && !asked ? 1 : INTEL_V, at: now.toISOString(), domain, url: pages[0] || `https://${domain}`, name, summary: (facts?.description || (asked?.isBrand ? asked.summary : "") || "").slice(0, 400), sells, by,
    products: products.length, examples: products.length ? products.slice(0, 10).map((p) => p.title) : asked?.isBrand ? asked.examples : [], price: priceStats(products, facts?.currency || ""), platform: facts?.platform || "",
    programs: programs.slice(0, 5), socials: (facts?.socials || []).slice(0, 8), markets: marketsOf(facts?.locales || []), currency: facts?.currency || "",
    wiki: wiki?.extract || "", works_with_creators: asked?.isBrand ? asked.creators : null, pages: pages.slice(0, 6), verified: facts ? siteIsBrand(b.name, domain, facts) || !!wiki?.verified : !!wiki?.verified,
    // Where the shop is doesn't change: looked up once per website and kept on every later read.
    geo: keptGeo || await brandGeo(b.name, domain, origin || `https://${domain}`).catch(() => ({ at: now.toISOString() })),
    company: await companyOf(b.name, domain, facts && !facts.blocked ? facts.socials : prev?.socials, prev?.company).catch(() => prev?.company && prev.company.domain === domain ? prev.company : undefined),
    people: keptPeople,
  };
  const status = facts && !facts.blocked ? "ok" : blocked && (wiki || by === "gemini") ? "ok" : facts?.blocked ? "blocked" : "unreachable";
  await admin.from("brand_intel").upsert({ brand_id: b.id, user_id: b.user_id, intel, status, researched_at: now.toISOString(), updated_at: now.toISOString() });
  return intel;
}

// ---- brands found in videos: is the domain really theirs? ------------------------------------

type SeenRow = { user_id: string; brand_key: string; name: string; domain: string; domain_check: string; checked_at: string | null };

// Is this found brand real, and what is its own website? In order:
//   1. the creator's own link — only when that domain IS the brand's (its name, not a short link,
//      tracker or agency: sbck.me, plug.dev, dotomi.com) and the page calls itself that name;
//   2. Wikidata's official website for an item that is exactly this company / brand / product;
//   3. name.com — only for a distinctive name, when the page calls itself that and sells something.
// A phrase, a handle or an everyday word ("either", "in advance", "Tom Fox") never gets this far.
// domain_check: site (verified) · guess (a name.com that looks right, not verified) · mismatch · blocked · none.
async function checkSeen(admin: SupabaseClient, s: SeenRow) {
  const now = new Date().toISOString();
  let name = cleanName(s.name) || s.name;
  let domain = s.domain || nameAsDomain(name);
  let check = "none", via = "", site: Record<string, unknown> | null = null;
  let landed = "";
  const look = async (d: string) => {
    landed = "";
    const page = await getText(`https://${d}`, { timeout: 9000, max: 1_500_000 });
    if (!page || page.status >= 400 && page.status !== 403) return null;
    // A short-link service's own error page ("dell.to/error?url=") names the brand but isn't its site.
    if (/\/(?:error|404|not-?found|invalid|expired)(?:[/?#.]|$)/i.test(new URL(page.url || `https://${d}`).pathname)) return null;
    landed = normalizeDomain(page.url || "");
    return parseHtml(page.text, page.url || `https://${d}`);
  };
  // What the site shows they sell: topics, its menu and a few products (for "what they sell" in the app).
  const describe = (f: SiteFacts) => ({ title: f.title.slice(0, 160), description: f.description.slice(0, 300), topics: brandTopics({ products: f.products, site: [f.title, f.description, ...f.nav] }), logo: f.logo, menu: f.nav.map((x) => x.slice(0, 40)).filter(Boolean).slice(0, 14), examples: f.products.map((p) => p.title.slice(0, 90)).filter(Boolean).slice(0, 10) });
  const fromLabel = name === prettyName(domain) || norm(name) === norm(domain.split(".")[0] || "");
  if (brandish(name) || nameAsDomain(name)) {
    // 1. The creator's link.
    if (domain && hostKind(domain) === "brand") {
      const f = await look(domain);
      if (f && !f.blocked && landed && landed !== domain && hostKind(landed) === "brand" && domainFits(name, landed)) domain = landed;
      if (f && !f.blocked && domainFits(name, domain) && siteIsBrand(name, domain, f)) {
        check = "site"; via = "link"; site = describe(f);
        // A name that was only the domain spelled out ("Wtm", "Rayconglobal"): what the site calls itself.
        if (fromLabel) name = siteName(f, domain, name) || name;
      } else if (f?.blocked && domainFits(name, domain)) check = "blocked";
      // The link opens another company's site (chartindustries.com for "Howden"): the creator promoted THAT —
      // don't look the name up elsewhere. A short personal / campaign link (x.la, sbck.me) proves nothing either way.
      else if (f) check = shortLinkDomain(domain) ? "none" : "mismatch";
    }
    if (check === "mismatch") {
      await admin.from("seen_brands").update({ name: cleanName(name) || s.name, domain_check: "mismatch", site: null, checked_at: now, updated_at: now }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
      return { domain, check, name: cleanName(name) || s.name, via: "" };
    }
    // 2. Wikidata, when the link didn't prove it (a short link, a tracker, a wall, nothing) — and also when
    //    the "site" is a short-style host (dell.to, del.ly): the company's official website wins over it.
    const shortHost = check === "site" && shortLinkDomain(domain);
    if ((check !== "site" || shortHost) && !(fromLabel && !brandish(name))) {
      const wd = await officialSite(name).catch(() => null);
      if (wd && (!shortHost || (wd.domain !== domain && domainFits(name, wd.domain)))) {
        domain = wd.domain; check = "site"; via = "wikidata";
        site = { ...(site || {}), title: wd.label, description: wd.description };
        if (!site.topics) { const f = await look(domain).catch(() => null); if (f && !f.blocked) site = { ...describe(f), title: wd.label, description: wd.description }; }
      }
    }
    // 3. A search — never a guess: DuckDuckGo's official-site answer (free), then a real Google search
    //    through Gemini for brands that have a real deal behind them. Whatever it says is checked:
    //    the domain must fit the name and the page must call itself that.
    if (check !== "site" && check !== "blocked") {
      let found = await duckSite(name).catch(() => "");
      let how = "search";
      if (!found) {
        const { data: deal } = await admin.from("creator_brands").select("brand_name, evidence").eq("user_id", s.user_id).eq("brand_key", s.brand_key).in("kind", ["sponsored", "seeded"]).gte("confidence", 0.65).limit(1).maybeSingle();
        if (deal) {
          const quote = String(((deal.evidence as { quote?: string }[] | null) || [])[0]?.quote || "").slice(0, 160);
          const got = await searchSite(name, `their words: ${quote}`).catch(() => null);
          if (got) { found = normalizeDomain(got); how = "google"; }
        }
      }
      if (found && domainFits(name, found)) {
        const f = await look(found);
        const home = landed && domainFits(name, landed) ? landed : found;
        if (f && !f.blocked && siteIsBrand(name, home, f)) { domain = home; check = "site"; via = how; site = describe(f); }
        else if (f?.blocked) { domain = home; check = "site"; via = how; site = { title: name, description: "", topics: [] }; }
      }
    }
  } else domain = s.domain;
  if (site) site.via = via;
  await admin.from("seen_brands").update({ name: cleanName(name) || s.name, domain, domain_check: check, site, checked_at: now, updated_at: now }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  // Keep the deal rows in step: the verified website, and the cleaned name.
  if (check === "site" || check === "guess") await admin.from("creator_brands").update({ domain }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  if (cleanName(name) && cleanName(name) !== s.name) await admin.from("creator_brands").update({ brand_name: cleanName(name) }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  return { domain, check, name: cleanName(name) || s.name, via };
}
const norm = (x: string) => String(x || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

/** Add brands found in a NEW creator's videos when they're sure: a paid or seeded deal, the creator's own link, the site confirmed. */
async function autoAdd(admin: SupabaseClient, s: SeenRow, checked: { domain: string; check: string; name: string; via?: string }) {
  // Only a verified website (the creator's link that IS the brand's, or Wikidata) — never a guess — and a real name.
  if (checked.check !== "site" || !checked.domain || checked.via === "guess" || !brandish(checked.name)) return;
  const { data: me } = await admin.from("profiles").select("preferences").eq("id", s.user_id).maybeSingle();
  if ((me?.preferences as { match_auto_add?: boolean } | null)?.match_auto_add === false) return;
  // Only a PROVEN brand deal (their own words + something else backs it up) — never an affiliate link,
  // a store, or a link that only sat up top in a paid video.
  const { data: rows } = await admin.from("creator_brands").select("creator_id, kind, confidence, last_at, verdict, verdict_kind, manual, store, evidence").eq("user_id", s.user_id).eq("brand_key", s.brand_key).in("kind", ["sponsored", "seeded"]).gte("confidence", 0.85).neq("verdict", "no").limit(20);
  const links = (rows || []).filter((l) => !l.store && dealProof(l as Parameters<typeof dealProof>[0]).level === "proven");
  if (!links.length) return;
  const { data: fresh } = await admin.from("creators").select("id, name, created_at").eq("user_id", s.user_id).in("id", links.map((l) => l.creator_id)).gte("created_at", new Date(Date.now() - 14 * DAY).toISOString()).limit(5);
  if (!fresh?.length) return;
  // Never twice: not if any brand (archived ones too — you removed it once) already has this domain.
  // …nor the same brand on another country domain or under its name (autodoc.de vs autodoc.com vs "AUTODOC").
  const label = (d: string) => normalizeDomain(d || "").split(".")[0].toLowerCase().replace(/[^a-z0-9]+/g, "");
  const flat = (n: string) => String(n || "").toLowerCase().normalize("NFKD").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
  const mine = new Set([label(checked.domain), flat(checked.name), flat(s.name)].filter((x) => x.length >= 3));
  const { data: all } = await admin.from("brands").select("id, name, domain").eq("user_id", s.user_id).limit(5000);
  if ((all || []).some((b: { name: string; domain: string | null }) => normalizeDomain(b.domain || "") === checked.domain || mine.has(label(b.domain || "")) || mine.has(flat(b.name)))) return;
  const from = fresh[0] as { id: string; name: string };
  const link = links.find((l) => l.creator_id === from.id) || links[0];
  const kindWord = link.kind === "seeded" ? "sent them product" : "sponsored them";
  const month = link.last_at ? new Date(link.last_at).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "";
  const { data: added, error } = await admin.from("brands").insert({
    user_id: s.user_id, name: checked.name.slice(0, 80), domain: checked.domain, pipeline_status: "new",
    notes: `Found in ${from.name}'s videos — ${kindWord}${month ? ` (${month})` : ""}.`,
    discovered: { creator_id: from.id, creator: from.name, kind: link.kind, at: new Date().toISOString(), auto: true },
  }).select("id").maybeSingle();
  if (error || !added) return;
  await admin.from("seen_brands").update({ added_brand_id: added.id }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  await admin.from("creator_brands").update({ brand_id: added.id }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  await admin.from("activities").insert({ user_id: s.user_id, entity_type: "brand", entity_id: added.id, text: `Added from ${from.name}'s videos (${kindWord})` }).then(() => null, () => null);
}

/** Link found brands to CRM brands you added since (same domain or name). */
async function relink(admin: SupabaseClient, userId: string) {
  const { data: open } = await admin.from("creator_brands").select("id, domain, brand_name").eq("user_id", userId).is("brand_id", null).limit(2000);
  if (!open?.length) return;
  const { brands } = await knownFor(admin, userId);
  const byDomain = new Map<string, string>(), byName = new Map<string, string>();
  for (const b of brands) { if (b.archived_at) continue; const d = normalizeDomain(b.domain || ""); if (d) byDomain.set(d, b.id); const n = b.name.toLowerCase().replace(/[^a-z0-9]+/g, ""); if (n.length >= 3) byName.set(n, b.id); }
  for (const l of open as { id: string; domain: string; brand_name: string }[]) {
    const id = (l.domain && byDomain.get(l.domain)) || byName.get(l.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    if (id) await admin.from("creator_brands").update({ brand_id: id }).eq("id", l.id).eq("user_id", userId);
  }
}

// ---- the server ------------------------------------------------------------------------------

const approvedUser = async (admin: SupabaseClient, auth: string) => {
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!data.user) return null;
  const { data: me } = await admin.from("profiles").select("access").eq("id", data.user.id).maybeSingle();
  return me && me.access && me.access !== "approved" ? null : data.user.id;
};

async function cron(admin: SupabaseClient) {
  const start = Date.now();
  const deadline = start + 115_000;
  const log: Record<string, number | string> = { creators: 0, brands: 0, seen: 0, listened: 0 };
  const { data: members } = await admin.from("profiles").select("id").eq("access", "approved").limit(500);
  const users = new Set((members || []).map((m: { id: string }) => m.id));
  if (!users.size) return log;
  const ids = [...users];

  // 1. Creators never read (newest added first — you just added them).
  if (youtubeConfigured()) {
    const { data: done } = await admin.from("creator_content").select("creator_id").in("user_id", ids).limit(20000);
    const seen = new Set((done || []).map((d: { creator_id: string }) => d.creator_id));
    const { data: list } = await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").in("user_id", ids).is("archived_at", null).order("created_at", { ascending: false }).limit(3000);
    const todo = ((list || []) as CreatorRow[]).filter((c) => !seen.has(c.id) && youtubeOf(c.socials));
    // A few per run: a first read is the heaviest work (up to 150 videos); the rest wait 3 minutes.
    for (const c of todo.slice(0, 4)) {
      if (Date.now() > deadline - 50_000) break;
      try { await scanCreator(admin, c, deadline - 30_000); log.creators = Number(log.creators) + 1; }
      catch (e) { if (e instanceof YouTubeQuota) { log.quota = "youtube"; break; } await admin.from("creator_content").upsert({ creator_id: c.id, user_id: c.user_id, status: "error", note: e instanceof Error ? e.message.slice(0, 200) : "error", scanned_at: new Date().toISOString() }); }
    }
  }
  // 2. Brands never researched.
  {
    const { data: done } = await admin.from("brand_intel").select("brand_id").in("user_id", ids).limit(20000);
    const seen = new Set((done || []).map((d: { brand_id: string }) => d.brand_id));
    const { data: list } = await admin.from("brands").select("id, user_id, name, domain, archived_at").in("user_id", ids).is("archived_at", null).order("created_at", { ascending: false }).limit(3000);
    for (const b of ((list || []) as BrandRow[]).filter((x) => !seen.has(x.id)).slice(0, 6)) {
      if (Date.now() > deadline - 40_000) break;
      try { await researchBrand(admin, b); log.brands = Number(log.brands) + 1; } catch { await admin.from("brand_intel").upsert({ brand_id: b.id, user_id: b.user_id, status: "error", researched_at: new Date().toISOString() }); }
    }
  }
  // 2b. Brands read before Gemini could help whose site blocked us or said nothing: once, a few a run.
  if (Date.now() < deadline - 60_000) {
    const { data: rows } = await admin.from("brand_intel").select("brand_id, status, intel").in("user_id", ids).in("status", ["blocked", "unreachable", "ok"]).limit(5000);
    const todo = ((rows || []) as { brand_id: string; status: string; intel: Intel | null }[]).filter((r) => (r.intel?.v || 0) < INTEL_V && (r.status !== "ok" || !(r.intel?.sells || []).length)).map((r) => r.brand_id).slice(0, 3);
    const { data: list } = todo.length ? await admin.from("brands").select("id, user_id, name, domain, archived_at").in("id", todo).is("archived_at", null) : { data: [] };
    for (const b of (list || []) as BrandRow[]) { if (Date.now() > deadline - 45_000) break; await researchBrand(admin, b).catch(() => null); log.brands = Number(log.brands) + 1; }
  }
  // 3. Brands found in videos: check the domain is theirs (then maybe add them).
  {
    const { data: list } = await admin.from("seen_brands").select("user_id, brand_key, name, domain, domain_check, checked_at").in("user_id", ids).eq("hidden", false).or(`checked_at.is.null,and(domain_check.eq.none,domain.neq.,checked_at.lt.${new Date(Date.now() - 2 * DAY).toISOString()})`).limit(24);
    await pool((list || []) as SeenRow[], 6, async (s) => {
      if (Date.now() > deadline - 25_000) return;
      const checked = await checkSeen(admin, s).catch(() => null);
      if (checked) { log.seen = Number(log.seen) + 1; await autoAdd(admin, s, checked).catch(() => null); }
    });
  }
  for (const u of ids) await relink(admin, u).catch(() => null);
  // 3b. Creators whose full year isn't read yet (the first read stops at 150; the rest follows here).
  if (youtubeConfigured() && !log.quota && Date.now() < deadline - 50_000) {
    const { data: open } = await admin.from("creator_content").select("creator_id, backfill, status").in("user_id", ids).in("status", ["ok", "empty"]).limit(5000);
    const cids = ((open || []) as { creator_id: string; backfill: Backfill | null }[]).filter((r) => r.backfill?.done !== true).map((r) => r.creator_id).slice(0, 3);
    const { data: list } = cids.length ? await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").in("id", cids).is("archived_at", null) : { data: [] };
    for (const c of (list || []) as CreatorRow[]) {
      if (Date.now() > deadline - 50_000) break;
      try { await scanCreator(admin, c, deadline - 30_000); log.backfill = Number(log.backfill || 0) + 1; } catch (e) { if (e instanceof YouTubeQuota) { log.quota = "youtube"; break; } }
    }
  }
  // 4. Creators not read for a week.
  if (youtubeConfigured() && !log.quota && Date.now() < deadline - 50_000) {
    const { data: stale } = await admin.from("creator_content").select("creator_id, scanned_at").in("user_id", ids).lt("scanned_at", new Date(Date.now() - RESCAN_DAYS * DAY).toISOString()).order("scanned_at", { ascending: true }).limit(6);
    const cids = (stale || []).map((s: { creator_id: string }) => s.creator_id);
    const { data: list } = cids.length ? await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").in("id", cids).is("archived_at", null) : { data: [] };
    for (const c of (list || []) as CreatorRow[]) {
      if (Date.now() > deadline - 50_000) break;
      try { await scanCreator(admin, c, deadline - 30_000); log.creators = Number(log.creators) + 1; } catch (e) { if (e instanceof YouTubeQuota) { log.quota = "youtube"; break; } }
    }
  }
  // 4b. Brands read before markets were looked up: where their shop is (free, a few a run).
  if (Date.now() < deadline - 45_000) {
    const { data: rows } = await admin.from("brand_intel").select("brand_id, user_id, intel").in("user_id", ids).eq("status", "ok").is("intel->geo", null).limit(6);
    for (const r of (rows || []) as { brand_id: string; user_id: string; intel: Intel | null }[]) {
      if (Date.now() > deadline - 35_000 || !r.intel?.domain) continue;
      const { data: b } = await admin.from("brands").select("id, user_id, name, domain, archived_at").eq("id", r.brand_id).maybeSingle();
      // The brand's website was changed since its site was read (opr.as → opera.com): read it again in full.
      if (b && normalizeDomain(b.domain || "") && normalizeDomain(b.domain || "") !== r.intel.domain) {
        await researchBrand(admin, b as BrandRow).catch(() => null);
        log.brands = Number(log.brands) + 1;
        continue;
      }
      const origin = (() => { try { return new URL(r.intel!.url).origin; } catch { return `https://${r.intel!.domain}`; } })();
      const geo = await brandGeo(b?.name || r.intel.name, r.intel.domain, origin).catch(() => ({ at: new Date().toISOString() }));
      await admin.from("brand_intel").update({ intel: { ...r.intel, geo } }).eq("brand_id", r.brand_id).eq("user_id", r.user_id);
      log.geo = Number(log.geo || 0) + 1;
    }
  }
  // 4e. Found brands checked before their menu / products were kept: read their verified site once more for "what they sell".
  if (Date.now() < deadline - 45_000) {
    const { data: rows } = await admin.from("seen_brands").select("user_id, brand_key, domain, site").in("user_id", ids).eq("domain_check", "site").eq("hidden", false).is("site->menu", null).limit(15);
    for (const r of (rows || []) as { user_id: string; brand_key: string; domain: string; site: Record<string, unknown> | null }[]) {
      if (Date.now() > deadline - 40_000 || !r.domain) continue;
      const page = await getText(`https://${r.domain}`, { timeout: 9000, max: 1_500_000 });
      const f = page && page.status < 400 ? parseHtml(page.text, page.url || `https://${r.domain}`) : null;
      const menu = f && !f.blocked ? f.nav.map((x) => x.slice(0, 40)).filter(Boolean).slice(0, 14) : [];
      const examples = f && !f.blocked ? f.products.map((p) => p.title.slice(0, 90)).filter(Boolean).slice(0, 10) : [];
      await admin.from("seen_brands").update({ site: { ...(r.site || {}), menu, examples } }).eq("user_id", r.user_id).eq("brand_key", r.brand_key);
      log.seenMenu = Number(log.seenMenu || 0) + 1;
    }
  }
  // 4c. LinkedIn pages for brands read before they were looked for: their site's link (already read), else Wikidata.
  if (Date.now() < deadline - 45_000) {
    const { data: rows } = await admin.from("brand_intel").select("brand_id, user_id, intel").in("user_id", ids).not("intel", "is", null).is("intel->company", null).limit(40);
    for (const r of (rows || []) as { brand_id: string; user_id: string; intel: Intel | null }[]) {
      if (Date.now() > deadline - 35_000 || !r.intel?.domain) continue;
      const { data: b } = await admin.from("brands").select("name").eq("id", r.brand_id).maybeSingle();
      const company = await companyOf(b?.name || r.intel.name, r.intel.domain, r.intel.socials, null).catch(() => null);
      if (company) await admin.from("brand_intel").update({ intel: { ...r.intel, company } }).eq("brand_id", r.brand_id).eq("user_id", r.user_id);
      log.linkedin = Number(log.linkedin || 0) + 1;
    }
  }
  // 4d. Clay / Hunter, each member with their own key (the owner also with the workspace key): a few brands a
  //     day with no LinkedIn yet — brands you're talking to first. One member's key never looks up another's brands.
  if (Date.now() < deadline - 40_000) {
    const STAGE: Record<string, number> = { negotiating: 6, replied: 5, inbound: 5, contacted: 4, no_reply: 3, roster: 3, signed: 3, new: 2, denied: 0 };
    const memo = new Map<string, KeyChoice>();
    const nextBrand = async (userId: string, asked: "clay_at" | "hunter_at") => {
      const { data: rows } = await admin.from("brand_intel").select("brand_id").eq("user_id", userId).not("intel->company", "is", null).is("intel->company->>linkedin", null).is(`intel->company->>${asked}`, null).limit(500);
      const bids = ((rows || []) as { brand_id: string }[]).map((r) => r.brand_id);
      if (!bids.length) return null;
      const { data: bs } = await admin.from("brands").select("id, pipeline_status, updated_at").eq("user_id", userId).in("id", bids.slice(0, 300)).is("archived_at", null);
      const pick = ((bs || []) as { id: string; pipeline_status: string; updated_at: string }[]).filter((b) => (STAGE[b.pipeline_status] ?? 1) > 0)
        .sort((a, b) => (STAGE[b.pipeline_status] ?? 1) - (STAGE[a.pipeline_status] ?? 1) || b.updated_at.localeCompare(a.updated_at))[0];
      if (!pick) return null;
      const { data: r } = await admin.from("brand_intel").select("brand_id, user_id, intel").eq("brand_id", pick.id).eq("user_id", userId).maybeSingle();
      return (r as { brand_id: string; user_id: string; intel: Intel } | null)?.intel?.company ? r as { brand_id: string; user_id: string; intel: Intel } : null;
    };
    const { data: keyed } = await admin.from("member_keys").select("user_id").in("user_id", ids).neq("status", "refused");
    const { data: owners } = await admin.from("profiles").select("id").in("id", ids).eq("role", "owner");
    const who = Array.from(new Set([...((keyed || []) as { user_id: string }[]).map((r) => r.user_id), ...((owners || []) as { id: string }[]).map((r) => r.id)]));
    for (const userId of who) {
      if (Date.now() > deadline - 35_000) break;
      const clay = await keyFor(admin, userId, "clay", memo).catch(() => null);
      if (clay) {
        const c = await clayState(admin, clay);
        if (c.left > envNum("CLAY_KEEP", 40) && c.today < envNum("CLAY_AUTO_DAILY", 2)) {
          const r = await nextBrand(userId, "clay_at");
          if (r) { const { co } = await clayFill(admin, clay, r.intel.company!); await admin.from("brand_intel").update({ intel: { ...r.intel, company: co } }).eq("brand_id", r.brand_id).eq("user_id", r.user_id); log.clay = Number(log.clay || 0) + 1; }
        }
      }
      if (Date.now() > deadline - 30_000) break;
      const hunter = await keyFor(admin, userId, "hunter", memo).catch(() => null);
      if (hunter) {
        const h = await hunterState(admin, hunter);
        if (h.left > envNum("HUNTER_KEEP", 15) && h.today < envNum("HUNTER_AUTO_DAILY", 1)) {
          const r = await nextBrand(userId, "hunter_at");
          if (r) { const { co } = await hunterFill(admin, hunter, r.intel.company!); await admin.from("brand_intel").update({ intel: { ...r.intel, company: co } }).eq("brand_id", r.brand_id).eq("user_id", r.user_id); log.hunter = Number(log.hunter || 0) + 1; }
        }
      }
    }
  }
  // 5. Brands not researched for two weeks.
  if (Date.now() < deadline - 40_000) {
    const { data: stale } = await admin.from("brand_intel").select("brand_id").in("user_id", ids).lt("researched_at", new Date(Date.now() - BRAND_DAYS * DAY).toISOString()).order("researched_at", { ascending: true }).limit(3);
    const bids = (stale || []).map((s: { brand_id: string }) => s.brand_id);
    const { data: list } = bids.length ? await admin.from("brands").select("id, user_id, name, domain, archived_at").in("id", bids).is("archived_at", null) : { data: [] };
    for (const b of (list || []) as BrandRow[]) { if (Date.now() > deadline - 35_000) break; await researchBrand(admin, b).catch(() => null); log.brands = Number(log.brands) + 1; }
  }
  // 6. Listen to promoted clips nothing written names.
  // Transcript services first (they read the whole video for a credit), Gemini listens to what's left.
  if (Date.now() < deadline - 50_000) log.transcribed = await txSome(admin, deadline).catch(() => 0);
  if (Date.now() < deadline - 50_000) log.listened = await listenSome(admin, deadline).catch(() => 0);
  log.ms = Date.now() - start;
  return log;
}

/** For the app: which lookup services this member can use, whose key, and what's left. */
async function lookupStatus(admin: SupabaseClient, userId: string) {
  const memo = new Map<string, KeyChoice>();
  const [h, c] = await Promise.all([keyFor(admin, userId, "hunter", memo).catch(() => null), keyFor(admin, userId, "clay", memo).catch(() => null)]);
  const [hs, cs] = await Promise.all([hunterState(admin, h).catch(() => null), clayState(admin, c).catch(() => null)]);
  return { hunter: { configured: !!h, own: !!h?.own, left: hs?.left ?? 0 }, clay: { configured: !!c, own: !!c?.own, left: cs?.left ?? 0 } };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  useClefBudget(admin);
  useListenBudget(admin);
  useBrandAskBudget(admin);
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (input.action === "cron") {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: ok } = given.length >= 32 ? await admin.rpc("gmail_cron_secret_ok", { p_secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    // Never two runs at once: a run holds the lease for 140 s.
    const { data: lease } = await admin.from("ai_budget").select("paused_until").eq("route", "brand-match-lease").eq("day", "2000-01-01").maybeSingle();
    if (lease?.paused_until && new Date(lease.paused_until).getTime() > Date.now()) return json({ skipped: "running" });
    await admin.from("ai_budget").upsert({ route: "brand-match-lease", day: "2000-01-01", paused_until: new Date(Date.now() + 140_000).toISOString() });
    try { return json(await cron(admin)); }
    finally { await admin.from("ai_budget").upsert({ route: "brand-match-lease", day: "2000-01-01", paused_until: null }); }
  }

  // Server-only self-test of the key vault (cron secret): seal/open with the real Vault key, the binding to
  // member + service, the live key checks, and that the workspace key is the owner's only. Returns booleans,
  // never a key.
  if (input.action === "keys_selftest") {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: ok } = given.length >= 32 ? await admin.rpc("gmail_cron_secret_ok", { p_secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    const vk = vaultKey(admin);
    const a = "00000000-0000-4000-8000-00000000000a", b2 = "00000000-0000-4000-8000-00000000000b";
    const probe = `probe_${crypto.randomUUID()}`;
    const sealed = await sealKey(vk, a, "clay", probe).catch(() => "");
    const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").limit(1).maybeSingle();
    const { data: member } = await admin.from("profiles").select("id").neq("role", "owner").eq("access", "approved").limit(1).maybeSingle();
    const ownerHunter = owner?.id ? await keyFor(admin, owner.id, "hunter") : null;
    const memberHunter = member?.id ? await keyFor(admin, member.id, "hunter") : null;
    const { data: memberRow } = member?.id ? await admin.from("member_keys").select("service").eq("user_id", member.id).eq("service", "hunter").maybeSingle() : { data: null };
    const live = Deno.env.get("HUNTER_API_KEY") ? await checkKey("hunter", Deno.env.get("HUNTER_API_KEY")!) : null;
    const wrong = await checkKey("hunter", "0000000000000000000000000000000000000000");
    return json({
      vault: !!sealed, sealedHidesKey: !!sealed && !sealed.includes(probe), roundTrip: (await openKey(vk, a, "clay", sealed)) === probe,
      otherMemberCant: (await openKey(vk, b2, "clay", sealed)) === "", otherServiceCant: (await openKey(vk, a, "hunter", sealed)) === "",
      ownerUsesWorkspaceKey: !!ownerHunter && !ownerHunter.own, memberNeverUsesWorkspaceKey: !memberHunter || (memberHunter.own && !!memberRow),
      hunterLiveCheck: live ? { ok: live.ok, label: live.ok ? live.label : "", left: live.ok ? live.left : null, total: live.ok ? live.total : null } : "no workspace key",
      hunterWrongKeyRefused: !wrong.ok && wrong.why === "refused",
    });
  }

  const userId = await approvedUser(admin, req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Unauthorized" }, 401);

  if (input.action === "status") {
    const newest = (table: string, col: string) => admin.from(table).select(col).eq("user_id", userId).order(col, { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const [{ data: people }, { data: done }, { count: brands }, { count: researched }, clef, l1, l2, l3, { count: links }] = await Promise.all([
      admin.from("creators").select("id, socials").eq("user_id", userId).is("archived_at", null).limit(5000),
      admin.from("creator_content").select("creator_id, scanned_at, status, backfill").eq("user_id", userId).limit(5000),
      admin.from("brands").select("id", { count: "exact", head: true }).eq("user_id", userId).is("archived_at", null),
      admin.from("brand_intel").select("brand_id", { count: "exact", head: true }).eq("user_id", userId),
      clefStatus(),
      newest("creator_brands", "updated_at"), newest("brand_intel", "researched_at"), newest("seen_brands", "checked_at"),
      admin.from("creator_brands").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    // Changes when anything the app shows changed: the app reloads only then.
    const at = (r: { data: unknown }, col: string) => String(((r.data || {}) as Record<string, unknown>)[col] || "");
    const stamp = [at(l1, "updated_at"), at(l2, "researched_at"), at(l3, "checked_at"), links || 0, (done || []).length].join("|");
    // Only creators with a YouTube channel can be read; the rest never count as "waiting".
    const withYoutube = ((people || []) as { id: string; socials: CreatorRow["socials"] }[]).filter((c) => youtubeOf(c.socials)).map((c) => c.id);
    const readAt = new Map(((done || []) as { creator_id: string; scanned_at: string | null }[]).map((d) => [d.creator_id, d.scanned_at || ""]));
    // "Read" = their videos really were read; a channel that couldn't be read is counted apart.
    const rowsOf = new Map(((done || []) as { creator_id: string; status: string; backfill: Backfill | null }[]).map((d) => [d.creator_id, d]));
    const creators = withYoutube.length;
    const read = withYoutube.filter((id) => ["ok", "empty"].includes(rowsOf.get(id)?.status || "")).length;
    const failed = withYoutube.filter((id) => ["error", "no_channel", "quota"].includes(rowsOf.get(id)?.status || "")).length;
    const backfilling = withYoutube.filter((id) => rowsOf.get(id) && rowsOf.get(id)!.backfill?.done !== true && ["ok", "empty"].includes(rowsOf.get(id)!.status)).length;
    const lastRead = [...readAt.values()].sort().pop() || null;
    const year = new Date(Date.now() - 365 * DAY).toISOString();
    const vc = (f: (q: ReturnType<typeof videoCount>) => ReturnType<typeof videoCount>) => f(videoCount()).then((r) => r.count || 0);
    const videoCount = () => admin.from("creator_videos").select("video_id", { count: "exact", head: true }).eq("user_id", userId).gte("published_at", year);
    const [videos, paidVideos, transcripts, noCaptions, waiting, listened, listenQueue] = await Promise.all([
      vc((q) => q), vc((q) => q.eq("paid", true)), vc((q) => q.eq("transcript_status", "ok")), vc((q) => q.eq("transcript_status", "none")),
      vc((q) => q.eq("transcript_status", "").gt("secs", 60)), vc((q) => q.not("listened_at", "is", null)), vc((q) => q.not("listen", "is", null).is("listened_at", null).neq("transcript_status", "ok")),
    ]);
    return json({ ok: true, stamp, creators, read, failed, backfilling, videos, paidVideos, transcripts, noCaptions, transcriptWaiting: waiting, listened, listenQueue, noYoutube: (people || []).length - creators, lastRead, everyMin: 3, perRun: 4, rescanDays: RESCAN_DAYS, brandDays: BRAND_DAYS, brands: brands || 0, researched: researched || 0, youtube: youtubeConfigured(), clef, listen: { configured: listenConfigured(), secondsLeft: await listenLeft() }, tx: { services: txProviders().map((p) => p.name), left: await txLeft(admin).catch(() => 0) }, ...(await lookupStatus(admin, userId)) });
  }

  // ---- transcripts from the browser helper (the member's own connection; YouTube blocks servers) ----
  if (input.action === "transcript_queue") {
    // Videos of the last year with no captions read yet: YouTube-labelled paid ones first, then the newest.
    const n = Math.min(20, Math.max(1, Math.floor(Number(input.n) || 10)));
    const skip = new Set((Array.isArray(input.skip) ? input.skip : []).filter((x): x is string => typeof x === "string" && /^[\w-]{11}$/.test(x)).slice(0, 300));
    const cutoff = new Date(Date.now() - BACK_DAYS * DAY).toISOString();
    const pick = (paid: boolean) => admin.from("creator_videos").select("video_id, creator_id, title, published_at, paid").eq("user_id", userId).eq("transcript_status", "").eq("paid", paid).gt("secs", 60).gte("published_at", cutoff).order("published_at", { ascending: false }).limit(n + skip.size);
    const [{ data: a }, { data: b }, { count: left }] = await Promise.all([pick(true), pick(false), admin.from("creator_videos").select("video_id", { count: "exact", head: true }).eq("user_id", userId).eq("transcript_status", "").gt("secs", 60).gte("published_at", cutoff)]);
    const items = [...(a || []), ...(b || [])].filter((v) => !skip.has(v.video_id)).slice(0, n).map((v) => ({ id: v.video_id, title: String(v.title || "").slice(0, 120) }));
    return json({ ok: true, items, left: left || 0 });
  }

  if (input.action === "transcript_save") {
    const raw = Array.isArray(input.items) ? input.items.slice(0, 8) : [];
    const items: TxItem[] = [];
    let chars = 0;
    for (const x of raw as Record<string, unknown>[]) {
      const id = typeof x?.id === "string" && /^[\w-]{11}$/.test(x.id) ? x.id : "";
      const status = x?.status === "ok" || x?.status === "none" || x?.status === "error" ? x.status : "";
      if (!id || !status) continue;
      const caps: Caption[] = [];
      if (status === "ok" && Array.isArray(x.caps)) for (const c of (x.caps as unknown[]).slice(0, 12_000)) {
        if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "string") continue;
        const t = c[1].slice(0, 400);
        chars += t.length;
        if (chars > 900_000) break;
        caps.push([Math.max(0, Math.min(36_000_000, Math.round(c[0]))), t]);
      }
      items.push({ id, status: status === "ok" && !caps.length ? "none" : status, lang: String(x.lang || "").replace(/[^\w-]/g, "").slice(0, 12), kind: x.kind === "asr" ? "asr" : x.kind === "manual" ? "manual" : "", caps });
    }
    if (!items.length) return json({ ok: true, saved: 0, found: 0 });
    try {
      return json({ ok: true, ...(await applyTranscripts(admin, userId, items)) });
    } catch {
      return json({ error: "Couldn't save the transcripts." }, 500);
    }
  }

  if (input.action === "scan_creator") {
    const id = typeof input.id === "string" && UUID.test(input.id) ? input.id : "";
    if (!id) return json({ error: "Pick an influencer." }, 400);
    if (!youtubeConfigured()) return json({ error: "YouTube isn't set up on the server yet (YOUTUBE_API_KEYS)." }, 503);
    const { data: c } = await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").eq("id", id).eq("user_id", userId).maybeSingle();
    if (!c) return json({ error: "That influencer isn't in your CRM (or hasn't saved yet) — try again in a moment." }, 404);
    if (!youtubeOf((c as CreatorRow).socials)) return json({ error: "Add their YouTube channel first." }, 400);
    try {
      const r = await scanCreator(admin, c as CreatorRow, Date.now() + 120_000, { force: input.force === true });
      // Check new finds right away so the list shows real domains.
      const { data: seen } = await admin.from("seen_brands").select("user_id, brand_key, name, domain, domain_check, checked_at").eq("user_id", userId).is("checked_at", null).limit(8);
      await pool((seen || []) as SeenRow[], 4, async (s) => { const ch = await checkSeen(admin, s).catch(() => null); if (ch) await autoAdd(admin, s, ch).catch(() => null); });
      return json({ ok: true, ...r });
    } catch (e) {
      if (e instanceof YouTubeQuota) return json({ error: "YouTube's daily limit is reached — it resets at midnight Pacific time; the CRM reads them then.", quota: true }, 429);
      return json({ error: e instanceof Error ? e.message : "Couldn't read their videos." }, 502);
    }
  }

  if (input.action === "research_brand") {
    const id = typeof input.id === "string" && UUID.test(input.id) ? input.id : "";
    const { data: b } = id ? await admin.from("brands").select("id, user_id, name, domain, archived_at").eq("id", id).eq("user_id", userId).maybeSingle() : { data: null };
    if (!b) return json({ error: "That brand isn't in your CRM (or hasn't saved yet) — try again in a moment." }, 404);
    if (!normalizeDomain((b as BrandRow).domain || "")) return json({ error: "Add their website first — that's where the research starts." }, 400);
    try { const intel = await researchBrand(admin, b as BrandRow); return json({ ok: true, intel }); }
    catch (e) { return json({ error: e instanceof Error ? e.message : "Couldn't read their site." }, 502); }
  }

  // ---- Your own Clay / Hunter keys ----------------------------------------------------------------
  // The key is checked with the service (free call) BEFORE anything is stored; only then sealed and saved.
  // Nothing about a key ever comes back except its last 4 characters, the account label and credits.
  if (input.action === "keys_status") {
    const { data: rows } = await admin.from("member_keys").select("service, hint, label, status, checked_at, updated_at").eq("user_id", userId);
    const { data: me } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    const memo = new Map<string, KeyChoice>();
    const out = await Promise.all(SERVICES.map(async (service) => {
      const row = ((rows || []) as { service: string; hint: string; label: string; status: string; checked_at: string | null; updated_at: string }[]).find((r) => r.service === service);
      const ch = await keyFor(admin, userId, service, memo).catch(() => null);
      const st = service === "hunter" ? await hunterState(admin, ch).catch(() => null) : await clayState(admin, ch).catch(() => null);
      const workspace = !row && !!ch && !ch.own;
      return { service, saved: !!row, hint: row?.hint || "", label: row?.label || "", status: row?.status || "", checked_at: row?.checked_at || null, saved_at: row?.updated_at || null, workspace, active: !!ch, left: ch ? st?.left ?? null : null, paused_until: st && st.paused > Date.now() ? new Date(st.paused).toISOString() : null };
    }));
    return json({ ok: true, keys: out, owner: me?.role === "owner" });
  }

  if (input.action === "key_save" || input.action === "key_check" || input.action === "key_remove") {
    const service = SERVICES.find((x) => x === input.service);
    if (!service) return json({ error: "Pick Clay or Hunter." }, 400);
    if (input.action === "key_remove") {
      const { error } = await admin.from("member_keys").delete().eq("user_id", userId).eq("service", service);
      if (error) return json({ error: "Couldn't remove the key — nothing changed. Try again." }, 500);
      await admin.from("activities").insert({ user_id: userId, text: `${service === "clay" ? "Clay" : "Hunter"} key removed from Settings`, entity_type: null, entity_id: null }).then(() => null, () => null);
      return json({ ok: true });
    }
    // At most 20 checks / saves a day per member: a key is never brute-forced through us.
    const tries = `keycheck@${userId}`;
    const { data: t } = await admin.from("ai_budget").select("calls").eq("route", tries).eq("day", utcToday()).maybeSingle();
    if ((Number(t?.calls) || 0) >= 20) return json({ error: "Too many key checks today — try again tomorrow." }, 429);
    await admin.rpc("ai_budget_use", { p_route: tries, p_units: 0 });
    let plain = "";
    if (input.action === "key_check") {
      // Re-check the key you saved (credits, still valid) — the browser never sends or gets the key.
      const { data: row } = await admin.from("member_keys").select("sealed").eq("user_id", userId).eq("service", service).maybeSingle();
      plain = row?.sealed ? await openKey(vaultKey(admin), userId, service, row.sealed) : "";
      if (!plain) return json({ error: "There's no saved key to check — paste it again." }, 404);
    } else {
      plain = cleanKey(service, input.key);
      if (!plain) return json({ error: service === "hunter" ? "That doesn't look like a Hunter API key — copy it from hunter.io → API." : "That doesn't look like a Clay API key — copy it from Clay → API and CLI → API keys.", field: "key" }, 400);
    }
    const check = await checkKey(service, plain);
    const name = service === "clay" ? "Clay" : "Hunter";
    const now = new Date().toISOString();
    if (!check.ok) {
      if (input.action === "key_check") await admin.from("member_keys").update({ status: check.why === "quota" ? "quota" : check.why === "refused" ? "refused" : "ok", checked_at: now, updated_at: now }).eq("user_id", userId).eq("service", service);
      return json({ error: check.why === "refused" ? `${name} refused this key — check it's copied whole and still active.${input.action === "key_save" ? " Nothing was saved." : ""}` : check.why === "quota" ? `${name} says this account is over its limit right now.${input.action === "key_save" ? " Nothing was saved." : ""}` : `${name} didn't answer — try again in a minute.${input.action === "key_save" ? " Nothing was saved." : ""}`, field: check.why === "refused" ? "key" : undefined, why: check.why }, check.why === "unreachable" ? 502 : 400);
    }
    if (input.action === "key_save") {
      let sealed = "";
      try { sealed = await sealKey(vaultKey(admin), userId, service, plain); } catch { return json({ error: "The key vault isn't available right now — nothing was saved. Try again in a minute." }, 503); }
      // Read it back before saying "saved": it must open to the very same key.
      if ((await openKey(vaultKey(admin), userId, service, sealed)) !== plain) return json({ error: "The key couldn't be sealed safely — nothing was saved." }, 500);
      const { error } = await admin.from("member_keys").upsert({ user_id: userId, service, sealed, hint: hintOf(plain), label: check.label, status: "ok", checked_at: now, updated_at: now }, { onConflict: "user_id,service" });
      if (error) return json({ error: "Couldn't save the key — nothing changed. Try again." }, 500);
      const { data: back } = await admin.from("member_keys").select("sealed").eq("user_id", userId).eq("service", service).maybeSingle();
      if (back?.sealed !== sealed || (await openKey(vaultKey(admin), userId, service, back.sealed)) !== plain) return json({ error: "The key didn't save completely — try again." }, 500);
      // A new key starts with a clean slate (no pause left from an old one).
      await admin.from("ai_budget").update({ paused_until: null }).eq("route", `${service}@${userId}`).gte("day", new Date(Date.now() - 31 * DAY).toISOString().slice(0, 10));
      await admin.from("activities").insert({ user_id: userId, text: `${name} key saved in Settings (•••• ${hintOf(plain)})`, entity_type: null, entity_id: null }).then(() => null, () => null);
    } else {
      await admin.from("member_keys").update({ status: "ok", label: check.label, checked_at: now, updated_at: now }).eq("user_id", userId).eq("service", service);
    }
    return json({ ok: true, service, hint: hintOf(plain), label: check.label, left: check.left, total: check.total, resets: check.resets, checked_at: now });
  }

  // A brand's company record / people from Clay and Hunter — only when you ask, for your own brand, by its
  // website, with YOUR key (or the workspace key if you're the owner), within that key's allowance.
  if (input.action === "company_lookup" || input.action === "people_find") {
    const id = typeof input.id === "string" && UUID.test(input.id) ? input.id : "";
    const { data: b } = id ? await admin.from("brands").select("id, user_id, name, domain, archived_at").eq("id", id).eq("user_id", userId).maybeSingle() : { data: null };
    if (!b) return json({ error: "That brand isn't in your CRM (or hasn't saved yet) — try again in a moment." }, 404);
    const domain = normalizeDomain((b as BrandRow).domain || "");
    if (!domain) return json({ error: "Add their website first — lookups go by website, never by name." }, 400);
    const memo = new Map<string, KeyChoice>();
    const [hk, ck] = await Promise.all([keyFor(admin, userId, "hunter", memo), keyFor(admin, userId, "clay", memo)]);
    if (!hk && !ck) return json({ error: "Connect Clay or Hunter in Settings → Lookup services first.", setup: true }, 400);
    const [h, c] = await Promise.all([hunterState(admin, hk), clayState(admin, ck)]);
    const left = () => ({ hunter: { configured: !!hk, own: !!hk?.own, left: h.left }, clay: { configured: !!ck, own: !!ck?.own, left: c.left } });
    if (h.left <= 0 && c.left <= 0) return json({ error: "No lookups left right now — Hunter refills on its reset date, Clay a little every day.", quota: true }, 429);
    const { data: row } = await admin.from("brand_intel").select("intel").eq("brand_id", id).eq("user_id", userId).maybeSingle();
    let intel = (row?.intel || null) as Intel | null;
    if (!intel || intel.domain !== domain) intel = await researchBrand(admin, b as BrandRow).catch(() => null);
    if (!intel) return json({ error: "Couldn't read their site yet — try again in a minute." }, 502);
    let company = intel.company && intel.company.domain === domain ? intel.company : await companyOf((b as BrandRow).name, domain, intel.socials, null);
    const said = (why?: string) => why === "quota" ? "the allowance is used up" : why === "bad_key" ? "the key was refused" : "it didn't answer";
    if (input.action === "company_lookup") {
      const notes: string[] = [];
      let found = false;
      if (ck && c.left > 0 && !company.clay_at) { const r = await clayFill(admin, ck, company); company = r.co; if (r.why && r.why !== "none") notes.push(`Clay: ${said(r.why)}`); else if (!r.why) { found = true; c.left = Math.max(0, c.left - 1); } }
      if (hk && h.left > 0 && !company.hunter_at && (!company.linkedin || !company.size)) { const r = await hunterFill(admin, hk, company); company = r.co; if (r.why && r.why !== "none") notes.push(`Hunter: ${said(r.why)}`); else { h.left = Math.max(0, h.left - 1); if (!r.why) found = true; } }
      await admin.from("brand_intel").update({ intel: { ...intel, company } }).eq("brand_id", id).eq("user_id", userId);
      if (!found && notes.length) return json({ error: `No company facts — ${notes.join("; ")}.` }, 502);
      return json({ ok: true, company, found, ...left() });
    }
    const notes: string[] = [];
    let fromHunter: Person[] = [], fromClay: Person[] = [], total = 0;
    if (hk && h.left > 0) {
      const r = await hunterPeople(domain, undefined, hk.key);
      if (r.ok) { await hunterUse(admin, hk); h.left = Math.max(0, h.left - 1); fromHunter = r.value.list; total = r.value.total; }
      else if (r.why !== "none") { await keyStop(admin, hk, "hunter", r.why); if (r.why === "error") await hunterUse(admin, hk); notes.push(`Hunter: ${said(r.why)}`); }
      else { await hunterUse(admin, hk); h.left = Math.max(0, h.left - 1); }
    }
    if (ck && c.left > 0) {
      const r = await clayPeople(domain, Math.min(5, c.left), undefined, ck.key);
      if (r.results) { await clayUse(admin, ck, r.results); c.left = Math.max(0, c.left - r.results); }
      if (r.ok) fromClay = r.value;
      else if (r.why !== "none") { await keyStop(admin, ck, "clay", r.why); notes.push(`Clay: ${said(r.why)}`); }
    }
    if (!fromHunter.length && !fromClay.length && notes.length) return json({ error: `No people found — ${notes.join("; ")}.` }, 502);
    const list = mergePeople(fromHunter, fromClay);
    const people: People = { at: new Date().toISOString(), domain, list, total: Math.max(total, list.length) };
    await admin.from("brand_intel").update({ intel: { ...intel, company, people } }).eq("brand_id", id).eq("user_id", userId);
    return json({ ok: true, people, ...left() });
  }

  return json({ error: "Unknown action" }, 400);
});

void sleep;
