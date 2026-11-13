import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { channelIdOf, uploadsPage, videoDetails, youtubeConfigured, YouTubeQuota, type FullVideo } from "../_shared/youtube.ts";
import { cleanName, combine, DIRECTORY, hostKind, hostOf, knownIndex, linksToFollow, nameKey, namesIn, normalizeDomain, prettyName, readVideo, type DealKind, type Known, type Mention, type Segment } from "../_shared/sponsors.ts";
import { brandTopics, contentProfile, TOPIC, TOPICS, topicLabel, videoTopics, type ContentVideo } from "../_shared/taxonomy.ts";
import { marketsOf, parseHtml, parseShopify, parseShopifyCollections, parseWoo, priceStats, readProgram, siteIsBrand, siteName, type Product, type SiteFacts } from "../_shared/brandSite.ts";
import { clefStatus, decide, useClefBudget, type ClefQuestion } from "../_shared/clef.ts";
import { listenConfigured, listenLeft, listenTo, useListenBudget } from "../_shared/listen.ts";

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
const READER_V = 3;
const DAY = 86400_000;
const BACK_DAYS = 400;
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
};

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
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
      const lines = row.description.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const at = lines.findIndex((l) => l.includes(m.quote.slice(0, 40)) || l.toLowerCase().includes(m.name.toLowerCase()));
      const excerpt = (at >= 0 ? lines.slice(Math.max(0, at - 1), at + 2) : [m.quote]).join("\n").slice(0, 500);
      state[`item${k}`] = { video_title: row.title.slice(0, 140), youtube_paid_promotion_label: row.paid, sponsor_segment_marked: row.segments.some((s) => s.category === "sponsor"), brand: m.name, brand_website: m.domain || "unknown", text: excerpt };
      questions[`item${k}`] = { type: "choice", instructions: `Look at item${k}. How is the creator connected to the brand "${m.name}" in that video?`, criteria: JUDGE };
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

type ScanResult = { videos: number; newVideos: number; links: number; status: string };

