import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { channelFacts, channelIdOf, channelsLight, featuredChannels, uploadPulse, flushYoutubeMeter, knownChannelId, useYoutubeMeter, youtubeBackgroundOk, youtubeConfigured, YouTubeQuota, type ChannelFacts } from "../_shared/youtube.ts";
import { asMember, ringFor, runInRing, type Ring } from "../_shared/keyring.ts";
import { otherLinksIn, roleOf, siblingVerdict, youtubeLinksIn } from "../_shared/channels.ts";

// YouTube numbers for influencers (see _shared/youtube.ts for how they're read).
//
// Actions (POST JSON):
//   lookup  {input}   — quick fill: everything about a pasted channel, stars
//                       included. Nothing is saved; the form shows it to edit.
//   refresh {ids}     — up to 10 of YOUR influencers: their fresh numbers come
//                       back as patches the app saves like your own edit, so a
//                       refresh never overwrites a change you're making.
//   channels {main, main_id?, discover?, extras?, skip?}
//                     — a creator's other channels: what their own channel links / features that is
//                       really theirs (shared/channels.ts decides; friends are left out), fresh numbers
//                       for the extra channels you linked, and the other links in their description.
//                       Public YouTube data only; nothing is read from or written to the database.
//   cron              — hourly, server only (x-cron-secret): every member who
//                       has "Keep YouTube stats fresh" on gets their influencers
//                       refreshed, oldest first, straight into the database.
// What a refresh may change: subscribers and the YouTube facts always; name,
// email, country, niche, average views and engagement rate while they're
// empty or still exactly what YouTube put there last time (youtube.auto).
// Change one yourself and it's yours: the hourly refresh leaves it alone
// (youtube.kept says which, so the profile can tell you). Pressing Refresh
// yourself (refresh with force: true — the "Refresh YouTube" buttons) takes
// YouTube's values for all of them again, except an email you already have. Suggested stars (engagement,
// consistency, audience) follow the same rule: a star you never set (0) or
// one still equal to YouTube's last suggestion is refreshed; one you picked
// stays. Niche fit is always yours.