async function scanCreator(admin: SupabaseClient, c: CreatorRow, deadline: number, opts: { force?: boolean } = {}): Promise<ScanResult> {
  const now = new Date();
  const saveStatus = (status: string, note = "") => admin.from("creator_content").upsert({ creator_id: c.id, user_id: c.user_id, status, note: note.slice(0, 200), scanned_at: now.toISOString(), updated_at: now.toISOString() });
  let channel = typeof c.youtube?.channel_id === "string" ? c.youtube.channel_id : "";
  if (!/^UC[\w-]{22}$/.test(channel)) {
    const link = youtubeOf(c.socials);
    channel = link ? (await channelIdOf(link)) || "" : "";
  }
  if (!channel) { await saveStatus("no_channel"); return { videos: 0, newVideos: 0, links: 0, status: "no_channel" }; }

  const { data: oldRows } = await admin.from("creator_videos").select("*").eq("user_id", c.user_id).eq("creator_id", c.id).order("published_at", { ascending: false }).limit(400);
  const rows = new Map<string, VideoRow>(((oldRows || []) as VideoRow[]).map((r) => [r.video_id, r]));
  const first = rows.size === 0;
  const since = now.getTime() - BACK_DAYS * DAY;

  // 1. Which uploads are new (or were read by older rules).
  const want: string[] = [];
  let token = "", pages = 0, knownRun = 0;
  pageLoop: while (pages < (first ? 3 : 2)) {
    const page = await uploadsPage(channel, token);
    pages++;
    for (const it of page.items) {
      if (it.at && new Date(it.at).getTime() < since) break pageLoop;
      const old = rows.get(it.id);
      if (!old || old.reader_v < READER_V || opts.force && !old.description && (old.paid || old.mentions.length)) { want.push(it.id); knownRun = 0; }
      else if (++knownRun >= 12 && !first) break pageLoop;
    }
    if (!page.next || Date.now() > deadline - 25_000) break;
    token = page.next;
  }
  const fresh: FullVideo[] = want.length ? (await videoDetails(want.slice(0, 150))).filter((v) => v.live === "none" || v.live === "") : [];

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
    if (old?.listened_at) row.mentions = [...row.mentions, ...old.mentions.filter((m) => m.signals.includes("voice") && !row.mentions.some((x) => x.key === m.key))];
    rows.set(v.id, row);
    touched.push(row);
  }
  for (const [id, segs] of sb) {
    const r = rows.get(id);
    if (!r || touched.includes(r)) continue;
    r.sb_at = now.toISOString();
    if (JSON.stringify(segs) === JSON.stringify(r.segments)) { touched.push(r); continue; }
    r.segments = segs;
    const reading = readVideo({ id, title: r.title, description: r.description, tags: r.tags, paid: r.paid, segments: segs, at: r.published_at || "", secs: r.secs }, ctx);
    r.mentions = [...reading.mentions, ...r.mentions.filter((m) => m.signals.includes("voice") && !reading.mentions.some((x) => x.key === m.key))];
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
  for (let i = 0; i < touched.length; i += 80) {
    const batch = touched.slice(i, i + 80).map((r) => ({ ...r, updated_at: now.toISOString() }));
    const { error } = await admin.from("creator_videos").upsert(batch);
    if (error) throw new Error(`save videos: ${error.message}`);
  }

  // 7. One row per brand, and the content mix.
  const links = await rebuildLinks(admin, c, [...rows.values()]);
  const recent = [...rows.values()].filter((r) => r.published_at).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, 60);
  const profile = contentProfile(recent.map((r): ContentVideo => ({ id: r.video_id, title: r.title, at: r.published_at || "", secs: r.secs, topics: r.topics })), now, recent.some((r) => r.topics_by === "ai") ? "rules+ai" : "rules");
  await admin.from("creator_content").upsert({ creator_id: c.id, user_id: c.user_id, content: profile, status: recent.length ? "ok" : "empty", note: "", scanned_at: now.toISOString(), updated_at: now.toISOString() });
  return { videos: rows.size, newVideos: fresh.length, links, status: recent.length ? "ok" : "empty" };
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
    by_ai: l.evidence.some((e) => e.signals.includes("ai") || e.signals.includes("voice")), updated_at: now,
  }));
  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await admin.from("creator_brands").upsert(payload.slice(i, i + 100), { onConflict: "user_id,creator_id,brand_key" });
    if (error) throw new Error(`save links: ${error.message}`);
  }
  const gone = ((existing || []) as { id: string; brand_key: string; verdict: string; manual: boolean }[]).filter((e) => !keep.has(e.brand_key) && !e.verdict && !e.manual).map((e) => e.id);
  if (gone.length) await admin.from("creator_brands").delete().in("id", gone).eq("user_id", c.user_id);
  // Brands not in the CRM: remember them for the "Found in videos" list (shops aren't brands to pitch).
  const seen = payload.filter((p) => !p.brand_id && !p.store).map((p) => ({ user_id: c.user_id, brand_key: p.brand_key, name: p.brand_name, domain: p.domain }));
  if (seen.length) await admin.from("seen_brands").upsert(seen, { onConflict: "user_id,brand_key", ignoreDuplicates: true });
  return links.length;
}

// ---- listening ----------------------------------------------------------------------------

async function listenSome(admin: SupabaseClient, deadline: number): Promise<number> {
  if (!listenConfigured() || (await listenLeft()) <= 0) return 0;
  const { data } = await admin.from("creator_videos").select("*").not("listen", "is", null).is("listened_at", null).order("published_at", { ascending: false }).limit(4);
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
      const m: Mention = { key: domain || nameKey(h.name), name: k?.name || h.name, domain, domainFrom: k?.domain ? "known" : "", kind: h.kind, confidence: h.kind === "sponsored" ? 0.84 : h.kind === "seeded" ? 0.8 : 0.66, signals: ["voice", ...(r.paid ? ["paid_label" as const] : [])], quote: `“${h.quote}”`, t: r.listen.start };
      if (!r.mentions.some((x) => x.key === m.key && x.confidence >= m.confidence)) r.mentions = [...r.mentions.filter((x) => x.key !== m.key), m];
    }
    r.listened_at = new Date().toISOString();
    await admin.from("creator_videos").update({ mentions: r.mentions, listened_at: r.listened_at, updated_at: r.listened_at }).eq("user_id", r.user_id).eq("creator_id", r.creator_id).eq("video_id", r.video_id);
    const { data: c } = await admin.from("creators").select("id, user_id, name, socials, youtube, created_at, archived_at").eq("id", r.creator_id).eq("user_id", r.user_id).maybeSingle();
    if (c) changed.set(c.id, c as CreatorRow);
    done++;
  }
  for (const c of changed.values()) {
    const { data: rows } = await admin.from("creator_videos").select("*").eq("user_id", c.user_id).eq("creator_id", c.id).limit(400);
    await rebuildLinks(admin, c, (rows || []) as VideoRow[]);
  }
  return done;
}