const APP_URL = (Deno.env.get("APP_URL") || "https://dhurimhalili.github.io/influenceflow-crm").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([new URL(APP_URL).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// How often a creator's stats are refreshed. Every 6 hours keeps 130+ creators well inside ONE free key
// (10,000 units a day; a refresh costs ~3): hourly would spend ~10,000 on refreshes alone. YT_REFRESH_HOURS overrides.
const FRESH_MS = Math.max(1, Math.min(48, Number(Deno.env.get("YT_REFRESH_HOURS")) || 6)) * 3600_000 - 5 * 60_000;
// The people you're talking to are refreshed most often; parked and closed ones far less (their numbers
// matter less and every refresh costs ~3 units of the key's 10,000 a day).
const CADENCE: Record<string, number> = { negotiating: 1, replied: 1, inbound: 1, roster: 1, signed: 1, contacted: 2, new: 2, no_reply: 4, denied: 12 };
// Other channels: searched again every 14 days per creator, at most 8 creators an hour (~3–15 units each).
const CHANNELS_DAYS = 14;
const CHANNELS_PER_RUN = 8;
const dueAfter = (status: string) => FRESH_MS * (CADENCE[status] ?? 2);

type Social = { platform: string; url: string; handle: string; followers: number };
type CreatorRow = { id: string; user_id: string; name: string; country: string | null; contact_email: string | null; niche: string | null; avg_views: number | null; engagement_rate: number | null; socials: Social[] | null; youtube: Record<string, unknown> | null; youtube_synced_at: string | null; stars_engagement?: number | null; stars_consistency?: number | null; stars_demographics?: number | null };
type StarField = "stars_engagement" | "stars_consistency" | "stars_demographics";
const STAR_FIELDS: [StarField, keyof ChannelFacts["stars"]][] = [["stars_engagement", "engagement"], ["stars_consistency", "consistency"], ["stars_demographics", "demographics"]];
type AutoField = "name" | "contact_email" | "country" | "niche" | "avg_views" | "engagement_rate";
const AUTO_FIELDS: AutoField[] = ["name", "contact_email", "country", "niche", "avg_views", "engagement_rate"];
const NUMERIC = new Set<AutoField>(["avg_views", "engagement_rate"]);

/** The YouTube link or handle on a record (the first YouTube social), or "". */
export const youtubeOf = (socials: Social[] | null | undefined) => {
  const s = (socials || []).find((x) => x && x.platform === "YouTube" && (x.url || x.handle));
  return s ? s.url || `@${s.handle}` : "";
};

/** "US" → "United States" (the CRM stores country names). */
const countryName = (code: string) => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { return code; }
};

/** What a refresh writes (see the top of the file). Stars are never touched. */
export function patchFor(c: Pick<CreatorRow, "name" | "country" | "contact_email" | "niche" | "avg_views" | "engagement_rate" | "socials" | "youtube" | StarField>, f: ChannelFacts, opts: { force?: boolean } = {}) {
  // Only the first YouTube link (the one that was read) gets the subscriber count.
  const first = (c.socials || []).findIndex((s) => s && s.platform === "YouTube" && (s.url || s.handle));
  const socials = (c.socials || []).map((s, i) => (i === first ? { ...s, url: s.url || f.url, handle: s.handle || f.handle, followers: f.subscribers || s.followers || 0 } : s));
  const prevAuto = (c.youtube && typeof c.youtube.auto === "object" && c.youtube.auto ? c.youtube.auto : {}) as Partial<Record<AutoField | StarField, string>>;
  // Records from before this rule: numbers were always YouTube's.
  const legacy = !(c.youtube && typeof c.youtube.auto === "object");
  const fresh: Partial<Record<AutoField, string | number>> = {
    name: f.title, contact_email: f.emails[0] || "", country: f.country ? countryName(f.country) : "", niche: f.niche,
    ...(f.sampled ? { avg_views: f.avgViews, engagement_rate: f.engagementRate } : {}),
  };
  const blank = (k: AutoField, v: unknown) => (NUMERIC.has(k) ? !(Number(v) > 0) : !String(v ?? "").trim());
  const same = (k: AutoField, a: unknown, b: unknown) => (NUMERIC.has(k) ? Number(a) === Number(b) : String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase());
  const patch: Record<string, unknown> = { socials };
  const auto: Partial<Record<AutoField | StarField, string>> = { ...prevAuto };
  const kept: AutoField[] = [];
  for (const k of AUTO_FIELDS) {
    const value = fresh[k];
    if (value === undefined || blank(k, value)) continue;
    const current = c[k];
    // A refresh you asked for takes YouTube's value back — never over an email you have.
    const free = blank(k, current) || (prevAuto[k] !== undefined && same(k, current, prevAuto[k])) || (legacy && NUMERIC.has(k)) || (opts.force === true && k !== "contact_email");
    if (free) { patch[k] = value; auto[k] = String(value); }
    else if (!same(k, current, value)) kept.push(k);
  }
  // Stars: never set (0) or still YouTube's last suggestion → refreshed.
  for (const [k, from] of STAR_FIELDS) {
    const value = f.stars[from];
    if (!(value > 0)) continue;
    const current = Number(c[k]) || 0;
    if (current === 0 || (prevAuto[k] !== undefined && Number(prevAuto[k]) === current)) { patch[k] = value; auto[k] = String(value); }
  }
  patch.youtube = { channel_id: f.channelId, handle: f.handle, title: f.title, url: f.url, country: f.country, subscribers: f.subscribers, hidden_subscribers: f.hiddenSubscribers, video_count: f.videoCount, total_views: f.totalViews, avg_views: f.avgViews, engagement_rate: f.engagementRate, sampled: f.sampled, uploads_90d: f.uploads90d, last_upload_at: f.lastUploadAt, emails: f.emails, business_email_hidden: f.businessEmailHidden, niche: f.niche, sub_niche: f.subNiche, includes_recent: f.includesRecent, sample: f.sample, at: f.at, auto, kept };
  patch.youtube_synced_at = f.at;
  return patch;
}

const approvedUser = async (admin: SupabaseClient, auth: string) => {
  if (!auth.startsWith("Bearer ")) return null;
  const { data } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!data.user) return null;
  const { data: me } = await admin.from("profiles").select("access").eq("id", data.user.id).maybeSingle();
  return me && me.access && me.access !== "approved" ? null : data.user.id;
};