// ---- researching a brand ------------------------------------------------------------------

type Intel = {
  v: 1; at: string; domain: string; url: string; name: string; summary: string; sells: { key: string; weight: number }[]; by: string;
  products: number; examples: string[]; price: { min: number; median: number; max: number; currency: string } | null; platform: string;
  programs: { kind: string; url: string; text: string; commission?: string; network?: string }[]; socials: { platform: string; url: string }[];
  markets: string[]; currency: string; wiki: string; works_with_creators: number | null; pages: string[]; verified: boolean;
};

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
  const name = (facts && !facts.blocked && siteName(facts, domain, b.name)) || b.name;
  const intel: Intel = {
    v: 1, at: now.toISOString(), domain, url: pages[0] || `https://${domain}`, name, summary: (facts?.description || "").slice(0, 400), sells, by,
    products: products.length, examples: products.slice(0, 10).map((p) => p.title), price: priceStats(products, facts?.currency || ""), platform: facts?.platform || "",
    programs: programs.slice(0, 5), socials: (facts?.socials || []).slice(0, 8), markets: marketsOf(facts?.locales || []), currency: facts?.currency || "",
    wiki: wiki?.extract || "", works_with_creators: null, pages: pages.slice(0, 6), verified: facts ? siteIsBrand(b.name, domain, facts) || !!wiki?.verified : !!wiki?.verified,
  };
  const status = facts && !facts.blocked ? "ok" : blocked && wiki ? "ok" : facts?.blocked ? "blocked" : "unreachable";
  await admin.from("brand_intel").upsert({ brand_id: b.id, user_id: b.user_id, intel, status, researched_at: now.toISOString(), updated_at: now.toISOString() });
  return intel;
}

// ---- brands found in videos: is the domain really theirs? ------------------------------------

type SeenRow = { user_id: string; brand_key: string; name: string; domain: string; domain_check: string; checked_at: string | null };

async function checkSeen(admin: SupabaseClient, s: SeenRow) {
  const now = new Date().toISOString();
  let domain = s.domain, check = "none", name = s.name, site: Record<string, unknown> | null = null;
  let landed = "";
  const look = async (d: string) => {
    const page = await getText(`https://${d}`, { timeout: 9000, max: 1_500_000 });
    if (!page || page.status >= 400 && page.status !== 403) return null;
    landed = normalizeDomain(page.url || "");
    return parseHtml(page.text, page.url || `https://${d}`);
  };
  if (domain) {
    const f = await look(domain);
    // A tracking domain ("carvertical.deal", "trade.re") that lands on the brand's real site: keep the real one.
    if (f && !f.blocked && landed && landed !== domain && hostKind(landed) === "brand" && siteIsBrand(name, landed, f)) {
      await admin.from("creator_brands").update({ domain: landed }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
      domain = landed;
    }
    if (!f) check = "none";
    else if (f.blocked) check = "blocked";
    else {
      check = siteIsBrand(name, domain, f) ? "site" : "mismatch";
      // The name was only the domain spelled out ("Rayconglobal"): use what the site calls itself.
      if (check === "site" && name === prettyName(domain)) name = siteName(f, domain, name) || name;
      site = { title: f.title.slice(0, 160), description: f.description.slice(0, 300), topics: brandTopics({ products: f.products, site: [f.title, f.description, ...f.nav] }), logo: f.logo };
    }
  } else {
    // Only a name was written: try name.com and keep it only if the site says it is that brand.
    const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
    if (slug.length >= 3) {
      const f = await look(`${slug}.com`);
      if (f && !f.blocked && siteIsBrand(name, `${slug}.com`, f)) {
        domain = `${slug}.com`; check = "guess";
        site = { title: f.title.slice(0, 160), description: f.description.slice(0, 300), topics: brandTopics({ products: f.products, site: [f.title, f.description, ...f.nav] }), logo: f.logo };
        await admin.from("creator_brands").update({ domain }).eq("user_id", s.user_id).eq("brand_key", s.brand_key).eq("domain", "");
      }
    }
  }
  await admin.from("seen_brands").update({ name: cleanName(name) || s.name, domain, domain_check: check, site, checked_at: now, updated_at: now }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  if (name !== s.name && cleanName(name)) await admin.from("creator_brands").update({ brand_name: cleanName(name) }).eq("user_id", s.user_id).eq("brand_key", s.brand_key);
  return { domain, check, name };
}

/** Add brands found in a NEW creator's videos when they're sure: a paid or seeded deal, the creator's own link, the site confirmed. */
async function autoAdd(admin: SupabaseClient, s: SeenRow, checked: { domain: string; check: string; name: string }) {
  if (checked.check !== "site" || !checked.domain) return;
  const { data: me } = await admin.from("profiles").select("preferences").eq("id", s.user_id).maybeSingle();
  if ((me?.preferences as { match_auto_add?: boolean } | null)?.match_auto_add === false) return;
  const { data: links } = await admin.from("creator_brands").select("creator_id, kind, confidence, last_at, verdict").eq("user_id", s.user_id).eq("brand_key", s.brand_key).in("kind", ["sponsored", "seeded"]).gte("confidence", 0.85).neq("verdict", "no").limit(20);
  if (!links?.length) return;
  const { data: fresh } = await admin.from("creators").select("id, name, created_at").eq("user_id", s.user_id).in("id", links.map((l) => l.creator_id)).gte("created_at", new Date(Date.now() - 14 * DAY).toISOString()).limit(5);
  if (!fresh?.length) return;
  // Never twice: not if any brand (archived ones too — you removed it once) already has this domain.
  const { data: all } = await admin.from("brands").select("id, domain").eq("user_id", s.user_id).limit(5000);
  if ((all || []).some((b: { domain: string | null }) => normalizeDomain(b.domain || "") === checked.domain)) return;
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
  // 3. Brands found in videos: check the domain is theirs (then maybe add them).
  {
    const { data: list } = await admin.from("seen_brands").select("user_id, brand_key, name, domain, domain_check, checked_at").in("user_id", ids).eq("hidden", false).or(`checked_at.is.null,and(domain_check.eq.none,domain.neq.,checked_at.lt.${new Date(Date.now() - 2 * DAY).toISOString()})`).limit(14);
    await pool((list || []) as SeenRow[], 4, async (s) => {
      if (Date.now() > deadline - 25_000) return;
      const checked = await checkSeen(admin, s).catch(() => null);
      if (checked) { log.seen = Number(log.seen) + 1; await autoAdd(admin, s, checked).catch(() => null); }
    });
  }
  for (const u of ids) await relink(admin, u).catch(() => null);
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
  // 5. Brands not researched for two weeks.
  if (Date.now() < deadline - 40_000) {
    const { data: stale } = await admin.from("brand_intel").select("brand_id").in("user_id", ids).lt("researched_at", new Date(Date.now() - BRAND_DAYS * DAY).toISOString()).order("researched_at", { ascending: true }).limit(3);
    const bids = (stale || []).map((s: { brand_id: string }) => s.brand_id);
    const { data: list } = bids.length ? await admin.from("brands").select("id, user_id, name, domain, archived_at").in("id", bids).is("archived_at", null) : { data: [] };
    for (const b of (list || []) as BrandRow[]) { if (Date.now() > deadline - 35_000) break; await researchBrand(admin, b).catch(() => null); log.brands = Number(log.brands) + 1; }
  }
  // 6. Listen to promoted clips nothing written names.
  if (Date.now() < deadline - 50_000) log.listened = await listenSome(admin, deadline).catch(() => 0);
  log.ms = Date.now() - start;
  return log;
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

  const userId = await approvedUser(admin, req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Unauthorized" }, 401);

  if (input.action === "status") {
    const [{ count: creators }, { count: read }, { count: brands }, { count: researched }, clef] = await Promise.all([
      admin.from("creators").select("id", { count: "exact", head: true }).eq("user_id", userId).is("archived_at", null),
      admin.from("creator_content").select("creator_id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("brands").select("id", { count: "exact", head: true }).eq("user_id", userId).is("archived_at", null),
      admin.from("brand_intel").select("brand_id", { count: "exact", head: true }).eq("user_id", userId),
      clefStatus(),
    ]);
    return json({ ok: true, creators: creators || 0, read: read || 0, brands: brands || 0, researched: researched || 0, youtube: youtubeConfigured(), clef, listen: { configured: listenConfigured(), secondsLeft: await listenLeft() } });
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

  return json({ error: "Unknown action" }, 400);
});

void sleep;