const isChannelId = (x: unknown): x is string => typeof x === "string" && /^UC[\w-]{22}$/.test(x);

/**
 * A creator's other channels from their main channel (public YouTube data only): channels it links in its
 * description or features that are really theirs (shared/channels.ts), fresh numbers for extra channels you
 * linked, and the other links in its description. ~3–15 units. Null when the main channel can't be found.
 */
async function discoverChannels(mainLink: string, knownId: string, opts: { discover: boolean; skip: string[]; extras: { link: string; id: string }[] }) {
  const now = new Date();
  const skip = new Set(opts.skip);
  const mainId = knownId || await channelIdOf(mainLink);
  if (!mainId) return null;
  const [main] = await channelsLight([mainId]);
  if (!main) return null;
  const found: Record<string, unknown>[] = [];
  if (opts.discover) {
    const featured = new Set(await featuredChannels(mainId).catch(() => [] as string[]));
    // Channels linked in their description (a handle costs 1 unit to resolve — at most 6).
    const lines = new Map<string, string>();
    let resolved = 0;
    for (const l of youtubeLinksIn(main.description)) {
      let id: string | null = isChannelId(l.ref) ? l.ref : null;
      if (!id && resolved < 6) { resolved++; id = await channelIdOf(l.ref).catch((e) => { if (e instanceof YouTubeQuota) throw e; return null; }); }
      if (id && !lines.has(id)) lines.set(id, l.line);
    }
    const ids = [...new Set([...lines.keys(), ...featured])].filter((id) => id !== mainId && !skip.has(id) && !opts.extras.some((e) => e.id === id)).slice(0, 50);
    for (const c of await channelsLight(ids)) {
      const line = lines.get(c.id) || "";
      const v = siblingVerdict({ id: mainId, title: main.title, handle: main.handle, description: main.description }, { id: c.id, title: c.title, handle: c.handle, description: c.description, featured: featured.has(c.id), line });
      if (!v) continue;
      const r = roleOf({ title: c.title, handle: c.handle, line }, main);
      found.push({ id: c.id, url: c.handle ? `https://www.youtube.com/@${c.handle}` : `https://www.youtube.com/channel/${c.id}`, title: c.title, handle: c.handle, thumbnail: c.thumbnail, subscribers: c.subscribers, hidden_subscribers: c.hiddenSubscribers, video_count: c.videoCount, total_views: c.totalViews, role: r.role, language: r.language || "", level: v.level, why: v.why });
    }
    found.sort((a, b) => Number(b.level === "sure") - Number(a.level === "sure") || Number(b.subscribers) - Number(a.subscribers));
    found.splice(8);
    for (const f of found) Object.assign(f, await uploadPulse(String(f.id), now).then((p) => ({ last_upload_at: p.lastUploadAt, uploads_90d: p.uploads90d })).catch(() => ({})));
  }
  const extras: Record<string, unknown>[] = [];
  for (const e of opts.extras) {
    const f = await channelFacts(e.link, now, { knownId: e.id || undefined }).catch((err) => { if (err instanceof YouTubeQuota) throw err; return null; });
    if (!f) { extras.push({ link: e.link, ok: false }); continue; }
    const r = roleOf({ title: f.title, handle: f.handle }, main);
    extras.push({ link: e.link, ok: true, facts: { channel_id: f.channelId, title: f.title, handle: f.handle, url: f.url, thumbnail: f.thumbnail, country: f.country, subscribers: f.subscribers, hidden_subscribers: f.hiddenSubscribers, video_count: f.videoCount, total_views: f.totalViews, avg_views: f.avgViews, engagement_rate: f.engagementRate, sampled: f.sampled, uploads_90d: f.uploads90d, last_upload_at: f.lastUploadAt, niche: f.niche, sub_niche: f.subNiche, role: r.role, language: r.language || "", at: f.at } });
  }
  return { main: { id: mainId, title: main.title, handle: main.handle, thumbnail: main.thumbnail }, found, extras, links: otherLinksIn(main.description) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : new URL(APP_URL).origin, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  useYoutubeMeter(admin);
  let input: Record<string, unknown> = {};
  try { input = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (input.action === "cron") {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: ok } = given.length >= 32 ? await admin.rpc("gmail_cron_secret_ok", { p_secret: given }) : { data: false };
    if (ok !== true) return json({ error: "Unauthorized" }, 401);
    const deadline = Date.now() + 100_000;
    const { data: members } = await admin.from("profiles").select("id, preferences, access").eq("access", "approved").limit(500);
    const on = new Set((members || []).filter((m) => (m.preferences as { youtube_auto?: boolean } | null)?.youtube_auto !== false).map((m) => m.id));
    const recent = new Set((members || []).filter((m) => (m.preferences as { youtube_recent?: boolean } | null)?.youtube_recent === true).map((m) => m.id));
    const stale = new Date(Date.now() - FRESH_MS).toISOString();
    // Each member's creators are refreshed with THEIR OWN YouTube key (keyring.ts); members without one are
    // left out (and never crowd out the others), one whose quota ran out is skipped until tomorrow.
    const rings = new Map<string, Ring>();
    for (const id of on) { const r = await ringFor(admin, id).catch(() => null); if (r && await runInRing(r, async () => youtubeConfigured())) rings.set(id, r); }
    if (!rings.size) return json({ refreshed: 0, skipped: 0, keyless: on.size });
    const quota = new Set<string>();
    const { data: rows } = await admin.from("creators").select("id, user_id, name, country, contact_email, niche, avg_views, engagement_rate, socials, youtube, youtube_synced_at, stars_engagement, stars_consistency, stars_demographics, pipeline_status").in("user_id", [...rings.keys()]).is("archived_at", null).or(`youtube_synced_at.is.null,youtube_synced_at.lt.${stale}`).order("youtube_synced_at", { ascending: true, nullsFirst: true }).limit(1000);
    // Due by their stage's cadence; never-read first, then the hottest stages, then the oldest.
    const now = Date.now();
    const due = ((rows || []) as (CreatorRow & { pipeline_status?: string })[])
      .filter((c) => !c.youtube_synced_at || now - new Date(c.youtube_synced_at).getTime() >= dueAfter(c.pipeline_status || ""))
      .sort((a, b) => Number(!!a.youtube_synced_at) - Number(!!b.youtube_synced_at) || (CADENCE[a.pipeline_status || ""] ?? 2) - (CADENCE[b.pipeline_status || ""] ?? 2) || String(a.youtube_synced_at).localeCompare(String(b.youtube_synced_at)));
    let done = 0, skipped = 0, saved = 0;
    for (const c of due) {
      if (Date.now() > deadline) break;
      if (!rings.has(c.user_id) || quota.has(c.user_id)) continue;
      const ref = youtubeOf(c.socials);
      if (!ref) continue;
      // Background refreshes stop before the key runs dry: Quick fill and Refresh always have units left.
      if (!(await runInRing(rings.get(c.user_id)!, () => youtubeBackgroundOk()))) { quota.add(c.user_id); continue; }
      const knownId = knownChannelId(ref, c.youtube as Record<string, unknown> | null);
      if (knownId) saved++;
      try {
        const f = await runInRing(rings.get(c.user_id)!, () => channelFacts(ref, new Date(), { includeRecent: recent.has(c.user_id), knownId }));
        if (!f) { await admin.from("creators").update({ youtube_synced_at: new Date().toISOString() }).eq("id", c.id).eq("user_id", c.user_id); skipped++; continue; }
        // Only these columns are written; an archived record is left alone.
        const { error } = await admin.from("creators").update(patchFor(c, f)).eq("id", c.id).eq("user_id", c.user_id).is("archived_at", null);
        if (!error) done++;
      } catch (e) {
        if (e instanceof YouTubeQuota) { quota.add(c.user_id); continue; }
        skipped++;
      }
    }
    // Their other channels, every 14 days per creator (a profile you open searches by itself too). The row's
    // channels are re-read right before the write so anything you changed meanwhile (a yes / no) is kept.
    let searched = 0;
    if (Date.now() < deadline - 20_000) {
      const since = new Date(Date.now() - CHANNELS_DAYS * 86_400_000).toISOString();
      const { data: rows2 } = await admin.from("creators").select("id, user_id, socials, youtube, channels, pipeline_status").in("user_id", [...rings.keys()]).is("archived_at", null)
        .or(`channels->>at.is.null,channels->>at.lt.${since}`).limit(1000);
      const due2 = ((rows2 || []) as { id: string; user_id: string; socials: Social[] | null; youtube: Record<string, unknown> | null; channels: Record<string, unknown> | null; pipeline_status: string | null }[])
        .filter((c) => youtubeOf(c.socials))
        .sort((a, b) => Number(!!a.channels?.at) - Number(!!b.channels?.at) || (CADENCE[a.pipeline_status || ""] ?? 2) - (CADENCE[b.pipeline_status || ""] ?? 2))
        .slice(0, CHANNELS_PER_RUN);
      for (const c of due2) {
        if (Date.now() > deadline - 10_000) break;
        const ring = rings.get(c.user_id);
        if (!ring || quota.has(c.user_id)) continue;
        if (!(await runInRing(ring, () => youtubeBackgroundOk()))) { quota.add(c.user_id); continue; }
        const prev = (c.channels || {}) as { dismissed?: unknown[]; stats?: Record<string, { channel_id?: unknown }>; main?: { id?: unknown } };
        const skip = [...(prev.dismissed || []), ...Object.values(prev.stats || {}).map((x) => x?.channel_id)].filter(isChannelId);
        const known = isChannelId(c.youtube?.channel_id) ? c.youtube.channel_id as string : isChannelId(prev.main?.id) ? prev.main.id as string : "";
        try {
          const out = await runInRing(ring, () => discoverChannels(youtubeOf(c.socials), known, { discover: true, skip, extras: [] }));
          const { data: fresh } = await admin.from("creators").select("channels").eq("id", c.id).eq("user_id", c.user_id).maybeSingle();
          const cur = (fresh?.channels && typeof fresh.channels === "object" && !Array.isArray(fresh.channels) ? fresh.channels : {}) as Record<string, unknown>;
          const at = new Date().toISOString();
          const next = out ? { ...cur, at, main: { id: out.main.id, title: out.main.title, thumbnail: out.main.thumbnail }, found: out.found.map((f) => ({ ...f, platform: "YouTube" })), links: out.links.slice(0, 30) } : { ...cur, at };
          const { error } = await admin.from("creators").update({ channels: next }).eq("id", c.id).eq("user_id", c.user_id).is("archived_at", null);
          if (!error) searched++;
        } catch (e) {
          if (e instanceof YouTubeQuota) quota.add(c.user_id);
        }
      }
    }
    await flushYoutubeMeter();
    return json({ refreshed: done, skipped, idsReused: saved, paused: quota.size, channelsSearched: searched });
  }

  const userId = await approvedUser(admin, req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Unauthorized" }, 401);
  // On this member's own YouTube key — never another member's or the owner's.
  return await asMember(admin, userId, async () => {
  if (!youtubeConfigured()) return json({ error: "Add your YouTube API key first — Settings → Your API keys. It's free from Google Cloud.", code: "no_key" }, 412);

  if (input.action === "lookup") {
    const text = typeof input.input === "string" ? input.input.trim().slice(0, 500) : "";
    if (!text) return json({ error: "Paste a YouTube channel link or @handle." }, 400);
    try {
      const f = await channelFacts(text, new Date(), { includeRecent: input.recent === true });
      return f ? json({ ok: true, facts: f }) : json({ error: "Couldn't find that YouTube channel — check the link." }, 404);
    } catch (e) {
      return json({ error: e instanceof YouTubeQuota ? "Your YouTube key's daily limit is reached — it resets at midnight Pacific time." : e instanceof Error ? e.message : "YouTube didn't answer." }, e instanceof YouTubeQuota ? 429 : 502);
    }
  }

  if (input.action === "refresh") {
    // The app sends what it has on screen (a record you just saved may not have
    // reached the database yet). Only public channel facts come back as a patch;
    // nothing is read from or written to anyone's records here.
    const items = (Array.isArray(input.items) ? input.items : []).slice(0, 10).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .filter((x) => typeof x.id === "string" && UUID.test(x.id) && typeof x.link === "string" && x.link.length <= 500)
      .map((x) => ({ id: x.id as string, link: x.link as string, name: String(x.name || "").slice(0, 300), country: String(x.country || "").slice(0, 80), contact_email: String(x.contact_email || "").slice(0, 254), niche: String(x.niche || "").slice(0, 120), avg_views: Number(x.avg_views) || 0, engagement_rate: Number(x.engagement_rate) || 0, stars_engagement: Number(x.stars_engagement) || 0, stars_consistency: Number(x.stars_consistency) || 0, stars_demographics: Number(x.stars_demographics) || 0, youtube: x.youtube && typeof x.youtube === "object" && !Array.isArray(x.youtube) ? (() => { const y = x.youtube as Record<string, unknown>; return { auto: y.auto, channel_id: typeof y.channel_id === "string" && /^UC[\w-]{22}$/.test(y.channel_id) ? y.channel_id : "", handle: typeof y.handle === "string" ? y.handle.slice(0, 100) : "", url: typeof y.url === "string" ? y.url.slice(0, 300) : "" } as Record<string, unknown>; })() : null, socials: (Array.isArray(x.socials) ? x.socials : []).slice(0, 30) as Social[] }));
    if (!items.length) return json({ error: "Pick at least one influencer with a YouTube channel." }, 400);
    const results: { id: string; ok: boolean; patch?: Record<string, unknown>; error?: string }[] = [];
    for (const c of items) {
      try {
        const f = await channelFacts(c.link, new Date(), { includeRecent: input.recent === true, knownId: knownChannelId(c.link, c.youtube as Record<string, unknown> | null) });
        results.push(f ? { id: c.id, ok: true, patch: patchFor(c, f, { force: input.force === true }) } : { id: c.id, ok: false, error: "Couldn't find that YouTube channel" });
      } catch (e) {
        if (e instanceof YouTubeQuota) return json({ results, error: "YouTube's daily limit is reached — the rest refresh after midnight Pacific time.", quota: true }, 429);
        results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : "YouTube didn't answer" });
      }
    }
    return json({ ok: true, results });
  }

  if (input.action === "channels") {
    const mainLink = typeof input.main === "string" ? input.main.trim().slice(0, 500) : "";
    if (!mainLink) return json({ error: "Add their main YouTube channel first." }, 400);
    const skip = (Array.isArray(input.skip) ? input.skip : []).filter(isChannelId).slice(0, 200);
    const extras = (Array.isArray(input.extras) ? input.extras : []).slice(0, 8).map((x) => (x && typeof x === "object" ? x as Record<string, unknown> : {}))
      .filter((x) => typeof x.link === "string" && x.link.length <= 500).map((x) => ({ link: String(x.link), id: isChannelId(x.id) ? x.id : "" }));
    try {
      const out = await discoverChannels(mainLink, isChannelId(input.main_id) ? input.main_id : "", { discover: input.discover !== false, skip, extras });
      return out ? json({ ok: true, ...out }) : json({ error: "Couldn't find their main YouTube channel — check the link." }, 404);
    } catch (e) {
      return json({ error: e instanceof YouTubeQuota ? "Your YouTube key's daily limit is reached — it resets at midnight Pacific time." : e instanceof Error ? e.message : "YouTube didn't answer." }, e instanceof YouTubeQuota ? 429 : 502);
    }
  }

  return json({ error: "Unknown action" }, 400);
  }).finally(() => flushYoutubeMeter());
});
